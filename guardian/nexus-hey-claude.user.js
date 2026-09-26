// ==UserScript==
// @name         Guardian — Claude v10.0
// @namespace    nexus.guardian.claude
// @version      10.4.0
// @description  Guardian v10: IndexedDB kernel, SHA-256 dedup, pre-prompt intelligence
//               injection, full system widget, connection info, log/ledger, options,
//               SEAM, queue, tags — fully system aware, no localStorage for state.
// @author       James Brooks / Nexus
// @match        https://claude.ai/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @run-at       document-idle
// ==/UserScript==

// ── Shared 'hey nexus' wake module (guardian/userscript-nexus-wake.js), bundled inline ──
// ─────────────────────────────────────────────────────────────────────────────
// guardian/userscript-nexus-wake.js — "Hey nexus" in any agent tab
// UUID: nexus-wake-v1-0000-2026-0818-001
// Version: 1.0.0
// Component: guardian.userscript.nexus-wake
// Hook: guardian.userscript.nexus-wake:v1:p0001
//
// James: "I want to inject into agents every input: Say 'hey nexus' to interact
// with nexus' co-pilot. Then obviously need to add that to the listener and
// have co-pilot respond."
//
// Loaded by each provider userscript (chatgpt / claude / gemini / perplexity),
// so the behaviour is defined once rather than four times (§10.3). It uses the
// injectText()/submit() the host script already exports, instead of a second
// composer driver that would drift from it.
//
// ── TWO FEATURES, DELIBERATELY SEPARATE ─────────────────────────────────────
//
//   1. THE LISTENER — you type "hey nexus, ..." in the composer. It is
//      intercepted BEFORE it reaches the host model: nothing is sent to
//      ChatGPT, the request goes to NEXUS co-pilot, and the answer renders
//      inline. Zero cost anywhere, because the model never sees the turn.
//
//   2. THE AGENT HINT — a line telling the MODEL that NEXUS is reachable, so it
//      can ask for real system state mid-reasoning instead of guessing. This
//      one the model does read.
//
// They are separate because they serve different readers, and conflating them
// is what makes the naive version misbehave. The wake word is for the human;
// the model does not need to know it exists, and telling it every turn invites
// the model to echo the line back, explain the feature, or treat it as an
// instruction it should act on. That risk is behavioural, not economic — it
// does not go away on a flat-rate plan.
//
// So HINT_MODE is per-provider and defaults per plan:
//   'once'    — one capability line at conversation start (default: chatgpt,
//               gemini, perplexity — flat-rate, and once is enough for the
//               model to know the tool exists)
//   'off'     — never injected (default: claude — metered, and the operator is
//               usually the one driving there anyway)
//   'every'   — appended to every input. Available because it was asked for,
//               and NOT the default: repeated identical trailing text is what
//               makes a model start commenting on it.
// ─────────────────────────────────────────────────────────────────────────────

