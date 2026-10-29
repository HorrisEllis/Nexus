'use strict';
/**
 * tests/modules/test-substrate-spec.test.js — the full specs stay buildable, and their phases stay tied to them (2026-10-20).
 * Specs: docs/substrate.spec · docs/belief-loop.spec · emerge/SPEC_COMPILER.spec (MOD-KG-BUILDER added 2026-10-20)
 * James, 2026-10-20: "not phasemaps. full specs to build them. everything needs  to be speccced before built,so it can be rebuilt
 * if lost."
 *
 *   SS-01  each spec compiles in emerge's own kg-builder: every module, schema and interface at specDepth 1.0, no BLACK node, the
 *          invariants engine valid (no build-order or other violation)
 *   SS-02  spec ↔ phases: every module names a phase that exists in its map; every phase of the map names the spec and blocks that
 *          resolve to that spec's modules; no module is unbuilt by any phase
 *   SS-03  emerge's build order is topological (the 2026-10-20 correction): a chain of four with the most ready node last in the
 *          chain is ordered foundation-first, and a cycle still gives a total order
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const ROOT = path.join(__dirname, '../..');
const { build } = require(path.join(ROOT, 'lib', 'emerge', 'compiler', 'kg-builder.js'));
const { check } = require(path.join(ROOT, 'lib', 'emerge', 'compiler', 'invariants-engine.js'));

let passed = 0, failed = 0;
function test(id, desc, fn) { try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack.split('\n').slice(0, 5).join('\n    ')}`); failed++; } }
const load = (p) => { const d = yaml.load(fs.readFileSync(path.join(ROOT, p), 'utf8')); return d.spec || d; };
const nodesOf = (g) => (g.nodes instanceof Map ? [...g.nodes.values()] : g.nodes);
const SPECS = [
  { spec: 'docs/substrate.spec', map: 'docs/2026-10-20-substrate-graph-traversal-chunking-gating-phasemap.spec' },
  { spec: 'docs/belief-loop.spec', map: 'docs/2026-10-20-belief-loop-phasemap.spec' },
  { spec: 'lib/emerge/SPEC_COMPILER.spec', map: null },
  { spec: 'docs/data-layout.spec', map: 'docs/2026-10-21-data-layout-phasemap.spec' },   // 2026-10-21
  { spec: 'docs/pipeline.spec', map: null },
  { spec: 'clear-glass/spec/snowflake.spec', map: 'docs/2026-10-21-snowflake-compartment-phasemap.spec' },   // 0.60.178
  { spec: 'clear-glass/spec/compartment-downloads.spec', map: 'docs/2026-10-21-compartment-downloads-phasemap.spec' },   // 0.60.179
  { spec: 'docs/brainos-in-idearium.spec', map: 'docs/2026-10-21-brainos-into-idearium-phasemap.spec' },
  { spec: 'docs/approval-chain.spec', map: 'docs/2026-10-21-approval-chain-phasemap.spec' },   // 2026-10-21 APV — his "make sure it's all interconnected"   // 2026-10-21 planned
  { spec: 'clear-glass/spec/passwords.spec', map: 'docs/2026-10-21-passwords-phasemap.spec' },   // 0.60.186
  { spec: 'clear-glass/spec/adblock.spec', map: 'docs/2026-10-21-adblock-phasemap.spec' },   // 0.60.183
  { spec: 'clear-glass/spec/browser-shell.spec', map: 'docs/2026-10-21-browser-shell-phasemap.spec' },
  { spec: 'docs/system-node-db.spec', map: 'docs/2026-10-22-system-node-db-phasemap.spec' },
  { spec: 'cos/spec/cos-spine.spec', map: 'docs/2026-10-23-cos-spine-phasemap.spec' },
  { spec: 'docs/self-building-loop.spec', map: 'docs/2026-10-23-self-building-loop-phasemap.spec' },   // 2026-10-23 SL — his "so it can start building itself"   // 2026-10-23 CS — COS is the spine: versions are system states
  { spec: 'clear-glass/spec/copilot-any-agent.spec', map: 'docs/2026-10-24-copilot-any-agent-phasemap.spec' },   // 2026-10-24 CL — his "get the cli working for guardian, use any agent as the copilot"
  { spec: 'cos/spec/cos-spine.spec', map: 'docs/2026-10-23-cos-spine-phasemap.spec' },   // 2026-10-23 CS — COS is the spine: versions are system states
  { spec: 'clear-glass/spec/flow-cores.spec', map: 'docs/2026-10-28-first-principles-phasemap.spec' },   // 2026-10-28 FP — the deterministic cores
  { spec: 'clear-glass/spec/tab-compartments.spec', map: 'docs/2026-10-28-tab-compartments-phasemap.spec' },   // 2026-10-28 TC — a compartment per tab, links open tabs
  { spec: 'clear-glass/spec/gated-flows.spec', map: 'docs/2026-10-28-gated-flows-phasemap.spec' },   // 2026-10-28 FG — gated flows, dropdowns, Tab mode
  { spec: 'clear-glass/spec/site-profile.spec', map: 'docs/2026-10-23-site-profile-processes-phasemap.spec' },   // 2026-10-23 SP — per-site settings, Processes   // 2026-10-22 ND — his "each database for each system"   // 0.60.179   // 2026-10-20 — compile only: its new modules' phases (AQ1/AQ2) are not in a map yet
  { spec: 'cos/spec/cos-services.spec', map: 'docs/2026-10-24-cos-services-phasemap.spec' },
  { spec: 'docs/automation-pipelines.spec', map: 'docs/2026-10-29-pipelines-phasemap.spec' },   // 2026-10-29 PL — his "making a pipeline and workflow feature and include the macros and automation"   // 2026-10-24 BCR1 (from brave-cori) — his "this is all the networking backend for anything needed netwroking wise"
];

console.log('\ntest-substrate-spec — full specs compile at full depth and stay tied to their phases');

test('SS-01', 'each spec compiles in emerge\'s kg-builder: full depth, no BLACK, invariants valid', () => {
  for (const s of SPECS) {
    const r = build(load(s.spec));
    assert.ok(r.ok, `${s.spec} did not build`);
    const nodes = nodesOf(r.graph);
    const low = nodes.filter(n => n.kind !== 'event' && n.specDepth < 1).map(n => `${n.id} ${n.specDepth}`);
    assert.deepStrictEqual(low, [], `${s.spec}: below full depth: ${low.join(', ')}`);
    assert.deepStrictEqual(nodes.filter(n => n.isBlack).map(n => n.id), [], `${s.spec}: BLACK nodes`);
    const v = check(r.graph);
    assert.ok(v.isValid, `${s.spec}: ${JSON.stringify(v.violations.slice(0, 3))}`);
  }
});

test('SS-02', 'spec ↔ phases: every module has its phase; every phase names its spec and blocks that resolve', () => {
  const PF = require(path.join(ROOT, 'lib/phase-files.js'));
  for (const s of SPECS.filter(x => x.map)) {
    const spec = load(s.spec);
    const mods = new Map(spec.modules.map(m => [m.id, m]));
    // a decision (it carries chosen:) is a DAG node phases depend on, not a phase: it builds no module (0.60.179)
    const phases = PF.phasesOf(fs.readFileSync(path.join(ROOT, s.map), 'utf8'), s.map).filter(p => !/^\s+chosen:/m.test(p.body));
    const ids = new Set(phases.map(p => p.id));
    for (const m of spec.modules) assert.ok(ids.has(m.phase), `${s.spec} ${m.id} names phase ${m.phase}, not in ${s.map}`);
    const built = new Set();
    for (const p of phases) {
      const sp = (p.body.match(/^\s{4}spec:\s*(.+)$/m) || [])[1];
      const bl = ((p.body.match(/^\s{4}blocks:\s*\[(.*)\]$/m) || [])[1] || '').split(',').map(x => x.trim()).filter(Boolean);
      assert.strictEqual(sp && sp.trim(), s.spec, `${p.id} names spec ${sp}`);
      assert.ok(bl.length, `${p.id} names no blocks`);
      for (const b of bl) { assert.ok(mods.has(b), `${p.id} block ${b} is not a module of ${s.spec}`); built.add(b); }
    }
    assert.deepStrictEqual([...mods.keys()].filter(k => !built.has(k)), [], `${s.spec}: modules no phase builds`);
  }
});

test('SS-03', 'emerge build order is topological: foundations first even when they are less ready; a cycle stays total', () => {
  const full = (id, deps = []) => ({ id, name: id.toLowerCase(), description: 'd', exports: ['f()→R'], gate_pipeline: ['G'], behavioral_contracts: ['c'], error_paths: ['e'], deps: deps.map(name => ({ name })) });
  const thin = (id, deps = []) => ({ id, name: id.toLowerCase(), description: 'd', deps: deps.map(name => ({ name })) });
  // D is fully specced (most ready) but depends on C → B → A (thin): the old sort put D first
  const r = build({ meta: { name: 't', version: '1' }, modules: [full('D', ['c']), thin('C', ['b']), thin('B', ['a']), thin('A')] });
  const order = r.graph.getBuildOrder().map(n => n.id);
  assert.ok(order.indexOf('A') < order.indexOf('B') && order.indexOf('B') < order.indexOf('C') && order.indexOf('C') < order.indexOf('D'), order.join(' '));
  assert.ok(check(r.graph).violations.every(v => !/build order/.test(v.message || '')), 'no false build-order violation');
  const cyc = build({ meta: { name: 't', version: '1' }, modules: [full('X', ['y']), full('Y', ['x']), full('Z')] });
  assert.strictEqual(cyc.graph.getBuildOrder().length, 3, 'a cycle still gives a total order');
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
