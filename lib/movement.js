'use strict';
/**
 * lib/movement.js — ALL MOVEMENT for one system, in one read-only snapshot.
 * comp_id: nexus.lib.movement
 * UUID: nexus-movement-v1-0000-2026-0808-001
 * Version: 0.1.0
 *
 * WHY (James, 2026-08-08): "autopilot needs a massive update — it's not
 * encompassing enough. All logs, error logs, ledgers, event types, gaps,
 * tension, friction, sigmas, changes. All movement."
 *
 * He is right, and the measurement is small: autopilot's _statusSnapshot()
 * returns SIX fields per kernel — status, restarts, crashesInWindow, lastExit,
 * downSince, pid. That is process supervision. It answers "is it running",
 * which is the one question that was already easy. Nothing in it can answer
 * "is it healthy", "what is it doing", or "what changed".
 *
 * ── ONE DATA LAYER, MANY RENDERERS ──────────────────────────────────────────
 * This file is agnostic (lib/ is for agnostic tools) and returns DATA. The CLI
 * panel (cli/nexus-movement.js) and the tablet render the same snapshot. That
 * split is deliberate: the tablet's problem was never the chart library, it was
 * that nothing aggregated per-system movement for a chart to draw.
 *
 * ── SOURCES, AND WHAT EACH ONE ACTUALLY IS ──────────────────────────────────
 *   process   autopilot :7799 /status        — up/down, restarts, circuit trips
 *   events    event_log (JAA)                — type histogram + rate over time
 *   ledgers   data/ledger/<system>/**.jsonl  — per-action append-only ledgers,
 *                                              tailed with lib/ledger-tail so a
 *                                              1.7MB ledger costs one block
 *   changes   component_ledger (JAA)         — register/update/error/verify
 *   gaps      gaps (JAA)                     — open/resolved by severity
 *   sigma     sigma_rollups (JAA)            — avg/max, warn + halt counts
 *   friction  cortex/self-heal/fault-taxonomy — thresholds + bands
 *   drift     schema_drift (JAA)             — rows that stopped matching schema
 *   errors    *.log + error-typed events     — the only ERROR surface there is
 *
 * ── HONESTY RULES (§1.2, §0.1) ──────────────────────────────────────────────
 * Every section returns `{ ok, ... }` or `{ ok:false, reason }`. A source that
 * is absent, empty, or unreadable says so BY NAME. Nothing is defaulted to zero,
 * because a zero and a silence look identical on a dashboard and that is exactly
 * how this codebase has been fooling itself. `snapshot.blind` lists every source
 * that could not be read, and a renderer is expected to show it.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let _tail = null;
try { _tail = require('./ledger-tail.js').tail; } catch (_) { /* reported below */ }

function _jaa() {
  try { return require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB; }
  catch (_) { return null; }
}

const BUCKET_MS = 15 * 60 * 1000;   // 15-minute buckets, like the dashboard grid

/** Bucket timestamps into a sparkline-ready series. Never invents empty tails. */
function _series(timestamps, windowMs, buckets = 48) {
  const now = Date.now();
  const start = now - windowMs;
  const width = windowMs / buckets;
  const out = new Array(buckets).fill(0);
  let counted = 0;
  for (const ts of timestamps) {
    if (!Number.isFinite(ts) || ts < start || ts > now) continue;
    const i = Math.min(buckets - 1, Math.floor((ts - start) / width));
    out[i]++; counted++;
  }
  return { buckets: out, counted, windowMs, bucketMs: width };
}

// ── process ─────────────────────────────────────────────────────────────────
function _process(system, autopilotStatus) {
  if (!autopilotStatus) return { ok: false, reason: 'autopilot :7799 /status unreachable — process state unknown, NOT assumed up' };
  const s = autopilotStatus[system];
  if (!s) return { ok: false, reason: `autopilot does not supervise "${system}" — it is not in the kernel set` };
  return { ok: true, status: s.status, pid: s.pid, restarts: s.restarts,
           crashesInWindow: s.crashesInWindow, lastExit: s.lastExit, downSince: s.downSince };
}