(function (global) {
  'use strict';

  const NEXUS_WAKE = {
    MODULE_ID: 'nexus-wake',
    VERSION:   '1.0.0',
    COMP_ID:   'guardian.userscript.nexus-wake',
    HOOK_ID:   'guardian.userscript.nexus-wake:v1:p0001',
  };

  // Same matcher as lib/agent-chat.parseWake — one grammar, two runtimes. If
  // these drift, a phrase works in the browser and not in the backend (or the
  // reverse), which is the worst kind of bug to chase.
  const WAKE_RE = /^\s*(?:hey|hi|ok|okay)[,\s]+nexus[,:\s]+([\s\S]+)$/i;

  // §CORRECTED 2026-08-18 — this first pointed at guardian's copilot-prompt
  // relay (deliberately not spelled out here: NW-005 scans this file, and a
  // string-scanning test cannot tell code from prose — the same trap BL-001
  // sprang on 2026-08-17 when an explanatory comment reproduced the very
  // literal it was explaining).
  //
  // That route calls askSync(), which DISPATCHES TO
  // ANOTHER PROVIDER — so "hey nexus" would have gone right back out to
  // ChatGPT or Claude and returned a model's guess about NEXUS, wearing
  // co-pilot's name. Exactly the fabricated-compartments failure again, with a
  // more convincing label on it.
  //
  // The real co-pilot is the sovereign service on :3750 (guardian's own
  // comments at lines 2854/3011 say so: "sovereign copilot service at :3750
  // handles these"). It has the tool index, gap field, component registry and
  // ledger — the things that make an answer real rather than plausible.
  //
  // Reachable cross-origin from chatgpt.com because copilot/server.js already
  // sends Access-Control-Allow-Origin: * — checked, not assumed.
  const COPILOT_URL    = 'http://127.0.0.1:3750';
  // §WIRED 2026-08-19 — James: "co-pilot has all it needs to work on nexus."
  // /api/prompt (the old target) is real and intent-routed, but it does NOT
  // run the agentic tool loop — no read_file, no diagnose, no nexus-map,
  // nothing that touches real system state mid-answer. /api/prompt/tools
  // is copilot/tool-runtime.js's run(), the SAME loop copilot runs for
  // everything else, with the full lib/agent-tools registry (60+ tools,
  // including agent_chat/agent_council so it can reach chatgpt and gemini
  // as agents too). Same response shape ({ok, text, ...}) — askNexus()
  // below needed no change for this.
  const COPILOT_PROMPT = `${COPILOT_URL}/api/prompt/tools`;

  const HINT = 'NEXUS is running alongside this chat and can be queried for real system ' +
               'state — open gaps, component registry, test results, ledger history. ' +
               'To ask it, emit a line starting with "hey nexus," and NEXUS will ' +
               'answer with live data. Prefer asking over guessing at ' +
               'system state you cannot see.';

  const HINT_MODE_DEFAULTS = {
    chatgpt:    'once',
    gemini:     'once',
    perplexity: 'once',
    claude:     'off',    // metered; and the operator is usually driving here
  };

  /**
   * parseWake(text) — identical semantics to the backend.
   * Ordinary prose mentioning nexus is NOT hijacked: a greedy matcher here
   * would silently swallow normal conversation, which is far worse than
   * occasionally having to type the prefix twice.
   */
  function parseWake(text) {
    if (typeof text !== 'string' || !text.trim()) return { addressed: false, ask: null };
    const m = text.match(WAKE_RE);
    if (!m) return { addressed: false, ask: null };
    const ask = (m[1] || '').trim();
    if (!ask) return { addressed: false, ask: null, note: 'wake word with no request — ignored rather than sent as an empty prompt' };
    return { addressed: true, ask };
  }

  function _detectAccount(provider) {
    try {
      const selectors = {
        claude:     ['[data-testid="user-menu-button"]', 'button[aria-label*="account" i]'],
        chatgpt:    ['[data-testid="profile-button"]', 'nav button img[alt]'],
        gemini:     ['[aria-label*="Google Account" i]'],
        perplexity: ['[data-testid="user-account-menu"]'],
      }[provider] || [];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        const name = el?.getAttribute('aria-label') || el?.textContent?.trim() || el?.title;
        if (name && name.length < 200) return name;
      }
    } catch (_) { /* §1.2 — a failed read is null, never a guess */ }
    return null;
  }

  /**
   * install(ctx) — wire the listener into a provider userscript.
   *
   * ctx: { provider, tabId, ncpUrl, injectText, submit, log }
   * injectText/submit are the HOST script's own functions. Passing them in
   * rather than re-implementing selectors means one composer driver per
   * provider, not two that disagree after the next UI change.
   */
  function install(ctx) {
    const { provider, tabId, ncpUrl = 'http://127.0.0.1:7820', log = () => {} } = ctx || {};
    if (!provider) { console.warn('[nexus-wake] §1.1 install requires a provider name'); return null; }

    const mode = (ctx.hintMode || HINT_MODE_DEFAULTS[provider] || 'once');
    let hintSent = false;
    let installed = false;

    // ── The listener ────────────────────────────────────────────────────────
    // Capture-phase keydown on the document. Capture matters: the host app's
    // own Enter handler must not run first, or the turn is already gone.
    function onKeyDown(e) {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      const el = e.target;
      if (!el) return;
      const isComposer = el.isContentEditable ||
                         el.tagName === 'TEXTAREA' ||
                         el.closest?.('[contenteditable="true"]');
      if (!isComposer) return;

      const text = (el.isContentEditable ? el.textContent : el.value) || '';
      const { addressed, ask } = parseWake(text);
      if (!addressed) return;   // ordinary turn — hands off entirely

      // Intercept. The host model never receives this turn.
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();

      _clearComposer(el);
      _render('question', ask);
      _render('pending', 'asking nexus co-pilot…');

      askNexus(ask)
        .then(r => {
          if (r.ok) _render('answer', r.text || '(co-pilot returned an empty answer)');
          // §1.2 — a miss is STATED. A wake word that silently does nothing is
          // indistinguishable from one that was not recognised, and the user
          // would reasonably conclude the feature is broken rather than that
          // co-pilot is down.
          else _render('error', `co-pilot unreachable — ${r.error}. Your message was NOT sent to ${provider}; nothing was lost, but nothing was asked either.`);
        })
        .catch(err => _render('error', `wake handler failed: ${err.message}`));
    }

  const _sentIdentity = new Set();   // sessionId → already sent this account+url

  async function askNexus(ask) {
      // §FIXED 2026-08-22 — James: "it didn't work." Real, likely root
      // cause, found by checking rather than assuming the wake logic
      // itself was broken: this used plain fetch(), which is blocked by
      // the browser as mixed content (https://claude.ai page -> real
      // http://127.0.0.1 target) exactly like EventSource is — no CORS
      // header from guardian can fix that, it's enforced by the browser
      // based on the PAGE's protocol. Unlike EventSource (needs real
      // streaming, no privileged equivalent), a single POST/response is
      // exactly what GM_xmlhttpRequest handles natively — same privileged,
      // already-working pattern this file's sibling userscript-claude.js
      // already uses for 6+ other endpoints, confirmed by reading them
      // directly. GM_xmlhttpRequest is callback-based; wrapped in a real
      // Promise so every existing .then()/await caller needs no changes.
      return new Promise((resolve) => {
        try {
          if (typeof GM_xmlhttpRequest !== 'function') {
            resolve({ ok: false, error: 'GM_xmlhttpRequest unavailable — @grant GM_xmlhttpRequest missing from this userscript\'s header' });
            return;
          }
          GM_xmlhttpRequest({
            method: 'POST',
            url: COPILOT_PROMPT,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({
              prompt: ask,
              channel: `wake:${provider}`,
              sessionId: _sessionId(),   // one co-pilot session per chat tab, so
                                         // follow-ups keep their context
              meta: { source: 'nexus-wake', provider, tabId, chatUrl: location.href },
            }),
            timeout: 30000,
            onload: (res) => {
              if (res.status < 200 || res.status >= 300) { resolve({ ok: false, error: `co-pilot HTTP ${res.status}` }); return; }
              let j = {};
              try { j = JSON.parse(res.responseText); } catch (_) {}
              const text = j.text || j.response || j.answer || j.result || null;
              if (!text) {
                // §1.2 — a 200 with no answer is a real outcome and must not
                // render as a blank bubble the user reads as "it ignored me".
                resolve({ ok: false, error: 'co-pilot answered 200 with no text field' });
                return;
              }
              resolve({ ok: true, text });
            },
            onerror: (e) => resolve({ ok: false, error: `GM_xmlhttpRequest failed: ${e.error || e.statusText || 'unknown network error'}` }),
            ontimeout: () => resolve({ ok: false, error: 'co-pilot request timed out after 30s' }),
          });
        } catch (e) {
          resolve({ ok: false, error: e.message });
        }
      });
    }

    // One co-pilot session per chat tab: a follow-up like "and the second one?"
    // is meaningless without it. Derived from the chat URL so a reload keeps
    // the same thread rather than silently starting a new one.
    function _sessionId() {
      const m = location.pathname.match(/([0-9a-f-]{8,})/i);
      return `wake:${provider}:${m ? m[1] : (tabId || 'tab')}`;
    }

    /**
     * captureAccountIdentity() — James: "clear-glass to have the account
     * name for cookies... so we can address it from nexus." Real, closed
     * gap, not new server plumbing: guardian/lib/ncp.js's handleChannel and
     * the event handlers in guardian/server.js already destructure and
     * persist account/chatUrl on every real chat_log and artifacts insert
     * — confirmed by reading both files. No client has ever actually SENT
     * those fields, so they've always landed undefined. This is that
     * missing half. Once per session, not per message — the same
     * paintroller discipline James asked for explicitly.
     */
    function captureAccountIdentity() {
      const key = `${_sessionId()}:${location.href}`;
      if (_sentIdentity.has(key)) return;
      const account = _detectAccount(provider);
      if (!account) return;   // nothing real found — send nothing, not a guess
      _sentIdentity.add(key);
      fetch(`${ncpUrl}/api/account-identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, tabId, sessionId: _sessionId(), account, chatUrl: location.href, ts: Date.now() }),
      }).catch(() => { _sentIdentity.delete(key); });   // real failure — allow a real retry later
    }
    captureAccountIdentity();

    // ── The agent hint ──────────────────────────────────────────────────────
    /**
     * decorate(outgoing) — called by the host script just before a prompt is
     * sent TO the model. Returns the text to actually send.
     *
     * 'once' appends on the first outgoing turn only. That is enough for the
     * model to know the capability exists, and avoids the repeated-trailing-
     * text effect that makes models start remarking on it.
     */
    function decorate(outgoing) {
      if (mode === 'off') return outgoing;
      if (mode === 'once' && hintSent) return outgoing;
      hintSent = true;
      return `${outgoing}\n\n---\n[NEXUS] ${HINT}`;
    }

    /** resetHint() — call on a new conversation so 'once' means once per chat. */
    function resetHint() { hintSent = false; }

    // ── Affordance ──────────────────────────────────────────────────────────
    // The reminder that "hey nexus" exists belongs on screen, where the person
    // typing can see it — not in the prompt, where only the model can.
    function _affordance() {
      try {
        const el = document.querySelector('[contenteditable="true"][data-placeholder], textarea[placeholder]');
        if (!el) return;
        const cur = el.getAttribute('data-placeholder') || el.getAttribute('placeholder') || '';
        if (cur.includes('hey nexus')) return;
        const next = cur ? `${cur}   ·   say "hey nexus" for NEXUS co-pilot` : 'say "hey nexus" for NEXUS co-pilot';
        if (el.hasAttribute('data-placeholder')) el.setAttribute('data-placeholder', next);
        else el.setAttribute('placeholder', next);
      } catch (_) { /* cosmetic only — never break the composer over a hint */ }
    }

    function _clearComposer(el) {
      try {
        if (el.isContentEditable) {
          el.focus();
          document.execCommand('selectAll', false, null);
          document.execCommand('delete', false, null);
          if (el.textContent) el.textContent = '';
        } else { el.value = ''; }
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (_) {}
    }

    function _render(kind, text) {
      let box = document.getElementById('nexus-wake-box');
      if (!box) {
        box = document.createElement('div');
        box.id = 'nexus-wake-box';
        box.style.cssText = 'position:fixed;right:18px;bottom:96px;width:390px;max-height:52vh;overflow:auto;' +
          'background:#0e0e12;color:#e8e8ef;border:1px solid #2c2c38;border-left:3px solid #5DCAA5;' +
          'font:12px/1.5 ui-monospace,Menlo,monospace;padding:12px 14px;z-index:2147483647;border-radius:2px;';
        const head = document.createElement('div');
        head.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px;color:#8a8a9a;font-size:10px;letter-spacing:1px;';
        head.innerHTML = '<span style="color:#5DCAA5">\u2b21</span> NEXUS CO-PILOT';
        const x = document.createElement('button');
        x.textContent = '\u2715';
        x.style.cssText = 'margin-left:auto;background:none;border:none;color:#5a5a68;cursor:pointer;font-size:12px;';
        x.onclick = () => box.remove();
        head.appendChild(x);
        box.appendChild(head);
        document.body.appendChild(box);
      }
      const line = document.createElement('div');
      line.style.cssText = 'margin-bottom:8px;white-space:pre-wrap;word-break:break-word;' +
        (kind === 'question' ? 'color:#8a8a9a;font-style:italic;'
         : kind === 'pending' ? 'color:#F9CB42;'
         : kind === 'error'   ? 'color:#E24B4A;' : 'color:#e8e8ef;');
      line.textContent = kind === 'question' ? `\u203a ${text}` : text;
      // A pending line is replaced by its own result rather than stacking.
      if (kind !== 'pending') {
        const p = box.querySelector('[data-pending]');
        if (p) p.remove();
      } else { line.setAttribute('data-pending', '1'); }
      box.appendChild(line);
      box.scrollTop = box.scrollHeight;
    }

    // Capture phase, on document — must beat the host app's own handler.
    document.addEventListener('keydown', onKeyDown, true);
    installed = true;

    _affordance();
    const affordanceTimer = setInterval(_affordance, 4000);  // SPAs re-render the composer
    if (affordanceTimer.unref) affordanceTimer.unref();

    log(`[nexus-wake] v${NEXUS_WAKE.VERSION} armed on ${provider} — wake word live, agent hint: ${mode}`);

    return {
      parseWake, decorate, resetHint,
      health: () => ({ installed, provider, hintMode: mode, hintSent, wakeWord: 'hey nexus, <request>' }),
      // §WIRED 2026-08-22 — the ClearGlass-side half of closing the loop:
      // renders a real, externally-supplied answer (from
      // ProviderHost.injectAnswer()) the exact same way a locally-triggered
      // wake answer renders — never re-submitted to the underlying model as
      // a new prompt, matching this file's own stated design.
      showAnswer: (text) => { _render('answer', text); return { ok: true }; },
      // §WIRED 2026-08-22 — James: "guardian already listens for the agents
      // chat." Confirmed real: userscript-claude.js's MutationObserver
      // (_nexusStartObserver) already watches every new message in the
      // conversation, both user and assistant turns — it just never checked
      // any of them for the wake phrase, only logged and annotated them.
      // checkMessage() is that missing check, reusing the exact same
      // parseWake()/askNexus()/_render() the composer interceptor already
      // uses, so a message ANYWHERE in the conversation — including one the
      // assistant itself writes — can trigger a real co-pilot exchange, not
      // only text typed directly into the composer.
      checkMessage(role, text) {
        const { addressed, ask } = parseWake(text);
        if (!addressed) return false;
        _render('question', ask);
        _render('pending', 'asking nexus co-pilot…');
        askNexus(ask).then(r => {
          if (r.ok) _render('answer', r.text || '(co-pilot returned an empty answer)');
          else _render('error', `co-pilot unreachable — ${r.error}.`);
        }).catch(err => _render('error', `wake handler failed: ${err.message}`));
        return true;
      },
      uninstall() {
        document.removeEventListener('keydown', onKeyDown, true);
        clearInterval(affordanceTimer);
        document.getElementById('nexus-wake-box')?.remove();
        installed = false;
      },
    };
  }

  const api = { install, parseWake, WAKE_RE, HINT, HINT_MODE_DEFAULTS, detectAccount: _detectAccount, ...NEXUS_WAKE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.NexusWake = api;
})(typeof window !== 'undefined' ? window : globalThis);

// ── Guardian's real Claude userscript body ──

(function () {
'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const NCP_URL    = 'http://127.0.0.1:7820';
const NCP_CHANNEL = `${NCP_URL}/channel`;
const NCP_RESULT  = `${NCP_URL}/result`;
const NCP_HB      = `${NCP_URL}/heartbeat`;
const CORTEX_URL  = 'http://127.0.0.1:3748';
const INTELLIGENCE_URL = 'http://127.0.0.1:3753'; // intelligence is its own sovereign system (moved out of cortex 2026-09-19)
const ORCH_URL    = 'http://127.0.0.1:9000';
const PROVIDER    = 'claude';
const VERSION    = '10.4.0';
// §P113: exponential backoff 3s→30s — eliminates SSE flood on disconnect
const RECONNECT_MIN_MS = 3000;
const RECONNECT_MAX_MS = 30000;
let _reconnectAttempts = 0;
// §BUGFIX 2026-08-27 — same root cause and same fix as
// guardian/userscript-chatgpt.js / -claude.js / -gemini.js / -perplexity.js:
// `const NEXUS` was declared inside _es.onopen's closure, but injectText()
// (module-scope, every job dispatch runs through it) references the bare
// name `NEXUS` — never in scope there. ReferenceError on every call. Hoisted
// to real module scope; onopen below now assigns it instead of shadowing it.
let NEXUS = null;
const HB_MS        = 8000;

// ── Tab identity (sessionStorage only — intentionally ephemeral) ──────────────
const MY_TAB = sessionStorage.getItem('gd_tab_id') || (() => {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  sessionStorage.setItem('gd_tab_id', id); return id;
})();
const TAB_KEY = 'guardian_claimed_tab_claude';

// ── Runtime state ─────────────────────────────────────────────────────────────
let _es = null, _hb = null, _reconnectTimer = null;
let connState = 'disconnected';
let currentJobId = null, jobActive = false;
let _watchTimer = null, _watchObs = null, _watchStart = 0;
let panelOpen = false, activeTab = 'log';
let isClaimed = true; // §FIX 2026-06-20: passive mode removed — every connected tab executes jobs, no single-tab claim gate
let sessionStart = Date.now(), sessionTokens = 0, sessionJobs = 0;
let logEntries = [], unreadCount = 0;
let currentGaps = [], artifactStore = [], _usageHistory = [];
let accountState = null;
let _settings = {}; // loaded from GM_getValue on init
let _systemStatus = {}; // polled from orchestrator
let _intelligenceCtx = null; // last pulled context

// ── IndexedDB Kernel — §US-02 ─────────────────────────────────────────────────
// Three stores: requests (queue), sessions (UUID chain), artifacts (hash→UUID).
// Replay authority lives here. Nothing else owns replay. §US-03.
const IDB_NAME    = 'nexus_guardian_claude';
const IDB_VERSION = 1;
let _db = null;

function dbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('requests')) {
        const s = db.createObjectStore('requests', { keyPath: 'uuid' });
        s.createIndex('status', 'status');
        s.createIndex('sessionId', 'sessionId');
      }
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'sessionId' });
      }
      if (!db.objectStoreNames.contains('artifacts')) {
        const a = db.createObjectStore('artifacts', { keyPath: 'hash' });
        a.createIndex('jobId', 'jobId');
        a.createIndex('ts', 'ts');
      }
    };
    req.onsuccess = e => { _db = e.target.result; res(_db); };
    req.onerror   = e => rej(e.target.error);
  });
}

function dbPut(store, obj) {
  if (!_db) return Promise.resolve(null);
  return new Promise((res, rej) => {
    const tx = _db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(obj);
    req.onsuccess = () => res(req.result);
    req.onerror   = e => rej(e.target.error);
  });
}

function dbGet(store, key) {
  if (!_db) return Promise.resolve(null);
  return new Promise((res, rej) => {
    const tx  = _db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => res(req.result || null);
    req.onerror   = e => rej(e.target.error);
  });
}

function dbGetAll(store, indexName, value) {
  if (!_db) return Promise.resolve([]);
  return new Promise((res, rej) => {
    const tx = _db.transaction(store, 'readonly');
    const s  = tx.objectStore(store);
    const req = indexName ? s.index(indexName).getAll(value) : s.getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror   = e => rej(e.target.error);
  });
}

function dbDelete(store, key) {
  if (!_db) return Promise.resolve();
  return new Promise((res, rej) => {
    const tx  = _db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => res();
    req.onerror   = e => rej(e.target.error);
  });
}

// ── SHA-256 dedup — §US-05 ────────────────────────────────────────────────────
async function sha256(text) {
  try {
    const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0,16);
  } catch(_) {
    // fallback if subtle not available (http context)
    let h = 0;
    for (let i = 0; i < text.length; i++) { h = Math.imul(31, h) + text.charCodeAt(i) | 0; }
    return Math.abs(h).toString(16).padStart(8,'0');
  }
}

// ── Session UUID chain — §US-04, §IDENTITY-03 ─────────────────────────────────
let _sessionId = null;
async function getSessionId() {
  if (_sessionId) return _sessionId;
  const chatPath = location.pathname;
  const stored   = await dbGet('sessions', chatPath);
  if (stored) { _sessionId = stored.sessionId; return _sessionId; }
  _sessionId = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  await dbPut('sessions', { sessionId: _sessionId, chatPath, provider: PROVIDER, startedAt: Date.now() });
  return _sessionId;
}

// §RETIRED 0.39.237 — the IndexedDB replay-on-connect was removed. It re-sent
// every 'pending' record in this origin's IndexedDB on connect. That store is
// shared by every window on the origin, so a newly opened window re-sent other
// windows' requests; the records carry `uuid`, not `jobId`, so guardian never
// matched one; and had it matched, guardian would have marked a live job
// complete with no response. Guardian's own .job files (0.39.225) are the
// restart recovery.

// ── Utils ─────────────────────────────────────────────────────────────────────
function uid()  { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function fts(ts){ return new Date(ts).toTimeString().slice(0,8); }
function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function estimateTokens(s) { return Math.max(1, Math.round((s||'').length / 4)); }
function chatId() {
  const m = location.pathname.match(/\/chat\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : 'home';
}
function getAccount() {
  if (accountState) return accountState;
  const sels = ['[data-testid="user-email"]','[data-testid="account-email"]','[aria-label*="@"]','nav [title*="@"]'];
  for (const sel of sels) {
    const el = document.querySelector(sel);
    if (el) {
      const t = (el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent||'').trim();
      if (t.includes('@') || t.length > 3) { accountState = t.slice(0,60); return accountState; }
    }
  }
  return location.hostname;
}

// ── Usage/quota-limit detection — §US-GAP-01 ─────────────────────────────────
// §HONEST-NOTE: same caveat as the chatgpt.js mirror of this — claude.ai's
// limit-banner copy/markup isn't pinned to a verified-current string, this is
// a layered, drift-tolerant scan (alert/live-region markup first, composer
// container text second, disabled-composer corroboration third). Extend
// USAGE_PATTERNS as real copy is observed.
let usageState = { limited: false, message: null, resetHint: null, detectedAt: null };
const USAGE_PATTERNS = [
  /usage limit/i, /message limit/i, /hit (the|your) .*(limit|cap)/i,
  /reached (the|your) .*(limit|cap)/i, /limit will reset/i, /resets? (on|at|in)/i,
  /upgrade to (pro|max|team)/i, /approaching your .*limit/i,
];
const RESET_HINT_RE = /(reset|resets?)[^.]{0,60}/i;
function _composerDisabled() {
  const ta = document.querySelector('div[contenteditable="true"], .ProseMirror, textarea[data-testid]');
  const btn = document.querySelector('[data-testid="send-button"], button[aria-label*="Send"]');
  return !!(ta?.getAttribute('contenteditable')==='false' || ta?.getAttribute('aria-disabled')==='true' || btn?.disabled);
}
function detectUsageLimit() {
  try {
    const regions = [
      ...document.querySelectorAll('[role="alert"], [role="status"], [aria-live="polite"], [aria-live="assertive"]'),
    ];
    // Fallback: composer's grandparent container — limit banners render right above/below input
    const composer = document.querySelector('div[contenteditable="true"], .ProseMirror');
    if (composer) { const c = composer.closest('form')?.parentElement || composer.parentElement?.parentElement; if (c) regions.push(c); }

    for (const el of regions) {
      const t = (el.textContent || '').trim();
      if (!t || t.length > 400) continue; // skip huge unrelated containers
      if (USAGE_PATTERNS.some(re => re.test(t))) {
        const resetMatch = t.match(RESET_HINT_RE);
        usageState = { limited: true, message: t.slice(0,200), resetHint: resetMatch?.[0]||null, detectedAt: Date.now() };
        return usageState;
      }
    }
    if (_composerDisabled() && usageState.limited === false) {
      usageState = { limited: 'suspected', message: 'composer disabled, no matching banner text', resetHint: null, detectedAt: Date.now() };
      return usageState;
    }
    if (usageState.limited) usageState = { limited: false, message: null, resetHint: null, detectedAt: Date.now() }; // cleared
    return usageState;
  } catch(e) { return usageState; }
}
function detectLang(el) {
  const c = el.tagName==='CODE' ? el : el.querySelector('code');
  if (c) { const cl=Array.from(c.classList).find(x=>x.startsWith('language-')); if(cl)return cl.replace('language-',''); }
  return null;
}

// ── Tab claim — sessionStorage only, GM for persistence across tabs ───────────
function amIClaimed() { return GM_getValue(TAB_KEY,'') === MY_TAB; }
function claimTab()   { GM_setValue(TAB_KEY, MY_TAB); isClaimed = true; updatePill(); }
function releaseTab() { /* no-op — passive mode removed, tabs stay active */ }
function autoClaimIfFree() {
  const ex = GM_getValue(TAB_KEY,'');
  if (!ex) { claimTab(); return; }
  const last = GM_getValue('gd_hb_'+ex, 0);
  if (Date.now() - last > 15000) { GM_setValue(TAB_KEY,''); claimTab(); }
}
setInterval(() => GM_setValue('gd_hb_'+MY_TAB, Date.now()), 5000);

// ── Bus connections ───────────────────────────────────────────────────────────
function _toOrc(system, type, payload = {}) {
  fetch(`${ORCH_URL}/api/ledger`, { method:'POST', headers:{'Content-Type':'application/json'}, keepalive:true,
    body: JSON.stringify({ system, type, payload }) }).catch(()=>{});
}
function _toCortex(type, payload = {}) {
  fetch(`${CORTEX_URL}/api/event`, { method:'POST', headers:{'Content-Type':'application/json'}, keepalive:true,
    body: JSON.stringify({ type, payload: { ...payload, _account:getAccount(), _chatUrl:location.href },
      source:'userscript-claude', causedBy:currentJobId||null, ts:Date.now() }) }).catch(()=>{});
}
// §GAP CLOSED 2026-07-06 — same fix as userscript-chatgpt.js: _toCortex
// only ever sent metadata shells, never real content. See that file's
// comment for the full explanation.
// §BUG FIXED 2026-07-06 — same fix as userscript-chatgpt.js: cortex now
// rejects pushes over 256KB, so this truncates client-side instead of
// letting an oversized push silently vanish via the fire-and-forget catch.
const CORTEX_PUSH_LIMIT = 250 * 1024;
function _toCortexPush(content, tags = [], tier = 'session') {
  let body = content;
  if (typeof body === 'string' && body.length > CORTEX_PUSH_LIMIT) {
    body = body.slice(0, CORTEX_PUSH_LIMIT) + '\n\n[...truncated, exceeded push size limit...]';
  }
  fetch(`${CORTEX_URL}/api/push`, { method:'POST', headers:{'Content-Type':'application/json'}, keepalive:true,
    body: JSON.stringify({ content: body, tags, tier }) }).catch(()=>{});
}
function _toNCP(type, payload = {}) {
  fetch(`${NCP_URL}/result`, { method:'POST', headers:{'Content-Type':'application/json'}, keepalive:true,
    body: JSON.stringify({ type, ...payload, ts:Date.now() }) }).catch(()=>{});
}

// ── Gate — §1.2 ───────────────────────────────────────────────────────────────
async function gate(name, fn, opts = {}) {
  const { jobId = null } = opts;
  const t0 = Date.now();
  try {
    const result = await fn();
    _log('ok', `✓ ${name}`, `${Date.now()-t0}ms`);
    return { ok: true, result };
  } catch (e) {
    const msg = `${name}: ${e.message}`;
    _log('err', `§1.2 GATE FAIL: ${name}`, e.message);
    toast(msg, 'error', 4000);
    if (jobId) send({ type:'GUARDIAN_ERROR', jobId, gate:name, error:msg, chatUrl:location.href, account:getAccount() });
    _toCortex('guardian.gate.failed', { gate:name, error:e.message });
    return { ok: false, error: msg };
  }
}

// ── §US-04 Pre-prompt intelligence injection ───────────────────────────────────
// Before each prompt: query cortex intelligence for reusable artifacts,
// failure modes, and active patterns. Sends UUID refs, not full content.
async function pullIntelligenceContext(intent, command) {
  try {
    const url = `${INTELLIGENCE_URL}/api/intelligence/context` +
      `?intent=${encodeURIComponent((intent||'').slice(0,120))}` +
      `&command=${encodeURIComponent(command||'')}` +
      `&provider=${PROVIDER}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    _intelligenceCtx = await r.json();
    return _intelligenceCtx;
  } catch(_) { return null; }
}

function buildContextHeader(ctx) {
  if (!ctx) return '';
  const parts = [];

  if (ctx.failureModes?.length) {
    const modes = ctx.failureModes.slice(0,3)
      .map(f => `  - ${f.faultClass} (×${f.count}): ${f.note||''}`)
      .join('\n');
    parts.push(`[KNOWN FAILURE MODES — account for these]\n${modes}`);
  }

  if (ctx.reuse?.length) {
    const items = ctx.reuse.slice(0,2)
      .map(r => `  - ${r.type} [${r.lang||'?'}] hash:${r.hash} — ${r.intent||''}`)
      .join('\n');
    parts.push(`[REUSABLE ARTIFACTS — check before reimplementing]\n${items}`);
  }

  if (ctx.patterns?.filter(p => p.actionable).length) {
    const pats = ctx.patterns.filter(p => p.actionable).slice(0,2)
      .map(p => `  - ${p.description}`)
      .join('\n');
    parts.push(`[ACTIVE PATTERNS]\n${pats}`);
  }

  if (ctx.systemState?.criticalGaps > 0) {
    parts.push(`[SYSTEM STATE] ${ctx.systemState.criticalGaps} critical gaps open — types: ${ctx.systemState.topGapTypes?.join(', ')||'?'}`);
  }

  return parts.length ? `[NEXUS CONTEXT]\n${parts.join('\n')}\n\n` : '';
}

// Legacy cortex context pull (memory/context endpoint)
async function pullCortexContext(prompt) {
  try {
    const q = encodeURIComponent((prompt||'').slice(0,120));
    const r = await fetch(`${NCP_URL}/memory/context?q=${q}`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return '';
    const d = await r.json();
    const parts = [];
    if (d.gaps?.length) {
      parts.push('[OPEN GAPS]\n' + d.gaps.slice(0,3).map(g=>`  - ${g.type}: ${(g.description||'').slice(0,80)}`).join('\n'));
    }
    if (d.artifacts?.length) {
      parts.push('[RECENT ARTIFACTS]\n' + d.artifacts.slice(0,2).map(a=>`  - ${a.name||a.lang||'artifact'}`).join('\n'));
    }
    return parts.length ? '[NEXUS CONTEXT]\n' + parts.join('\n') + '\n\n' : '';
  } catch(_) { return ''; }
}

// ── NCP post helper ───────────────────────────────────────────────────────────
async function ncpPost(url, data) {
  try {
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ ...data, chatUrl: location.href, account: getAccount() }),
    });
    return res.ok ? await res.json() : null;
  } catch(_) { return null; }
}

