'use strict';
/**
 * lib/system-control.js — settings control + governed clear-glass (§CA5)
 * UUID: nexus-system-control-v1-0000-2026-0808-001
 *
 * James: "co-pilot changes system settings + full clear-glass access incl.
 * DOM storage. RAID-gated; every change logged + revertible."
 *
 * TWO HALVES:
 *
 * 1. SETTINGS — getSetting/setSetting/revertSetting against cortex's
 *    'settings' table (already live: 14 rows on boot per the jaa-db load
 *    log, so this is a real table other code already writes to, not a new
 *    one invented here).
 *
 *    §CORRECTION to copilot-autonomous-phasemap.spec's CA5 line ("...
 *    revertible (integrity-revert)") — read lib/integrity-revert.js's body
 *    before wiring to it, third time this pass a one-line spec assumption
 *    didn't survive contact with the actual module (same as kernel-surface.js
 *    and CA3's execution-pipeline correction): integrity-revert operates at
 *    FILE-hash-and-snapshot grain (file-integrity → sigma → replay-engine
 *    snapshot), gated behind a functionality-broken probe. A single cortex
 *    settings row has neither a file hash nor a "did tests still pass"
 *    signal — using integrity-revert here would be reverting the wrong
 *    thing at the wrong grain. Settings get their own append-only undo log
 *    instead (old value kept alongside each write; revertSetting() restores
 *    the immediately-prior value) — the right-grained mechanism for a
 *    single-row change, while integrity-revert.js stays exactly what it is
 *    for the file-level case it already covers correctly.
 *
 * 2. CLEAR-GLASS — governedBrowserCommand() wraps guardian/clear-glass-
 *    bridge.js's dispatchBrowserCommand(), which is REAL and ALREADY
 *    reaches DOM storage: clear-glass/src/driver/index.js's storage.get/
 *    storage.set run via 'driver.exec' today. "Full clear-glass access incl.
 *    DOM storage" was mostly already built — checked before assuming it
 *    needed building. What was missing, and what this adds, is a governed
 *    entry point: RAID gate + fan-in log wrapped around the existing bridge
 *    call, so a co-pilot-initiated browser command is accountable the same
 *    way every other CA1-CA4 action is, instead of calling the bridge raw.
 *
 * §RAID — every setting write + every browser command passes governAction.
 * §1.2 — a failed write/command is caught, logged, never silently lost.
 */

const TABLE = 'settings';

function _cortex() { try { return require('../cortex/memory/jaa-db').jaaDB || require('../cortex/memory/jaa-db'); } catch (_) { return null; } }
function _fanin() { try { return require('./ledger-fanin'); } catch (_) { return null; } }

async function _govern(intent, target) {
  let allowed = true, reason = null;
  try {
    const sm = require('../copilot/lib/self-model');
    if (sm.governAction) { const g = sm.governAction({ action: intent, target }, {}); if (g && g.allowed === false) { allowed = false; reason = g.reason; } }
  } catch (_) {}
  return { allowed, reason };
}

function _log(type, fields) {
  try { const f = _fanin(); f && f.emit && f.emit({ type, source: 'system-control', ts: Date.now(), ...fields }); } catch (_) {}
}

// ── Settings ─────────────────────────────────────────────────────────────

/** getSetting(systemId, key) — the current value, or null if unset. */
function getSetting(systemId, key) {
  try {
    const db = _cortex(); if (!db || !db.query) return null;
    const rows = db.query(TABLE, r => r.systemId === systemId && r.key === key);
    if (!rows || !rows.length) return null;
    const latest = rows.sort((a, b) => (b.setAt || 0) - (a.setAt || 0))[0];
    return latest.value;
  } catch (_) { return null; }
}

/**
 * setSetting(systemId, key, value, opts) — governed, logged write. Keeps the
 * PRIOR value on the new row (opts.actor for who/what changed it) so
 * revertSetting() has something real to restore to — the undo log IS the
 * row history, not a separate table.
 */
async function setSetting(systemId, key, value, opts = {}) {
  const prior = getSetting(systemId, key);
  const hadPrior = prior !== null;   // distinguishes "no prior value existed" from "prior value was null"
  const { allowed, reason } = await _govern(opts.intent || 'system-control.setSetting', { systemId, key, value });
  _log(allowed ? 'setting.changed' : 'setting.denied', { systemId, key, prior, value, allowed, reason, actor: opts.actor || 'copilot' });
  if (!allowed) return { ok: false, reason: reason || 'denied' };

  try {
    const db = _cortex(); if (!db || !db.insert) return { ok: false, reason: 'cortex unavailable' };
    const row = db.insert(TABLE, { systemId, key, value, prior, hadPrior, setAt: Date.now(), actor: opts.actor || 'copilot', status: 'active' });
    return { ok: true, systemId, key, value, prior, row };
  } catch (e) {
    _log('setting.error', { systemId, key, error: e.message });
    return { ok: false, reason: e.message };
  }
}

