'use strict';
/**
 * clear-glass/src/page/nexus-chat.js — open a chat in Clear Glass and the agent in it can talk to Nexus (0.59.5).
 * comp_id: clear-glass.page.nexus-chat
 *
 * James, 2026-10-10: "All I'm going to do. Is open this chat in clearglass. Then you should be able to talk to nexus right
 * now."
 *
 * No picker, no listener to set up. On a chat page Clear Glass is told to watch (option nexusChat.urls — by default Claude
 * Code on the web and every claude.ai chat, https://claude.ai/ — 0.59.9), it reads the page's text every 2 s. A line that starts with `nexus> ` and has
 * stayed the same for two reads (so a streaming reply is finished) runs as a Nexus command through the one command tool
 * (lib/listener-commands.js), and the answer is typed into the page's message box and sent — so the agent reads it as the
 * next message and can carry on.
 *
 * Guard rails, because anything printed on that page can reach the machine:
 *   - when the page first opens, only its newest command line may run — the rest is history (0.59.6: 0.59.5 skipped
 *     everything on the page at open, so the command he opened the chat to run never ran); a reload of the same page in
 *     the same session replays nothing; after a Clear Glass restart the newest line can run once more (read-only)
 *   - each line runs once; at most 6 commands a minute per page
 *   - read commands only (and `dump`, an idea into the Void): anything that changes Nexus is refused here — a listener he
 *     sets himself (⦿ LISTEN → Run Nexus commands) is the door for those; the person's own rows are refused everywhere
 *   - the answer it types back never starts with `nexus>`, so it cannot run itself
 * Reads the page from the main process (executeJavaScript): nothing is injected into the page, so it adds nothing to the
 * per-frame injection count (CG1).
 */

const MODULE_ID = 'clear-glass.page.nexus-chat';
const VERSION = '1.5.0';
const POLL_MS = 2000;
const PER_MINUTE = 6;
const READ_ALLOW = new Set(['dump']);   // the one write allowed here: an idea dropped into the Void

// §0.59.9 — James: "i want all sessions captured": every Claude page (Claude Code sessions and claude.ai chats), not one
const DEFAULT_URLS = ['https://claude.ai/'];
const RAN = new Map();   // url → Set of lines already run, across reloads of the page in this session
function _urls(options) {
  try {
    let v = options && options.get && options.get('nexusChat.urls');
    if (v && !Array.isArray(v)) v = (v.nexusChat || {}).urls;   // §0.59.6 — NexusOptions.get() takes no key: it returns the whole options object
    if (Array.isArray(v) && v.length) return v;
  } catch (_) {}
  const env = process.env.CLEARGL_NEXUS_CHAT_URLS; return env ? env.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_URLS;
}
function watched(url, options) { const u = String(url || ''); return _urls(options).some(p => u.startsWith(p)); }

/** the page's command lines, read from the main process */
const READ_JS = `(() => { const parts = [(document.body && document.body.innerText) || '']; const walk = (root) => { for (const el of root.querySelectorAll('*')) if (el.shadowRoot) { for (const c of el.shadowRoot.children) parts.push(c.innerText || c.textContent || ''); walk(el.shadowRoot); } }; try { walk(document); } catch (_) {} const t = parts.join('\\n').replace(/\\u00a0/g, ' '); return (t.match(/^[ \\t]*nexus>[ \\t]+.+$/gm) || []).map(l => l.trim().replace(/^nexus>\\s+/, '')); })()`;   // 0.59.7: U+00A0 · 0.59.8: open shadow roots too
/** what the page looks like to the reader — logged once per open, so a page that shows no lines can be told apart (0.59.8) */
const DIAG_JS = `(() => ({ chars: ((document.body && document.body.innerText) || '').length, iframes: document.querySelectorAll('iframe').length, shadows: [...document.querySelectorAll('*')].filter(e => e.shadowRoot).length, nexusAnywhere: ((document.body && document.body.textContent) || '').includes('nexus>') }))()`;
/** type text into the page's message box and send it; returns what happened */
function replyJs(text) {
  return `(() => {
    const text = ${JSON.stringify(String(text))};
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 40 && r.height > 10 && getComputedStyle(el).visibility !== 'hidden'; };
    const boxes = [...document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable=""]')].filter(vis);
    const box = boxes.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
    if (!box) return { ok: false, error: 'no message box found on the page' };
    box.focus();
    if (box.tagName === 'TEXTAREA') { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(box, text); box.dispatchEvent(new Event('input', { bubbles: true })); }
    else document.execCommand('insertText', false, text);
    return { ok: true };
  })()`;
}