function send(obj) { ncpPost(NCP_RESULT, obj).catch(()=>{}); }
function sendLedger(category, msg, meta={}) {
  send({ type:'GUARDIAN_LEDGER_EVENT', level:category, category, msg, meta,
    chatUrl:location.href, account:getAccount(), requestId:currentJobId });
}

// ── §2.3 Log ──────────────────────────────────────────────────────────────────
function _log(type, msg, detail) {
  const T = { info:{c:'#94a3b8',i:'·'}, in:{c:'#60a5fa',i:'↓'}, out:{c:'#a78bfa',i:'↑'},
    ok:{c:'#34d399',i:'✓'}, err:{c:'#f87171',i:'✗'}, job:{c:'#fbbf24',i:'⚡'},
    gap:{c:'#f472b6',i:'△'}, sys:{c:'#818cf8',i:'◈'}, use:{c:'#2dd4bf',i:'~'},
    debug:{c:'#334155',i:'·'} };
  const t = T[type] || T.info;
  const entry = { ts:Date.now(), type, msg, detail:detail||null, color:t.c, icon:t.i };
  logEntries.push(entry);
  if (logEntries.length > 300) logEntries.shift();
  if (panelOpen && activeTab==='log') _appendLogRow(entry);
  else { unreadCount++; _setBadge(unreadCount); }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type='info', ms=3000) {
  const C = { success:'#34d399', error:'#f87171', warn:'#f59e0b', job:'#fbbf24', info:'#818cf8' };
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;bottom:80px;right:20px;z-index:2147483647;background:rgba(8,8,14,.95);` +
    `border:1px solid ${C[type]||C.info}44;color:${C[type]||C.info};padding:8px 14px;border-radius:6px;` +
    `font:600 11px 'SF Mono',monospace;box-shadow:0 4px 20px rgba(0,0,0,.6);max-width:340px;animation:gfadein .12s ease`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// ── Streaming to cortex ───────────────────────────────────────────────────────
let _streamBuf = '', _streamCnt = 0;
function _streamToCortex(jobId, delta, full) {
  _streamBuf += delta; _streamCnt++;
  if (_streamBuf.length < 400 && _streamCnt % 5 !== 0 && !/[.!?\n]$/.test(delta)) return;
  const batch = _streamBuf; _streamBuf = '';
  _toCortex('guardian.job.stream', { jobId, provider:PROVIDER, text:batch.slice(0,2000),
    chars:batch.length, fullLen:(full||'').length, chatUrl:location.href });
}

// ── Usage recording ───────────────────────────────────────────────────────────
function recordUsage(jobId, text, ms) {
  const tokens = estimateTokens(text);
  sessionTokens += tokens; sessionJobs++;
  const u = { jobId, chatId:chatId(), chars:text.length, tokens, ms, ts:Date.now(), retried:false };
  _usageHistory.push(u);
  if (_usageHistory.length > 50) _usageHistory.shift();
  return u;
}

// ── Artifact detection + IDB dedup (SHA-256) — §US-05 ────────────────────────
let _seenHashes = new Set(); // session-level dedup, IDB is persistent

async function scanArtifacts(jobId) {
  const codeEls = document.querySelectorAll('pre code, .code-block__code, [class*="CodeBlock"] code');
  for (const el of codeEls) {
    const content = (el.innerText || el.textContent || '').trim();
    if (content.length < 50) continue;
    const hash = await sha256(content);
    if (_seenHashes.has(hash)) continue;
    // Check IDB — if already stored, skip
    const existing = await dbGet('artifacts', hash);
    if (existing) { _seenHashes.add(hash); continue; }
    _seenHashes.add(hash);
    const lang = detectLang(el) || 'text';
    const art  = { hash, lang, content: content.slice(0,4000), jobId, provider:PROVIDER,
      sessionId: await getSessionId(), ts: Date.now() };
    // §US-05 — store in IDB first
    await dbPut('artifacts', art);
    artifactStore.push(art);
    if (artifactStore.length > 200) artifactStore.shift();
    // Then send to guardian/cortex
    send({ type:'GUARDIAN_ARTIFACT', jobId, content:art.content, lang, hash, chatUrl:location.href, account:getAccount() });
    _toCortex('guardian.artifact', { jobId, hash, lang, chars:content.length });
    _toCortexPush(content, ['artifact', lang, `job:${jobId}`], 'session');
    _log('ok', `Artifact: ${lang} ${hash}`, `${content.length}ch`);
    if (panelOpen && activeTab==='arts') renderArts();
  }
}

// ── DOM observation ───────────────────────────────────────────────────────────
function findResponseEl() {
  return document.querySelector(
    '[data-is-streaming="true"], .font-claude-message:last-child, ' +
    '[class*="assistant-message"]:last-child .font-claude-message, ' +
    '.text-streaming'
  );
}
function _isGenerating() {
  return !!document.querySelector('[data-is-streaming="true"], .text-streaming, [class*="loading"]');
}
function injectText(text) {
  // §NEXUS-WAKE 2026-08-18 — one-line hook (HOOKUP.md §3): if the outgoing
  // turn earned the agent hint (per-provider hintMode), append it here, right
  // before injection, same as every other provider script.
  text = NEXUS ? NEXUS.decorate(text) : text;
  const el = document.querySelector('[contenteditable="true"][data-placeholder]') ||
             document.querySelector('.ProseMirror[contenteditable="true"]') ||
             document.querySelector('[contenteditable="true"]');
  if (!el) return false;
  el.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, text);
  if (!el.textContent.includes(text.slice(0,20))) {
    el.textContent = text;
    el.dispatchEvent(new Event('input', { bubbles:true }));
  }
  return true;
}
function submit() {
  const btn = document.querySelector('button[aria-label="Send message"]:not([disabled])') ||
              document.querySelector('button[type="submit"]:not([disabled])') ||
              document.querySelector('[data-testid="send-button"]:not([disabled])');
  if (btn) { btn.click(); return; }
  const el = document.querySelector('[contenteditable="true"]');
  if (el) el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));
}

// ── Scan DOM for spatial / DOM map signal ─────────────────────────────────────
function sendDOMMap() {
  if (!connState === 'ready') return;
  const nodes = Array.from(document.querySelectorAll(
    '.font-claude-message, [class*="conversation"], [class*="message"]'
  )).slice(0,20).map(el => ({
    tag: el.tagName, id: el.id||null,
    role: el.matches('[data-testid="human-turn-content"], .human-turn')?'user':el.matches('.font-claude-message')?'assistant':null,
    text: (el.innerText||'').slice(0,60),
  }));
  send({ type:'NEXUS_DOM_MAP', provider:PROVIDER, tabId:MY_TAB, nodes,
    context:{ url:location.href, chatId:chatId(), ts:Date.now() } });
}

// ── Gap / error detection ─────────────────────────────────────────────────────
function detectResponseErrors(text) {
  const issues = [];
  const t = text.toLowerCase();
  if (/\bcannot\s+assist|\bcannot\s+help|\bum unable\b/i.test(text)) issues.push({type:'refusal',score:0.9,reason:'refusal detected'});
  if (/\bcontext window\b|\btoken limit\b|\btoo long\b/i.test(text)) issues.push({type:'context_limit',score:0.9,reason:'context limit'});
  if (/\bsorry\b|\bapologize\b/i.test(text)&&text.length<200) issues.push({type:'short_apology',score:0.6,reason:'short apology'});
  if (text.length < 80 && jobActive) issues.push({type:'truncation',score:0.7,reason:'very short response'});
  if ((text.match(/```/g)||[]).length % 2 !== 0) issues.push({type:'unclosed_code_block',score:0.8,reason:'unclosed code block'});
  return issues;
}

function autoRetry(jobId, text, retryCount) {
  const issue = detectResponseErrors(text)[0];
  if (!issue || retryCount >= 2) return;
  const retryPrompts = {
    context_limit:     'The previous response hit a context limit. Please summarise what was completed and list exactly what remains.',
    truncation:        'Your response was cut off. Please continue from exactly where you stopped.',
    refusal:           'Please reconsider and provide the technical assistance requested.',
    unclosed_code_block: 'Your last code block was not closed. Please complete it.',
    short_apology:     'Please provide a full technical response rather than an apology.',
  };
  const retry = retryPrompts[issue.type] || `Issue detected (${issue.type}). Please revise your response.`;
  _log('gap', `Auto-retry: ${issue.type}`, `attempt ${retryCount+1}`);
  setTimeout(() => {
    if (!injectText(retry)) return;
    _usageHistory[_usageHistory.length-1].retried = true;
    setTimeout(submit, 500);
    startWatch(jobId, retry, retryCount+1);
  }, 1000);
}

// ── Watch ─────────────────────────────────────────────────────────────────────
function stopWatch() {
  if (_watchObs) { _watchObs.disconnect(); _watchObs = null; }
  if (_watchTimer) { clearTimeout(_watchTimer); _watchTimer = null; }
  currentJobId = null; jobActive = false;
  setJobBar(false);
}

function startWatch(jobId, prompt, retryCount = 0) {
  stopWatch();
  currentJobId = jobId; jobActive = true; _watchStart = Date.now();
  let _noElReported = false; // 0.39.238 — one no-reply-element report per watch
  setJobBar(true, prompt, jobId);

  let lastText = '', stableCount = 0;
  let _lastChunkLen = 0;

  function checkStable() {
    if (!currentJobId || currentJobId !== jobId) return;
    const el   = findResponseEl();
    if (!el) {
      // §NO-ELEMENT 0.39.238 — this branch used to reschedule itself forever:
      // no progress, no error, no completion (James's 2026-09-25 log: submitted,
      // then silence). The NO_REPLY_MS deadline below never ran for it. Now the
      // log says within 15 s that findResponseEl() matches nothing on this page,
      // and the job fails loudly at the deadline, naming selector drift.
      const _waited = Date.now() - _watchStart;
      const _limit = (typeof NO_REPLY_MS !== 'undefined') ? NO_REPLY_MS : 180000;
      if (!_noElReported && _waited > 15000) {
        _noElReported = true;
        send({ type:'GUARDIAN_PROGRESS', jobId, stage:'no-reply-element', how:`${Math.round(_waited/1000)}s`, chatUrl:location.href, ts:Date.now() });
      }
      if (_waited > _limit) {
        stopWatch();
        _log('gap', 'No reply element', `#${jobId.slice(0,8)} · ${Math.round(_waited/1000)}s`);
        send({ type:'GUARDIAN_ERROR', jobId, gate:'watch',
               error:`no reply element found after ${Math.round(_waited/1000)}s — findResponseEl() matched nothing on this page, so the reply could not be read (selector drift, not a missing answer)`,
               chatUrl:location.href, account:getAccount() });
        return;
      }
      _watchTimer = setTimeout(checkStable, 600); return;
    }
    const text = (el.innerText || el.textContent || '').trim();
    if (text === lastText && !_isGenerating()) {
      stableCount++;
      if (stableCount >= 3) {
        const ms = Date.now() - _watchStart;
        _onJobComplete(jobId, text, ms, prompt, retryCount);
        return;
      }
    } else {
      if (text.length > _lastChunkLen) {
        const delta = text.slice(_lastChunkLen); _lastChunkLen = text.length;
        if (delta.length > 10 || /[.!?\n]/.test(delta)) {
          send({ type:'GUARDIAN_CHUNK', jobId, text:delta, full:text, provider:PROVIDER, chatUrl:location.href, ts:Date.now() });
          _streamToCortex(jobId, delta, text);
        }
      }
      lastText = text; stableCount = 0;
    }
    _watchTimer = setTimeout(checkStable, 300);
  }

  const target = document.querySelector('main') || document.body;
  _watchObs = new MutationObserver(() => {
    stableCount = 0;
    if (_watchTimer) { clearTimeout(_watchTimer); _watchTimer = null; }
    _watchTimer = setTimeout(checkStable, 300);
  });
  _watchObs.observe(target, { childList:true, subtree:true, characterData:true });
  _watchTimer = setTimeout(checkStable, 1500);
}

async function _onJobComplete(jobId, text, ms, prompt, retryCount) {
  stopWatch();
  send({ type:'GUARDIAN_LEDGER_WRITE', jobId, category:'UPGRADE',
    msg:`Complete · ${text.length}ch · ${Math.round(ms/1000)}s`,
    meta:{ jobId, chars:text.length, ms, provider:PROVIDER, ts:Date.now() }
  });
  _log('ok', `Complete · ${text.length}ch`, `${Math.round(ms/1000)}s · #${jobId.slice(0,8)}`);
  toast(`Done: ${text.length}ch in ${Math.round(ms/1000)}s`, 'success', 3500);

  const usage = recordUsage(jobId, text, ms);
  await scanArtifacts(jobId);

  // Update IDB request status
  await dbPut('requests', { uuid:jobId, status:'fulfilled', completedAt:Date.now(), sessionId:await getSessionId() });

  const issues = detectResponseErrors(text);
  if (issues.length) {
    currentGaps = [...issues, ...currentGaps].slice(0,100);
    if (retryCount === 0) autoRetry(jobId, text, retryCount);
    send({ type:'GUARDIAN_GAPS', jobId, gaps:issues, chatUrl:location.href, account:getAccount() });
    // §BUG FIXED 2026-07-06 — same fix as userscript-chatgpt.js: batched
    // event hid every real gap from nexus-heal-loop.js. See that file's
    // comment for the full traced root cause.
    for (const issue of issues) {
      _toCortex('cortex.gap.found', { jobId, type: issue.type, description: issue.reason,
        score: issue.score, source: 'userscript-detector' });
    }
  }

  send({ type:'GUARDIAN_COMPLETE', jobId, text, chatUrl:location.href, account:getAccount(), requestId:jobId });
  _toCortex('guardian.job.complete', { jobId, chars:text.length, ms, usage });
  _toCortexPush(text, ['conversation', 'claude', `job:${jobId}`], 'session');
  _toNCP('guardian.job.complete', { jobId, chars:text.length, ms, provider:PROVIDER });
  sendLedger('UPGRADE', `Job complete · #${jobId.slice(0,8)}`, { jobId, chars:text.length, ms });

  // Post-response cortex command parser
  await parseCortexCommands(text, jobId);
  if (panelOpen) renderActiveTab();
}

// ── Job handler ───────────────────────────────────────────────────────────────
async function handleJob(msg) {
  const { jobId, prompt='', content='', command='', seam_chunk_idx, seam_total, seam_title, seam_queue_id } = msg;
  const text = content ? (prompt ? `${prompt}\n\n${content}` : content) : prompt;
  if (!text.trim()) { _log('err','Empty job','skipping'); return; }
  if (seam_queue_id != null) {
    _log('job', `SEAM chunk ${seam_chunk_idx+1}/${seam_total}: ${seam_title}`, `queue #${seam_queue_id.slice(0,8)}`);
    toast(`SEAM ${seam_chunk_idx+1}/${seam_total}: ${seam_title}`, 'job', 3500);
  }

  // §LAW II — write to IDB before any action
  const sessionId = await getSessionId();
  await dbPut('requests', { uuid:jobId, status:'pending', command, promptLen:text.length,
    sessionId, provider:PROVIDER, createdAt:Date.now() });

  send({ type:'GUARDIAN_LEDGER_WRITE', jobId, category:'INPUT',
    msg:`Job: ${command} #${jobId.slice(0,8)}`,
    meta:{ jobId, command, chars:text.length, provider:PROVIDER, chatUrl:location.href, ts:Date.now() }
  });

  _log('job', `Job: ${command}`, `${text.length}ch · #${jobId.slice(0,8)}`);
  toast(`⚡ ${command} · #${jobId.slice(0,8)}`, 'job', 3000);
  _toCortex('agent.call.start', { jobId, provider:PROVIDER, command, promptLen:text.length });
  _toNCP('guardian.job.dispatched', { jobId, command, provider:PROVIDER });

  await gate('handleJob', async () => {
    // §US-04 — pre-prompt intelligence injection
    const intel   = await pullIntelligenceContext(text, command);
    const intelHdr= buildContextHeader(intel);
    // Legacy cortex context
    const legacyCtx = _settings.enableContextInjection !== false
      ? await pullCortexContext(text) : '';

    const finalText = (intelHdr || legacyCtx) + text;
    if (!injectText(finalText)) throw new Error('Input not found — no contenteditable');

    send({ type:'GUARDIAN_DELIVERED', jobId, chatUrl:location.href, account:getAccount(), requestId:jobId });
    await dbPut('requests', { uuid:jobId, status:'dispatched', sessionId, dispatchedAt:Date.now() });
    setTimeout(() => { submit(); startWatch(jobId, text, 0); }, 500);
    return true;
  }, { jobId });
}

// ── Cortex command parser ─────────────────────────────────────────────────────
async function parseCortexCommands(text, jobId) {
  const cmds = text.split('\n').filter(l => /^\?CORTEX:/i.test(l.trim()));
  for (const cmd of cmds) {
    const q = cmd.replace(/^\?CORTEX:/i,'').trim();
    try {
      const r = await fetch(`${NCP_URL}/memory/query?q=${encodeURIComponent(q)}`, { signal:AbortSignal.timeout(2000) });
      if (!r.ok) continue;
      const d = await r.json();
      const result = (d.results||[]).slice(0,3).map(x=>x.text||x.content||'').join('\n') || '(no results)';
      send({ type:'GUARDIAN_CORTEX_RESULT', jobId, query:q, result });
    } catch(_) {}
  }
}