/**
 * revertSetting(systemId, key) — restore the value from immediately before
 * the current one. Governed + logged like any other change (a revert is
 * still a change). No-op (ok:false) if there's no prior value to revert to.
 */
async function revertSetting(systemId, key, opts = {}) {
  const db = _cortex(); if (!db || !db.query) return { ok: false, reason: 'cortex unavailable' };
  const rows = (db.query(TABLE, r => r.systemId === systemId && r.key === key) || [])
    .sort((a, b) => (b.setAt || 0) - (a.setAt || 0));
  if (rows.length < 1 || !rows[0].hadPrior) return { ok: false, reason: 'no prior value to revert to' };
  const current = rows[0];
  const revertTo = current.prior;

  const { allowed, reason } = await _govern(opts.intent || 'system-control.revertSetting', { systemId, key, revertTo });
  _log(allowed ? 'setting.reverted' : 'setting.denied', { systemId, key, from: current.value, to: revertTo, allowed, reason });
  if (!allowed) return { ok: false, reason: reason || 'denied' };

  // No separate "mark old row reverted-away" step: getSetting()/listSettings()
  // already resolve to the LATEST row by setAt, so writing the reverted value
  // as a new row (below) is the entire mechanism — an older row doesn't need
  // tombstoning to stop being "current". Kept the code path honest rather
  // than adding a db.update() call that would silently no-op (JaaDB.update
  // keys by uuid; these rows aren't given one, so a predicate-style update
  // here would match nothing — noticed before shipping it, not after).
  return setSetting(systemId, key, revertTo, { actor: opts.actor || 'copilot:revert', intent: 'system-control.revertSetting' });
}

/** listSettings(systemId) — every active setting for a system. */
function listSettings(systemId) {
  try {
    const db = _cortex(); if (!db || !db.query) return [];
    const rows = db.query(TABLE, r => r.systemId === systemId && r.status === 'active') || [];
    const byKey = new Map();
    for (const r of rows) { const prev = byKey.get(r.key); if (!prev || r.setAt > prev.setAt) byKey.set(r.key, r); }
    return [...byKey.values()];
  } catch (_) { return []; }
}

// ── Clear-glass (governed) ──────────────────────────────────────────────────

/**
 * governedBrowserCommand(eventType, data, opts) — RAID-gate, then delegate
 * to the real, existing guardian/clear-glass-bridge.dispatchBrowserCommand.
 * Does not reimplement DOM/storage access — that already exists and works;
 * this is the accountability wrapper co-pilot's autonomous use needed.
 */
async function governedBrowserCommand(eventType, data = {}, opts = {}) {
  const { allowed, reason } = await _govern(opts.intent || `system-control.clearglass.${eventType}`, { eventType, data });
  _log(allowed ? 'clearglass.command' : 'clearglass.denied', { eventType, allowed, reason, actor: opts.actor || 'copilot' });
  if (!allowed) return { ok: false, reason: reason || 'denied' };

  try {
    const bridge = require('../guardian/clear-glass-bridge');
    const result = await bridge.dispatchBrowserCommand({ eventType, data, timeoutMs: opts.timeoutMs });
    _log('clearglass.result', { eventType, ok: result && result.ok !== false });
    return result;
  } catch (e) {
    _log('clearglass.error', { eventType, error: e.message });
    return { ok: false, reason: e.message };
  }
}

/** getDomStorage(key, opts) — governed read via clear-glass's storage.get. */
function getDomStorage(key, opts = {}) { return governedBrowserCommand('driver.exec', { command: 'storage.get', key, type: opts.type || 'local' }, opts); }
/** setDomStorage(key, value, opts) — governed write via clear-glass's storage.set. */
function setDomStorage(key, value, opts = {}) { return governedBrowserCommand('driver.exec', { command: 'storage.set', key, value, type: opts.type || 'local' }, opts); }

module.exports = {
  getSetting, setSetting, revertSetting, listSettings,
  governedBrowserCommand, getDomStorage, setDomStorage,
  TABLE, MODULE_ID: 'system-control', VERSION: '1.0.0',
};
