'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-pipeline-nodes.test.js — 0.60.162: the build pipeline is persistent, and a derived plan names its files.
 *
 * James, 2026-10-19: "look at the node taxonomy." · "yes it should all be persistent." · "need to get the pipeline working."
 *   PN-01  derivePlan gives every phase at least one file (spec paths when it names them, else a convention) — so DG2 (lib/phase-graph.js)
 *          can build a graph and the build does not refuse NO_GRAPH ("it names no file it changes … mapping source: none")
 *   PN-02  phaseNode / graphNode / gateNode build node-export envelopes that validate against their schemas (.phase .graph .gate)
 *   PN-03  writeNode persists an envelope and it round-trips through node-export importFromFile (survives a restart)
 *   PN-04  the taxonomy knows the three types (lib/node-export.js KNOWN_TYPES) — a type not in it cannot be written
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const SP = require('../../idearium/repo/spec-plan.js');
const PN = require('../../lib/pipeline-nodes.js');
const NE = require('../../lib/node-export.js');
const NS = require('../../lib/node-schemas.js');
if (NS.loadAll) NS.loadAll();

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}

test('PN-01', 'derivePlan names a file for every phase (spec paths, else a convention)', () => {
  // a spec that names a path in one section and names none in another
  const specText = [
    '# Thing', '',
    '## format', 'Parse the input in `lib/format.js` and emit a record.', '',
    '## route', 'Expose a route for it (the spec names no path here).', '',
  ].join('\n');
  const r = SP.derivePlan({ specPath: 'docs/thing-phasemap.spec', specText, reason: 'test' });
  assert.ok(r.ok, `derivePlan not ok: ${JSON.stringify(r.problems)}`);
  const lines = (r.text.match(/^\s+files: \[[^\]]*\]/gm) || []);
  assert.ok(lines.length >= 2, `expected a files line per phase, got ${lines.length}`);
  for (const l of lines) assert.ok(!/files: \[\s*\]/.test(l), `a phase has empty files — DG2 would refuse it: ${l.trim()}`);
  assert.ok(/lib\/format\.js/.test(r.text), 'the path the spec named is used');
  // validatePlan reads the files back
  const v = SP.validatePlan(r.text, 'thing-phasemap');
  assert.ok(v.phases.every(p => p.files.length >= 1), 'every parsed phase has at least one file');
});

test('PN-02', 'phaseNode / graphNode / gateNode build envelopes that validate against their schemas', () => {
  const g = PN.graphNode({ for: 'SP0_format', hash: 'abc123', ready: true,
    nodes: [{ path: 'lib/format.js', role: 'changes', exists: false, system: 'core' }],
    edges: [{ from: 'lib/format.js', to: 'lib/x.js' }], crossings: [] }, { repo: 'r1', kind: 'phase' });
  const p = PN.phaseNode({ id: 'SP0_format', map: 'docs/thing-phasemap.spec', repo: 'r1', layer: 'foundation',
    files: ['lib/format.js'], depends_on: [], spec: 'docs/thing.spec', graph: 'abc123' });
  const ga = PN.gateNode({ gate: 'precommit', contract: 'c1', repo: 'r1', status: 'HELD', packetHash: 'h', attempts: 1 });
  for (const env of [g, p, ga]) {
    NE.validate(env);
    const r = NS.checkPayload(env.type, env.payload);
    assert.ok(r.ok, `${env.type} payload failed schema: ${JSON.stringify(r)}`);
  }
  assert.strictEqual(g.id, 'phase:SP0_format:abc123', 'graph node id is kind:for:hash');
  assert.strictEqual(p.id, 'docs_thing-phasemap.spec::SP0_format', 'phase node id is map::id');
  assert.strictEqual(ga.id, 'precommit', 'gate node id is the gate key');
});

test('PN-03', 'writeNode persists an envelope and it round-trips', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pn-'));
  try {
    const g = PN.graphNode({ for: 'SP0_format', hash: 'deadbeef', ready: true, nodes: [], edges: [], crossings: [] }, { repo: 'r1' });
    const fp = PN.writeNode(g, dir);
    assert.ok(fs.existsSync(fp), 'the node file was written');
    const back = NE.importFromFile(fp);
    assert.strictEqual(back.id, g.id, 'id survives');
    assert.strictEqual(back.payload.hash, 'deadbeef', 'payload survives');
    assert.strictEqual(back.type, 'graph', 'type survives');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('PN-04', 'the taxonomy knows phase, graph and gate (KNOWN_TYPES)', () => {
  for (const t of ['phase', 'graph', 'gate']) assert.ok(NE.KNOWN_TYPES.includes(t), `KNOWN_TYPES is missing "${t}"`);
  assert.throws(() => NE.wrap('not_a_type', 'x', {}), /unknown type/, 'an unknown type is refused');
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
