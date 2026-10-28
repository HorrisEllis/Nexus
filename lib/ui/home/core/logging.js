'use strict';
// ui/home/core/logging.js — UI failure/event logging to cortex with sessionStorage fallback.
// Split from ui/home/index.html (inline script, lines 2536-2596 at v0.39.227). Loads FIRST: self-contained, and
// selectMode() (via agent-suite.js's stored-mode restore) calls _logToData at load — the monolith's hoisting hid that.
// ── Failure / event logging ──────────────────────────────────────────────────
// §1.2 nothing silently fails — all UI errors logged to cortex + local data/
const _uiLog = [];
function _logToData(type, payload = {}) {
  const entry = { type, source: 'home-ui', payload, ts: Date.now() };
  _uiLog.push(entry);
  // POST to cortex (fire-and-forget)
  fetch('http://127.0.0.1:3748/api/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch(() => {
    // Cortex offline — store locally in sessionStorage for later replay
    try {
      const pending = JSON.parse(sessionStorage.getItem('nexus_ui_log_pending') || '[]');
      pending.push(entry);
      if (pending.length > 200) pending.splice(0, pending.length - 200);
      sessionStorage.setItem('nexus_ui_log_pending', JSON.stringify(pending));
    } catch(_) {}
  });
}

// Replay pending logs when cortex comes back online
async function _replayPendingLogs() {
  try {
    const raw = sessionStorage.getItem('nexus_ui_log_pending');
    if (!raw) return;
    const pending = JSON.parse(raw);
    if (!pending.length) return;
    // Test cortex is alive
    const hc = await fetch('http://127.0.0.1:3748/health', { signal: AbortSignal.timeout(1000) });
    if (!hc.ok) return;
    // Replay
    for (const entry of pending) {
      await fetch('http://127.0.0.1:3748/api/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...entry, replayed: true }),
      }).catch(() => {});
    }
    sessionStorage.removeItem('nexus_ui_log_pending');
    console.log(`[home-ui] replayed ${pending.length} pending log entries to cortex`);
  } catch(_) {}
}

// Global error boundary — catch uncaught UI errors
window.addEventListener('error', e => {
  _logToData('ui.error', {
    message: e.message,
    filename: e.filename?.replace(/.*nexus-071\//,''),
    lineno: e.lineno,
    colno: e.colno,
  });
});

window.addEventListener('unhandledrejection', e => {
  _logToData('ui.unhandled-rejection', {
    reason: String(e.reason).slice(0, 200),
  });
});

