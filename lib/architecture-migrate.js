'use strict';
/**
 * lib/architecture-migrate.js — the refactor tool: read the architecture, propose the migration as phases (RF0, RF1).
 * comp_id: nexus.lib.architecture-migrate
 * UUID: nexus-lib-architecture-migrate-v1-0000-2026-1024-jamesbrooks-001
 * Map: docs/2026-10-13-projects-raid-and-gates-phasemap.spec RF0_architecture_read, RF1_migration_proposed_as_phases
 *
 * James, 2026-10-13: "can you have a refactor tool, or a option to fix or migrate archecture, like decompose components, and use the
 * component registry for the spine…" · 2026-10-24: "need to make the refactor tool from the phgases. so we can make each system
 * sovereignfor the cos migratoin" · "15 systems. the rest of the folders need to migrate." · 2026-10-05: "There is only 15 systems.
 * Not 27. Any system that's in idearium is a system, nothing more."
 *
 * Decision A (his, 2026-10-16, decision_refactor_tool): a proposal engine — it proposes, a person or the pipeline applies (RF2).
 * Read only. Stands on what exists (§8.6): lib/nexus-self/systems.js (the 15 systems and their folders) and lib/system-boundary.js
 * (scan: every require that crosses from one top-level folder to another, with its kind).
 *
 *   read({ root })     → { systems:[{id,dirs}], folders:[{ dir, files, usedBy:{system:n}, uses:{system:n} }] }   RF0
 *                        a "folder" is a top-level folder the boundary census treats as a system that is not one of the 15
 *   propose(model)     → [{ dir, home, homeDir, rule, why, dependsOn:[dir], files, placed }]                       RF1
 *   phasemap(rows, o)  → the proposal as a phasemap's text (one phase per folder, bottom-up, DAG-checkable)
 *   lines(rows)        → what a person reads
 * The rules (his axioms: code belongs to the system it serves — docs/CLAUDE.md 2026-10-07; shared code is kernel — lib/ is core):
 *   R1 used by exactly one of the 15, and not by lib/        → that system
 *   R2 used by lib/, or by two or more of the 15            → core (lib/<folder>/)
 *   R3 used by nothing, and uses exactly one place (not lib/ — everything uses the kernel) → wherever that place lives
 *   R4 no evidence (no edge either way)                     → unplaced: a home by purpose, to confirm — never guessed silently
 */
const path = require('path');

const MODULE_ID = 'nexus.lib.architecture-migrate';
const VERSION = '1.0.0';
const CORE = 'core';

function _count(obj, k) { obj[k] = (obj[k] || 0) + 1; }
function _sorted(o) { return Object.entries(o).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); }

/** RF0 — the architecture as it is: the 15 systems, and every other top-level folder with its edges. */
function read({ root = path.join(__dirname, '..'), boundary = require('./system-boundary.js'), systems = require('./nexus-self/systems.js'), filesOf = null } = {}) {
  const fifteen = systems.SYSTEMS.map(s => ({ id: s.id || s.name, dirs: (s.dirs || []).slice() }));
  const owned = new Map(); for (const s of fifteen) for (const d of s.dirs) owned.set(d, s.id);
  owned.set('lib', CORE);
  const { crossings = [] } = boundary.scan({ root });
  const sysOf = (dir) => owned.get(dir) || dir;
  const folders = boundary.systems(root).filter(d => !owned.has(d)).map(dir => {
    const usedBy = {}, uses = {};
    for (const x of crossings) {
      if (x.toSystem === dir && x.fromSystem !== dir) _count(usedBy, sysOf(x.fromSystem));
      if (x.fromSystem === dir && x.toSystem !== dir) _count(uses, sysOf(x.toSystem));
    }
    return { dir, files: filesOf ? filesOf(dir) : null, usedBy, uses };
  });
  return { systems: fifteen, folders };
}

