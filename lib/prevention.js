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
 * record is fresh, heavy work needs real headroom (PREVENT_FREE, 25% free since 0.60.518, was 30%), not merely "not critical".
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
// CP6a (0.60.518) — James, 2026-11-13: "Lower the line for heavy work (CP6a, your load balancing). It's a number to choose, and the choice is yours."
// Was 30%. His 16 GB machine sat at 26.5-30% free for two hours after one critical moment, and the RAID worker, its officiator and Idearium's
// snapshot waited the whole time. 25% is the monitor's own way back to ok after pressure (freeMemWarnPct 20% + clearMarginPct 5%,
// lib/resource-monitor.js): the first point the machine reads calm again, and a heavy job (about 0.5-1 GB, 3-6% of 16 GB) started there ends
// above the pressure line. The coder's choice, by his word. NEXUS_PREVENT_FREE (0.05-0.9) changes it without a release.
const PREVENT_FREE = (() => { const v = parseFloat(process.env.NEXUS_PREVENT_FREE); return Number.isFinite(v) && v >= 0.05 && v <= 0.9 ? v : 0.25; })();   // with a fresh memory_pressure record, heavy work waits for this much free memory

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
// 0.60.583 — James, 2026-11-18: "baseline deviation or the intelligence system" · "just get the system stable. nexus needs to be able to code."
// Found: on his machine free memory normally sits near 24%; one critical moment armed the fixed 25% line for a day, and DeepSeek was held 149 times
// (12:53 to 15:10) at 24.3%. The line is now the machine's own: its usual free memory less 2σ (Welford over the free memory this file is asked
// with, kept in prevention.json as _baseline), never below FLOOR_FREE (the monitor's warning line, 20%) and never above PREVENT_FREE (25%).
// With fewer than 30 readings the fixed 25% holds, as before. Whether a model fits at all stays RAID's fit rule (OL4a), not this.
const FLOOR_FREE = 0.20, MIN_N = 30, SD_K = 2;
function _observe(free, now) {
  if (!Number.isFinite(free)) return null;
  const all = _read(); const b = all._baseline || { n: 0, mean: 0, m2: 0, at: 0 };
  if (now - (b.at || 0) >= 60000) { b.n += 1; const d = free - b.mean; b.mean += d / b.n; b.m2 += d * (free - b.mean); b.at = now; if (b.n > 1440) { b.m2 *= 1440 / b.n; b.n = 1440; } all._baseline = b; _write(all); }
  return b;
}
function lineFor(b) {
  if (!b || b.n < MIN_N) return { line: PREVENT_FREE, how: `the fixed ${_pct(PREVENT_FREE)} (baseline has ${b ? b.n : 0} of ${MIN_N} readings)` };
  const sd = Math.sqrt(b.m2 / (b.n - 1)); const line = Math.min(PREVENT_FREE, Math.max(FLOOR_FREE, b.mean - SD_K * sd));
  return { line, how: `this machine's usual ${_pct(b.mean)} free less ${SD_K}σ (σ ${_pct(sd)}, ${b.n} readings), kept between ${_pct(FLOOR_FREE)} and ${_pct(PREVENT_FREE)}` };
}
function heavyAllowed({ sample = null, level = null, cls = 'memory_pressure', now = Date.now() } = {}) {
  const free = sample && sample.system ? sample.system.freeMemPct : null;
  if (level && level !== 'ok') return { ok: false, why: `memory is at ${level}${Number.isFinite(free) ? ` (${_pct(free)} free)` : ''}` };
  const b = _observe(free, now); const { line, how } = lineFor(b);
  const rec = active(cls, now);
  if (rec && Number.isFinite(free) && free < line) {
    return { ok: false, why: `memory went critical ${new Date(rec.at).toLocaleTimeString()} (${rec.count}× since ${new Date(rec.since).toLocaleTimeString()}) — heavy work waits for ${_pct(line)} free, now ${_pct(free)} (the line: ${how})` };
  }
  return { ok: true, why: rec ? `${_pct(free)} free, above the ${_pct(line)} line (${how})` : 'memory ok' };
}

/** heavyAllowedHere(name) — the same answer, from this process's own shared monitor (one fresh sample) */
function heavyAllowedHere(name = 'nexus') {
  try {
    const RM = require('./resource-monitor.js');
    const mon = RM.shared(name);
    return heavyAllowed({ sample: RM.sample(), level: mon.level() });
  } catch (e) { return { ok: true, why: `not checked: ${e.message}` }; }
}

module.exports = { VERSION, TTL_MS, PREVENT_FREE, FLOOR_FREE, lineFor, fileOf, record, active, all, clear, heavyAllowed, heavyAllowedHere };
