'use strict';
/**
 * diagnostic/lib/causality.js — FMR0: how much of each system's ledger can be walked for a cause.
 * comp_id: diagnostic.causality
 * Map: docs/2026-10-17-failure-mode-report-phasemap.spec (FMR0_causality_measured)
 *
 * James, 2026-10-17: "failure mode report thats also a macro to import into a cos test env." · "lets do it. map it all, be
 * thorough." · "do it. … we need to add this all to nexus, there is boundaries mapping it"
 *
 * WHY. RFR2 walks a row for a root cause only through its causedBy (rule C-1: an observational row is never walked). The
 * mapping sweep found 72 of 1,467 ledger rows tracked in the tree carrying one (4.9%), and every .failure_mode on his
 * machine hollow: root null, no conditions. A failure report is only as good as this number, so it is measured first.
 *
 * Diagnostic owns it: its own spec's purpose is "watches all system ledgers". It READS the ledger files every system already
 * writes (no require into any system: the drawbridge census is unchanged) —
 *   data/ledger/<system>/<component>/<day>.jsonl    lib/component-ledger.js
 *   <system>/data/event_log.jsonl                   a system's own event ledger
 *   data/<system>/event_log.jsonl · data/<system>/ledger/**\/*.jsonl
 * and reads each file's tail only (TAIL_BYTES), so it stays cheap on a machine with months of ledger.
 *
 *   measure({ root, system?, tailBytes? })  → { systems: [{ system, rows, linked, resolved, dangling, share, files }], total, … }
 *   compare(now, highWater)                 → { fell: [{ system, from, to }], highWater }   the ratchet: a share only rises
 *   lines(result)                           → what a person reads
 * A row is linked when it names a cause (causedBy / caused_by, at the top, in payload or in meta). It is resolved when that
 * cause is a row id or uuid seen in any ledger read; otherwise dangling (the cause was not written, or is older than the
 * tails read: said as "not found in what was read", never as "does not exist").
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'diagnostic.causality';
const VERSION = '1.0.0';
const TAIL_BYTES = 2 * 1024 * 1024;

function _tail(file, bytes) {
  const st = fs.statSync(file);
  if (st.size <= bytes) return fs.readFileSync(file, 'utf8');
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    fs.readSync(fd, buf, 0, bytes, st.size - bytes);
    const s = buf.toString('utf8');
    return s.slice(s.indexOf('\n') + 1);   // the first line is cut mid-row
  } finally { fs.closeSync(fd); }
}

function _walk(dir, out, depth = 0) {
  if (depth > 6) return;
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
  for (const e of ents) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) _walk(p, out, depth + 1);
    else if (e.name.endsWith('.jsonl')) out.push(p);
  }
}

/** ledgerFiles(root) → [{ file, system }] — the ledgers on disk, each with the system it belongs to */
function ledgerFiles(root) {
  const out = [];
  const add = (file, system) => out.push({ file, system, rel: path.relative(root, file).replace(/\\/g, '/') });
  const central = path.join(root, 'data', 'ledger');
  const c = []; _walk(central, c);
  for (const f of c) { const rel = path.relative(central, f).replace(/\\/g, '/'); add(f, rel.includes('/') ? rel.split('/')[0] : path.basename(rel, '.jsonl')); }
  let ents = []; try { ents = fs.readdirSync(root, { withFileTypes: true }); } catch (_) {}
  for (const e of ents) {
    if (!e.isDirectory() || e.name === 'node_modules' || e.name === 'data' || e.name.startsWith('.') || e.name.startsWith('_')) continue;
    const own = path.join(root, e.name, 'data', 'event_log.jsonl');
    if (fs.existsSync(own)) add(own, e.name);
  }
  let dEnts = []; try { dEnts = fs.readdirSync(path.join(root, 'data'), { withFileTypes: true }); } catch (_) {}
  for (const e of dEnts) {
    if (!e.isDirectory() || e.name === 'ledger') continue;
    const el = path.join(root, 'data', e.name, 'event_log.jsonl');
    if (fs.existsSync(el)) add(el, e.name);
    const lg = []; _walk(path.join(root, 'data', e.name, 'ledger'), lg);
    for (const f of lg) add(f, e.name);
  }
  return out;
}