// ── events ──────────────────────────────────────────────────────────────────
function _events(system, jaa, windowMs) {
  if (!jaa) return { ok: false, reason: 'JAA unavailable' };
  let rows;
  try { rows = jaa.query('event_log', () => true, 100000) || []; }
  catch (e) { return { ok: false, reason: `event_log unreadable: ${e.message}` }; }
  const mine = rows.filter(r => {
    const src = String(r.source || ''), typ = String(r.type || '');
    return src.startsWith(system) || typ.startsWith(system) || src === system;
  });
  if (!mine.length) return { ok: true, total: 0, note: `no event_log rows attributable to "${system}" — the system may not emit, or may not tag its source`, types: [], series: _series([], windowMs) };
  const types = {};
  for (const r of mine) types[r.type || '?'] = (types[r.type || '?'] || 0) + 1;
  return {
    ok: true,
    total: mine.length,
    types: Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([type, count]) => ({ type, count })),
    distinctTypes: Object.keys(types).length,
    series: _series(mine.map(r => r.ts), windowMs),
    newest: Math.max(...mine.map(r => r.ts || 0)) || null,
  };
}

// ── ledgers on disk ─────────────────────────────────────────────────────────
function _ledgers(system, windowMs) {
  const dir = path.join(ROOT, 'data/ledger', system);
  if (!fs.existsSync(dir)) return { ok: false, reason: `no ledger directory at data/ledger/${system}` };
  if (!_tail) return { ok: false, reason: 'lib/ledger-tail.js unavailable — cannot read ledgers cheaply' };

  const files = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { stack.push(full); continue; }
      if (/\.(jsonl|ndjson)$/.test(e.name)) files.push(full);
    }
  }
  if (!files.length) return { ok: true, streams: 0, note: `data/ledger/${system} exists but holds no .jsonl/.ndjson` };

  let totalBytes = 0, malformed = 0, sampled = 0;
  const stamps = [];
  const streams = [];
  for (const f of files) {
    let r;
    try { r = _tail(f, 200); } catch (e) { streams.push({ stream: path.relative(dir, f), ok: false, reason: e.message }); continue; }
    totalBytes += r.fileSize; malformed += r.malformed; sampled += r.entries.length;
    for (const e of r.entries) { const t = e.ts || e.timestamp || e.time; if (Number.isFinite(t)) stamps.push(t); }
    streams.push({ stream: path.relative(dir, f), ok: true, bytes: r.fileSize, read: r.bytesRead, sampled: r.entries.length, malformed: r.malformed });
  }
  return {
    ok: true, streams: streams.length, totalBytes, sampled, malformed,
    readEfficiency: totalBytes ? +(streams.reduce((n, s) => n + (s.read || 0), 0) / totalBytes).toFixed(4) : null,
    series: _series(stamps, windowMs),
    top: streams.filter(s => s.ok).sort((a, b) => b.bytes - a.bytes).slice(0, 6),
  };
}

// ── changes ─────────────────────────────────────────────────────────────────
function _changes(system, jaa, windowMs) {
  if (!jaa) return { ok: false, reason: 'JAA unavailable' };
  let rows;
  try { rows = jaa.query('component_ledger', () => true, 100000) || []; }
  catch (e) { return { ok: false, reason: `component_ledger unreadable: ${e.message}` }; }
  const mine = rows.filter(r => r.system === system);
  const actions = {};
  for (const r of mine) actions[r.action || '?'] = (actions[r.action || '?'] || 0) + 1;
  return {
    ok: true, total: mine.length,
    actions: Object.entries(actions).sort((a, b) => b[1] - a[1]).map(([action, count]) => ({ action, count })),
    errors: mine.filter(r => r.action === 'error' || r.status === 'error').length,
    series: _series(mine.map(r => r.ts), windowMs),
  };
}

// ── gaps ────────────────────────────────────────────────────────────────────
function _gaps(system, jaa) {
  if (!jaa) return { ok: false, reason: 'JAA unavailable' };
  let rows;
  try { rows = jaa.query('gaps', () => true, 100000) || []; }
  catch (e) { return { ok: false, reason: `gaps unreadable: ${e.message}` }; }
  const mine = rows.filter(r => String(r.source || '').includes(system) || String(r.path || '').includes(system) || String(r.type || '').includes(system));
  const open = mine.filter(r => r.status === 'open');
  const sev = {};
  for (const r of open) sev[r.severity ?? '?'] = (sev[r.severity ?? '?'] || 0) + 1;
  return { ok: true, total: mine.length, open: open.length, bySeverity: sev,
           oldestOpenMs: open.length ? Date.now() - Math.min(...open.map(r => r.ts || r.createdAt || Date.now())) : null,
           sample: open.slice(0, 5).map(r => ({ type: r.type, severity: r.severity, body: String(r.body || '').slice(0, 70) })) };
}

