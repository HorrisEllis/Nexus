#!/usr/bin/env node
'use strict';
/**
 * cli/nexus-movement.js — `nexus movement <system>`
 * comp_id: nexus.cli.movement
 * UUID: nexus-cli-movement-v1-0000-2026-0808-001
 * Version: 0.1.0
 *
 * The custom command. One panel per system, laid out like the checkmk
 * dashboard: gauges top-left, time series across, tables below.
 *
 * It renders lib/movement.js's snapshot and NOTHING ELSE — the same object the
 * tablet should consume. That split is the point: the tablet's problem was never
 * the chart library, it was that nothing aggregated per-system movement for a
 * chart to draw. Two renderers, one truth.
 *
 * §1.2 — a source that could not be read is drawn as `??` in a BLIND panel, not
 * as an empty graph. An empty graph and a missing feed look identical, and that
 * confusion is the thing this whole command exists to remove.
 *
 * Usage:
 *   node cli/nexus-movement.js <system>          panel for one system
 *   node cli/nexus-movement.js --all             one line per system
 *   node cli/nexus-movement.js <system> --json   raw snapshot (what the tablet eats)
 *   node cli/nexus-movement.js <system> --window=6h
 */
const path = require('path');
const http = require('http');
const movement = require(path.join(__dirname, '..', 'lib', 'movement.js'));

const C = process.stdout.isTTY ? {
  dim: s => `\x1b[90m${s}\x1b[0m`, b: s => `\x1b[1m${s}\x1b[0m`,
  g: s => `\x1b[32m${s}\x1b[0m`, y: s => `\x1b[33m${s}\x1b[0m`,
  r: s => `\x1b[31m${s}\x1b[0m`, c: s => `\x1b[36m${s}\x1b[0m`,
} : { dim: s => s, b: s => s, g: s => s, y: s => s, r: s => s, c: s => s };

const SPARK = '▁▂▃▄▅▆▇█';
function spark(vals) {
  if (!vals || !vals.length) return C.dim('(no series)');
  const max = Math.max(...vals);
  if (max === 0) return C.dim('▁'.repeat(vals.length) + '  (all zero)');
  return vals.map(v => SPARK[Math.min(7, Math.floor((v / max) * 7.999))]).join('');
}
function gauge(pct, width = 22) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return C.dim('?'.repeat(width) + '  unknown');
  const p = Math.max(0, Math.min(100, pct));
  const fill = Math.round((p / 100) * width);
  const bar = '█'.repeat(fill) + C.dim('░'.repeat(width - fill));
  const col = p >= 75 ? C.r : p >= 40 ? C.y : C.g;
  return `${col(bar)} ${col(p.toFixed(1).padStart(5) + '%')}`;
}
const box = t => console.log(C.dim('┌─ ') + C.b(t) + C.dim(' ' + '─'.repeat(Math.max(0, 66 - t.length))));
const row = (k, v) => console.log('  ' + C.c(String(k).padEnd(18)) + ' ' + v);

function autopilotStatus(cb) {
  const req = http.request({ hostname: '127.0.0.1', port: process.env.AUTOPILOT_PORT || 7799, path: '/status', timeout: 1500 },
    res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { cb(JSON.parse(d)); } catch (_) { cb(null); } }); });
  req.on('error', () => cb(null)); req.on('timeout', () => { req.destroy(); cb(null); });
  req.end();
}

function parseWindow(s) {
  const m = /^(\d+)([hmd])$/.exec(s || '');
  if (!m) return 24 * 3600 * 1000;
  return +m[1] * ({ m: 60e3, h: 3600e3, d: 86400e3 }[m[2]]);
}