function _causeOf(r) {
  if (!r || typeof r !== 'object') return null;
  const c = r.causedBy || r.caused_by || (r.payload && (r.payload.causedBy || r.payload.caused_by)) || (r.meta && (r.meta.causedBy || r.meta.caused_by));
  return c ? String(c) : null;
}
function _idsOf(r) { return [r.uuid, r.id, r.shortid, r.eventId, r.entryUuid].filter(Boolean).map(String); }

function measure({ root = path.join(__dirname, '..', '..'), system = null, tailBytes = TAIL_BYTES } = {}) {
  root = path.resolve(root);
  const files = ledgerFiles(root).filter(f => !system || f.system === system);
  const seen = new Set();
  const rowsBy = new Map();
  let unreadable = 0;
  for (const f of files) {
    let text = ''; try { text = _tail(f.file, tailBytes); } catch (_) { unreadable++; continue; }
    const list = rowsBy.get(f.system) || { rows: [], files: [] };
    list.files.push(f.rel);
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let r; try { r = JSON.parse(line); } catch (_) { continue; }
      for (const id of _idsOf(r)) seen.add(id);
      list.rows.push(r);
    }
    rowsBy.set(f.system, list);
  }
  const systems = [];
  let T = 0, L = 0, R = 0;
  for (const [sys, { rows, files: fl }] of rowsBy) {
    let linked = 0, resolved = 0;
    for (const r of rows) { const c = _causeOf(r); if (!c) continue; linked++; if (seen.has(c)) resolved++; }
    T += rows.length; L += linked; R += resolved;
    systems.push({ system: sys, rows: rows.length, linked, resolved, dangling: linked - resolved,
      share: rows.length ? +(linked / rows.length).toFixed(4) : 0, files: fl.length });
  }
  systems.sort((a, b) => b.rows - a.rows);
  return { root, measuredAt: Date.now(), tailBytes, files: files.length, unreadable,
    total: { rows: T, linked: L, resolved: R, dangling: L - R, share: T ? +(L / T).toFixed(4) : 0 }, systems };
}

/** compare(now, highWater) — the ratchet: a system's share only rises; a fall is named (it becomes a gap upstream) */
function compare(now, highWater = {}) {
  const hw = { ...highWater };
  const fell = [];
  for (const s of now.systems || []) {
    if (!s.rows) continue;
    const before = hw[s.system];
    if (typeof before === 'number' && s.share + 1e-9 < before) fell.push({ system: s.system, from: before, to: s.share });
    else if (typeof before !== 'number' || s.share > before) hw[s.system] = s.share;
  }
  return { fell, highWater: hw };
}

const _pct = (x) => `${(x * 100).toFixed(1)}%`;
function lines(m, cmp = null) {
  if (!m || !m.total) return ['no ledgers read'];
  const out = [`${m.total.linked} of ${m.total.rows} ledger rows name their cause (${_pct(m.total.share)}); ${m.total.resolved} of those resolve to a row that was read, ${m.total.dangling} do not · ${m.files} file(s), each read from its last ${Math.round(m.tailBytes / 1048576)} MB`];
  for (const s of m.systems) out.push(`  ${s.system.padEnd(16)} ${_pct(s.share).padStart(6)}  ${s.linked}/${s.rows} rows${s.dangling ? ` · ${s.dangling} dangling` : ''}`);
  if (cmp && cmp.fell.length) for (const f of cmp.fell) out.push(`FELL ${f.system}: ${_pct(f.from)} → ${_pct(f.to)}`);
  if (m.unreadable) out.push(`${m.unreadable} file(s) could not be read`);
  return out;
}

module.exports = { MODULE_ID, VERSION, TAIL_BYTES, ledgerFiles, measure, compare, lines };