/** policy for pages Clear Glass watches by itself: read commands and dump only */
async function readOnly(parsed) {
  if (READ_ALLOW.has(parsed.command)) return null;
  const { pathToFileURL } = require('url');
  const path = require('path');
  const { SPEC } = await import(pathToFileURL(path.join(__dirname, '..', '..', '..', 'idearium', 'cli', 'route-commands.js')).href);
  const row = SPEC.find(r => r.key.replace('.', ' ') === parsed.command);
  if (!row) return null;   // the tool says it does not exist
  let rq; try { rq = row.req({ repo: { uuid: 'repo', name: 'repo' }, args: parsed.args || [], flags: parsed.flags || {} }) || {}; } catch (_) { rq = {}; }
  return (rq.method || 'GET') === 'GET' ? null : `"${parsed.command}" changes Nexus — from a watched chat only read commands and dump run. Set a listener yourself (◎ → ⦿ LISTEN → Run Nexus commands) to allow it.`;
}

/**
 * attach(contents, { options, emit, postEvent, runner }) — watch one web-contents. Safe to call for every one: it does
 * nothing until the page's URL is watched.
 */
function attach(contents, { options = null, emit = () => {}, postEvent = () => {}, runner = null, pollMs = POLL_MS } = {}) {
  const log = (m) => console.log(`[ClearGlass/nexus-chat] ${m}`);   // 0.59.7 — every step is in the boot log: 0.59.6 failed silently on his machine
  const said = {};
  let timer = null, baseline = null, last = new Map(), times = [], busy = false, opened = false, url = '', firstAt = 0, lastCount = -1, hit = null;
  // every frame of the page (a chat can live in an iframe); the frame that held the lines is the one typed into (0.59.8)
  async function readAll() {
    const frames = (contents.mainFrame && contents.mainFrame.framesInSubtree) || null;
    if (!frames || !frames.length) { const l = await contents.executeJavaScript(READ_JS, false).catch(() => null); hit = null; return l; }
    let all = null;
    for (const f of frames) {
      const l = await f.executeJavaScript(READ_JS).catch(() => null);
      if (!Array.isArray(l)) continue;
      all = (all || []).concat(l); if (l.length) hit = f;
    }
    return all;
  }
  const LC = require('../../../lib/listener-commands.js');
  const run = runner || LC.createRunner({ policy: readOnly });
  const stop = () => { if (timer) clearInterval(timer); timer = null; };
  const start = () => {
    stop(); baseline = null; last = new Map(); firstAt = 0; lastCount = -1; said.diag = false;
    url = String(contents.getURL() || '').split('#')[0];
    if (!watched(url, options)) return;
    if (!RAN.has(url)) RAN.set(url, new Set());
    console.log(`[ClearGlass/nexus-chat] watching ${url} — its newest \`nexus> \` line, and every new one, runs read-only`);
    timer = setInterval(tick, pollMs); if (timer.unref) timer.unref();
  };
  async function tick() {
    if (busy || contents.isDestroyed()) return;
    busy = true;
    try {
      const lines = await readAll();
      if (!Array.isArray(lines)) { if (!said.unreadable) { said.unreadable = true; log(`could not read ${url} (the page refused the read)`); } return; }
      const ran = RAN.get(url) || new Set();
      if (!said.diag) { said.diag = true; const d = await contents.executeJavaScript(DIAG_JS, false).catch(e => ({ error: e.message })); log(`${url}: page text ${JSON.stringify(d)} · frames ${((contents.mainFrame && contents.mainFrame.framesInSubtree) || []).length || 1}`); }
      if (lines.length !== lastCount) { if (lastCount >= 0) log(`${url}: ${lines.length} command line(s) now${lines.length ? `, newest "${lines[lines.length - 1]}"` : ''}`); lastCount = lines.length; }
      if (baseline == null && !opened && !lines.length) {
        // a chat app renders its messages after the page has loaded: wait up to 15 s for them before deciding what is history
        firstAt = firstAt || Date.now();
        if (Date.now() - firstAt < 15000) return;
      }
      if (baseline == null) {
        // first read: history never runs — except, on the first open, the newest line (the one he opened the page to run)
        log(`${url}: ${lines.length} command line(s) on the page${lines.length ? `, newest "${lines[lines.length - 1]}"` : ''}${opened ? ' — reload, none run' : ''}`);
        baseline = new Set(opened ? lines : lines.slice(0, -1)); opened = true;
        if (baseline.size === lines.length) return;
      }
      const now = Date.now(); times = times.filter(t => now - t < 60000);
      for (const line of [...new Set(lines)]) {
        if (baseline.has(line) || ran.has(line)) continue;
        const seen = (last.get(line) || 0) + 1; last.set(line, seen);
        if (seen < 2) continue;                                       // stable for two reads: the reply is finished
        if (times.length >= PER_MINUTE) { emit('nexus.chat.limited', { url: contents.getURL(), line, ts: now }); continue; }
        ran.add(line); times.push(now);
        let r;
        log(`running "${line}"…`);
        try { [r] = await Promise.race([run.hear(`chat:${contents.id}`, `nexus> ${line}`), new Promise((_, no) => setTimeout(() => no(new Error('no answer in 30 s')), 30000))]); }
        catch (e) { r = { line, error: `the command tool failed: ${e.message}` }; }
        if (!r) { log(`"${line}" — not run (already heard)`); continue; }
        log(`ran "${line}" → ${r.refused ? 'refused' : r.error ? `error: ${r.error}` : 'ok'}`);
        // 0.59.10 — prose on the page can start with nexus> ("`nexus> list` shows every command." got "✗ no Nexus command \"list
        // shows\"" typed into his chat): a line that names no command is logged and shown in the pane, never typed back
        if (r.unknown) { emit('guardian.listener.command-result', { listenerId: `chat:${contents.id}`, url: contents.getURL(), line, ok: false, text: `⌘ not run (no such command, not answered in the chat): ${line}`, ts: Date.now() }); continue; }
        const said = LC.summary(r).replace(/^nexus>\s*/, '⌘ Nexus ran: ').replace(/^([ \t]*)nexus>/gm, '$1nexus›');   // no line of it starts with nexus> — it cannot run itself
        emit('guardian.listener.command-result', { listenerId: `chat:${contents.id}`, url: contents.getURL(), line, ok: !r.error && !r.refused, text: said, ts: Date.now() });
        postEvent('nexus.chat.command', { url: contents.getURL(), line, ok: !r.error && !r.refused, refused: !!r.refused });
        const typed = await (hit ? hit.executeJavaScript(replyJs(said), true) : contents.executeJavaScript(replyJs(said), true)).catch(e => ({ ok: false, error: e.message }));
        if (typed && typed.ok) {
          await new Promise(res => setTimeout(res, 150));
          for (const type of ['keyDown', 'char', 'keyUp']) contents.sendInputEvent(type === 'char' ? { type, keyCode: '\r' } : { type, keyCode: 'Enter' });
          log(`typed the answer into the page and pressed Enter`);
        } else log(`could not type the answer: ${(typed && typed.error) || 'not typed'}`), emit('nexus.chat.reply.failed', { url: contents.getURL(), line, error: (typed && typed.error) || 'not typed', ts: Date.now() });
      }
    } catch (e) { log(`stopped mid-read: ${e.message}`); } finally { busy = false; }
  }
  contents.on('did-finish-load', start);
  // an in-page move to another chat (Claude Code's sessions are one app) is a first open of that chat (0.59.6)
  contents.on('did-navigate-in-page', () => { const u = String(contents.getURL() || '').split('#')[0]; if (!timer || u !== url) { if (u !== url) opened = false; start(); } });
  contents.on('destroyed', stop);
  return { stop, _tick: tick, _start: start };
}

module.exports = { MODULE_ID, VERSION, RAN, DIAG_JS, attach, watched, readOnly, READ_JS, replyJs, DEFAULT_URLS };
