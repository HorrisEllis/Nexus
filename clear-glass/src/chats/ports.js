'use strict';
/**
 * clear-glass/src/chats/ports.js — the three ports the chat crawler needs, made of Clear Glass automations (PI5b, 0.60.85)
 * comp_id: cg.chats.ports
 * UUID: cg-chats-ports-v1-0000-2026-1016-jamesbrooks-001
 * Map: docs/2026-10-15-personal-chat-import-phasemap.spec (PI5_the_crawler, addendum e: "the crawler's page work is ... a Clear Glass automation workflow")
 *
 * James, 2026-10-16: "build it."  The crawler (crawler.js) decides; this is the part that touches a page. It owns no browser code: it creates two
 * automation workflows per account (one reads the chat list, one reads one chat) and runs them through the engine on the account's OWN session
 * (workflow setting `partition`, which _automationBrowser turns into the hidden tab's webview partition). It never types, sends or clicks a chat: navigation,
 * waiting, scroll and reading only. A wall (signed out, captcha) is read from the page and returned as a kind the plan stops on.
 *
 * UNVERIFIED until he runs it on one account, ten chats: the selectors per provider, that the sidebar list is complete after scrolling, the partition per account.
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');

// Selectors are data, per provider, so a provider changing its page is a settings edit, not a code change.
const PROVIDERS = {
  chatgpt: { home: 'https://chatgpt.com/', chatLink: 'a[href^="/c/"]', messageSelector: '[data-message-author-role]', roleAttr: 'data-message-author-role', idAttr: 'data-message-id' },
};

/** classifyPage({ url, title, text }, nChats) → null | 'login' | 'challenge'.  Pure. */
function classifyPage(p = {}, nChats = 0) {
  const url = String(p.url || ''), title = String(p.title || ''), text = String(p.text || '').slice(0, 4000);
  if (/just a moment|attention required|verify you are human|are you a robot/i.test(title) || /verify you are human|checking if the site connection is secure|captcha/i.test(text)) return 'challenge';
  if (/\/auth\/|\/login|\/signin|accounts\.google|login\.microsoftonline/i.test(url)) return 'login';
  if (!nChats && /\b(log in|sign in|sign up)\b/i.test(text) && !/new chat/i.test(text)) return 'login';
  return null;
}
const _obj = (v) => { if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return v; } } return v; };

function listSteps(p, cfg) {
  return [
    { type: 'trigger', config: {} },
    { type: 'browser', label: 'Open', config: { action: 'navigate', page: 'auto', url: '{{vars.home}}' } },
    { type: 'delay', config: { ms: 5000, jitterMs: 1500 } },
    { type: 'browser', label: 'Scroll', onError: 'continue', config: { action: 'scroll_until', page: 'auto', via: cfg.scrollVia || 'erosmancer', direction: 'down', stepPx: String(cfg.scrollStepPx || 120), pauseMs: String(cfg.scrollPauseMs || 700), countSelector: '{{vars.chatLink}}', stableRounds: String(cfg.scrollStableRounds || 4), maxRounds: '{{vars.rounds}}' } },
    { type: 'extract', label: 'Page', config: { page: 'auto', mode: 'page' } },
    { type: 'extract', label: 'Chats', config: { page: 'auto', mode: 'records', selector: '{{vars.chatLink}}', limit: 2000, fields: 'title = @text\nurl = @href' } },
    { type: 'set', config: { assign: 'page = {{steps.Page.output}}\nchats = {{steps.Chats.output}}\nscroll = {{steps.Scroll.output}}' } },
  ];
}
function readSteps(p, cfg) {
  return [
    { type: 'trigger', config: {} },
    { type: 'browser', label: 'Open', config: { action: 'navigate', page: 'auto', url: '{{vars.chatUrl}}' } },
    { type: 'delay', config: { ms: 4000, jitterMs: 1500 } },
    { type: 'browser', label: 'Scroll', config: { action: 'scroll_until', page: 'auto', via: cfg.scrollVia || 'erosmancer', direction: cfg.scrollDirection || 'up', stepPx: String(cfg.scrollStepPx || 120), pauseMs: String(cfg.scrollPauseMs || 700), countSelector: '{{vars.messageSelector}}', stableRounds: String(cfg.scrollStableRounds || 4), maxRounds: String(cfg.maxScrollRounds || 300) } },
    { type: 'extract', label: 'Page', config: { page: 'auto', mode: 'page' } },
    { type: 'extract', label: 'Messages', config: { page: 'auto', mode: 'records', selector: '{{vars.messageSelector}}', fields: `role = @attr:${p.roleAttr}\nid = @attr:${p.idAttr}\ntext = @text` } },
    { type: 'set', config: { assign: 'page = {{steps.Page.output}}\nmessages = {{steps.Messages.output}}' } },
  ];
}