/** RF1 — a home for each folder, by the rules above; bottom-up order follows from dependsOn (a folder it uses moves first). */
function propose(model) {
  const ids = new Set(model.systems.map(s => s.id));
  const dirOf = (id) => (id === CORE ? 'lib' : ((model.systems.find(s => s.id === id) || {}).dirs || [id])[0]);
  const folderSet = new Set(model.folders.map(f => f.dir));
  const rows = new Map();
  for (const f of model.folders) {
    const users = _sorted(f.usedBy), used = _sorted(f.uses);
    const sysUsers = users.filter(([k]) => ids.has(k));
    let home = null, rule = null, why = null;
    if (users.length && !f.usedBy[CORE] && sysUsers.length === 1 && users.length === 1) {
      home = sysUsers[0][0]; rule = 'R1'; why = `only ${home} uses it (${sysUsers[0][1]} require${sysUsers[0][1] === 1 ? '' : 's'})`;
    } else if (f.usedBy[CORE] || sysUsers.length >= 2) {
      home = CORE; rule = 'R2'; why = `shared: used by ${users.map(([k, n]) => `${k} ${n}`).join(', ')} — shared code is kernel`;
    } else if (!users.length && used.length === 1 && used[0][0] !== CORE) {   // using only lib/ says nothing: everything uses the kernel
      home = used[0][0]; rule = 'R3'; why = `nothing uses it; it uses only ${home}`;
    } else if (users.length) {
      home = null; rule = 'R4'; why = `used only by other folders that are moving (${users.map(([k]) => k).join(', ')}) — placed with them, to confirm`;
    } else {
      home = null; rule = 'R4'; why = used.length ? `nothing uses it; it uses ${used.map(([k, n]) => `${k} ${n}`).join(', ')} — no single home, to confirm` : 'no edge either way — a home by purpose, to confirm';
    }
    rows.set(f.dir, { dir: f.dir, home, rule, why, uses: f.uses, usedBy: f.usedBy, files: f.files, dependsOn: Object.keys(f.uses).filter(k => folderSet.has(k) && k !== f.dir).sort() });
  }
  // R3 into another folder: that folder's own home (resolved once; a cycle stays unplaced)
  for (const r of rows.values()) {
    if (r.rule === 'R3' && folderSet.has(r.home)) {
      const t = rows.get(r.home);
      if (t && t.home && !folderSet.has(t.home)) { r.why += ` → goes where ${r.home} goes (${t.home})`; r.home = t.home; }
      else { r.why += ` — ${r.home} is unplaced too`; r.home = null; r.rule = 'R4'; }
    }
  }
  return [...rows.values()].map(r => ({ ...r, placed: !!r.home, homeDir: r.home ? `${dirOf(r.home)}/${r.dir}/` : null }))
    .sort((a, b) => a.dependsOn.length - b.dependsOn.length || a.dir.localeCompare(b.dir));
}

// phase keys need a code with a number (MV1_…), the form every map's parser reads; numbered in the proposal's bottom-up order
const _slug = (dir) => dir.replace(/[^a-z0-9]+/gi, '_');
/** The proposal as a phasemap (his order: specs → phases; each phase one folder's move, bottom-up). */
function phasemap(rows, { date = new Date().toISOString().slice(0, 10), origin = '' } = {}) {
  const q = (s) => JSON.stringify(String(s));
  const out = [];
  out.push('spec:', '  meta:', '    name:     fifteen-systems-migration', '    version:  1.0.0', `    date:     ${date}`,
    '    owner:    "core (lib/architecture-migrate.js wrote this proposal; RF2 applies it one phase at a time)"',
    `    origin: ${q(origin)}`,
    '    generated: "node lib/architecture-migrate.js --write <this file> — regenerate, do not hand-edit the phases; decisions are his"',
    '  decisions:',
    '    MV0_unplaced_homes:',
    `      status: ${q(`OPEN — homes to confirm: ${rows.filter(r => !r.placed).map(r => r.dir).join(', ') || 'none'}`)}`,
    '  phases:');
  const keyOf = new Map(rows.map((r, i) => [r.dir, `MV${i + 1}_${_slug(r.dir)}`]));
  for (const r of rows) {
    const deps = r.dependsOn.map(d => keyOf.get(d)).filter(Boolean).concat(r.placed ? [] : ['MV0_unplaced_homes']);
    out.push(`    ${keyOf.get(r.dir)}:`, '      status: OPEN', `      depends_on: [${deps.join(', ')}]`,
      `      files: [${r.dir}/${r.homeDir ? `, ${r.homeDir}` : ''}]`,
      `      does: ${q(r.placed ? `move ${r.dir}/ into ${r.homeDir} (${r.rule}: ${r.why}); rewrite every require that points at it; the census then counts it inside ${r.home}` : `${r.dir}/ has no home yet (${r.rule}: ${r.why})`)}`,
      `      proof: ${q('the sovereignty census no longer lists it as a system; the boundary ratchet adds no crossing; the tests that touch it pass')}`);
  }
  return out.join('\n') + '\n';
}

function lines(rows) {
  const w = Math.max(...rows.map(r => r.dir.length), 6);
  return rows.map(r => `${r.dir.padEnd(w)}  ${r.placed ? `→ ${r.homeDir}` : '→ ?  (to confirm)'}  ${r.rule}  ${r.why}${r.dependsOn.length ? `  · after ${r.dependsOn.join(', ')}` : ''}`);
}

module.exports = { MODULE_ID, VERSION, CORE, read, propose, phasemap, lines };

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const { execFileSync } = require('child_process');
  const filesOf = (d) => { try { return execFileSync('git', ['ls-files', d], { cwd: root }).toString().split('\n').filter(Boolean).length; } catch (_) { return null; } };
  const rows = propose(read({ root, filesOf }));
  const i = process.argv.indexOf('--write');
  if (i > 0 && process.argv[i + 1]) {
    require('fs').writeFileSync(path.resolve(process.argv[i + 1]), phasemap(rows, { origin: 'James, 2026-10-24: "15 systems. the rest of the folders need to migrate." · "need to make the refactor tool from the phgases. so we can make each system sovereignfor the cos migratoin"' }));
    console.log(`written: ${process.argv[i + 1]}`);
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 2)); else for (const l of lines(rows)) console.log(l);
}
