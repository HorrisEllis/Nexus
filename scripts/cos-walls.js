'use strict';
/**
 * scripts/cos-walls.js — each system's wall, written into its own compartment.json from the census (CP1a, 0.60.355).
 * Map: docs/2026-11-01-the-compartment-phasemap.spec CP1a_every_system_walled_by_cos, CP_D5 · Spec: cos/spec/compartment.spec MOD-CP-WALLS.
 *
 * James, 2026-11-01: "continue moving the rest of the systems into cos." LM6 (0.60.338) walled Loom; Emerge declared its own in emerge.cos.
 * This writes the same declaration for every other process COS boots: runtime.process(es).compartment = nexus-self-<system>, and
 * boundary = { mode, allow, about }, where allow is the census's boundaryFor(system) as {{root}} paths and mode is enforce when the system has
 * no way out (lib/system-boundary.js sovereignty().out === 0), audit otherwise (his DO_D9: "audit first, enforce when the audit is empty").
 * A process that already declares a wall (Loom, Emerge's .cos) is left as it is. The script is the coder's tool, run once and checked by the
 * test; COS's running manager never writes a system's file (CP-001).
 *
 *   node scripts/cos-walls.js            what each declaration would be, against what it is
 *   node scripts/cos-walls.js --write    write the walls that are missing or differ (only into compartment.json files)
 *   node scripts/cos-walls.js --check    exit 1 when a declared wall differs from the census
 *   plan({ root }) → [{ system, file, process, compartment, mode, allow, out, state: 'same'|'missing'|'differs'|'own' }]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function _rel(root, abs) {
  const r = path.relative(root, abs).split(path.sep).join('/');
  return `{{root}}/${r}${abs.endsWith(path.sep) || abs.endsWith('/') || !path.extname(abs) ? (r.endsWith('/') ? '' : '/') : ''}`;
}

function plan({ root = ROOT } = {}) {
  root = path.resolve(root);
  const C = require(path.join(root, 'loom/templates/cos-compartment.js'));
  const SB = require(path.join(root, 'lib/system-boundary.js'));
  const out = [];
  for (const d of fs.readdirSync(root, { withFileTypes: true })) {
    if (!d.isDirectory() || /^(\.|node_modules$|data$|_archive$)/.test(d.name)) continue;
    const file = path.join(root, d.name, 'compartment.json');
    if (fs.existsSync(path.join(root, d.name, `${d.name}.cos`))) continue;   // a .cos node declares itself (Emerge): its own
    let c; try { c = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { continue; }
    const rt = c.runtime || {};
    const procs = [rt.process, ...(rt.processes || [])].filter(Boolean);
    if (!procs.length) continue;
    const system = c.name || d.name;
    const b = C.boundaryFor(d.name, { root });
    if (!b.ok) { out.push({ system, file, state: 'no-census', why: b.error }); continue; }
    const sov = (SB.sovereignty({ root, system: d.name }).systems || [])[0] || {};
    const ways = typeof sov.out === 'number' ? sov.out : null;
    const mode = ways === 0 ? 'enforce' : 'audit';
    const allow = b.allow.map(a => _rel(root, a.endsWith(path.sep) ? a : a + path.sep).replace(/\/+$/, '/'));
    for (const p of procs) {
      const has = p.boundary && Array.isArray(p.boundary.allow);
      const same = has && p.compartment === b.name && p.boundary.mode === mode && JSON.stringify([...p.boundary.allow].sort()) === JSON.stringify([...allow].sort());
      out.push({ system, dir: d.name, file: path.relative(root, file).split(path.sep).join('/'), process: p.name, compartment: b.name, mode, allow, out: ways,
        state: has && (p.boundary.ownWall || system === 'loom') ? 'own' : same ? 'same' : has ? 'differs' : 'missing' });
    }
  }
  return out;
}

function write({ root = ROOT } = {}) {
  root = path.resolve(root);
  const rows = plan({ root }).filter(r => r.state === 'missing' || r.state === 'differs');
  const byFile = new Map();
  for (const r of rows) { if (!byFile.has(r.file)) byFile.set(r.file, []); byFile.get(r.file).push(r); }
  for (const [file, rs] of byFile) {
    const abs = path.join(root, file);
    const raw = fs.readFileSync(abs, 'utf8');
    const c = JSON.parse(raw);
    for (const r of rs) {
      const p = [c.runtime.process, ...(c.runtime.processes || [])].find(x => x && x.name === r.process);
      p.compartment = r.compartment;
      p.boundary = { mode: r.mode, allow: r.allow,
        about: `${r.system}'s wall, declared by ${r.system} (CP1a, 2026-11-01): COS's supervisor starts it behind this; equal to the census's boundaryFor('${r.dir}'); ${r.mode === 'enforce' ? 'enforce: it has no way out' : `audit: ${r.out} way(s) out still open, so the wall says what it would refuse (DO_D9); enforce when the audit is empty`}` };
    }
    fs.writeFileSync(abs, JSON.stringify(c, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
  }
  return { written: rows.length, files: [...byFile.keys()] };
}

if (require.main === module) {
  const rows = plan();
  if (process.argv.includes('--write')) { const r = write(); console.log(`wrote ${r.written} wall(s) into ${r.files.length} file(s): ${r.files.join(', ')}`); process.exit(0); }
  for (const r of rows) console.log(`${String(r.process || r.system).padEnd(22)} ${String(r.mode || '').padEnd(8)} out ${String(r.out ?? '?').padStart(3)}  ${r.state}${r.why ? ` (${r.why})` : ''}`);
  if (process.argv.includes('--check')) process.exit(rows.some(r => r.state === 'missing' || r.state === 'differs' || r.state === 'no-census') ? 1 : 0);
}

module.exports = { plan, write };