// ── System status polling ─────────────────────────────────────────────────────
async function pollSystemStatus() {
  try {
    const r = await fetch(`${ORCH_URL}/health`, { signal:AbortSignal.timeout(2000) });
    if (r.ok) {
      _systemStatus = await r.json();
      if (panelOpen && activeTab==='sys') renderSys();
    }
  } catch(_) {}
}
setInterval(pollSystemStatus, 15000);

// ── NCP connection ────────────────────────────────────────────────────────────
function connect() {
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  _reconnectAttempts = 0; // §P113: reset backoff on successful connect
  if (_es) { try { _es.close(); } catch(_) {} }
  const params = `tabId=${MY_TAB}&provider=${PROVIDER}`;
  _log('info', 'NCP connecting…', `${NCP_CHANNEL}?${params}`);
  connState = 'connecting'; setConnState('connecting');
  _es = new EventSource(`${NCP_CHANNEL}?${params}`);
  _es.onmessage = e => {
    try {
      _handleServerMessage(JSON.parse(e.data));
      // ♥ pulse on every NCP emit
      const h = document.getElementById('__g10heart__');
      if (h) {
        h.style.color = '#ef4444';
        h.style.transform = 'scale(1.4)';
        h.style.transition = 'none';
        setTimeout(() => { h.style.color = 'rgba(239,68,68,.25)'; h.style.transform = 'scale(1)'; h.style.transition = 'all .4s ease'; }, 150);
      }
    } catch(err) { _log('err','NCP parse',err.message); }
  };
  _es.onopen = () => {
    connState = 'ready'; setConnState('ready');
    _log('ok', `NCP connected · ${PROVIDER}`, NCP_CHANNEL);
    ncpPost(NCP_RESULT, { type:'GUARDIAN_REGISTER', provider:PROVIDER, host:location.hostname, tabId:MY_TAB, claimed:amIClaimed() });
    // §NEXUS-WAKE 2026-08-18 — arm "hey nexus" once per boot (HOOKUP.md §2).
    // window.NexusWake is the shared prelude ProviderHost injects before this
    // script; absent under node/tests or if the prelude failed to load, so
    // NEXUS stays null and decorate() below is a no-op rather than a crash.
    NEXUS = (typeof window !== 'undefined' && window.NexusWake)
      ? window.NexusWake.install({ provider: PROVIDER, tabId: MY_TAB, injectText, submit, log: (m) => console.log(m) })
      : null;
    if (typeof window !== 'undefined') window.__nexusWakeInstance__ = NEXUS;
    // §WIRED 2026-08-22 — James: "listens for the co-pilot response and
    // injects it into the corresponding agent chat using clearglass."
    // The page-side half of clear-glass/src/providers/host.js's
    // injectAnswer() — called via executeJavaScript from the main process,
    // so it must be a real, checkable global, not an assumption that
    // something is listening.
    if (typeof window !== 'undefined') {
      window.__nexusInjectAnswer = (text) => {
        if (!window.__nexusWakeInstance__) return { ok: false, reason: 'wake module not installed on this tab' };
        return window.__nexusWakeInstance__.showAnswer(text);
      };
    }
    if (_hb) clearInterval(_hb);
    _hb = setInterval(() => ncpPost(NCP_HB, { type:'GUARDIAN_HEARTBEAT', provider:PROVIDER, tabId:MY_TAB, ts:Date.now(), usage:detectUsageLimit(), chatId:chatId(), claimed:isClaimed }), HB_MS);
    autoClaimIfFree();
    setTimeout(() => sendDOMMap(), 2000);
    pollSystemStatus();
  };
  _es.onerror = () => {
    connState = 'disconnected'; setConnState('disconnected');
    _reconnectAttempts++;
    const _delay = Math.min(RECONNECT_MIN_MS * Math.pow(2, _reconnectAttempts - 1), RECONNECT_MAX_MS);
    _log('err', `NCP error — retry ${_delay}ms (attempt ${_reconnectAttempts})`);
    _es.close(); clearInterval(_hb);
    _reconnectTimer = setTimeout(connect, _delay);
  };
}

function _handleServerMessage(msg) {
  switch(msg.type) {
    case 'NCP_READY':
    case 'GUARDIAN_READY':
      setConnState('ready');
      _log('ok', `Ready · ${msg.provider||PROVIDER}`, NCP_CHANNEL);
      toast('Guardian connected ✓', 'success', 2000);
      break;
    case 'GUARDIAN_CLAIM':
      if (msg.tabId===MY_TAB||msg.tabId==='any') {
        claimTab();
        ncpPost(NCP_RESULT, { type:'GUARDIAN_CLAIM_ACK', tabId:MY_TAB, provider:PROVIDER });
        toast('Tab claimed — ACTIVE', 'success', 2000);
      }
      break;
    case 'GUARDIAN_RELEASE': releaseTab(); break;
    case 'GUARDIAN_JOB':     currentJobId = msg.jobId; handleJob(msg); break;
    case 'NEXUS_CONTEXT_RESPONSE':
      if (msg.context) { _intelligenceCtx = msg.context; _log('sys','Context updated from server'); }
      break;
    case 'GUARDIAN_SESSION_NAMED': _log('info','Session named', msg.name); break;
    case 'GUARDIAN_ARTIFACT_SAVED': _log('ok','Artifact saved', msg.artifactId); break;
    default: _log('debug', `NCP: ${msg.type}`);
  }
}

// Navigation
let _lastPath = location.pathname;
setInterval(() => {
  if (location.pathname !== _lastPath) {
    _lastPath = location.pathname;
    _sessionId = null; // reset session chain on navigation
    if (currentJobId) stopWatch();
    _log('sys', `Nav → ${chatId()}`);
    setTimeout(() => sendDOMMap(), 1000);
  }
}, 800);

// ══════════════════════════════════════════════════════════════════════════════
// UI
// ══════════════════════════════════════════════════════════════════════════════

function injectStyles() {
  const s = document.createElement('style');
  s.textContent = `
    @keyframes gfadein{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
    @keyframes gpulse{0%,100%{opacity:1}50%{opacity:.4}}
    #__g10root__{position:fixed;bottom:16px;right:16px;z-index:2147483647;font-family:'SF Mono','Fira Code',monospace;font-size:11px;user-select:none}
    #__g10pill__{display:flex;align-items:center;gap:6px;background:rgba(8,8,14,.95);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:5px 12px 5px 8px;cursor:pointer;box-shadow:0 4px 24px rgba(0,0,0,.6);transition:opacity .2s;margin-left:auto}
    #__g10pill__:hover{opacity:.85}
    #__g10panel__{width:520px;background:rgba(6,6,12,.98);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.07);border-radius:14px;box-shadow:0 12px 60px rgba(0,0,0,.85);overflow:hidden;margin-bottom:8px;display:none;flex-direction:column;max-height:580px;animation:gfadein .14s ease}
    #__g10hdr__{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.05);flex-shrink:0}
    .g10hdr-l{display:flex;align-items:center;gap:8px}
    .g10hdr-dot{width:8px;height:8px;border-radius:50%;background:#888;transition:background .4s}
    .g10hdr-title{color:#e2e8f0;font-weight:700;font-size:12px;letter-spacing:.04em}
    .g10hdr-badge{font-size:9px;padding:2px 7px;border-radius:10px;background:#88888822;color:#888;font-weight:600}
    .g10clear{background:none;border:1px solid rgba(255,255,255,.08);color:#475569;border-radius:3px;padding:2px 8px;font:inherit;font-size:9px;cursor:pointer;transition:color .2s}
    .g10clear:hover{color:#94a3b8}
    #__g10jobbar__{display:none;align-items:center;gap:8px;padding:6px 14px;background:rgba(251,191,36,.05);border-bottom:1px solid rgba(251,191,36,.1);flex-shrink:0}
    .g10jdot{width:6px;height:6px;border-radius:50%;background:#fbbf24;animation:gpulse 1.2s infinite}
    .g10jtext{color:#fbbf24;font-size:10px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .g10jid{color:#78716c;font-size:9px}
    #__g10tabs__{display:flex;border-bottom:1px solid rgba(255,255,255,.05);flex-shrink:0}
    .g10tab{flex:1;text-align:center;padding:7px 0;cursor:pointer;color:#334155;font-size:9px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;transition:color .2s;border-bottom:2px solid transparent}
    .g10tab:hover{color:#64748b}
    .g10tab.active{color:#818cf8;border-bottom-color:#818cf8}
    #__g10log__{flex:1;overflow-y:auto;padding:6px 0;min-height:0}
    .g10row{display:flex;align-items:flex-start;gap:6px;padding:2px 12px;transition:background .15s}
    .g10row:hover{background:rgba(255,255,255,.02)}
    .g10ts{color:#1e293b;font-size:9px;flex-shrink:0;padding-top:1px;width:52px}
    .g10ic{font-size:10px;flex-shrink:0;width:12px;text-align:center;padding-top:1px}
    .g10ct{flex:1;min-width:0}
    .g10msg{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .g10det{color:#1e293b;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px}
    .g10use-row{display:flex;justify-content:space-between;padding:3px 12px;border-bottom:1px solid rgba(255,255,255,.03)}
    .g10use-label{color:#334155;font-size:9px}
    .g10use-val{color:#64748b;font-size:9px;font-weight:600}
    .g10use-bar{height:3px;background:rgba(255,255,255,.05);margin:8px 12px 4px;border-radius:2px}
    .g10use-fill{height:100%;background:linear-gradient(90deg,#818cf8,#6366f1);border-radius:2px;transition:width .4s}
    .g10gap{padding:6px 12px;border-bottom:1px solid rgba(255,255,255,.03)}
    .g10gap-type{color:#f472b6;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
    .g10gap-desc{color:#475569;font-size:9px;margin-top:2px}
    .g10gap-score{color:#1e293b;font-size:8px;margin-top:1px}
    .g10art{padding:6px 12px;border-bottom:1px solid rgba(255,255,255,.03);cursor:pointer}
    .g10art:hover{background:rgba(255,255,255,.02)}
    .g10art-hdr{display:flex;align-items:center;gap:6px}
    .g10art-lang{color:#2dd4bf;font-size:9px;font-weight:700;text-transform:uppercase}
    .g10art-sz{color:#334155;font-size:9px}
    .g10art-hash{color:#1e293b;font-size:9px;font-family:monospace}
    .g10art-pre{color:#475569;font-size:9px;margin-top:4px;white-space:pre-wrap;word-break:break-all;max-height:80px;overflow:hidden}
    #__g10sys__{overflow-y:auto;max-height:460px}
    .g10sys-section{padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04)}
    .g10sys-title{color:#334155;font-size:8px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px;font-weight:700}
    .g10sys-row{display:flex;justify-content:space-between;align-items:center;padding:2px 0}
    .g10sys-label{color:#1e293b;font-size:9px}
    .g10sys-val{font-size:9px;font-weight:600}
    .g10sys-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
    .g10online{color:#34d399}.g10offline{color:#f87171}.g10warn{color:#f59e0b}
    #__g10opts__{overflow-y:auto;max-height:460px;padding:8px 0}
    .g10opt-row{display:flex;justify-content:space-between;align-items:center;padding:6px 14px;border-bottom:1px solid rgba(255,255,255,.03)}
    .g10opt-label{color:#64748b;font-size:9px}
    .g10opt-toggle{width:28px;height:14px;border-radius:7px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);cursor:pointer;position:relative;transition:background .2s}
    .g10opt-toggle.on{background:#6366f144;border-color:#6366f166}
    .g10opt-toggle::after{content:'';position:absolute;width:10px;height:10px;border-radius:50%;background:#475569;top:1px;left:1px;transition:all .2s}
    .g10opt-toggle.on::after{background:#818cf8;left:15px}
    .g10intel-section{padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04);font-size:9px}
    .g10intel-title{color:#f59e0b;font-size:8px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;font-weight:700}
    .g10intel-row{color:#334155;padding:2px 0;line-height:1.5}
    .g10intel-val{color:#64748b}
    .g10badge-count{display:inline-block;background:#f87171;color:#fff;border-radius:8px;padding:0 5px;font-size:8px;font-weight:700;margin-left:3px;min-width:14px;text-align:center}
    .g10footer{display:flex;justify-content:space-between;padding:5px 12px;border-top:1px solid rgba(255,255,255,.04);flex-shrink:0}
    .g10footer span{color:#1e293b;font-size:9px}
    #__g10badge__{background:#f87171;color:#fff;border-radius:8px;padding:0 5px;font-size:9px;font-weight:700;display:none;min-width:16px;text-align:center}
    #__g10claim__{font-size:8px;padding:2px 7px;border-radius:10px;border:1px solid rgba(255,255,255,.08);color:#475569;cursor:pointer;transition:all .2s;font-weight:700;letter-spacing:.04em}
    #__g10claim__.active{color:#34d399;border-color:#34d39933;background:#34d39910}
    .g10seam-area{padding:8px 12px;overflow-y:auto;max-height:400px}
    .g10seam-chunk{border:1px solid rgba(255,255,255,.05);border-radius:4px;margin-bottom:6px;overflow:hidden}
    .g10seam-hdr{display:flex;align-items:center;gap:6px;padding:5px 8px;background:rgba(255,255,255,.02)}
    .g10seam-title{color:#94a3b8;font-size:9px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .g10seam-inject{background:none;border:1px solid rgba(245,158,11,.3);color:#f59e0b;border-radius:2px;padding:2px 7px;font:inherit;font-size:8px;cursor:pointer;flex-shrink:0}
    .g10seam-inject:hover{background:rgba(245,158,11,.1)}
    .g10seam-inject:disabled{opacity:.3;cursor:default}
    .g10ledger-row{display:flex;gap:6px;padding:3px 12px;border-bottom:1px solid rgba(255,255,255,.02);align-items:flex-start}
    .g10ledger-ts{color:#1e293b;font-size:9px;flex-shrink:0;width:52px}
    .g10ledger-cat{font-size:8px;font-weight:700;text-transform:uppercase;flex-shrink:0;width:50px;letter-spacing:.04em}
    .g10ledger-msg{color:#475569;font-size:9px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .cat-upgrade{color:#34d399}.cat-input{color:#60a5fa}.cat-event{color:#818cf8}.cat-gap{color:#f472b6}.cat-error{color:#f87171}
  `;
  document.head.appendChild(s);
}

function buildUI() {
  injectStyles();
  const root = document.createElement('div'); root.id='__g10root__';
  document.body.appendChild(root);

  // Pill
  const pill  = document.createElement('div'); pill.id='__g10pill__';
  const dot   = document.createElement('div'); dot.id='__g10dot__';
  Object.assign(dot.style,{width:'7px',height:'7px',borderRadius:'50%',background:'#888',transition:'background .4s',flexShrink:'0'});
  const lbl   = document.createElement('span'); lbl.id='__g10label__'; lbl.style.cssText='color:#cbd5e1;font-size:11px;font-weight:600'; lbl.textContent='Guardian';
  const prov  = document.createElement('span'); prov.style.cssText='color:#475569;font-size:9px;border-left:1px solid rgba(255,255,255,.08);padding-left:6px;margin-left:1px'; prov.textContent=`claude v${VERSION}`;
  // ♥ heartbeat — flashes on every NCP SSE message
  const heart = document.createElement('span'); heart.id='__g10heart__';
  heart.textContent='♥';
  heart.style.cssText='font-size:10px;color:rgba(239,68,68,.3);transition:none;flex-shrink:0;margin-left:2px';
  const claim = document.createElement('span'); claim.id='__g10claim__'; claim.textContent='ACTIVE'; claim.classList.add('active');
  const badge = document.createElement('span'); badge.id='__g10badge__';
  pill.append(dot, lbl, prov, heart, claim, badge);

  // Panel
  const panel  = document.createElement('div'); panel.id='__g10panel__';

  // Header
  const hdr    = document.createElement('div'); hdr.id='__g10hdr__';
  const hdrL   = document.createElement('div'); hdrL.className='g10hdr-l';
  const hdrDot = document.createElement('div'); hdrDot.id='__g10hdrdot__'; hdrDot.className='g10hdr-dot';
  const hdrTitle= document.createElement('span'); hdrTitle.className='g10hdr-title'; hdrTitle.textContent='Guardian';
  const hdrBadge= document.createElement('span'); hdrBadge.id='__g10hdrbadge__'; hdrBadge.className='g10hdr-badge'; hdrBadge.textContent='DISCONNECTED';
  hdrL.append(hdrDot, hdrTitle, hdrBadge);
  const clearBtn= document.createElement('button'); clearBtn.className='g10clear'; clearBtn.textContent='Clear';
  clearBtn.onclick = () => { logEntries=[]; unreadCount=0; renderLog(); _setBadge(0); };
  hdr.append(hdrL, clearBtn);

  // Job bar
  const jobBar = document.createElement('div'); jobBar.id='__g10jobbar__';
  const jDot   = document.createElement('div'); jDot.className='g10jdot';
  const jText  = document.createElement('span'); jText.id='__g10jtext__'; jText.className='g10jtext'; jText.textContent='Job running…';
  const jId    = document.createElement('span'); jId.id='__g10jid__'; jId.className='g10jid';
  jobBar.append(jDot, jText, jId);

  // Tabs: Log | Ledger | Gaps | Arts | SEAM | Intel | Sys | Opts
  const tabs = document.createElement('div'); tabs.id='__g10tabs__';
  const TAB_LIST = [
    ['log','Log'], ['ledger','Ledger'], ['gaps','Gaps'], ['arts','Arts'],
    ['seam','SEAM'], ['intel','Intel'], ['nexus','NEXUS'], ['sys','Sys'], ['opts','Opts'],
  ];
  for (const [id,label] of TAB_LIST) {
    const t = document.createElement('div');
    t.className = 'g10tab' + (id===activeTab?' active':'');
    t.textContent = label; t.dataset.tab = id;
    t.addEventListener('click', () => switchTab(id));
    tabs.appendChild(t);
  }

  // Content areas
  const logArea    = document.createElement('div'); logArea.id='__g10log__';
  const ledgerArea = document.createElement('div'); ledgerArea.id='__g10ledger__'; ledgerArea.style.cssText='display:none;overflow-y:auto;max-height:460px';
  const gapsArea   = document.createElement('div'); gapsArea.id='__g10gaps__';   gapsArea.style.cssText='display:none;overflow-y:auto;max-height:460px';
  const artsArea   = document.createElement('div'); artsArea.id='__g10arts__';   artsArea.style.cssText='display:none;overflow-y:auto;max-height:460px';
  const seamArea   = document.createElement('div'); seamArea.id='__g10seam__';   seamArea.style.display='none';
  const intelArea  = document.createElement('div'); intelArea.id='__g10intel__'; intelArea.style.cssText='display:none;overflow-y:auto;max-height:460px';
  const nexusArea  = document.createElement('div'); nexusArea.id='__g10nexus__'; nexusArea.style.cssText='display:none;overflow-y:auto;max-height:460px;padding:0';
  const sysArea    = document.createElement('div'); sysArea.id='__g10sys__';     sysArea.style.display='none';
  const optsArea   = document.createElement('div'); optsArea.id='__g10opts__';   optsArea.style.display='none';

  const footer = document.createElement('div'); footer.className='g10footer';
  const fL = document.createElement('span'); fL.id='__g10fl__'; fL.textContent=`${NCP_URL} · claude`;
  const fR = document.createElement('span'); fR.textContent=`v${VERSION}`;
  footer.append(fL, fR);

  panel.append(hdr, jobBar, tabs, logArea, ledgerArea, gapsArea, artsArea, seamArea, intelArea, nexusArea, sysArea, optsArea, footer);

  pill.addEventListener('click', () => {
    panelOpen = !panelOpen;
    panel.style.display = panelOpen ? 'flex' : 'none';
    if (panelOpen) { renderActiveTab(); unreadCount=0; _setBadge(0); }
  });
  root.append(panel, pill);
}

