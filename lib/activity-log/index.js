'use strict';
/**
 * lib/activity-log/index.js — per-system activity + error logging into cortex
 * UUID: nexus-activity-log-v1-0000-2026-0804-001
 *
 * James: "a log for each system, a full log for activity to save in cortex, like
 * enable logging, error.log — I want history preserved."
 *
 * §8.6 — this composes what already exists and adds no new store:
 *   - lib/ledger-fanin already receives EVERY system's events.
 *   - cortex's `event_log` JAA table already persists append-only, history-kept.
 * So logging = a subscriber on the fan-in that writes each event into cortex,
 * tagged by system, with errors ALSO written to a separate `error_log`. History
 * is preserved because JAA is append-only (§0.3 nothing lost).
 *
 * Enable/disable is per system (James: "enable logging"). Persistence goes
 * through cortex over HTTP (the tablet/decoupling pattern) OR a passed writer, so
 * this stays an agnostic lib tool that doesn't hard-depend on cortex internals.
 */

const http = require('http');
const CORTEX = { host: '127.0.0.1', port: 3748 };

let _enabled = new Set();      // explicit allowlist (when non-empty, ONLY these log)
let _disabled = new Set();     // explicit denylist (excluded from the all-on default)
let _allOff = false;
let _unsub = null;
let _writer = null;            // optional injected writer(table,row) for tests

function _post(table, row) {
  if (_writer) { try { _writer(table, row); } catch (_) {} return; }
  try {
    const data = Buffer.from(JSON.stringify({ table, row }));
    const req = http.request({ hostname: CORTEX.host, port: CORTEX.port, path: '/api/log', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }, timeout: 3000 }, () => {});
    req.on('error', () => {}); req.on('timeout', () => req.destroy());
    req.write(data); req.end();
  } catch (_) { /* §1.2 — a failed log write never breaks the emitting system */ }
}

function _isError(row) {
  const t = (row.type || '').toLowerCase();
  return /error|fail|crash|denied|exception|fault|unreachable|reject/.test(t)
      || (row.payload && (row.payload.error || row.payload.failed || row.payload.severity === 'high'));
}

function _shouldLog(system) {
  if (_allOff) return false;
  if (_disabled.has(system)) return false;          // explicitly excluded
  if (_enabled.size === 0) return true;             // default: all systems logged
  return _enabled.has(system);                      // allowlist mode
}

/**
 * attach(fanin, opts) — subscribe to the fan-in and start persisting. One call
 * wires logging for the WHOLE system (every system's events flow through the
 * fan-in). Returns a detach fn.
 */
function attach(fanin, opts = {}) {
  if (opts.writer) _writer = opts.writer;
  if (_unsub) _unsub();
  _unsub = fanin.subscribe('activity-log', (row) => {
    const system = row.source || row._system || 'unknown';
    if (!_shouldLog(system)) return;
    // Full activity log — every event, tagged by system, into cortex event_log.
    const entry = { type: row.type, system, source: row.source, payload: row.payload || {}, causedBy: row.causedBy || null, ts: row.ts || Date.now(), loggedAt: Date.now() };
    _post('event_log', entry);
    // Errors ALSO go to a dedicated error_log so error history is queryable alone.
    if (_isError(row)) _post('error_log', { ...entry, level: 'error' });
  });
  return () => { if (_unsub) { _unsub(); _unsub = null; } };
}

// ── enable/disable (James: "enable logging") ──────────────────────────────────
function enable(system) { if (system) { _enabled.add(system); _disabled.delete(system); _allOff = false; } else { _allOff = false; _enabled.clear(); _disabled.clear(); } return status(); }
function disable(system) { if (system) { _disabled.add(system); _enabled.delete(system); } else { _allOff = true; } return status(); }
function status() { return { allOff: _allOff, mode: _enabled.size ? 'allowlist' : 'all-systems', enabled: [..._enabled], disabled: [..._disabled] }; }

function _resetForTest() { _enabled = new Set(); _disabled = new Set(); _allOff = false; _writer = null; if (_unsub) { _unsub(); _unsub = null; } }

module.exports = { attach, enable, disable, status, _isError, _resetForTest, MODULE_ID: 'activity-log', VERSION: '1.0.0' };
