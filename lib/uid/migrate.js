'use strict';
/**
 * lib/uid/migrate.js — NEXUS UID Migration & Conformance Tool
 * UUID: nexus-uid-migrate-v001-000000000001
 *
 * Walks every UUID in the system, normalizes it to canonical form, builds the
 * alias ledger (old↔new), persists it, and reports conformance.
 *
 * FLEXIBILITY-FIRST (default = dry run, no files touched):
 *   By default this does NOT rewrite source files. It builds the alias ledger so
 *   legacy UUIDs resolve via resolveAny() — both old and new forms stay valid.
 *   This is the safe, reference-preserving path. Pass --write only if you
 *   explicitly want canonical UUIDs written back into source (riskier).
 *
 * Run:  node lib/uid/migrate.js            (dry run + ledger + audit)
 *       node lib/uid/migrate.js --write    (also rewrite source UUIDs)
 */

const fs = require('fs');
const path = require('path');
const { normalize, _ledger } = require('./normalize');

const ROOT = path.resolve(__dirname, '..', '..');           // nexus-work/
const LEDGER_PATH = path.join(ROOT, 'data', 'uid-aliases.jsonl');

const UUID_RE = /(["']?)(uuid|UUID)\1\s*[:=]\s*["']([^"']+)["']/g;

function collectFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'data') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectFiles(p, acc);
    else if (/\.(json|js)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

function run({ write = false } = {}) {
  const files = collectFiles(ROOT);
  const seen = new Map();          // uuid → [files]
  for (const f of files) {
    let txt; try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
    let m;
    UUID_RE.lastIndex = 0;
    while ((m = UUID_RE.exec(txt)) !== null) {
      const u = m[3];
      if (u.includes('-') && u.length > 5) {
        if (!seen.has(u)) seen.set(u, []);
        seen.get(u).push(f);
      }
    }
  }

  const report = { total: 0, normalized: 0, alreadyStructured: 0, unmapped: 0, byComponent: {}, unmappedList: [],
                   addressable: 0, rawRuntime: 0, addressableResolved: 0 };
  const rewrites = new Map();      // old → canonical (for --write)

  // raw runtime UUID = standard randomUUID (8-4-4-4-12 hex). These are event/row
  // instance ids — NOT meant to be component-addressable. Flexible by design:
  // tolerate them, alias them, never force them into the grammar.
  const RAW_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  for (const [uuid] of seen) {
    report.total++;
    const isRaw = RAW_RE.test(uuid);
    if (isRaw) report.rawRuntime++; else report.addressable++;

    const n = normalize(uuid);
    if (n.reason === 'already-structured') { report.alreadyStructured++; if (!isRaw) report.addressableResolved++; }
    else if (n.reason === 'unmapped-component') { report.unmapped++; if (!isRaw && report.unmappedList.length < 20) report.unmappedList.push(uuid); }
    else if (n.reason === 'normalized') {
      report.normalized++;
      if (!isRaw) report.addressableResolved++;
      report.byComponent[n.componentId] = (report.byComponent[n.componentId] || 0) + 1;
      if (n.changed) rewrites.set(uuid, n.canonical);
    }
  }

  // persist alias ledger (§7.4 — nothing discarded, both forms preserved)
  try {
    fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
    fs.writeFileSync(LEDGER_PATH, _ledger.toJSON().map(r => JSON.stringify(r)).join('\n') + '\n');
  } catch (e) { console.warn('[migrate] ledger persist failed:', e.message); }

  // conformance: of UUIDs that are MEANT to be component addresses, how many resolve?
  report.conformance = report.addressable ? Math.round(report.addressableResolved / report.addressable * 100) : 100;

  if (write) {
    let filesChanged = 0, replacements = 0;
    for (const f of files) {
      let txt; try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
      let changed = false;
      for (const [oldU, newU] of rewrites) {
        if (txt.includes(oldU)) { txt = txt.split(oldU).join(newU); changed = true; replacements++; }
      }
      if (changed) { fs.writeFileSync(f, txt); filesChanged++; }
    }
    report.write = { filesChanged, replacements };
  }

  return report;
}

if (require.main === module) {
  const write = process.argv.includes('--write');
  const r = run({ write });
  console.log('=== NEXUS UID MIGRATION ===');
  console.log('mode:', write ? 'WRITE (source rewritten)' : 'dry-run (alias ledger only — safe/flexible)');
  console.log('total unique UUIDs:', r.total);
  console.log('  addressable (named component/contract ids):', r.addressable);
  console.log('  raw runtime ids (events/rows — correctly raw, left alone):', r.rawRuntime);
  console.log('--- of the addressable set ---');
  console.log('  resolved to a component:', r.addressableResolved, '/', r.addressable);
  console.log('  ADDRESSABLE CONFORMANCE:', r.conformance + '%');
  console.log('alias ledger entries:', _ledger.size, '→', LEDGER_PATH);
  if (r.write) console.log('files rewritten:', r.write.filesChanged, '| replacements:', r.write.replacements);
  if (r.unmappedList.length) { console.log('\nunmapped (need a component-map entry):'); r.unmappedList.forEach(u => console.log('  ? ' + u)); }
  console.log('\nby component:'); Object.entries(r.byComponent).sort((a,b)=>b[1]-a[1]).forEach(([c,n]) => console.log(`  ${c}: ${n}`));
}

module.exports = { run };