// Tab management
const AREAS = {
  log:'__g10log__', ledger:'__g10ledger__', gaps:'__g10gaps__',
  arts:'__g10arts__', seam:'__g10seam__', intel:'__g10intel__',
  nexus:'__g10nexus__', sys:'__g10sys__', opts:'__g10opts__',
};
function switchTab(id) {
  activeTab = id;
  document.querySelectorAll('.g10tab').forEach(t => t.classList.toggle('active', t.dataset.tab===id));
  Object.entries(AREAS).forEach(([k,eid]) => {
    const el = document.getElementById(eid);
    if (el) el.style.display = k===id ? 'block' : 'none';
  });
  renderActiveTab();
}
function renderActiveTab() {
  if (activeTab==='log')    renderLog();
  if (activeTab==='ledger') renderLedger();
  if (activeTab==='gaps')   renderGaps();
  if (activeTab==='arts')   renderArts();
  if (activeTab==='seam')   renderSeam();
  if (activeTab==='intel')  renderIntel();
  if (activeTab==='nexus')  renderNexus();
  if (activeTab==='sys')    renderSys();
  if (activeTab==='opts')   renderOpts();
}

function _setBadge(n) {
  const b = document.getElementById('__g10badge__');
  if (b) { b.textContent = n > 99 ? '99+' : n; b.style.display = n > 0 ? 'inline' : 'none'; }
}
function setConnState(state) {
  const COLORS = { connecting:'#f59e0b', handshaking:'#f59e0b', ready:'#22c55e', disconnected:'#ef4444' };
  const LABELS = { connecting:'CONNECTING', handshaking:'HANDSHAKING', ready:'READY', disconnected:'DISCONNECTED' };
  const col = COLORS[state] || '#ef4444';
  ['__g10dot__','__g10hdrdot__'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.background = col;
  });
  const hb = document.getElementById('__g10hdrbadge__');
  if (hb) { hb.textContent = LABELS[state]||state.toUpperCase(); hb.style.background=col+'22'; hb.style.color=col; }
}
function updatePill() {
  const c = document.getElementById('__g10claim__');
  if (c) { c.textContent = 'ACTIVE'; c.classList.add('active'); }
}
function setJobBar(active, prompt, jobId) {
  const bar = document.getElementById('__g10jobbar__'); if (!bar) return;
  bar.style.display = active ? 'flex' : 'none';
  if (active) {
    const t = document.getElementById('__g10jtext__'); if (t) t.textContent = (prompt||'Job running…').slice(0,60);
    const i = document.getElementById('__g10jid__');   if (i) i.textContent = jobId ? `#${jobId.slice(0,8)}` : '';
  }
}

// ── Log tab ───────────────────────────────────────────────────────────────────
function _appendLogRow(entry) {
  const a = document.getElementById('__g10log__'); if (!a) return;
  const row = document.createElement('div'); row.className = 'g10row';
  const ts  = document.createElement('span'); ts.className = 'g10ts'; ts.textContent = fts(entry.ts);
  const ic  = document.createElement('span'); ic.className = 'g10ic'; ic.style.color = entry.color; ic.textContent = entry.icon;
  const ct  = document.createElement('div'); ct.className = 'g10ct';
  const m   = document.createElement('span'); m.className = 'g10msg'; m.style.color = entry.color; m.textContent = entry.msg; ct.appendChild(m);
  if (entry.detail) { const d = document.createElement('div'); d.className = 'g10det'; d.textContent = entry.detail; ct.appendChild(d); }
  row.append(ts, ic, ct); a.appendChild(row);
  a.scrollTop = a.scrollHeight;
}
function renderLog() {
  const a = document.getElementById('__g10log__'); if (!a) return;
  a.innerHTML = ''; logEntries.forEach(e => _appendLogRow(e));
}

// ── Ledger tab ────────────────────────────────────────────────────────────────
async function renderLedger() {
  const a = document.getElementById('__g10ledger__'); if (!a) return;
  a.innerHTML = '<div style="color:#1e293b;font-size:9px;padding:10px 12px">Loading ledger…</div>';
  try {
    const r = await fetch(`${CORTEX_URL}/api/events?limit=30&source=userscript-claude`, { signal:AbortSignal.timeout(2000) });
    const d = r.ok ? await r.json() : { rows:[] };
    const rows = (d.rows || d.events || []).slice(0,30);
    if (!rows.length) { a.innerHTML='<div style="color:#1e293b;font-size:9px;padding:20px;text-align:center">No ledger entries</div>'; return; }
    a.innerHTML = rows.map(row => {
      const cat = (row.type||'').split('.').pop().toUpperCase();
      const catClass = row.type?.includes('error')||row.type?.includes('fail') ? 'cat-error'
        : row.type?.includes('gap') ? 'cat-gap'
        : row.type?.includes('complete')||row.type?.includes('ok') ? 'cat-upgrade'
        : row.type?.includes('start')||row.type?.includes('dispatch') ? 'cat-input' : 'cat-event';
      return `<div class="g10ledger-row">
        <span class="g10ledger-ts">${fts(row.ts||0)}</span>
        <span class="g10ledger-cat ${catClass}">${escHtml(cat.slice(0,8))}</span>
        <span class="g10ledger-msg">${escHtml((row.type||'')+' '+JSON.stringify(row.payload||{}).slice(0,60))}</span>
      </div>`;
    }).join('');
  } catch(_) {
    a.innerHTML = '<div style="color:#f87171;font-size:9px;padding:12px">Cortex offline</div>';
  }
}

// ── Gaps tab ──────────────────────────────────────────────────────────────────
function renderGaps() {
  const a = document.getElementById('__g10gaps__'); if (!a) return;
  if (!currentGaps.length) {
    a.innerHTML = '<div style="color:#1e293b;font-size:9px;padding:20px;text-align:center">No gaps this session</div>';
    return;
  }
  a.innerHTML = currentGaps.map(g => `
    <div class="g10gap">
      <div class="g10gap-type">${escHtml(g.type||'unknown')}</div>
      <div class="g10gap-desc">${escHtml(g.reason||g.description||'')}</div>
      <div class="g10gap-score">score: ${(g.score||0).toFixed(2)} · domain: ${escHtml(g.domain||'?')}</div>
    </div>`).join('');
}

// ── Artifacts tab ─────────────────────────────────────────────────────────────
let _artExpanded = new Set();
function renderArts() {
  const a = document.getElementById('__g10arts__'); if (!a) return;
  if (!artifactStore.length) {
    a.innerHTML = '<div style="color:#1e293b;font-size:9px;padding:20px;text-align:center">No artifacts (SHA-256 dedup active)</div>';
    return;
  }
  a.innerHTML = '';
  for (const art of [...artifactStore].reverse()) {
    const div = document.createElement('div'); div.className='g10art';
    const exp = _artExpanded.has(art.hash);
    div.innerHTML = `<div class="g10art-hdr">
      <span class="g10art-lang">${escHtml(art.lang||'text')}</span>
      <span class="g10art-sz">${art.content.length}ch</span>
      <span class="g10art-hash">#${art.hash}</span>
      <span style="color:#334155;margin-left:auto">${exp?'▲':'▼'}</span>
    </div>${exp ? `<div class="g10art-pre">${escHtml(art.content.slice(0,400))}${art.content.length>400?'…':''}</div>` : ''}`;
    div.addEventListener('click', () => {
      if (exp) _artExpanded.delete(art.hash); else _artExpanded.add(art.hash);
      renderArts();
    });
    a.appendChild(div);
  }
}

// ── SEAM tab — real view into guardian's actual SEAM pipeline ────────────────
// §SEAM-GLUE-FIX: same fix as chatgpt.js — see that file for the full
// rationale. Submits to the real POST /command spec pipeline instead of
// parsing pasted text locally; dispatch back to this tab needs no new
// wiring, SEAMQueue already pushes type:'GUARDIAN_JOB' and handleJob()
// already processes it.
let _seamQueues = [];
let _seamPollTimer = null;
function renderSeam() {
  const a = document.getElementById('__g10seam__'); if (!a) return;
  a.innerHTML = '';

  const wrap = document.createElement('div'); wrap.style.cssText = 'padding:8px 12px';
  const ta = document.createElement('textarea');
  ta.style.cssText = 'width:100%;background:#030308;border:1px solid #1e1e3a;color:#64748b;padding:6px 8px;font-family:inherit;font-size:.68rem;line-height:1.5;outline:none;resize:none;border-radius:2px;min-height:70px;display:block;box-sizing:border-box';
  ta.placeholder = 'Paste .spec content here…';

  const titleIn = document.createElement('input');
  titleIn.style.cssText = 'width:100%;margin-top:4px;background:#030308;border:1px solid #1e1e3a;color:#94a3b8;padding:4px 8px;font-family:inherit;font-size:.65rem;outline:none;border-radius:2px;box-sizing:border-box';
  titleIn.placeholder = 'Title (optional)';

  const submitBtn = document.createElement('button');
  submitBtn.style.cssText = 'margin-top:4px;background:none;border:1px solid rgba(129,140,248,.3);color:#818cf8;border-radius:2px;padding:3px 10px;font:inherit;font-size:9px;cursor:pointer';
  submitBtn.textContent = 'Submit to SEAM queue';
  submitBtn.onclick = async () => {
    const specText = ta.value.trim();
    if (!specText) { toast('Nothing pasted', 'warn'); return; }
    submitBtn.disabled = true; submitBtn.textContent = 'Submitting…';
    try {
      const res = await fetch(`${NCP_URL}/command`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'spec', provider: PROVIDER, specText, title: titleIn.value.trim() || undefined }),
      });
      const data = await res.json();
      if (!data.ok) { toast(`SEAM submit failed: ${data.error || 'unknown error'}`, 'error', 5000); return; }
      toast(`SEAM queue created — ${data.total} chunks`, 'success', 3000);
      ta.value = ''; titleIn.value = '';
      _log('ok', `SEAM queue ${data.queueId?.slice(0,8)} created`, `${data.total} chunks · ${data.title}`);
      await _refreshSeamQueues(a);
    } catch (e) {
      toast(`SEAM submit failed: ${e.message}`, 'error', 5000);
    } finally {
      submitBtn.disabled = false; submitBtn.textContent = 'Submit to SEAM queue';
    }
  };

  wrap.append(ta, titleIn, submitBtn);
  a.appendChild(wrap);

  const list = document.createElement('div');
  list.id = '__g10seam_list__';
  list.style.cssText = 'padding:0 12px 12px';
  a.appendChild(list);

  _refreshSeamQueues(a);
  if (_seamPollTimer) clearInterval(_seamPollTimer);
  _seamPollTimer = setInterval(() => {
    if (document.getElementById('__g10seam__')?.classList.contains('on')) _refreshSeamQueues(a);
    else { clearInterval(_seamPollTimer); _seamPollTimer = null; }
  }, 3000);
}

async function _refreshSeamQueues(a) {
  const list = a.querySelector('#__g10seam_list__'); if (!list) return;

  let liveQueues = [], sessions = [];
  try {
    const [liveRes, sessRes] = await Promise.all([
      fetch(`${NCP_URL}/seam/queues`,   { signal: AbortSignal.timeout(3000) }),
      fetch(`${NCP_URL}/seam/sessions`, { signal: AbortSignal.timeout(3000) }),
    ]);
    const liveData = await liveRes.json();
    const sessData = await sessRes.json();
    liveQueues = (liveData.queues   || []).filter(q => q.provider === PROVIDER);
    sessions   = (sessData.sessions || []).filter(s => s.provider === PROVIDER);
  } catch (_) { return; }

  // Live (in-memory, still-active) queues carry full compartment detail and
  // are retry-capable. Once a queue completes it's dropped from the server's
  // active-queue map — nothing left to retry — so those fall back to the
  // session summary instead.
  const liveUuids = new Set(liveQueues.map(q => q.uuid));
  _seamQueues = [...liveQueues, ...sessions.filter(s => !liveUuids.has(s.uuid))].slice(0, 8);

  list.innerHTML = '';
  if (!_seamQueues.length) {
    list.innerHTML = '<div style="color:#1e293b;font-size:9px;padding:8px 0">No SEAM queues for this provider yet.</div>';
    return;
  }
  for (const q of _seamQueues) {
    const row = document.createElement('div');
    row.style.cssText = 'border:1px solid #1e1e3a;border-radius:3px;padding:6px 8px;margin-top:6px;font-size:.65rem';

    const isLive  = liveUuids.has(q.uuid);
    const active  = isLive ? (q.compartments || []).find(c => c.state === 'GENERATING') : null;
    const statusTxt = (q.completedAt || q.status === 'complete')
      ? `done — ${q.stats?.verified ?? q.verified ?? 0} verified${(q.stats?.escalated ?? q.escalated) ? `, ${q.stats?.escalated ?? q.escalated} escalated` : ''}`
      : 'active';

    row.innerHTML = `<div style="color:#94a3b8;font-weight:600">${escHtml(q.title || 'Untitled')}</div>
      <div style="color:#475569;margin-top:2px">#${(q.uuid||'').slice(0,8)} · ${statusTxt}</div>`;

    if (active) {
      const ageS = Math.round((Date.now() - active.updatedAt) / 1000);
      const stuckLine = document.createElement('div');
      stuckLine.style.cssText = 'color:#fbbf24;margin-top:3px;display:flex;align-items:center;gap:6px;flex-wrap:wrap';
      stuckLine.innerHTML = `<span>generating "${escHtml(active.chunkTitle || '')}" — ${ageS}s${active.watchdogRetries ? ` · watchdog ${active.watchdogRetries}/${active.maxWatchdogRetries ?? 3}` : ''}</span>`;

      const retryBtn = document.createElement('button');
      retryBtn.style.cssText = 'background:none;border:1px solid rgba(251,191,36,.4);color:#fbbf24;border-radius:2px;padding:1px 7px;font:inherit;font-size:9px;cursor:pointer';
      retryBtn.textContent = 'Retry now';
      retryBtn.onclick = async () => {
        retryBtn.disabled = true; retryBtn.textContent = '…';
        try {
          const r = await fetch(`${NCP_URL}/seam/retry`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ queueId: q.uuid, chunkUuid: active.uuid, reason: 'manual_ui' }),
          });
          const d = await r.json();
          if (d.ok) {
            toast(d.escalated ? 'Chunk escalated — watchdog limit reached' : 'Retry forced', d.escalated ? 'warn' : 'success', 3000);
            _log('ok', `SEAM retry forced — ${q.uuid.slice(0,8)}`, d.escalated ? 'escalated to gap' : 'retrying');
          } else {
            toast(`Retry failed: ${d.error || 'unknown'}`, 'error', 4000);
          }
        } catch (e) {
          toast(`Retry failed: ${e.message}`, 'error', 4000);
        } finally {
          await _refreshSeamQueues(a);
        }
      };
      stuckLine.appendChild(retryBtn);
      row.appendChild(stuckLine);
    }

    list.appendChild(row);
  }
}

