// guardian/userscript-chat-stream.js — every provider chat, streamed live to Clear Glass's download manager.
// comp_id: nexus.guardian.userscript-chat-stream
// Version: 1.0.0
//
// §0.39.278 — James: "guardian is polling, but it shouldn't be, live streams the dom mutation live to the download
// manager, that way we don't lose progress. including you expanding elements for your thoughts."
//
// A shared prelude, loaded the same way as userscript-nexus-wake.js (clear-glass/src/providers/host.js
// _loadSharedPrelude injects it before the provider script): it attaches window.NexusChatStream and does nothing until
// a provider script calls .start({ provider, read, generating }). Defined once, not five times.
//
// HOW (no timer reads the page):
//   - a MutationObserver on the chat (<main>) fires on every DOM change the page makes — a token streamed in, a code
//     block closed, a thinking block opened;
//   - the changes of one burst are coalesced (COALESCE_MS after the FIRST mutation of the burst, so a reply that
//     streams for a minute is sent every ~150ms as it grows, not once at the end);
//   - the chat is read with the provider's own reader, diffed against what Clear Glass has ACKNOWLEDGED, and only the
//     difference goes: per turn, the appended text ({ add, at }) or the whole turn when it was rewritten ({ text });
//     reply and thinking apart;
//   - POST http://127.0.0.1:7702/cli/downloads/ledger (clear-glass/src/downloads/chat-ledger.js appends it as one
//     line). Nothing is marked sent until Clear Glass answers ok, so Clear Glass being closed means "sent later",
//     never lost while the tab is open; a failed send retries with backoff, and pagehide sends what is pending.
//   - thinking: collapsed "Thought process" / "Thinking" toggles in the chat are opened (once each, never re-closed by
//     us), so their text is in the DOM for the reader. Read-only otherwise: never touches the composer.
//
// The settled transcript push (GUARDIAN_TRANSCRIPT → guardian → versioned .response) and the job stream
// (GUARDIAN_CHUNK) stay in each provider script; both are now driven by the same mutations instead of timers.

