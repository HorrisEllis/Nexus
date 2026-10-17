'use strict';
/**
 * lib/prevention.js — 0.60.123 MP — a failure mode that has happened becomes a prevention.
 *
 * James (2026-10-13): "can we fix the memory issue. all of the resource optimization as possible. also failure modes are
 * to prevent problems not solutionsn".
 *
 * His 0.60.23 log: free memory fell 15.4% → 0.1% four minutes after boot. The response was a forced GC in cortex
 * (1.5MB freed of 45MB), friction raised, then "refused HEAL_REQUESTED — already in FAILURE_MODE". The failure mode was
 * recorded; nothing it recorded changed what ran next. Here the record IS the prevention: any process that sees memory
 * go critical writes it (lib/resource-monitor.js), and every heavy job asks heavyAllowed() before it starts — while a
 * record is fresh, heavy work needs real headroom (PREVENT_FREE, 30% free), not merely "not critical".
 *
 *   record(cls, { why, level, ttlMs, by })   → the record ({ since, at, until, count, why, level, by }), persisted
 *   active(cls)                              → the record while it holds, else null
 *   heavyAllowed({ sample, level, cls })     → { ok, why }  — what a heavy job asks before it starts
 *   all()                                    → every record (the Settings card and `system prevention` read it)
 * State: <NEXUS_DATA_ROOT or data>/prevention.json (never committed).
 */
const fs = require('fs');
const path = require('path');

const VERSION = '1.0.0';
const TTL_MS = 24 * 3600 * 1000;
const PREVENT_FREE = 0.30;   // with a fresh memory_pressure record, heavy work waits for 30% free memory

function fileOf() {
  // a test process that did not arm the sandbox itself gets one here: a test must never write the real data/
  if (!process.env.NEXUS_PREVENTION_DIR) { try { require('./test-sandbox.js').ensure(); } catch (_) {} }
  return path.join(process.env.NEXUS_PREVENTION_DIR || process.env.NEXUS_DATA_ROOT || path.join(__dirname, '..', 'data'), 'prevention.json');
}
function _read() { try { return JSON.parse(fs.readFileSync(fileOf(), 'utf8')) || {}; } catch (_) { return {}; } }
function _write(all) { try { fs.mkdirSync(path.dirname(fileOf()), { recursive: true }); fs.writeFileSync(fileOf(), JSON.stringify(all, null, 2)); return true; } catch (_) { return false; } }

function record(cls, { why = null, level = null, ttlMs = TTL_MS, by = null, now = Date.now() } = {}) {
  if (!cls) return null;
  const all = _read();
  const prev = all[cls] && (all[cls].until || 0) > now ? all[cls] : null;
  const rec = { since: prev ? prev.since : now, at: now, until: now + ttlMs, count: (prev ? prev.count : 0) + 1,
    why: why ? String(why).slice(0, 300) : prev ? prev.why : null, level: level || (prev && prev.level) || null, by: by || (prev && prev.by) || null };
  all[cls] = rec;
  _write(all);
  return rec;
}

function active(cls, now = Date.now()) { const r = _read()[cls]; return r && (r.until || 0) > now ? r : null; }
function all(now = Date.now()) { const a = _read(); return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, { ...v, active: (v.until || 0) > now }])); }
function clear(cls) { const a = _read(); if (!a[cls]) return false; a[cls] = { ...a[cls], until: Date.now(), cleared: Date.now() }; return _write(a); }

const _pct = (x) => `${Math.round(x * 1000) / 10}%`;
function heavyAllowed({ sample = null, level = null, cls = 'memory_pressure', now = Date.now() } = {}) {
  const free = sample && sample.system ? sample.system.freeMemPct : null;
  if (level && level !== 'ok') return { ok: false, why: `memory is at ${level}${Number.isFinite(free) ? ` (${_pct(free)} free)` : ''}` };
  const rec = active(cls, now);
  if (rec && Number.isFinite(free) && free < PREVENT_FREE) {
    return { ok: false, why: `memory went critical ${new Date(rec.at).toLocaleTimeString()} (${rec.count}× since ${new Date(rec.since).toLocaleTimeString()}) — heavy work waits for ${_pct(PREVENT_FREE)} free, now ${_pct(free)}` };
  }
  return { ok: true, why: rec ? `${_pct(free)} free, above the ${_pct(PREVENT_FREE)} a recent memory crisis asks for` : 'memory ok' };
}

/** heavyAllowedHere(name) — the same answer, from this process's own shared monitor (one fresh sample) */
function heavyAllowedHere(name = 'nexus') {
  try {
    const RM = require('./resource-monitor.js');
    const mon = RM.shared(name);
    return heavyAllowed({ sample: RM.sample(), level: mon.level() });
  } catch (e) { return { ok: true, why: `not checked: ${e.message}` }; }
}

module.exports = { VERSION, TTL_MS, PREVENT_FREE, fileOf, record, active, all, clear, heavyAllowed, heavyAllowedHere };