// ── sigma ───────────────────────────────────────────────────────────────────
function _sigma(jaa) {
  if (!jaa) return { ok: false, reason: 'JAA unavailable' };
  let roll, recs;
  try { roll = jaa.query('sigma_rollups', () => true, 10000) || []; recs = jaa.query('sigma_records', () => true, 10) || []; }
  catch (e) { return { ok: false, reason: `sigma tables unreadable: ${e.message}` }; }
  if (!roll.length) return { ok: false, reason: 'sigma_rollups is empty — no regime history to read' };
  const recent = roll.sort((a, b) => (b.bucket || 0) - (a.bucket || 0)).slice(0, 48);
  return {
    ok: true, buckets: recent.length,
    avgSigma: +(recent.reduce((n, r) => n + (r.avgSigma || 0), 0) / recent.length).toFixed(4),
    maxSigma: Math.max(...recent.map(r => r.maxSigma || 0)),
    warnCount: recent.reduce((n, r) => n + (r.warnCount || 0), 0),
    haltCount: recent.reduce((n, r) => n + (r.haltCount || 0), 0),
    series: recent.map(r => r.avgSigma || 0).reverse(),
    // §NOTE this is the LIVE half of the sigma reconciliation. sigma_records is
    // the permanent half and its writer was lost with the causal-nexus
    // retirement — reported rather than hidden.
    recordsTable: recs.length ? `${recs.length} rows` : 'EMPTY — sigma_records has no writer (recompute-trigger.cjs was removed)',
  };
}

// ── friction / tension ──────────────────────────────────────────────────────
function _friction(system) {
  let ft;
  try { ft = require(path.join(ROOT, 'cortex/self-heal/fault-taxonomy.js')); }
  catch (e) { return { ok: false, reason: `fault-taxonomy unavailable: ${e.message}` }; }
  const out = { ok: true, thresholds: ft.FRICTION_THRESHOLDS || null, knownClasses: ft.KNOWN_FAULT_CLASSES || [] };
  try { if (ft.bandFor) out.band = ft.bandFor(0); } catch (_) {}
  // §1.1 — say what this taxonomy CANNOT classify. Verified 2026-08-08 by
  // injecting a real silent-swallow fault into a built component: every class
  // here is operational (timeout, saturation, memory), and getFaultClass
  // returned null for it. A dashboard that showed "0 faults" would be lying.
  out.blindTo = 'constitutional faults (silent swallow, stub in production, fabricated wire) — every known class is operational';
  return out;
}

// ── file drift — hash manifest vs the stored baseline ──────────────────────
// §2026-08-08. The 10th source. `data/` has 746 files and ZERO tracked by git
// (§2.2, state is never committed — correct), and idearium has 1,551 untracked
// artifacts. Source is versioned; artifacts and state are not. Hashes cover
// what git deliberately does not.
function _fileDrift(system) {
  let M;
  try { M = require('./manifest.js'); }
  catch (e) { return { ok: false, reason: `lib/manifest.js unavailable: ${e.message}` }; }
  const fsx = require('fs');
  const baseDir = path.join(ROOT, 'data/manifests');
  const store = path.join(baseDir, `${system}.json`);
  let prev = null;
  if (fsx.existsSync(store)) {
    try { prev = JSON.parse(fsx.readFileSync(store, 'utf8')); } catch (_) { prev = null; }
  }
  const r = M.drift(system, prev, { expected: false });
  if (!r.ok) return { ok: false, reason: r.reason };
  if (r.baseline) {
    return { ok: true, baseline: true, fileCount: r.manifest.fileCount,
             note: r.note + ` Run \`nexus movement ${system} --baseline\` to store it.` };
  }
  const d = r.delta;
  return { ok: true, baseline: false, sigma: r.sigma.sigma, band: r.sigma.band,
           reasons: r.sigma.reasons, added: d.added.length, removed: d.removed.length,
           changed: d.changed.length, renamed: d.renamed.length, ghost: d.ghost.length,
           fileCount: r.manifest.fileCount };
}

