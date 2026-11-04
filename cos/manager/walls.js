'use strict';
/**
 * cos/manager/walls.js — every compartment's wall, as its system declares it and as COS's ledger shows it working (CP1a, 0.60.355).
 * Spec: cos/spec/compartment.spec MOD-CP-WALLS · Map: docs/2026-11-01-the-compartment-phasemap.spec CP1a_every_system_walled_by_cos, CP_D5.
 *
 * James, 2026-11-01: "continue moving the rest of the systems into cos." Each system declares its wall in its own compartment.json (or .cos);
 * the supervisor starts it behind it (node: --require boundary.js; Electron: NODE_OPTIONS). This reads what the declarations say and what the
 * walls have said since each process last started: an audit wall lets a crossing through and says it, so the crossings are the list of what
 * stands between that system and enforce (his DO_D9: "enforce when the audit is empty"). It reads only the supervisor; it writes nothing.
 *
 *   report(sup) → CompartmentWall[]   · crossingsOf(entries) → [{ file, from, at }]
 */
const LINE = /^(\S+) (refused|would refuse) (.+?) \(from (.+)\)$/;

function crossingsOf(entries) {
  const seen = new Map();
  for (const e of entries) {
    if (e.kind !== 'wall') continue;
    const m = LINE.exec(String(e.why || ''));
    if (!m) continue;   // "the wall is NOT up" and other wall lines stay on the ledger; they are not crossings
    if (!seen.has(m[3])) seen.set(m[3], { file: m[3], from: m[4], at: e.ts, refused: m[2] === 'refused' });
  }
  return [...seen.values()];
}

function report(sup) {
  const P = sup.policy();
  const views = new Map(sup.list().map(v => [v.name, v]));
  return sup.declarations().map((d) => {
    const v = views.get(d.name) || {};
    const walled = !!(d.boundary && Array.isArray(d.boundary.allow));
    const mode = walled ? (d.boundary.mode === 'audit' ? 'audit' : 'enforce') : 'none';
    const all = sup.ledger({ system: d.name, limit: 5000 });
    let since = -1; for (let i = all.length - 1; i >= 0; i--) if (all[i].kind === 'spawn') { since = i; break; }
    const crossings = walled ? crossingsOf(since >= 0 ? all.slice(since + 1) : []) : [];
    const stable = !!(v.pid && v.startedAt && Date.now() - v.startedAt >= P.stableMs);
    return {
      system: d.system, name: d.name, compartment: d.compartment || null, mode,
      via: !walled ? 'none' : /electron/i.test(String(d.cmd)) ? 'NODE_OPTIONS' : '--require',
      allow: walled ? d.boundary.allow : [], crossings, state: v.state || 'declared', running: !!v.pid,
      enforceReady: mode === 'audit' && stable && crossings.length === 0,
      said: !walled ? 'bare: no wall declared'
        : mode === 'enforce' ? (crossings.length ? `enforce: ${crossings.length} require(s) refused since it started` : 'enforce: isolated (code only: fs, child processes and the network are not walled by this)')
        : !v.pid ? 'audit: not running, nothing said yet'
        : crossings.length ? `audit: ${crossings.length} crossing(s) since it started — each one still to close before enforce`
        : stable ? 'audit: no crossing since it started — ready for enforce' : 'audit: no crossing yet; ready for enforce once it has run a while',
    };
  });
}

module.exports = { report, crossingsOf };