(function (root) {
  'use strict';
  const VERSION = '1.0.0';
  const COALESCE_MS = 150;
  const RETRY_MS = [1000, 2000, 5000, 10000, 30000];

  /**
   * create({ provider, read, generating, post, agentId, schedule, clear }) — the pure core (no DOM): diff + ack.
   * read() -> { chatId, url, messages:[{ role, text, thinking? }] }; post(body) -> Promise<{ ok, resync? } | null>
   */
  function create({ provider, read, generating = () => null, post, agentId = null, schedule = setTimeout, clear = clearTimeout } = {}) {
    let acked = null;             // { chatId, turns:[{ role, text, thinking }] } as Clear Glass holds it
    let timer = null, inFlight = false, again = false, fails = 0, seq = 0;
    const stats = { sent: 0, skipped: 0, failed: 0, resyncs: 0 };

    function _ops(chat) {
      const fresh = !acked || acked.chatId !== chat.chatId;
      const prev = fresh ? [] : acked.turns;
      const ops = [];
      chat.messages.forEach((m, i) => {
        const p = prev[i];
        const text = String(m.text || ''), thinking = String(m.thinking || '');
        const o = { i, role: m.role };
        let changed = !p || p.role !== m.role;
        if (!p || p.text == null) { o.text = text; changed = true; }
        else if (text !== p.text) { changed = true; if (text.startsWith(p.text)) { o.add = text.slice(p.text.length); o.at = p.text.length; } else o.text = text; }
        if (!p || p.thinking == null) { if (thinking) { o.thinking = thinking; changed = true; } }
        else if (thinking !== p.thinking) { changed = true; if (thinking.startsWith(p.thinking)) { o.thinkingAdd = thinking.slice(p.thinking.length); o.thinkingAt = p.thinking.length; } else o.thinking = thinking; }
        if (changed) ops.push(o);
      });
      return ops;
    }

    async function flush() {
      timer = null;
      if (inFlight) { again = true; return; }
      let chat;
      try { chat = read(); } catch (_) { return; }
      if (!chat || !chat.chatId || chat.chatId === 'home' || !Array.isArray(chat.messages)) return;
      let gen = null; try { gen = generating(); gen = gen == null ? null : !!gen; } catch (_) {}
      const ops = _ops(chat);
      const stateChanged = acked && acked.chatId === chat.chatId && gen !== acked.generating;
      if (!ops.length && !stateChanged) { stats.skipped++; return; }
      const snapshot = { chatId: chat.chatId, generating: gen, turns: chat.messages.map(m => ({ role: m.role, text: String(m.text || ''), thinking: String(m.thinking || '') })) };
      const body = { provider, chatId: chat.chatId, url: chat.url || null, agentId, seq: ++seq, generating: gen, settled: gen === false, turns: ops };
      inFlight = true;
      let r = null;
      try { r = await post(body); } catch (_) { r = null; }
      inFlight = false;
      if (r && r.ok) { acked = snapshot; fails = 0; stats.sent++; }
      else if (r && Array.isArray(r.resync)) {
        // Clear Glass holds a different length for these turns (a delta was missed): send them whole next time
        stats.resyncs++;
        if (!acked || acked.chatId !== chat.chatId) acked = { chatId: chat.chatId, generating: null, turns: [] };
        for (const x of r.resync) acked.turns[x.i] = { role: null, text: null, thinking: null };
        again = true;
      } else {
        stats.failed++;
        const wait = RETRY_MS[Math.min(fails++, RETRY_MS.length - 1)];
        if (!timer) timer = schedule(flush, wait);
      }
      if (again) { again = false; kick(0); }
    }

    /** kick() — a mutation happened: flush once the burst has had COALESCE_MS (the first mutation starts the clock). */
    function kick(ms = COALESCE_MS) { if (!timer) timer = schedule(flush, ms); }
    function stop() { if (timer) clear(timer); timer = null; }
    return { kick, flush, stop, stats, get acked() { return acked; }, _ops };
  }

  // ── The page side ──────────────────────────────────────────────────────────
  const THINK_RE = /^\s*(thought process|thinking|thought for|reasoning|reasoned for|show thinking|thoughts)\b/i;
  const _opened = typeof WeakSet !== 'undefined' ? new WeakSet() : null;

  // A toggle is only a thinking toggle when it sits inside a chat TURN and outside the composer/header: ChatGPT's
  // model picker can read "Thinking" and is an aria-expanded button too — it must never be clicked.
  const TURN_SEL = '[data-message-author-role], [data-testid*="turn"], [data-test-render-count], .font-claude-message, article, model-response, ms-chat-turn, .ds-message';
  const NOT_SEL = 'form, header, nav, [contenteditable="true"], [role="menu"], [role="dialog"]';
  function _inTurn(b) { return !!(b.closest && b.closest(TURN_SEL) && !b.closest(NOT_SEL)); }

  /** expandThinking(scope) — open collapsed thinking toggles once each, so their text is in the DOM to be read. */
  function expandThinking(scope) {
    if (!scope || !_opened) return 0;
    let n = 0;
    for (const b of scope.querySelectorAll('button[aria-expanded="false"], summary')) {
      if (_opened.has(b) || !_inTurn(b)) continue;
      const label = (b.getAttribute('aria-label') || b.textContent || '').trim();
      if (!THINK_RE.test(label)) continue;
      _opened.add(b);   // once: if James closes it again, we leave it closed
      try {
        if (b.tagName === 'SUMMARY') { const d = b.parentElement; if (d && !d.open) { d.open = true; n++; } }
        else { b.click(); n++; }
      } catch (_) {}
    }
    return n;
  }

  /**
   * thinkingOf(turnEl) — the text of a turn's thinking region: the element the thinking toggle controls
   * (aria-controls), else the toggle's collapsible parent minus the toggle's own label. '' when there is none.
   */
  function thinkingOf(turnEl) {
    if (!turnEl || !turnEl.querySelectorAll) return '';
    const parts = [];
    for (const b of turnEl.querySelectorAll('button[aria-expanded], summary')) {
      const label = (b.getAttribute('aria-label') || b.textContent || '').trim();
      if (!THINK_RE.test(label)) continue;
      let region = null;
      const id = b.getAttribute('aria-controls');
      if (id) region = turnEl.ownerDocument.getElementById(id);
      if (!region && b.tagName === 'SUMMARY') region = b.parentElement;
      // the sibling fallback only for an OPEN toggle whose next element holds no code or turn (never the reply itself)
      if (!region && b.getAttribute('aria-expanded') === 'true') {
        const sib = b.nextElementSibling || (b.parentElement && b.parentElement.nextElementSibling);
        if (sib && !sib.querySelector('pre, [data-message-author-role]')) region = sib;
      }
      if (!region) continue;
      let t = (region.innerText || region.textContent || '').trim();
      if (t.startsWith(label)) t = t.slice(label.length).trim();
      if (t) parts.push(t);
    }
    return parts.join('\n\n');
  }

  function _poster(url) {
    return (body) => new Promise((resolve) => {
      const data = JSON.stringify(body);
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({ method: 'POST', url, headers: { 'Content-Type': 'application/json' }, data, timeout: 10000,
          onload: (r) => { try { resolve(JSON.parse(r.responseText)); } catch (_) { resolve(null); } },
          onerror: () => resolve(null), ontimeout: () => resolve(null) });
      } else if (typeof fetch === 'function') {
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: data, keepalive: data.length < 60000 })
          .then(r => r.json()).then(resolve, () => resolve(null));
      } else resolve(null);
    });
  }

  /**
   * start({ provider, read, generating, target?, agentId?, url?, thinking? }) — attach to the live page. Returns the
   * core (kick/flush/stats). Idempotent per page: a second start returns the first.
   */
  let _live = null;
  function start(opts = {}) {
    if (_live) return _live;
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return null;
    const url = opts.url || (root.__NEXUS_CG_URL || 'http://127.0.0.1:7702') + '/cli/downloads/ledger';
    const agentId = opts.agentId || root.__NEXUS_AGENT_ID || null;
    const core = create({ provider: opts.provider, read: opts.read, generating: opts.generating, post: _poster(url), agentId });
    const pickTarget = opts.target || (() => document.querySelector('main') || document.body);
    const expand = opts.thinking !== false;
    let target = null, obs = null;
    const onMutations = () => { if (expand) { try { expandThinking(target); } catch (_) {} } core.kick(); };
    function attach() {
      const t = pickTarget();
      if (!t || t === target) return;
      if (obs) obs.disconnect();
      target = t;
      obs = new MutationObserver(onMutations);
      obs.observe(t, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-expanded', 'data-is-streaming', 'open'] });
      onMutations();
    }
    attach();
    // SPA navigation replaces <main>: a light observer on <body>'s children re-attaches — event-driven, no interval
    new MutationObserver(() => { if (!target || !target.isConnected || target === document.body) attach(); })
      .observe(document.body, { childList: true, subtree: true });
    // leaving the page: send what is pending now
    root.addEventListener && root.addEventListener('pagehide', () => { core.flush(); });
    document.addEventListener && document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') core.flush(); });
    _live = core;
    return core;
  }

  /** splitThinking(text, thinking) -> the reply without its thinking text and the toggle's label line. */
  function splitThinking(text, thinking) {
    let t = String(text || '');
    if (!thinking) return t;
    if (t.includes(thinking)) t = t.replace(thinking, '');
    return t.replace(/^\s*(thought process|thinking|thought for[^\n]*|reasoned for[^\n]*|show thinking)\s*\n/i, '').trim();
  }

  /** withThinking(el, turnEl, text, isHuman) -> { text, thinking? } — one reader line for every provider script. */
  function withThinking(turnEl, text, isHuman) {
    if (isHuman) return { text };
    let thinking = '';
    try { thinking = thinkingOf(turnEl); } catch (_) {}
    if (!thinking) return { text };
    const reply = splitThinking(text, thinking);
    // a "thinking" read that swallowed the whole reply is the wrong region: keep the reply, drop the guess
    if (!reply && String(text || '').trim()) return { text };
    return { text: reply, thinking };
  }

  const api = { VERSION, create, start, expandThinking, thinkingOf, splitThinking, withThinking, THINK_RE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NexusChatStream = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
