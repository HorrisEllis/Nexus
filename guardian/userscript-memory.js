// ==UserScript==
// @name         NEXUS — Cortex Memory Observer v1.0
// @namespace    nexus.cortex.memory
// @version      1.0.0
// @description  Passive conversation observer. Watches all AI chats and routes
//               conversation turns directly into cortex working/short-term memory.
//               Separate from Guardian — does not inject, does not claim tabs.
//               Runs on all claude.ai and chatgpt.com tabs simultaneously.
//               Extracts ?REMEMBER: signals for long-term crystal candidates.
// @author       James Brooks / Nexus
// @match        https://claude.ai/*
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(function () {
'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const CORTEX_URL  = 'http://127.0.0.1:3748';
const VERSION     = '1.0.0';
const PROVIDER    = location.hostname.includes('claude') ? 'claude' : 'chatgpt';

// Scan interval — observe DOM every 2s for new turns
const SCAN_MS     = 2000;
// Flush working memory to cortex every 30s
const FLUSH_MS    = 30 * 1000;
// Heartbeat to prove we're alive
const HB_MS       = 60 * 1000;

// ── Session identity ──────────────────────────────────────────────────────────
function chatId() {
  const m = location.pathname.match(/\/chat\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : 'home';
}
function sessionId() {
  // Stable session key: hostname + chatId
  return `${PROVIDER}:${chatId()}`;
}

// ── Turn tracking ─────────────────────────────────────────────────────────────
// We track which turn content we've already seen by a simple hash.
// Only write a turn once per conversation — don't re-fire on re-scans.
const _seenHashes = new Set();
let   _turnIndex  = 0;
let   _pendingFlush = []; // turns buffered before flush to cortex

function simpleHash(s) {
  let h = 0;
  for (let i = 0; i < Math.min(s.length, 500); i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(16).slice(0, 10);
}

// ── DOM selectors per provider ────────────────────────────────────────────────
const SELECTORS = PROVIDER === 'claude' ? {
  userTurns:      '[data-testid="human-message"]',
  assistantTurns: '[data-testid="assistant-message"]',
} : {
  userTurns:      '[data-message-author-role="user"]',
  assistantTurns: '[data-message-author-role="assistant"]',
};

// ── Cortex write ─────────────────────────────────────────────────────────────
function _toCortex(type, payload) {
  try {
    fetch(`${CORTEX_URL}/api/event`, {
      method:    'POST',
      headers:   { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        type,
        payload: { ...payload, _provider: PROVIDER, _chatUrl: location.href },
        source:  'userscript-memory',
        causedBy: payload.jobId || null,
        ts:       Date.now(),
      }),
    }).catch(() => {});
  } catch (_) {}
}

// ── Signal extraction — ?REMEMBER:, ?FLAG:, code blocks ──────────────────────
// Scans a completed assistant response for lines that should persist
// beyond the working memory decay window.
function extractSignals(text, sid) {
  const signals = [];

  // ?REMEMBER: <content> — explicit long-term signal from the AI
  const rememberLines = text.split('\n').filter(l => /^\?REMEMBER:/i.test(l.trim()));
  for (const l of rememberLines) {
    const content = l.replace(/^\?REMEMBER:/i, '').trim();
    if (content.length > 3) {
      signals.push({ kind: 'remember', content, sessionId: sid });
    }
  }

  // ?FLAG: <content> — explicit flag for human review
  const flagLines = text.split('\n').filter(l => /^\?FLAG:/i.test(l.trim()));
  for (const l of flagLines) {
    const content = l.replace(/^\?FLAG:/i, '').trim();
    if (content.length > 3) {
      signals.push({ kind: 'flag', content, sessionId: sid });
    }
  }

  // Code blocks — note language and first line as a signal
  const codeMatches = [...text.matchAll(/```(\w+)?\n([^\n]+)/g)];
  for (const m of codeMatches.slice(0, 3)) {
    const lang    = m[1] || 'unknown';
    const preview = (m[2] || '').trim().slice(0, 80);
    if (preview.length > 10) {
      signals.push({ kind: 'code', content: `${lang}: ${preview}`, sessionId: sid });
    }
  }

  return signals;
}

// ── Scan DOM for new conversation turns ───────────────────────────────────────
function scanTurns() {
  const sid = sessionId();

  // User turns
  const userEls = document.querySelectorAll(SELECTORS.userTurns);
  for (const el of userEls) {
    const text = (el.innerText || el.textContent || '').trim();
    if (!text || text.length < 2) continue;
    const h = simpleHash(text);
    if (_seenHashes.has(h)) continue;
    _seenHashes.add(h);

    const turn = {
      sessionId: sid,
      role:      'user',
      content:   text.slice(0, 8000),
      provider:  PROVIDER,
      chatUrl:   location.href,
      turnIndex: _turnIndex++,
      ts:        Date.now(),
    };
    _pendingFlush.push({ type: 'turn', ...turn });
  }

  // Assistant turns — only capture stable ones (not mid-stream)
  const assistantEls = document.querySelectorAll(SELECTORS.assistantTurns);
  for (const el of assistantEls) {
    const text = (el.innerText || el.textContent || '').trim();
    if (!text || text.length < 10) continue;
    const h = simpleHash(text);
    if (_seenHashes.has(h)) continue;

    // Stability check — don't capture while streaming
    // A turn is stable if it hasn't changed in the last 1.5s
    if (!el._stableTs) {
      el._lastText = text;
      el._stableTs = 0;
      setTimeout(() => {
        const current = (el.innerText || el.textContent || '').trim();
        if (current === el._lastText) {
          el._stableTs = Date.now();
        } else {
          el._stableTs = 0;
        }
      }, 1500);
      continue;
    }
    if (el._stableTs === 0) continue; // still changing

    _seenHashes.add(h);

    const turn = {
      sessionId: sid,
      role:      'assistant',
      content:   text.slice(0, 8000),
      provider:  PROVIDER,
      chatUrl:   location.href,
      turnIndex: _turnIndex++,
      ts:        el._stableTs || Date.now(),
    };
    _pendingFlush.push({ type: 'turn', ...turn });

    // Extract signals from this assistant turn
    const signals = extractSignals(text, sid);
    for (const sig of signals) {
      _pendingFlush.push({ type: 'signal', ...sig });
    }
  }
}

// ── Flush pending turns to cortex ─────────────────────────────────────────────
// Batches all pending turns into individual cortex events.
// Working memory turns use type 'working.memory.turn'.
// Signals use type 'working.memory.signal'.
// Both route to working_memory table via the WELL_KNOWN router.
function flush() {
  if (!_pendingFlush.length) return;

  const batch = _pendingFlush.splice(0, _pendingFlush.length);

  for (const entry of batch) {
    if (entry.type === 'turn') {
      _toCortex('working.memory.turn', entry);
    } else if (entry.type === 'signal') {
      _toCortex('working.memory.signal', entry);
      // Also push ?REMEMBER: signals as crystal candidates to long-term memory
      if (entry.kind === 'remember') {
        _toCortex('cortex.crystal.candidate', {
          sessionId: entry.sessionId,
          content:   entry.content,
          source:    'userscript-remember-protocol',
          provider:  PROVIDER,
        });
      }
    }
  }
}

// ── Navigation tracking ───────────────────────────────────────────────────────
let _lastChatId = chatId();

function checkNavigation() {
  const current = chatId();
  if (current !== _lastChatId) {
    // Chat changed — flush pending from old session, reset turn index
    flush();
    _lastChatId  = current;
    _turnIndex   = 0;
    // Don't clear _seenHashes — prevent re-ingesting turns if returning to same chat
    console.log(`[nexus-memory] navigated to ${current}`);
  }
}

// ── Session context write ─────────────────────────────────────────────────────
// Periodically write a context snapshot so cortex knows the current session state.
function writeContextSnapshot() {
  _toCortex('working.memory.context', {
    sessionId:   sessionId(),
    provider:    PROVIDER,
    chatUrl:     location.href,
    turnsSeen:   _turnIndex,
    pendingFlush: _pendingFlush.length,
    ts:          Date.now(),
  });
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────
function heartbeat() {
  _toCortex('memory.observer.heartbeat', {
    provider: PROVIDER,
    sessionId: sessionId(),
    turnsSeen: _turnIndex,
    version:   VERSION,
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  // Observe DOM for new turns
  setInterval(scanTurns, SCAN_MS);
  // Flush to cortex
  setInterval(flush, FLUSH_MS);
  // Navigation
  setInterval(checkNavigation, 800);
  // Context snapshot
  setInterval(writeContextSnapshot, 5 * 60 * 1000);
  // Heartbeat
  setInterval(heartbeat, HB_MS);

  // MutationObserver for faster capture on active chats
  const target = document.querySelector('main') || document.body;
  if (target) {
    let debounceTimer = null;
    const obs = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(scanTurns, 800);
    });
    obs.observe(target, { childList: true, subtree: true, characterData: true });
  }

  // Initial scan
  setTimeout(scanTurns, 1500);

  console.log(`[nexus-memory v${VERSION}] observer started on ${PROVIDER} — session: ${sessionId()}`);
  _toCortex('memory.observer.started', { provider: PROVIDER, sessionId: sessionId(), version: VERSION });
}

// Boot after DOM is ready
if (document.readyState === 'complete') {
  setTimeout(init, 1000);
} else {
  window.addEventListener('load', () => setTimeout(init, 1000));
}

})();