// ── Intelligence tab ──────────────────────────────────────────────────────────
async function renderIntel() {
  const a = document.getElementById('__g10intel__'); if (!a) return;
  a.innerHTML = '<div style="color:#1e293b;font-size:9px;padding:10px 12px">Loading intelligence context…</div>';
  try {
    const r = await fetch(`${INTELLIGENCE_URL}/api/intelligence/status`, { signal:AbortSignal.timeout(2000) });
    const status = r.ok ? await r.json() : null;
    const ctx    = _intelligenceCtx;
    let html = '';
    if (status) {
      html += `<div class="g10intel-section">
        <div class="g10intel-title">Intelligence Core</div>
        <div class="g10intel-row">Patterns: <span class="g10intel-val">${status.patterns||0} (${status.crystallised||0} crystallised)</span></div>
        <div class="g10intel-row">Fault classes: <span class="g10intel-val">${status.faultClasses||0}</span></div>
        <div class="g10intel-row">Reuse index: <span class="g10intel-val">${status.reuseItems||0} items</span></div>
        <div class="g10intel-row">Drift: <span class="g10intel-val ${status.driftLevel==='critical'?'g10offline':status.driftLevel==='elevated'?'g10warn':'g10online'}">${status.driftLevel||'unknown'}</span></div>
      </div>`;
    }
    if (ctx?.failureModes?.length) {
      html += `<div class="g10intel-section"><div class="g10intel-title">Active Failure Modes</div>`;
      for (const f of ctx.failureModes.slice(0,5)) {
        html += `<div class="g10intel-row">${escHtml(f.faultClass)} <span class="g10intel-val">×${f.count}</span></div>`;
      }
      html += '</div>';
    }
    if (ctx?.reuse?.length) {
      html += `<div class="g10intel-section"><div class="g10intel-title">Reusable Artifacts</div>`;
      for (const r2 of ctx.reuse.slice(0,3)) {
        html += `<div class="g10intel-row">${escHtml(r2.lang||'?')} <span class="g10intel-val">#${r2.hash}</span> ${escHtml((r2.intent||'').slice(0,40))}</div>`;
      }
      html += '</div>';
    }
    if (ctx?.patterns?.filter(p=>p.actionable).length) {
      html += `<div class="g10intel-section"><div class="g10intel-title">Active Patterns</div>`;
      for (const p of ctx.patterns.filter(p=>p.actionable).slice(0,3)) {
        html += `<div class="g10intel-row" style="color:#94a3b8">${escHtml(p.description.slice(0,80))}</div>`;
      }
      html += '</div>';
    }
    a.innerHTML = html || '<div style="color:#1e293b;font-size:9px;padding:20px;text-align:center">No intelligence context yet — fire a job first</div>';
  } catch(_) {
    a.innerHTML = '<div style="color:#f87171;font-size:9px;padding:12px">Intelligence core offline or not initialised</div>';
  }
}

// ── System status tab ─────────────────────────────────────────────────────────
function renderSys() {
  const a = document.getElementById('__g10sys__'); if (!a) return;
  const systems = [
    { id:'orchestrator', port:9000 },
    { id:'cortex', port:3748 },       { id:'guardian', port:7820 },
    { id:'idearium', port:4800 },     { id:'emerge', port:4242 },
  ];
  const health  = _systemStatus;
  let html = `<div class="g10sys-section">
    <div class="g10sys-title">System Health</div>`;
  for (const sys of systems) {
    const online = health[sys.id]?.ok || health.systems?.[sys.id]?.ok || health[sys.id];
    html += `<div class="g10sys-row">
      <div class="g10sys-dot" style="background:${online?'#22c55e':'#ef4444'}"></div>
      <span class="g10sys-label">${sys.id}</span>
      <span class="g10sys-val ${online?'g10online':'g10offline'}">:${sys.port} ${online?'ONLINE':'OFFLINE'}</span>
    </div>`;
  }
  html += '</div>';
  html += `<div class="g10sys-section">
    <div class="g10sys-title">Connection</div>
    <div class="g10sys-row"><span class="g10sys-label">NCP</span><span class="g10sys-val">${NCP_URL}</span></div>
    <div class="g10sys-row"><span class="g10sys-label">Cortex</span><span class="g10sys-val">${CORTEX_URL}</span></div>
    <div class="g10sys-row"><span class="g10sys-label">Provider</span><span class="g10sys-val">${PROVIDER}</span></div>
    <div class="g10sys-row"><span class="g10sys-label">Tab</span><span class="g10sys-val">${MY_TAB.slice(0,12)}</span></div>
    <div class="g10sys-row"><span class="g10sys-label">State</span><span class="g10sys-val ${connState==='ready'?'g10online':'g10offline'}">${connState.toUpperCase()}</span></div>
    <div class="g10sys-row"><span class="g10sys-label">Claimed</span><span class="g10sys-val g10online">ACTIVE</span></div>
  </div>`;
  html += `<div class="g10sys-section">
    <div class="g10sys-title">Session</div>
    <div class="g10sys-row"><span class="g10sys-label">Account</span><span class="g10sys-val">${escHtml(getAccount().slice(0,25))}</span></div>
    <div class="g10sys-row"><span class="g10sys-label">Chat ID</span><span class="g10sys-val">${escHtml(chatId())}</span></div>
    <div class="g10sys-row"><span class="g10sys-label">Jobs</span><span class="g10sys-val">${sessionJobs}</span></div>
    <div class="g10sys-row"><span class="g10sys-label">~Tokens</span><span class="g10sys-val">${sessionTokens.toLocaleString()}</span></div>
    <div class="g10sys-row"><span class="g10sys-label">Artifacts (IDB)</span><span class="g10sys-val">${artifactStore.length}</span></div>
    <div class="g10sys-row"><span class="g10sys-label">Gaps</span><span class="g10sys-val">${currentGaps.length}</span></div>
  </div>`;
  const refreshBtn = `<div style="padding:8px 12px"><button onclick="window.__g10pollSys?.()" style="background:none;border:1px solid rgba(255,255,255,.08);color:#475569;border-radius:3px;padding:3px 10px;font:inherit;font-size:9px;cursor:pointer;width:100%">↺ Refresh</button></div>`;
  a.innerHTML = html + refreshBtn;
  window.__g10pollSys = pollSystemStatus;
}

// ── Options tab ───────────────────────────────────────────────────────────────
const OPTIONS = [
  { key:'enableContextInjection', label:'Pre-prompt intelligence injection', default:true },
  { key:'enableArtifactCapture',  label:'Artifact capture (SHA-256 dedup)',   default:true },
  { key:'enableAutoRetry',        label:'Auto-retry on gap detection',        default:true },
  { key:'enableDOMMap',           label:'Send DOM map on navigation',         default:true },
  { key:'enableStreamCapture',    label:'Stream response to cortex',          default:true },
  { key:'enableSeamAutoInject',   label:'SEAM auto-inject mode',              default:false },
  { key:'verboseLog',             label:'Verbose logging',                    default:false },
];
function loadSettings() {
  for (const opt of OPTIONS) {
    const v = GM_getValue('g10_'+opt.key, null);
    _settings[opt.key] = v === null ? opt.default : v;
  }
}
function renderOpts() {
  const a = document.getElementById('__g10opts__'); if (!a) return;
  a.innerHTML = '';
  for (const opt of OPTIONS) {
    const row = document.createElement('div'); row.className='g10opt-row';
    const lbl = document.createElement('span'); lbl.className='g10opt-label'; lbl.textContent=opt.label;
    const toggle = document.createElement('div');
    toggle.className = 'g10opt-toggle' + (_settings[opt.key] ? ' on' : '');
    toggle.addEventListener('click', () => {
      _settings[opt.key] = !_settings[opt.key];
      GM_setValue('g10_'+opt.key, _settings[opt.key]);
      toggle.classList.toggle('on', _settings[opt.key]);
      _log('sys', `Setting: ${opt.key}`, _settings[opt.key] ? 'on' : 'off');
    });
    row.append(lbl, toggle); a.appendChild(row);
  }
  // Connection test button
  const testDiv = document.createElement('div'); testDiv.style.cssText='padding:10px 12px';
  const testBtn = document.createElement('button');
  testBtn.style.cssText = 'background:none;border:1px solid rgba(129,140,248,.3);color:#818cf8;border-radius:3px;padding:4px 12px;font:inherit;font-size:9px;cursor:pointer;width:100%';
  testBtn.textContent = '↺ Test all connections';
  testBtn.onclick = async () => {
    testBtn.textContent = 'Testing…';
    await pollSystemStatus();
    switchTab('sys');
    testBtn.textContent = '↺ Test all connections';
  };
  testDiv.appendChild(testBtn);
  a.appendChild(testDiv);
  // IDB stats
  dbGetAll('artifacts').then(arts => {
    const statsDiv = document.createElement('div'); statsDiv.style.cssText='padding:4px 14px;color:#1e293b;font-size:9px';
    statsDiv.textContent = `IDB: ${arts.length} artifacts stored`;
    a.appendChild(statsDiv);
  }).catch(()=>{});
}

// ══ NEXUS MODULE ════════════════════════════════════════════════════════════
// Wires the chat tab into NEXUS:
//   1. MutationObserver watches conversation DOM — every new message is captured
//   2. BDA signal extraction on each message (via Cortex /api/meta/observe)
//   3. Gap scoring on AI responses (via Cortex /api/meta/gaps)
//   4. Semantic context pull (via /api/search) — surfaces relevant past work
//   5. Ollama fallback (GM_xmlhttpRequest to 127.0.0.1:11434) for offline use
//   6. Inline annotations added to AI messages in the chat DOM

const _nexus = {
  observer:    null,
  lastMsgCount:0,
  sessionId:   null,
  signals:     [],
  context:     '',
  ollamaOk:    null,
  pending:      false,
  wakeHandledIndex: -1,   // §2026-08-22 — dedup guard for streaming-message wake detection
};

// ── Extract all visible messages from the DOM ─────────────────────────────────
function _nexusGetMessages() {
  const msgs = [];
  // Claude message selectors
  const humanEls = document.querySelectorAll(
    '[data-testid="human-turn-content"], .human-turn, [class*="HumanMessage"]'
  );
  const aiEls = document.querySelectorAll(
    '[data-testid="assistant-turn-content"], .font-claude-message, [class*="AssistantMessage"]'
  );
  // Interleave by DOM order
  const all = [...document.querySelectorAll(
    '[data-testid="human-turn-content"], [data-testid="assistant-turn-content"], .font-claude-message, .human-turn'
  )];
  for (const el of all) {
    const text = (el.innerText || el.textContent || '').trim();
    if (!text || text.length < 5) continue;
    const isHuman = el.matches('[data-testid="human-turn-content"], .human-turn, [class*="HumanMessage"]');
    msgs.push({ role: isHuman ? 'user' : 'assistant', text: text.slice(0, 2000) });
  }
  return msgs;
}

// ── Post message to NEXUS (chat-logger + BDA) ─────────────────────────────────
function _nexusLogMessage(msg) {
  // POST to Cortex /api/meta/observe for BDA signal extraction
  GM_xmlhttpRequest({
    method: 'POST',
    url: CORTEX_URL + '/api/meta/observe',
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({
      role:      msg.role,
      text:      msg.text,
      sessionId: _nexus.sessionId,
      source:    PROVIDER,
      chatUrl:   location.href,
      account:   window.NexusWake?.detectAccount?.(PROVIDER) || null,
    }),
    onload: (r) => {
      try {
        const d = JSON.parse(r.responseText);
        if (d?.result?.signals) {
          _nexus.signals.push({ ...d.result.signals, role: msg.role, ts: Date.now() });
          // Update NEXUS tab if open
          if (activeTab === 'nexus') renderNexus();
          // Annotate the message in DOM if gap score is high
          if (d.result.pendulum?.regime && d.result.pendulum.regime !== 'STABLE') {
            _nexusAnnotate(msg.role, d.result.pendulum.regime, d.result.gaps?.length || 0);
          }
        }
      } catch(_) {}
    },
    onerror: () => {},
  });
}

// ── Pull semantic context from NEXUS memory ────────────────────────────────────
function _nexusPullContext(query) {
  if (!query || _nexus.pending) return;
  _nexus.pending = true;
  GM_xmlhttpRequest({
    method: 'GET',
    url: ORCH_URL + '/api/search?q=' + encodeURIComponent(query.slice(0, 200)) + '&k=5&threshold=0.68&table=artifacts',
    onload: (r) => {
      _nexus.pending = false;
      try {
        const d = JSON.parse(r.responseText);
        if (d?.results?.length) {
          _nexus.context = d.results;
          if (activeTab === 'nexus') renderNexus();
        }
      } catch(_) { _nexus.pending = false; }
    },
    onerror: () => { _nexus.pending = false; },
  });
}

// ── Ollama fallback via GM_xmlhttpRequest ─────────────────────────────────────
// When Ollama is running locally and Guardian's Node process can't reach it,
// the userscript can call it directly — browser has no CORS restrictions via GM.
function _nexusOllamaQuery(prompt, cb) {
  GM_xmlhttpRequest({
    method: 'POST',
    url: 'http://127.0.0.1:11434/api/generate',
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({
      model:  'qwen2.5-coder:1.5b',
      prompt,
      stream: false,
    }),
    timeout: 30000,
    onload: (r) => {
      try {
        const d = JSON.parse(r.responseText);
        _nexus.ollamaOk = true;
        cb(null, d.response || '');
      } catch(e) { cb(e.message, null); }
    },
    onerror: (e) => {
      _nexus.ollamaOk = false;
      cb('Ollama unreachable', null);
    },
    ontimeout: () => {
      _nexus.ollamaOk = false;
      cb('Ollama timeout', null);
    },
  });
}

// Check Ollama availability on boot
function _nexusCheckOllama() {
  GM_xmlhttpRequest({
    method: 'GET', url: 'http://127.0.0.1:11434/api/tags',
    timeout: 3000,
    onload:  () => { _nexus.ollamaOk = true;  if (activeTab==='nexus') renderNexus(); },
    onerror: () => { _nexus.ollamaOk = false; if (activeTab==='nexus') renderNexus(); },
    ontimeout:()=> { _nexus.ollamaOk = false; },
  });
}

// ── Annotate AI messages with gap/regime badges ────────────────────────────────
function _nexusAnnotate(role, regime, gapCount) {
  if (role !== 'assistant' || !regime || regime === 'STABLE') return;
  // Find the last assistant message element
  const aiEls = document.querySelectorAll('[data-testid="assistant-turn-content"], .font-claude-message');
  if (!aiEls.length) return;
  const last = aiEls[aiEls.length - 1];
  if (last.querySelector('.__nx_badge__')) return; // already annotated
  const badge = document.createElement('div');
  badge.className = '__nx_badge__';
  const col = regime === 'OSCILLATING' || regime === 'DYSREGULATED' ? '#ff6b35' : '#818cf8';
  badge.style.cssText = `display:inline-flex;align-items:center;gap:4px;margin-top:6px;padding:2px 8px;border-radius:3px;font:9px monospace;color:${col};border:1px solid ${col};opacity:.7`;
  badge.textContent = `⬡ NEXUS · ${regime}${gapCount ? ' · ' + gapCount + ' gaps' : ''}`;
  last.appendChild(badge);
}

// ── MutationObserver — watch for new messages ─────────────────────────────────
function _nexusStartObserver() {
  const target = document.querySelector('main') || document.body;
  _nexus.observer = new MutationObserver(() => {
    const msgs = _nexusGetMessages();
    const newestIdx = msgs.length - 1;
    const newest = msgs[newestIdx];

    // §FIXED 2026-08-22 — James, live test: "it doesn't detect when you
    // say it but it does when i say it. the moment i click enter." Real
    // cause: this whole callback used to short-circuit on msgs.length
    // unchanged, so a STREAMING assistant message — which appears near-
    // empty, then grows over many mutations at the same message count —
    // only ever got checked once, at the moment it was still empty. A
    // typed human message has its full text instantly, so it never hit
    // this. Wake-checking now runs on every mutation, using the freshest
    // text, independent of the count-gated block below.
    try {
      if (newest && newest.text && typeof window !== 'undefined' && window.__nexusWakeInstance__
          && _nexus.wakeHandledIndex !== newestIdx) {
        const handled = window.__nexusWakeInstance__.checkMessage(newest.role, newest.text);
        // Only mark handled on a real match — an unmatched check must stay
        // re-checkable as more text streams in and the phrase may still
        // appear. Once handled, stop re-firing for this same message
        // (dedup: without this, a wake phrase present for the rest of a
        // streaming response would re-trigger askNexus() on every mutation).
        if (handled) _nexus.wakeHandledIndex = newestIdx;
      }
    } catch (_) { /* §1.2 — a wake-check failure never blocks real message logging */ }

    if (msgs.length === _nexus.lastMsgCount) return;
    _nexus.lastMsgCount = msgs.length;
    if (!newest) return;
    _nexusLogMessage(newest);
    // On user message: pull semantic context for what they're asking
    if (newest.role === 'user') {
      _nexusPullContext(newest.text);
    }
    if (activeTab === 'nexus') renderNexus();
  });
  _nexus.observer.observe(target, { childList: true, subtree: true, characterData: false });
}

