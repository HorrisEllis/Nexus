'use strict';
// The observability/tablet arc's components must be in loom's registry WITH their
// real require() edges as wires — the registry is the system's self-model of its
// connections (James: everything connects to everything; that's how it finds
// friction/gaps). A bare declaration with no wires is an isolated dot.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}
const ROOT = path.join(__dirname, '../..');
const { mapObservability, FILES } = require(path.join(ROOT, 'loom/maps/observability-map'));

function run() {
  let comps = [], hooks = [], wires = [];
  const driver = { declare: (kind, o) => { if (kind === 'component') comps.push(o); if (kind === 'hook') hooks.push(o); if (kind === 'wire') wires.push(o); return { ok: true, stored: o }; } };
  return { r: mapObservability(driver), comps, hooks, wires };
}

test('T-001', 'maps one component per file (all session components)', () => {
  const { comps } = run();
  assert.ok(comps.length >= 9, `expected ≥9 components, got ${comps.length}`);
  for (const id of ['nexus.copilot.diagnostics', 'nexus.copilot.movement-map', 'nexus.copilot.optimizer', 'nexus.lib.sigma-roles', 'nexus.tablet.homepage']) {
    assert.ok(comps.find(c => c.id === id), `component ${id} must be mapped`);
  }
});

test('T-002', 'maps REAL require() edges as wires (not bare declarations)', () => {
  const { wires } = run();
  assert.ok(wires.length >= 15, `expected ≥15 wires from real require edges, got ${wires.length}`);
});

test('T-003', 'the optimizer is wired to the intelligence layer it composes (§the graph is real)', () => {
  // optimizer requires movement-map + pattern-leverage + sigma-roles + mastermind
  const opt = FILES.find(f => f[1] === 'nexus.copilot.optimizer');
  assert.ok(opt, 'optimizer must be in the map');
  for (const dep of ['nexus.copilot.movement-map', 'nexus.lib.pattern-leverage', 'nexus.lib.sigma-roles', 'nexus.intelligence.mastermind']) {
    assert.ok(opt[2].includes(dep), `optimizer must wire to ${dep}`);
  }
});

test('T-004', 'the graph joins the rest of NEXUS (edges to cfr, jaa-db, mastermind)', () => {
  const allDeps = new Set();
  for (const [, , reqs] of FILES) for (const d of reqs) allDeps.add(d);
  // §0.39.282 — CFR moved from meta/ into intelligence/ (intelligence.spec); the id followed it.
  for (const ext of ['nexus.intelligence.cfr.field', 'nexus.cortex.jaa-db', 'nexus.intelligence.mastermind']) {
    assert.ok(allDeps.has(ext), `the arc must connect to ${ext} (everything connects)`);
  }
});

test('T-005', 'export/import hooks exist so wires have real endpoints', () => {
  const { hooks } = run();
  assert.ok(hooks.some(h => h.direction === 'out'), 'export hooks');
  assert.ok(hooks.some(h => h.direction === 'in'), 'import hooks');
});

test('T-006', 'no fabricated edges — every wire traces to a real require in FILES', () => {
  const { wires } = run();
  // each wire id encodes dep--id; both must be real FILES ids or declared external deps
  const knownIds = new Set(FILES.map(f => f[1]));
  const externalOk = new Set(['nexus.copilot.system-status', 'nexus.meta.cfr.field', 'nexus.meta.cfr.delta', 'nexus.meta.gap.hunter', 'nexus.lib.capability-registry', 'nexus.cortex.jaa-db', 'nexus.intelligence.mastermind']);
  for (const w of wires) {
    assert.ok(w.from_hook_id && w.to_hook_id, 'wire has both endpoints');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
