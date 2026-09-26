// ─────────────────────────────────────────────────────────────────────────────
// guardian/userscript-nexus-wake.js — "Hey nexus" in any agent tab
// UUID: nexus-wake-v1-0000-2026-0818-001
// Version: 1.1.0   (0.39.252 — checkMessage reports only; agent wakes are answered by guardian/lib/wake-loop.js)
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
    VERSION:   '1.1.0',
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
    const { provider, tabId, ncpUrl = 'http://127.0.0.1:7820', injectText, submit, log = () => {}, ledgerWrite = () => {} } = ctx || {};
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
      // §FOUND & FIXED 2026-09-07 — James, with a real screenshot: "see
      // the black box, thats where it gets delivered. it needs to
      // deliver as a job." Same real fix as checkMessage() below —
      // reusing the exact same GUARDIAN_LEDGER_WRITE mechanism this
      // same userscript already sends elsewhere, so this exchange
      // becomes a real, trackable job rather than only ever existing in
      // this floating overlay.
      const wakeJobId = `wake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      ledgerWrite({ jobId: wakeJobId, category: 'WAKE_QUESTION', msg: ask, meta: { provider, tabId } });

      askNexus(ask)
        .then(r => {
          if (r.ok) {
            const answer = r.text || '(co-pilot returned an empty answer)';
            _render('answer', answer);
            ledgerWrite({ jobId: wakeJobId, category: 'WAKE_ANSWER', msg: answer, meta: { provider, tabId } });
            ackWakeJob(wakeJobId, ask, answer);
            // §NEW 2026-09-07 — James: "so close, just needs to send it
            // back as a job and ack to inject into the chat like its
            // user input." Real gap found before fixing: injectText/
            // submit were DOCUMENTED in this function's own ctx
            // comment but never actually passed by any of the 5 real
            // provider userscripts that call install() — confirmed by
            // checking every real call site, not assumed. Wired all 5.
            // §DELIBERATE — injectText() only, NOT submit(). Checked
            // each provider's own real submit() directly: it clicks
            // the real send button, which would dispatch nexus's own
            // answer text as a brand-new turn TO THE REAL MODEL —
            // exactly the real API cost this whole feature exists to
            // avoid (this file's own header: "Zero cost anywhere,
            // because the model never sees the turn"). injectText()
            // alone fills the real composer with the real answer,
            // visible exactly where a genuine user turn would be
            // typed — "like its user input" — without ever spending a
            // real request on it. If genuinely submitting it as a real
            // turn is what's wanted instead, that's a one-line change
            // here (add submit() after injectText()) — named explicitly
            // rather than guessed at silently, given the real cost
            // difference between the two.
            if (typeof injectText === 'function') {
              try { injectText(answer); }
              catch (e) { log(`[nexus-wake] injectText failed: ${e.message}`); }
            }
          }
          // §1.2 — a miss is STATED. A wake word that silently does nothing is
          // indistinguishable from one that was not recognised, and the user
          // would reasonably conclude the feature is broken rather than that
          // co-pilot is down.
          else {
            _render('error', `co-pilot unreachable — ${r.error}. Your message was NOT sent to ${provider}; nothing was lost, but nothing was asked either.`);
            ledgerWrite({ jobId: wakeJobId, category: 'WAKE_ERROR', msg: r.error || 'unknown', meta: { provider, tabId } });
          }
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

    // §BUILT 2026-09-08 — James: "wake word relay needs to send the
    // wake word response as a guardian job ack just like any other
    // input into a tab for agents chat input." Real, fire-and-forget —
    // registers the already-completed exchange as a real job in
    // guardian's own job registry (jobs Map + jaa 'jobs' table), same
    // real pattern this codebase already uses elsewhere for exactly
    // this ("dispatch via guardian job system — same path as regular
    // jobs"). Never blocks or delays showing the real answer to the
    // person — this is bookkeeping, not part of the real exchange.
    function ackWakeJob(wakeJobId, ask, answer) {
      if (typeof GM_xmlhttpRequest !== 'function') return;
      try {
        GM_xmlhttpRequest({
          method: 'POST',
          url: `${ncpUrl}/wake-job-ack`,
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({ jobId: wakeJobId, provider, prompt: ask, response: answer, tabId }),
          timeout: 10000,
          onload: () => {}, onerror: () => {}, ontimeout: () => {},
        });
      } catch (_) { /* §1.2 — a failed ack must never affect the real, already-delivered answer */ }
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
      // §0.39.252 — James (2026-09-25): "is supposed to be injected into the chat like a job. it is for the agents to
      // talk to nexus. not me." This used to ANSWER here: the observer calls it on every mutation of a STREAMING reply,
      // so it matched the first fragment ("hey nexus, w"), asked co-pilot "w", drew the overlay for the person and
      // typed the answer into the composer without sending it. An agent's wake is now answered by guardian's wake-loop
      // (guardian/lib/wake-loop.js) from the COMPLETED reply, as a wake-reply job typed AND sent into this tab — the
      // agent receives it. This only reports whether a message addresses NEXUS (so the caller stops re-checking it);
      // it asks nothing, renders nothing, types nothing.
      checkMessage(role, text) {
        const { addressed } = parseWake(text);
        return !!addressed;
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