// ── Render NEXUS tab ──────────────────────────────────────────────────────────
function renderNexus() {
  const el = document.getElementById('__g10nexus__');
  if (!el) return;

  const msgs    = _nexusGetMessages();
  const signals = _nexus.signals.slice(-5);
  const context = _nexus.context || [];
  const ollamaStatus = _nexus.ollamaOk === null ? '...' : _nexus.ollamaOk ? '✓ online' : '✗ offline';
  const ollamaCol    = _nexus.ollamaOk ? '#00ff88' : _nexus.ollamaOk === false ? '#ff2d55' : '#818cf8';

  el.innerHTML = '';

  const pad = 'padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.06)';
  const dim = 'color:#334466;font-size:9px';
  const bright = 'color:#b8cfe0;font-size:10px';

  // ── Status bar ───────────────────────────────────────────────────────────────
  const status = document.createElement('div');
  status.style.cssText = pad + ';display:flex;gap:12px;align-items:center;flex-wrap:wrap';
  status.innerHTML =
    '<span style="' + dim + ';text-transform:uppercase;letter-spacing:.08em">NEXUS</span>' +
    '<span style="font:9px monospace;color:' + ollamaCol + '">ollama ' + ollamaStatus + '</span>' +
    '<span style="' + dim + '">' + msgs.length + ' messages</span>' +
    '<span style="' + dim + '">' + signals.length + ' signals</span>' +
    '<span style="' + dim + '">' + context.length + ' context hits</span>' +
    '<button style="margin-left:auto;background:none;border:1px solid rgba(129,140,248,.3);color:#818cf8;border-radius:3px;padding:2px 8px;font:9px monospace;cursor:pointer" ' +
    'onclick="_nexusCheckOllama()">↺ ping ollama</button>';
  el.appendChild(status);

  // ── BDA Signals ───────────────────────────────────────────────────────────────
  if (signals.length) {
    const sdiv = document.createElement('div');
    sdiv.style.cssText = pad;
    sdiv.innerHTML = '<div style="' + dim + ';margin-bottom:5px;text-transform:uppercase;letter-spacing:.08em">BDA SIGNALS</div>';
    const latest = signals[signals.length - 1];
    const axes = ['valence','certainty','openness','tension','selfref'];
    const sigRow = document.createElement('div');
    sigRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    for (const ax of axes) {
      const v = latest[ax] ?? 0;
      const pct = Math.round(v * 100);
      const col = ax === 'tension' ? (pct > 60 ? '#ff2d55' : '#818cf8') :
                  ax === 'valence' ? (pct > 50 ? '#00ff88' : '#ff6b35') : '#818cf8';
      const chip = document.createElement('div');
      chip.style.cssText = 'font:9px monospace;color:' + col + ';border:1px solid ' + col + ';border-radius:3px;padding:2px 6px;opacity:.8';
      chip.textContent = ax + ':' + pct + '%';
      sigRow.appendChild(chip);
    }
    // Regime
    if (latest.regime) {
      const reg = document.createElement('div');
      reg.style.cssText = 'margin-top:5px;font:9px monospace;color:#ff6b35';
      reg.textContent = 'regime: ' + latest.regime;
      sdiv.appendChild(sigRow);
      sdiv.appendChild(reg);
    } else {
      sdiv.appendChild(sigRow);
    }
    el.appendChild(sdiv);
  }

  // ── Semantic context from NEXUS memory ───────────────────────────────────────
  if (context.length) {
    const cdiv = document.createElement('div');
    cdiv.style.cssText = pad;
    cdiv.innerHTML = '<div style="' + dim + ';margin-bottom:5px;text-transform:uppercase;letter-spacing:.08em">RELEVANT MEMORY</div>';
    for (const hit of context.slice(0, 4)) {
      const pct = Math.round((hit.snr || hit.similarity || 0) * 100);
      const col = pct >= 85 ? '#00ff88' : pct >= 72 ? '#00d4ff' : '#818cf8';
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:4px;padding:5px 8px;background:rgba(0,0,0,.3);border-radius:3px;border-left:2px solid ' + col;
      row.innerHTML =
        '<div style="font:9px monospace;color:' + col + '">' + pct + '% · ' + (hit.type || hit.table || '?') + '</div>' +
        '<div style="font:10px monospace;color:#5a7a96;margin-top:2px;line-height:1.4">' +
        (hit.text || '').slice(0, 100) + '</div>';
      cdiv.appendChild(row);
    }
    // Inject context button
    const injectBtn = document.createElement('button');
    injectBtn.style.cssText = 'margin-top:6px;background:none;border:1px solid rgba(0,212,255,.3);color:#00d4ff;border-radius:3px;padding:3px 10px;font:9px monospace;cursor:pointer;width:100%';
    injectBtn.textContent = '⬡ inject context into next prompt';
    injectBtn.onclick = () => _nexusInjectContext();
    cdiv.appendChild(injectBtn);
    el.appendChild(cdiv);
  }

  // ── Ollama quick-query ────────────────────────────────────────────────────────
  const qdiv = document.createElement('div');
  qdiv.style.cssText = pad;
  qdiv.innerHTML = '<div style="' + dim + ';margin-bottom:5px;text-transform:uppercase;letter-spacing:.08em">OLLAMA DIRECT</div>';
  const qInput = document.createElement('textarea');
  qInput.id = '__nx_query__';
  qInput.placeholder = 'Ask Ollama directly (qwen2.5-coder:1.5b)…';
  qInput.style.cssText = 'width:100%;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.07);color:#b8cfe0;font:10px monospace;padding:6px 8px;border-radius:3px;resize:none;height:52px;outline:none;box-sizing:border-box';
  const qBtn = document.createElement('button');
  qBtn.textContent = '↗ ask ollama';
  qBtn.style.cssText = 'margin-top:4px;background:none;border:1px solid rgba(0,255,136,.3);color:#00ff88;border-radius:3px;padding:3px 10px;font:9px monospace;cursor:pointer';
  const qOut = document.createElement('div');
  qOut.id = '__nx_qout__';
  qOut.style.cssText = 'margin-top:6px;font:10px monospace;color:#5a7a96;line-height:1.5;min-height:20px';
  qBtn.onclick = () => {
    const q = document.getElementById('__nx_query__')?.value?.trim();
    if (!q) return;
    qOut.style.color = '#818cf8'; qOut.textContent = '⟳ querying ollama…';
    _nexusOllamaQuery(q, (err, text) => {
      const out = document.getElementById('__nx_qout__');
      if (!out) return;
      if (err) { out.style.color='#ff2d55'; out.textContent='✗ ' + err; }
      else      { out.style.color='#b8cfe0'; out.textContent = text.slice(0, 400); }
    });
  };
  qdiv.append(qInput, qBtn, qOut);
  el.appendChild(qdiv);

  // ── Recent conversation summary ────────────────────────────────────────────
  if (msgs.length) {
    const mdiv = document.createElement('div');
    mdiv.style.cssText = 'padding:8px 12px';
    mdiv.innerHTML = '<div style="' + dim + ';margin-bottom:5px;text-transform:uppercase;letter-spacing:.08em">CONVERSATION (' + msgs.length + ')</div>';
    for (const m of msgs.slice(-4)) {
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:3px;display:flex;gap:6px';
      const role = document.createElement('span');
      role.style.cssText = 'font:8px monospace;color:' + (m.role==='user'?'#00d4ff':'#00ff88') + ';width:52px;flex-shrink:0;padding-top:1px';
      role.textContent = m.role.toUpperCase();
      const text = document.createElement('span');
      text.style.cssText = 'font:10px monospace;color:#334466;line-height:1.4';
      text.textContent = m.text.slice(0, 80) + (m.text.length > 80 ? '…' : '');
      row.append(role, text);
      mdiv.appendChild(row);
    }
    el.appendChild(mdiv);
  }
}

// ── Inject NEXUS context into the Claude input field ─────────────────────────
function _nexusInjectContext() {
  if (!_nexus.context?.length) return;
  const lines = ['[NEXUS CONTEXT — relevant past work]'];
  for (const hit of _nexus.context.slice(0, 3)) {
    const pct = Math.round((hit.snr || hit.similarity || 0) * 100);
    lines.push('[' + pct + '% match · ' + (hit.type || '?') + '] ' + (hit.text || '').slice(0, 200));
  }
  lines.push('[END NEXUS CONTEXT]');
  const ctx = lines.join('\n');
  // Find Claude's input
  const inp = document.querySelector('[contenteditable="true"][data-placeholder]') ||
              document.querySelector('div[contenteditable="true"]');
  if (!inp) return;
  inp.focus();
  const existing = inp.innerText || '';
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, ctx + (existing ? '\n\n' + existing : ''));
}

// ── Init ──────────────────────────────────────────────────────────────────────
function _nexusInit() {
  _nexus.sessionId = MY_TAB + '-' + Date.now().toString(36);
  _nexusCheckOllama();
  setTimeout(_nexusStartObserver, 2000); // wait for DOM to settle
}

// ══ NEXUS HOOKS — Memory · RAID · Self-Heal ═════════════════════════════════
// The userscript is now a full NEXUS agent.
// Three hooks into the sovereign system, callable from the NEXUS tab
// or triggered automatically by conversation events.

// ── MEMORY HOOK ───────────────────────────────────────────────────────────────
// Read working memory, write observations, search semantic memory.
// The conversation IS the input. Every exchange enriches the memory store.

const _mem = {
  working:   [],  // live working memory from cortex
  lastFetch: 0,
};

function _memFetch(cb) {
  GM_xmlhttpRequest({
    method: 'GET',
    url: CORTEX_URL + '/api/memory/working',
    onload: (r) => {
      try {
        const d = JSON.parse(r.responseText);
        _mem.working = d.rows || d.memory || [];
        _mem.lastFetch = Date.now();
        if (cb) cb(_mem.working);
      } catch(_) { if (cb) cb([]); }
    },
    onerror: () => { if (cb) cb([]); },
  });
}

function _memWrite(key, value, tags = []) {
  // Write an observation to cortex working memory from the conversation
  GM_xmlhttpRequest({
    method: 'POST',
    url: CORTEX_URL + '/api/table/insert',
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({
      table: 'cortex_memory',
      record: {
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
        tags:  [...tags, 'userscript', PROVIDER],
        source: PROVIDER + '-userscript',
        ts:    Date.now(),
      },
    }),
    onerror: () => {},
  });
}

function _memSearch(query, cb) {
  GM_xmlhttpRequest({
    method: 'GET',
    url: ORCH_URL + '/api/search?q=' + encodeURIComponent(query) + '&k=8&threshold=0.68',
    onload: (r) => {
      try { cb(null, JSON.parse(r.responseText)); }
      catch(e) { cb(e.message, null); }
    },
    onerror: (e) => cb('search failed', null),
  });
}

function _memForget(id) {
  GM_xmlhttpRequest({
    method: 'POST',
    url: CORTEX_URL + '/api/memory/forget',
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({ id }),
    onerror: () => {},
  });
}

// ── RAID HOOK ─────────────────────────────────────────────────────────────────
// Ask RAID which provider it would choose for a given intent.
// Surface the decision in the NEXUS tab — you can see why NEXUS would route
// a particular query to Claude vs ChatGPT vs Gemini vs Perplexity vs Ollama.
// Lets you override before dispatching.

const _raid = {
  lastDecision: null,
  history:      [],
};

function _raidDecide(intent, preferred, cb) {
  const url = CORTEX_URL + '/api/raid/decide?intent=' +
    encodeURIComponent(intent || '') +
    (preferred ? '&preferred=' + encodeURIComponent(preferred) : '');
  GM_xmlhttpRequest({
    method: 'GET', url,
    onload: (r) => {
      try {
        const d = JSON.parse(r.responseText);
        _raid.lastDecision = d;
        _raid.history.unshift({ intent: intent.slice(0,60), decision: d, ts: Date.now() });
        if (_raid.history.length > 20) _raid.history.pop();
        if (cb) cb(null, d);
        if (activeTab === 'nexus') _renderNexusRaid();
      } catch(e) { if (cb) cb(e.message, null); }
    },
    onerror: () => { if (cb) cb('RAID unreachable', null); },
  });
}

function _raidStatus(cb) {
  GM_xmlhttpRequest({
    method: 'GET',
    url: CORTEX_URL + '/health',
    onload: (r) => {
      try { cb(null, JSON.parse(r.responseText)); }
      catch(e) { cb(e.message, null); }
    },
    onerror: () => cb('cortex offline', null),
  });
}

// ── SELF-HEAL HOOK ─────────────────────────────────────────────────────────────
// Read open gaps, active failure modes, friction scores.
// Trigger a heal request from the userscript for a specific gap.
// Surface the escalation state — you can see what the system tried and where it is.

const _heal = {
  gaps:         [],
  failureModes: [],
  friction:     [],
  status:       null,
  lastFetch:    0,
};

function _healFetch(cb) {
  let done = 0;
  const finish = () => { done++; if (done === 3 && cb) cb(_heal); };

  GM_xmlhttpRequest({
    method: 'GET', url: CORTEX_URL + '/api/gaps?status=open',
    onload: (r) => {
      try { const d=JSON.parse(r.responseText); _heal.gaps=d.rows||d.gaps||[]; } catch(_) {}
      finish();
    },
    onerror: finish,
  });

  GM_xmlhttpRequest({
    method: 'GET', url: CORTEX_URL + '/api/failure-modes',
    onload: (r) => {
      try { const d=JSON.parse(r.responseText); _heal.failureModes=d.failureModes||[]; } catch(_) {}
      finish();
    },
    onerror: finish,
  });

  GM_xmlhttpRequest({
    method: 'GET', url: CORTEX_URL + '/api/friction',
    onload: (r) => {
      try { const d=JSON.parse(r.responseText); _heal.friction=d.faultClasses||[]; } catch(_) {}
      finish();
    },
    onerror: finish,
  });
}

function _healTrigger(gapUuid, cb) {
  // Inject a HEAL_REQUESTED event into the bus — escalation engine picks it up
  GM_xmlhttpRequest({
    method: 'POST',
    url: CORTEX_URL + '/api/event',
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({
      type:    'HEAL_REQUESTED',
      payload: { gapUuid, source: PROVIDER + '-userscript', manual: true },
      source:  'userscript',
      ts:      Date.now(),
    }),
    onload: (r) => {
      try { if (cb) cb(null, JSON.parse(r.responseText)); }
      catch(e) { if (cb) cb(e.message, null); }
    },
    onerror: () => { if (cb) cb('heal trigger failed', null); },
  });
}

function _healStatus(cb) {
  GM_xmlhttpRequest({
    method: 'GET', url: CORTEX_URL + '/api/self-heal/status',
    onload: (r) => {
      try { const d=JSON.parse(r.responseText); _heal.status=d; if(cb) cb(null,d); }
      catch(e) { if(cb) cb(e.message,null); }
    },
    onerror: () => { if(cb) cb('self-heal offline',null); },
  });
}

// ── NEXUS tab sub-renderers ────────────────────────────────────────────────────
function _renderNexusMemory(container) {
  const sec = document.createElement('div');
  sec.style.cssText = 'padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.06)';

  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:5px';
  hdr.innerHTML =
    '<span style="color:#334466;font-size:9px;text-transform:uppercase;letter-spacing:.08em">WORKING MEMORY</span>' +
    '<span style="color:#1e3050;font-size:9px">' + _mem.working.length + ' items</span>' +
    '<button style="margin-left:auto;background:none;border:1px solid rgba(255,255,255,.07);color:#334466;border-radius:3px;padding:1px 7px;font:9px monospace;cursor:pointer" ' +
    'id="__nx_mem_refresh__">↺</button>';
  sec.appendChild(hdr);

  if (!_mem.working.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:#1e3050;font:9px monospace';
    empty.textContent = 'empty — memory fills as the system runs';
    sec.appendChild(empty);
  } else {
    for (const m of _mem.working.slice(0, 5)) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;margin-bottom:3px;align-items:flex-start';
      const k = document.createElement('span');
      k.style.cssText = 'color:#00d4ff;font:9px monospace;flex-shrink:0;width:90px;overflow:hidden;text-overflow:ellipsis';
      k.textContent = (m.key||'').slice(0,14);
      const v = document.createElement('span');
      v.style.cssText = 'color:#334466;font:9px monospace;line-height:1.4;flex:1';
      v.textContent = String(m.value||'').slice(0,80);
      const del = document.createElement('button');
      del.style.cssText = 'margin-left:auto;background:none;border:none;color:#1e3050;font:9px monospace;cursor:pointer;flex-shrink:0';
      del.textContent = '✕';
      const mUuid = m.uuid||'';
      del.onclick = function() { _memForget(mUuid); this.parentNode.remove(); };
      row.append(k, v, del);
      sec.appendChild(row);
    }
    if (_mem.working.length > 5) {
      const more = document.createElement('div');
      more.style.cssText = 'color:#1e3050;font:9px monospace;margin-top:3px';
      more.textContent = '+ ' + (_mem.working.length - 5) + ' more';
      sec.appendChild(more);
    }
  }

  // Write to memory from conversation
  const writeRow = document.createElement('div');
  writeRow.style.cssText = 'display:flex;gap:4px;margin-top:6px';
  const keyIn = document.createElement('input');
  keyIn.placeholder = 'key';
  keyIn.style.cssText = 'flex:0 0 80px;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.07);color:#b8cfe0;font:9px monospace;padding:3px 5px;border-radius:3px;outline:none';
  const valIn = document.createElement('input');
  valIn.placeholder = 'value to remember';
  valIn.style.cssText = 'flex:1;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.07);color:#b8cfe0;font:9px monospace;padding:3px 5px;border-radius:3px;outline:none';
  const writeBtn = document.createElement('button');
  writeBtn.textContent = '+ mem';
  writeBtn.style.cssText = 'background:none;border:1px solid rgba(0,212,255,.2);color:#00d4ff;border-radius:3px;padding:2px 7px;font:9px monospace;cursor:pointer;flex-shrink:0';
  writeBtn.onclick = () => {
    const k = keyIn.value.trim(); const v = valIn.value.trim();
    if (!k || !v) return;
    _memWrite(k, v, ['manual']);
    keyIn.value = ''; valIn.value = '';
    setTimeout(() => _memFetch(() => { if(activeTab==='nexus') renderNexus(); }), 300);
  };
  writeRow.append(keyIn, valIn, writeBtn);
  sec.appendChild(writeRow);
  container.appendChild(sec);
}

