'use strict';
/**
 * renderer/float-cli.js — the floating CLI's behaviour (BS6, 0.60.179). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-FLOAT-CLI.
 * comp_id: cg.renderer.float-cli
 *
 * copilot-cli.js (the pane's CLI, wearing the Clear Glass hat) does the routing, slash commands, history and completion; this window gives
 * it a log, an input and a stand-in for the webview: /go /back /forward /reload are sent to the browser window it floats over
 * (floatcli:nav), which runs them on its own page. Messages go through cg.copilot.send with the route the three-way bar chose, the same
 * call the pane makes. Nothing here touches the page: there is no DOM context unless the pane sends it.
 */
(function () {
  const cg = window.ClearGlass;
  const q = new URLSearchParams(location.search);
  const agentId = q.get('agentId') || 'default';
  const $ = (id) => document.getElementById(id);
  const log = $('fc-log'), input = $('fc-input');
  let url = '';

  function print(role, text) {
    const d = document.createElement('div'); d.className = `fc-line ${role === 'assistant' || role === 'user' || role === 'cli' || role === 'route' || role === 'thinking' ? role : 'cli'}`;
    d.textContent = String(text == null ? '' : text); log.append(d); log.scrollTop = log.scrollHeight; return d;
  }
  // the protection badge: what this window really is on this machine
  const shield = $('fc-shield');
  if (q.get('protected') === '1') { shield.textContent = '◉ hidden from capture'; shield.className = 'fc-shield on'; shield.title = 'Screen recording and screen sharing leave this window out. No page can read it: it is not part of the page.'; }
  else { shield.textContent = '◌ visible to capture'; shield.className = 'fc-shield off'; shield.title = `This system (${q.get('platform') || 'Linux'}) has no way to keep a window out of screen capture. No page can read it: it is not part of the page.`; }

  const normalizeUrl = (s) => { const t = String(s || '').trim(); if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return t; if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(t)) return `https://${t}`; return `https://duckduckgo.com/?q=${encodeURIComponent(t)}`; };
  const wv = {   // the page lives in the other window: these ask it to act
    getURL: () => url, canGoBack: () => true, canGoForward: () => true,
    goBack: () => cg.floatCli.nav('back'), goForward: () => cg.floatCli.nav('forward'), reload: () => cg.floatCli.nav('reload'),
    executeJavaScript: async () => { throw new Error('the floating CLI does not reach into the page; use the co-pilot pane for that'); },
  };
  const navigate = (u) => cg.floatCli.nav('go', u);
  const cli = window.CGCopilotCLI.create({ cg, agentId, wv, print, normalizeUrl, navigate,
    getCtx: () => ({ dom: false, picks: false, cookies: false }), setCtx: (what) => print('cli', `${what}: page context is the co-pilot pane's (this window never reads the page)`),
    clearMessages: () => log.replaceChildren() });

  async function send() {
    let text = input.value.trim(); if (!text) return;
    input.value = ''; fit();
    const handled = await cli.handle(text);
    if (handled === true) return;
    if (handled && handled.passthrough) text = handled.passthrough;
    print('user', text);
    const wait = print('thinking', 'thinking');
    try {
      const res = await cg.copilot.send({ message: text, agentId, noDom: true, ...cli.route() });
      wait.remove();
      if (!res || res.ok === false) { print('error', (res && res.error) || 'no answer'); return; }
      print('assistant', res.text || '');
      if (res.route && cli.state.showRoute !== false) { const r = res.route; print('route', `${r.backend}${r.agent ? ' · ' + r.agent : ''}${r.hat ? ' · 🎩' : ''}${r.modelUsed ? ' · ' + r.modelUsed : ''}`); }
      if (res.executed === false) cli.propose(res.commands || []);
    } catch (e) { wait.remove(); print('error', e.message); }
  }
  function fit() { input.style.height = 'auto'; input.style.height = `${Math.min(140, input.scrollHeight)}px`; }
  input.addEventListener('input', fit);
  input.addEventListener('keydown', (e) => {
    if (cli.onKey(e, input)) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    if (e.key === 'Escape') { e.preventDefault(); collapse(); }
  });
  $('fc-form').addEventListener('submit', (e) => { e.preventDefault(); send(); });

  // open (panel) ⇄ collapsed (the round button); the window resizes to match (floatcli:size)
  function expand() { document.body.classList.add('open'); cg.floatCli.size(true); setTimeout(() => input.focus(), 30); }
  function collapse() { document.body.classList.remove('open'); cg.floatCli.size(false); }
  $('fab').addEventListener('click', expand);
  $('fc-min').addEventListener('click', collapse);
  // 0.60.280 KB7 — James: "the clearglass floating menu button, can you make that an option to pin it?" Pinned: the button stays on every
  // window, and ✕ collapses to it instead of hiding.
  let pinned = false;
  const paintPin = () => { const b = $('fc-pin'); b.classList.toggle('on', pinned); b.setAttribute('aria-pressed', String(pinned)); b.title = pinned ? 'Pinned: the button stays on every window (click to unpin)' : 'Pin: keep the button on every window'; $('fc-close').title = pinned ? 'Collapse to the button (pinned)' : 'Hide (Ctrl+Shift+Space)'; };
  $('fc-pin').addEventListener('click', async () => { const r = await cg.floatCli.pin(!pinned); if (r && r.ok) { pinned = r.pinned; paintPin(); } else print('error', (r && r.error) || 'could not pin'); });
  try { cg.floatCli.pinned().then((r) => { pinned = !!(r && r.pinned); paintPin(); }).catch(() => {}); } catch (_) {}
  $('fc-close').addEventListener('click', () => cg.floatCli.hide());
  window.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'Space') { e.preventDefault(); cg.floatCli.hide(); } });

  cg.floatCli.onState((s) => {
    if (s.url !== undefined) { url = s.url; $('fc-where').textContent = url ? (() => { try { return new URL(url).host || url; } catch (_) { return url; } })() : ''; }
    if (s.open && s.expanded !== false) expand();
    if (s.pinned !== undefined) { pinned = !!s.pinned; paintPin(); }
    if (s.collapse) document.body.classList.remove('open');
  });
  const hello = document.createElement('div'); hello.className = 'fc-hello';
  hello.textContent = 'Pick who answers above — Ollama, Co-pilot, Guardian (or Claude Code). Type /help for every command. This window is not part of the page.';
  log.append(hello);
  document.body.classList.add('open');
})();