function render(s) {
  const hours = (s.windowMs / 3600e3).toFixed(0);
  console.log('');
  console.log(C.b(`  ${s.system.toUpperCase()} — movement`) + C.dim(`   last ${hours}h   ${new Date(s.ts).toISOString()}`));
  console.log(C.dim(`  sources read ${s.sourcesRead}/${s.sourcesRead + s.blind.length}` + (s.blind.length ? `   ${s.blind.length} BLIND` : '')));
  console.log('');

  // ── GAUGES ──────────────────────────────────────────────────────────────
  box('PRESSURE');
  const g = s.gaps;
  const gapPct = g.ok && g.total ? (g.open / g.total) * 100 : (g.ok ? 0 : null);
  row('gap pressure', gauge(gapPct) + C.dim(g.ok ? `   ${g.open} open / ${g.total}` : `   ${g.reason}`));
  const sg = s.sigma;
  row('sigma (max)', sg.ok ? gauge(sg.maxSigma * 100) + C.dim(`   avg ${sg.avgSigma}  warn ${sg.warnCount}  halt ${sg.haltCount}`)
                           : C.dim(sg.reason));
  const ch = s.changes;
  const errPct = ch.ok && ch.total ? (ch.errors / ch.total) * 100 : null;
  row('change error %', gauge(errPct) + C.dim(ch.ok ? `   ${ch.errors} errors / ${ch.total} changes` : ''));
  console.log('');

  // ── SERIES ──────────────────────────────────────────────────────────────
  box(`MOVEMENT  (${hours}h, 48 buckets)`);
  row('events', s.events.ok ? spark(s.events.series.buckets) + C.dim(`  ${s.events.total} total, ${s.events.distinctTypes} types`)
                            : C.dim(s.events.reason));
  row('ledger writes', s.ledgers.ok ? spark(s.ledgers.series.buckets) + C.dim(`  ${s.ledgers.streams} streams, ${(s.ledgers.totalBytes / 1024).toFixed(0)}KB`)
                                    : C.dim(s.ledgers.reason));
  row('changes', s.changes.ok ? spark(s.changes.series.buckets) + C.dim(`  ${s.changes.total}`) : C.dim(s.changes.reason));
  row('sigma', sg.ok ? spark(sg.series) + C.dim(`  ${sg.buckets} buckets`) : C.dim(sg.reason));
  console.log('');

  // ── TABLES ──────────────────────────────────────────────────────────────
  box('TOP EVENT TYPES');
  if (s.events.ok && s.events.types.length) {
    for (const t of s.events.types.slice(0, 6)) row(String(t.count), t.type);
  } else console.log('  ' + C.dim(s.events.note || s.events.reason || 'none'));
  console.log('');

  box('CHANGES BY ACTION');
  if (s.changes.ok && s.changes.actions.length) {
    for (const a of s.changes.actions.slice(0, 6)) row(String(a.count), a.action + (a.action === 'error' ? C.r('  ←') : ''));
  } else console.log('  ' + C.dim('none'));
  console.log('');

  box('LEDGER STREAMS');
  if (s.ledgers.ok && s.ledgers.top) {
    for (const t of s.ledgers.top) row(`${(t.bytes / 1024).toFixed(0)}KB`, t.stream + C.dim(`  read ${((t.read / t.bytes) * 100).toFixed(1)}% for ${t.sampled}`));
    if (s.ledgers.malformed) console.log('  ' + C.y(`${s.ledgers.malformed} malformed lines across all streams — counted, not dropped`));
  } else console.log('  ' + C.dim(s.ledgers.reason || s.ledgers.note));
  console.log('');

  box('OPEN GAPS');
  if (g.ok && g.open) {
    for (const x of g.sample) row(`sev ${x.severity}`, `${x.type}  ${C.dim(x.body)}`);
    if (g.oldestOpenMs) row('oldest', `${(g.oldestOpenMs / 86400e3).toFixed(1)} days`);
  } else console.log('  ' + C.dim(g.ok ? 'none open' : g.reason));
  console.log('');

  box('ERRORS');
  const e = s.errors;
  row('from events', String(e.fromEvents));
  row('from ledger', String(e.fromLedger));
  for (const lf of e.logFiles) {
    row(lf.file, lf.isDirectory ? C.y(`DIRECTORY (${lf.entries} entries) — ${lf.note}`)
      : lf.ok === false ? C.r(lf.reason) : `${(lf.bytes / 1024).toFixed(0)}KB, ${lf.errorLines} error lines`);
  }
  if (e.note) console.log('  ' + C.y(e.note));
  console.log('');

  box('FILE DRIFT  (sha256 manifest vs baseline)');
  const fd = s.files;
  if (!fd.ok) console.log('  ' + C.dim(fd.reason));
  else if (fd.baseline) console.log('  ' + C.dim(`${fd.fileCount} files — ${fd.note}`));
  else {
    const col = fd.band === 'HALT' ? C.r : fd.band === 'WARN' ? C.y : fd.band === 'NOTE' ? C.c : C.g;
    row('sigma', gauge(fd.sigma * 100) + '  ' + col(fd.band));
    row('delta', `+${fd.added} -${fd.removed} ~${fd.changed} →${fd.renamed}` +
        (fd.ghost ? C.r(`  ${fd.ghost} GHOST`) : '') + C.dim(`   of ${fd.fileCount} files`));
    for (const r of fd.reasons) console.log('  ' + (/GHOST|BETWEEN|UNCOMPARED/.test(r) ? C.r('• ' + r) : C.dim('• ' + r)));
  }
  console.log('');

  box('DRIFT & FRICTION');
  row('schema drift', s.drift.ok ? `${s.drift.total} rows  ${C.dim(JSON.stringify(s.drift.byTable))}` : C.dim(s.drift.reason));
  row('friction classes', s.friction.ok ? s.friction.knownClasses.join(', ') : C.dim(s.friction.reason));
  if (s.friction.ok) console.log('  ' + C.y('blind to: ' + s.friction.blindTo));
  if (sg.ok && /EMPTY/.test(sg.recordsTable)) console.log('  ' + C.y('sigma_records: ' + sg.recordsTable));
  console.log('');

  // ── BLIND — the panel that must never be omitted ────────────────────────
  if (s.blind.length) {
    box(C.y('BLIND — sources that could NOT be read'));
    for (const b of s.blind) row(b.source, C.y(b.reason));
    console.log('  ' + C.dim('An unread source is not a quiet one. §1.2'));
    console.log('');
  }
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const all = args.includes('--all');
  const win = parseWindow((args.find(a => a.startsWith('--window=')) || '').split('=')[1]);
  const system = args.find(a => !a.startsWith('--'));

  autopilotStatus(status => {
    if (all) {
      const list = movement.systems();
      console.log('');
      console.log(C.b('  system'.padEnd(24)) + C.b('events  ledgers  changes  err  gaps  blind'));
      for (const sys of list) {
        const s = movement.collect(sys, { windowMs: win, autopilotStatus: status });
        const f = (v) => String(v).padStart(6);
        console.log('  ' + sys.padEnd(22) +
          f(s.events.ok ? s.events.total : '?') + '  ' +
          f(s.ledgers.ok ? s.ledgers.streams : '?') + '   ' +
          f(s.changes.ok ? s.changes.total : '?') + ' ' +
          f(s.changes.ok ? s.changes.errors : '?') + ' ' +
          f(s.gaps.ok ? s.gaps.open : '?') + '  ' +
          (s.blind.length ? C.y(f(s.blind.length)) : C.dim(f(0))));
      }
      console.log('');
      console.log(C.dim(`  ${list.length} systems discovered from data/ledger + component_ledger.`));
      console.log(C.dim('  Names are UNVALIDATED — see the movement spec on bl7-* and .._.._etc.'));
      console.log('');
      return;
    }

    if (!system) {
      console.log('\nusage: node cli/nexus-movement.js <system> [--json] [--window=6h]');
      console.log('       node cli/nexus-movement.js --all\n');
      console.log('systems: ' + movement.systems().join(', ') + '\n');
      process.exit(1);
    }

    // --baseline stores the current manifest so the next run has something to
    // compare against. Explicit on purpose: an auto-updating baseline can never
    // report drift, because it agrees with whatever it just saw.
    if (args.includes('--baseline')) {
      const M = require(path.join(__dirname, '..', 'lib', 'manifest.js'));
      const fs2 = require('fs');
      const m = M.capture(system);
      if (!m.ok) { console.log(C.r('  ' + m.reason)); process.exit(1); }
      const dir = path.join(__dirname, '..', 'data', 'manifests');
      fs2.mkdirSync(dir, { recursive: true });
      fs2.writeFileSync(path.join(dir, `${system}.json`), JSON.stringify(m));
      console.log(`\n  baseline stored: ${system} — ${m.fileCount} files, ${(m.totalBytes / 1024).toFixed(0)}KB, complete=${m.complete}\n`);
      return;
    }

    const snap = movement.collect(system, { windowMs: win, autopilotStatus: status });
    if (json) { console.log(JSON.stringify(snap, null, 2)); return; }
    render(snap);
  });
}

if (require.main === module) main();
module.exports = { render, spark, gauge };