function _renderNexusRaid(container) {
  const sec = document.createElement('div');
  sec.style.cssText = 'padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.06)';

  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px';
  hdr.innerHTML = '<span style="color:#334466;font-size:9px;text-transform:uppercase;letter-spacing:.08em">RAID ROUTING</span>';
  sec.appendChild(hdr);

  // Last decision
  if (_raid.lastDecision) {
    const d = _raid.lastDecision;
    const agentCol = { ollama:'#00ff88', claude:'#818cf8', chatgpt:'#34d399', gemini:'#ff6b35', perplexity:'#00d4ff' };
    const col = agentCol[d.agent] || '#b8cfe0';
    const decision = document.createElement('div');
    decision.style.cssText = 'padding:5px 8px;background:rgba(0,0,0,.3);border-radius:3px;border-left:2px solid ' + col + ';margin-bottom:6px';
    decision.innerHTML =
      '<div style="display:flex;gap:8px;align-items:center">' +
      '<span style="font:10px monospace;color:' + col + ';font-weight:700">' + (d.agent||'?') + '</span>' +
      '<span style="font:9px monospace;color:#334466">cluster: ' + (d.cluster||'?') + '</span>' +
      '<span style="font:9px monospace;color:#1e3050">' + (d.reason||'') + '</span>' +
      '</div>';
    sec.appendChild(decision);
  }

  // Ask RAID row
  const askRow = document.createElement('div');
  askRow.style.cssText = 'display:flex;gap:4px;align-items:center';
  const intentIn = document.createElement('input');
  intentIn.placeholder = 'intent to route…';
  intentIn.style.cssText = 'flex:1;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.07);color:#b8cfe0;font:9px monospace;padding:3px 6px;border-radius:3px;outline:none';
  const askBtn = document.createElement('button');
  askBtn.textContent = '→ route';
  askBtn.style.cssText = 'background:none;border:1px solid rgba(129,140,248,.3);color:#818cf8;border-radius:3px;padding:2px 8px;font:9px monospace;cursor:pointer;flex-shrink:0';
  askBtn.onclick = () => {
    const q = intentIn.value.trim(); if (!q) return;
    _raidDecide(q, '', (err, d) => { if (!err && activeTab==='nexus') renderNexus(); });
  };
  // Auto-route the current input field content
  const autoBtn = document.createElement('button');
  autoBtn.textContent = '⟳ auto';
  autoBtn.style.cssText = 'background:none;border:1px solid rgba(0,255,136,.2);color:#00ff88;border-radius:3px;padding:2px 8px;font:9px monospace;cursor:pointer;flex-shrink:0';
  autoBtn.onclick = () => {
    const msgs = _nexusGetMessages();
    const last = msgs.filter(m => m.role==='user').pop();
    if (last) { intentIn.value=last.text.slice(0,80); askBtn.click(); }
  };
  askRow.append(intentIn, askBtn, autoBtn);
  sec.appendChild(askRow);

  // History
  if (_raid.history.length) {
    const hist = document.createElement('div');
    hist.style.cssText = 'margin-top:5px;display:flex;flex-direction:column;gap:2px';
    for (const h of _raid.history.slice(0, 4)) {
      const agentCol = { ollama:'#00ff88', claude:'#818cf8', chatgpt:'#34d399', gemini:'#ff6b35', perplexity:'#00d4ff' };
      const col = agentCol[h.decision?.agent] || '#334466';
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;font:9px monospace;color:#1e3050';
      row.innerHTML =
        '<span style="color:' + col + ';width:70px;flex-shrink:0">' + (h.decision?.agent||'?') + '</span>' +
        '<span style="color:#1e3050">' + (h.intent||'').slice(0,50) + '</span>';
      hist.appendChild(row);
    }
    sec.appendChild(hist);
  }

  if (container) container.appendChild(sec);
  else {
    const el = document.getElementById('__g10nexus__');
    if (el) { /* will be called from renderNexus */ }
  }
  return sec;
}

function _renderNexusHeal(container) {
  const sec = document.createElement('div');
  sec.style.cssText = 'padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.06)';

  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:5px';
  hdr.innerHTML =
    '<span style="color:#334466;font-size:9px;text-transform:uppercase;letter-spacing:.08em">SELF-HEAL</span>' +
    '<span style="color:#1e3050;font-size:9px">' + _heal.gaps.length + ' open gaps · ' + _heal.failureModes.length + ' failure modes</span>' +
    '<button style="margin-left:auto;background:none;border:1px solid rgba(255,255,255,.07);color:#334466;border-radius:3px;padding:1px 7px;font:9px monospace;cursor:pointer" ' +
    'id="__nx_heal_refresh__">↺</button>';
  sec.appendChild(hdr);

  // Failure modes (highest priority)
  for (const fm of _heal.failureModes.slice(0, 2)) {
    const card = document.createElement('div');
    card.style.cssText = 'padding:5px 8px;background:rgba(255,45,85,.06);border:1px solid rgba(255,45,85,.2);border-radius:3px;margin-bottom:4px';
    card.innerHTML =
      '<div style="display:flex;gap:6px;align-items:center">' +
      '<span style="font:9px monospace;color:#ff2d55;font-weight:700">FAILURE MODE</span>' +
      '<span style="font:9px monospace;color:#5a7a96">' + (fm.faultClass||'').slice(0,30) + '</span>' +
      '<span style="font:9px monospace;color:#334466">friction:' + ((fm.friction||0)*100).toFixed(0) + '%</span>' +
      '</div>' +
      '<div style="font:9px monospace;color:#5a7a96;margin-top:3px;line-height:1.4">' + (fm.humanAction||'').slice(0,100) + '</div>';
    sec.appendChild(card);
  }

  // Open gaps
  for (const gap of _heal.gaps.slice(0, 4)) {
    const sev  = gap.severity || 'medium';
    const col  = sev==='high'?'#ff6b35':sev==='critical'?'#ff2d55':'#818cf8';
    const fric = (_heal.friction.find(f=>f.faultClass===gap.type)?.friction||0)*100;
    const row  = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:3px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04)';
    const sevEl = document.createElement('span');
    sevEl.style.cssText = 'font:8px monospace;color:'+col+';width:50px;flex-shrink:0';
    sevEl.textContent = sev;
    const typeEl = document.createElement('span');
    typeEl.style.cssText = 'font:9px monospace;color:#334466;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    typeEl.textContent = (gap.type||'?') + (gap.path?' · '+gap.path.slice(-20):'');
    const healBtn = document.createElement('button');
    healBtn.style.cssText = 'background:none;border:1px solid rgba(0,255,136,.2);color:#00ff88;border-radius:3px;padding:1px 6px;font:8px monospace;cursor:pointer;flex-shrink:0';
    healBtn.textContent = '⟳ heal';
    const gUuid = gap.uuid||'';
    healBtn.onclick = function() {
      _healTrigger(gUuid, function(e) {
        healBtn.textContent = e ? '✗' : '✓';
        setTimeout(function() { _healFetch(function() { if(activeTab==='nexus') renderNexus(); }); }, 500);
      });
    };
    if (fric>0) { const fr=document.createElement('span'); fr.style.cssText='font:8px monospace;color:#ff6b35'; fr.textContent='f:'+fric.toFixed(0)+'%'; row.append(sevEl,typeEl,fr,healBtn); }
    else row.append(sevEl,typeEl,healBtn);
    sec.appendChild(row);
  }

  if (!_heal.gaps.length && !_heal.failureModes.length) {
    const ok = document.createElement('div');
    ok.style.cssText = 'color:#00ff88;font:9px monospace';
    ok.textContent = '✓ no open gaps';
    sec.appendChild(ok);
  }

  // Friction table
  if (_heal.friction.some(f=>f.friction>0)) {
    const ftbl = document.createElement('div');
    ftbl.style.cssText = 'margin-top:6px';
    ftbl.innerHTML = '<div style="color:#1e3050;font:8px monospace;margin-bottom:3px;text-transform:uppercase">FRICTION</div>';
    for (const f of _heal.friction.filter(x=>x.friction>0).slice(0,5)) {
      const pct = Math.round(f.friction*100);
      const col = pct>=70?'#ff2d55':pct>=40?'#ff6b35':'#818cf8';
      const bar = document.createElement('div');
      bar.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:2px';
      bar.innerHTML =
        '<span style="font:8px monospace;color:#334466;width:100px;overflow:hidden;text-overflow:ellipsis">' + (f.faultClass||'?') + '</span>' +
        '<div style="flex:1;height:4px;background:rgba(255,255,255,.05);border-radius:2px">' +
        '<div style="width:' + pct + '%;height:100%;background:' + col + ';border-radius:2px"></div>' +
        '</div>' +
        '<span style="font:8px monospace;color:' + col + ';width:24px;text-align:right">' + pct + '%</span>';
      ftbl.appendChild(bar);
    }
    sec.appendChild(ftbl);
  }

  container.appendChild(sec);
}

// ── Rewrite renderNexus to include all three hooks ────────────────────────────
const _renderNexusOrig = renderNexus;
function renderNexus() {
  const el = document.getElementById('__g10nexus__');
  if (!el) return;
  el.innerHTML = '';

  // Status bar
  const msgs = _nexusGetMessages();
  const os   = _nexus.ollamaOk===null?'...':_nexus.ollamaOk?'✓':'✗';
  const oc   = _nexus.ollamaOk?'#00ff88':_nexus.ollamaOk===false?'#ff2d55':'#818cf8';
  const sb   = document.createElement('div');
  sb.style.cssText = 'padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:rgba(0,0,0,.2)';
  sb.innerHTML =
    '<span style="color:#00d4ff;font:9px monospace;font-weight:700">⬡ NEXUS</span>' +
    '<span style="font:9px monospace;color:' + oc + '">ollama ' + os + '</span>' +
    '<span style="color:#1e3050;font:9px monospace">' + msgs.length + ' msgs</span>' +
    '<span style="color:#1e3050;font:9px monospace">' + _heal.gaps.length + ' gaps</span>' +
    '<span style="color:#1e3050;font:9px monospace">' + _mem.working.length + ' mem</span>' +
    '<button style="margin-left:auto;background:none;border:1px solid rgba(0,212,255,.2);color:#00d4ff;border-radius:3px;padding:1px 7px;font:8px monospace;cursor:pointer" ' +
    'onclick="_nexusRefreshAll()">↺ all</button>';
  el.appendChild(sb);

  // BDA signals (compact)
  if (_nexus.signals.length) {
    const latest = _nexus.signals[_nexus.signals.length-1];
    const sdiv   = document.createElement('div');
    sdiv.style.cssText = 'padding:6px 12px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;gap:5px;flex-wrap:wrap;align-items:center';
    sdiv.innerHTML = '<span style="color:#334466;font:8px monospace;margin-right:3px;text-transform:uppercase">BDA</span>';
    for (const ax of ['valence','certainty','openness','tension','selfref']) {
      const v = latest[ax]??0; const pct=Math.round(v*100);
      const col=ax==='tension'?(pct>60?'#ff2d55':'#818cf8'):ax==='valence'?(pct>50?'#00ff88':'#ff6b35'):'#818cf8';
      sdiv.innerHTML += '<span style="font:8px monospace;color:'+col+';border:1px solid '+col+';border-radius:2px;padding:1px 4px">'+ax[0].toUpperCase()+':'+pct+'%</span>';
    }
    if (latest.regime && latest.regime!=='STABLE') {
      sdiv.innerHTML += '<span style="font:8px monospace;color:#ff6b35;margin-left:4px">'+latest.regime+'</span>';
    }
    el.appendChild(sdiv);
  }

  // Semantic context (compact)
  if (_nexus.context?.length) {
    const cdiv = document.createElement('div');
    cdiv.style.cssText = 'padding:6px 12px;border-bottom:1px solid rgba(255,255,255,.06)';
    cdiv.innerHTML = '<div style="color:#334466;font:8px monospace;margin-bottom:4px;text-transform:uppercase">MEMORY HITS</div>';
    for (const hit of _nexus.context.slice(0,3)) {
      const pct=Math.round((hit.snr||hit.similarity||0)*100);
      const col=pct>=85?'#00ff88':pct>=72?'#00d4ff':'#818cf8';
      const row=document.createElement('div');
      row.style.cssText='display:flex;gap:6px;margin-bottom:2px;align-items:flex-start';
      row.innerHTML='<span style="font:8px monospace;color:'+col+';width:28px;flex-shrink:0">'+pct+'%</span><span style="font:9px monospace;color:#334466;line-height:1.4">'+(hit.text||'').slice(0,90)+'</span>';
      cdiv.appendChild(row);
    }
    const inj=document.createElement('button');
    inj.style.cssText='margin-top:4px;background:none;border:1px solid rgba(0,212,255,.2);color:#00d4ff;border-radius:3px;padding:2px 8px;font:8px monospace;cursor:pointer;width:100%';
    inj.textContent='⬡ inject into prompt';
    inj.onclick=_nexusInjectContext;
    cdiv.appendChild(inj);
    el.appendChild(cdiv);
  }

  // RAID
  el.appendChild(_renderNexusRaid());

  // Memory
  _renderNexusMemory(el);

  // Self-Heal
  _renderNexusHeal(el);

  // Ollama direct (compact)
  const qdiv=document.createElement('div');
  qdiv.style.cssText='padding:8px 12px';
  qdiv.innerHTML='<div style="color:#334466;font:8px monospace;margin-bottom:4px;text-transform:uppercase">OLLAMA DIRECT</div>';
  const qi=document.createElement('textarea');qi.id='__nx_query__';
  qi.placeholder='qwen2.5-coder:1.5b…';
  qi.style.cssText='width:100%;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.07);color:#b8cfe0;font:9px monospace;padding:5px 7px;border-radius:3px;resize:none;height:44px;outline:none;box-sizing:border-box';
  const qb=document.createElement('button');qb.textContent='↗ ask';
  qb.style.cssText='margin-top:3px;background:none;border:1px solid rgba(0,255,136,.2);color:#00ff88;border-radius:3px;padding:2px 8px;font:8px monospace;cursor:pointer';
  const qo=document.createElement('div');qo.id='__nx_qout__';
  qo.style.cssText='margin-top:4px;font:9px monospace;color:#334466;line-height:1.5;min-height:16px';
  qb.onclick=()=>{const q=document.getElementById('__nx_query__')?.value?.trim();if(!q)return;qo.style.color='#818cf8';qo.textContent='⟳';_nexusOllamaQuery(q,(err,text)=>{const o=document.getElementById('__nx_qout__');if(!o)return;if(err){o.style.color='#ff2d55';o.textContent='✗ '+err;}else{o.style.color='#b8cfe0';o.textContent=text.slice(0,400);}});};
  qdiv.append(qi,qb,qo);el.appendChild(qdiv);
}

function _nexusRefreshAll() {
  _nexusCheckOllama();
  _memFetch(() => { if(activeTab==='nexus') renderNexus(); });
  _healFetch(() => { if(activeTab==='nexus') renderNexus(); });
  const msgs = _nexusGetMessages();
  const last = msgs.filter(m=>m.role==='user').pop();
  if (last) _raidDecide(last.text, '', () => { if(activeTab==='nexus') renderNexus(); });
}

// Override _nexusInit to also boot hooks
const _nexusInitBase = _nexusInit;
function _nexusInit() {
  _nexus.sessionId = MY_TAB + '-' + Date.now().toString(36);
  _nexusCheckOllama();
  setTimeout(_nexusStartObserver, 2000);
  setTimeout(() => { _memFetch(); _healFetch(); }, 3000);
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  loadSettings();
  await dbOpen().catch(() => { _log('err','IDB failed — degraded mode'); });
  buildUI();
  connect();
  _nexusInit();  // start conversation observer + Ollama fallback
  _log('sys', `Guardian v${VERSION}`, `${PROVIDER} · ${location.hostname}`);
  // DOM map on load if enabled
  if (_settings.enableDOMMap) setTimeout(() => sendDOMMap(), 3000);
  // Periodic footer update
  setInterval(() => {
    const el = document.getElementById('__g10fl__');
    if (el) {
      const secs = Math.round((Date.now()-sessionStart)/1000);
      el.textContent = `${getAccount().slice(0,16)} · ${Math.floor(secs/60)}m · ~${sessionTokens.toLocaleString()}tok`;
    }
  }, 5000);
}

init().catch(e => console.error('[Guardian §1.2]', e));

})();