const _name = (kind, accountKey) => `Chat crawler ${kind}: ${accountKey}`;
/** ensureWorkflows(engine, { accountKey, provider, partition, cfg }) → { listId, readId } — found by name, created once; the partition is the account's own session. */
function ensureWorkflows(engine, { accountKey, provider, partition, cfg = {} }) {
  const p = PROVIDERS[provider]; if (!p) throw new Error(`no chat page known for provider "${provider}" (known: ${Object.keys(PROVIDERS).join(', ')})`);
  const settings = { partition, concurrency: 'queue', timeoutMs: 15 * 60e3 };
  const one = (kind, steps, vars) => {
    const name = _name(kind, accountKey); let wf = engine.find(name);
    if (!wf) wf = engine.create({ name, status: 'active', description: `Reads ${provider} chats for ${accountKey} on its own session. Made by the chat crawler; only navigates, waits, scrolls and reads.`, steps, vars, settings, origin: { source: 'chat-crawler' } }).workflow;
    return wf.id;
  };
  return { provider: p, listId: one('list', listSteps(p, cfg), { home: p.home, chatLink: p.chatLink, rounds: '60' }), readId: one('read', readSteps(p, cfg), { chatUrl: '', messageSelector: p.messageSelector }) };
}


const _chatId = (url) => { const m = String(url).match(/\/c\/([\w-]{8,})/); return m ? m[1] : null; };
/** writeChat({ ledger, root, provider, url, messages }) — files each turn into the chat ledger, skipping any turn the ledger already holds word for word (novel only). */
function writeChat({ ledger, root = null, provider, url, messages }) {
  const chatId = _chatId(url); if (!chatId) return { error: `not a chat address: ${url}` };
  const have = (ledger.readChat({ provider, chatId }, { root }) || {}).turns || [];
  const fresh = messages.map((m, i) => ({ i, role: m.role === 'user' ? 'user' : 'assistant', text: String(m.text || '') })).filter(t => !have[t.i] || have[t.i].text !== t.text);
  let written = 0;
  for (let k = 0; k < fresh.length; k += 50) {
    const r = ledger.applyDelta({ provider, chatId, url, turns: fresh.slice(k, k + 50), generating: false, settled: true }, { root });
    if (!r || r.ok === false) return { error: `the chat ledger refused: ${(r && r.error) || 'no answer'}` };
    written += Math.min(50, fresh.length - k);
  }
  return { written };
}

/** fileStore(dir, accountKey) → { load, save }: the plan's state as one JSON file, written whole and renamed so a crash never leaves half a file. */
function fileStore(dir, accountKey) {
  const f = path.join(dir, String(accountKey).replace(/[^\w.-]+/g, '_') + '.json');
  return {
    file: f,
    load: () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; } },
    save: (state) => { fs.mkdirSync(dir, { recursive: true }); const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(state)); fs.renameSync(tmp, f); },
  };
}

/** makePorts({ engine, accountKey, provider, partition, cfg, dir }) → ports for Crawler */
function makePorts({ engine, accountKey, provider = 'chatgpt', partition, cfg = {}, dir, now = Date.now, ledger = require('../downloads/chat-ledger.js'), ledgerRoot = null } = {}) {
  if (!engine) throw new Error('makePorts needs the automation engine');
  const ids = ensureWorkflows(engine, { accountKey, provider, partition, cfg }); const store = fileStore(dir, accountKey);
  const prov = ids.provider; const baseOf = (u) => { try { return new URL(u, prov.home).href; } catch (_) { return u; } };
  const run = async (id, vars) => engine.run(id, 'crawler', { vars });
  return {
    now, load: store.load, save: store.save, store,
    readList: async ({ more = false } = {}) => {
      const r = await run(ids.listId, { rounds: String((cfg.listScrollRounds || 20) * (more ? 3 : 1)) });
      if (!r || r.ok === false) return { ok: false, kind: 'error', error: (r && r.error) || 'the list workflow did not run' };
      const page = _obj(r.vars.page) || {}; const chats = _obj(r.vars.chats); const scroll = _obj(r.vars.scroll) || {};
      const list = (Array.isArray(chats) ? chats : []).filter(c => c && c.url && /\/c\//.test(c.url)).map(c => ({ url: baseOf(c.url), title: String(c.title || '').trim() || null }));
      const wall = classifyPage(page, list.length); if (wall) return { ok: false, kind: wall };
      if (!list.length) return { ok: false, kind: 'error', error: 'no chats found in the sidebar (signed out, or the page changed: check the selector in Settings)' };
      const rounds = Number(scroll.rounds), cap = (cfg.listScrollRounds || 20) * (more ? 3 : 1);
      return { ok: true, list: [...new Map(list.map(c => [c.url, c])).values()], complete: Number.isFinite(rounds) ? rounds < cap : false };
    },
    visit: async (url) => {
      const r = await run(ids.readId, { chatUrl: url });
      if (!r || r.ok === false) return { kind: 'error', error: (r && r.error) || 'the read workflow did not run' };
      const page = _obj(r.vars.page) || {}; const msgs = _obj(r.vars.messages); const list = Array.isArray(msgs) ? msgs : [];
      const wall = classifyPage(page, list.length); if (wall) return { kind: wall };
      if (!list.length) return { kind: 'empty', error: 'no messages found on the chat page' };
      const hash = crypto.createHash('sha256').update(JSON.stringify(list.map(m => [m.role, m.id, m.text]))).digest('hex').slice(0, 16);
      const wrote = writeChat({ ledger, root: ledgerRoot, provider, url, messages: list });   // the SAME ledger the live observer writes: only what is new is appended
      if (wrote.error) return { kind: 'error', error: wrote.error };
      return { kind: 'ok', turns: list.length, hash, wrote: wrote.written };
    },
  };
}

module.exports = { PROVIDERS, classifyPage, listSteps, readSteps, ensureWorkflows, fileStore, writeChat, makePorts };