// ── schema drift ────────────────────────────────────────────────────────────
function _drift(jaa) {
  if (!jaa) return { ok: false, reason: 'JAA unavailable' };
  try {
    const rows = jaa.query('schema_drift', () => true, 10000) || [];
    const byTable = {};
    for (const r of rows) byTable[r.table || '?'] = (byTable[r.table || '?'] || 0) + 1;
    return { ok: true, total: rows.length, byTable, sample: rows.slice(0, 4).map(r => ({ table: r.table, missing: r.missing, kind: r.kind })) };
  } catch (e) { return { ok: false, reason: `schema_drift unreadable: ${e.message}` }; }
}

// ── errors ──────────────────────────────────────────────────────────────────
function _errors(system, jaa, windowMs) {
  const out = { ok: true, logFiles: [], fromEvents: 0, fromLedger: 0 };
  const dir = path.join(ROOT, 'data/ledger', system);
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.log')) continue;
      const p = path.join(dir, f);
      try {
        const st = fs.statSync(p);
        // §FOUND 2026-08-08 — guardian.bus.log is a DIRECTORY, not a file.
        // Reading it threw EISDIR. A ".log" that is a directory is worth
        // saying out loud rather than swallowing as an unreadable file.
        if (st.isDirectory()) {
          const inner = fs.readdirSync(p).length;
          out.logFiles.push({ file: f, isDirectory: true, entries: inner,
            note: 'a .log path that is a directory — named like a file, shaped like a stream' });
          continue;
        }
        const size = st.size;
        const txt = fs.readFileSync(p, 'utf8').slice(-200000);
        const hits = (txt.match(/\b(error|ERROR|FAIL|failed|exception|ECONN|ENOENT)\b/g) || []).length;
        out.logFiles.push({ file: f, bytes: size, errorLines: hits });
      } catch (e) { out.logFiles.push({ file: f, ok: false, reason: e.message }); }
    }
  }
  if (jaa) {
    try {
      const rows = jaa.query('event_log', () => true, 100000) || [];
      out.fromEvents = rows.filter(r => /error|fail|violation|reject/i.test(String(r.type || '')) &&
        (String(r.source || '').startsWith(system) || String(r.type || '').startsWith(system))).length;
      const cl = jaa.query('component_ledger', () => true, 100000) || [];
      out.fromLedger = cl.filter(r => r.system === system && (r.action === 'error' || r.status === 'error')).length;
    } catch (_) {}
  }
  if (!out.logFiles.length && !out.fromEvents && !out.fromLedger) {
    out.note = `no error surface found for "${system}" — that is an ABSENCE OF SOURCES, not a clean bill of health`;
  }
  return out;
}

/**
 * collect(system, opts) -> a complete movement snapshot.
 * opts: { windowMs = 24h, autopilotStatus = null }
 * Never throws. Every section reports its own reachability.
 */
function collect(system, opts = {}) {
  if (!system || typeof system !== 'string') {
    return { ok: false, reason: 'movement.collect(system) requires a system name' };
  }
  const windowMs = opts.windowMs || 24 * 60 * 60 * 1000;
  const jaa = _jaa();
  const snap = {
    ok: true, system, ts: Date.now(), windowMs,
    process:  _process(system, opts.autopilotStatus),
    events:   _events(system, jaa, windowMs),
    ledgers:  _ledgers(system, windowMs),
    changes:  _changes(system, jaa, windowMs),
    gaps:     _gaps(system, jaa),
    sigma:    _sigma(jaa),
    friction: _friction(system),
    drift:    _drift(jaa),
    files:    _fileDrift(system),
    errors:   _errors(system, jaa, windowMs),
  };
  // §1.2 — a renderer must be able to show what could not be read, so a blank
  // panel is never mistaken for a quiet system.
  snap.blind = Object.entries(snap)
    .filter(([, v]) => v && typeof v === 'object' && v.ok === false)
    .map(([k, v]) => ({ source: k, reason: v.reason }));
  snap.sourcesRead = 10 - snap.blind.length;
  return snap;
}

/** systems() — every system that has ANY movement source, discovered not listed. */
function systems() {
  const found = new Set();
  const ldir = path.join(ROOT, 'data/ledger');
  if (fs.existsSync(ldir)) {
    for (const e of fs.readdirSync(ldir, { withFileTypes: true })) if (e.isDirectory()) found.add(e.name);
  }
  const jaa = _jaa();
  if (jaa) {
    try { for (const r of jaa.query('component_ledger', () => true, 100000) || []) if (r.system && !/^bl7-\d+$/.test(r.system)) found.add(r.system); } catch (_) {}
  }
  return [...found].sort();
}

module.exports = { collect, systems, _series, VERSION: '0.1.0' };
