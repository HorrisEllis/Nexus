'use strict';
/**
 * tests/modules/test-root-findings-not-phases.test.js — NF1 (0.60.225)
 * His run, 2026-10-23: RF2_shared_data_directory_is_the_root_of_the_crash (a `root_findings:` entry, "Not phases" in its own
 * map) was offered as a phase and sent to Gemini. Gemini changed nothing and wrote a spec; the gate failed contract-incomplete.
 *
 *   NF-01  loom reads a root_findings entry as kind 'finding'; a phase in the same map stays a phase
 *   NF-02  the roadmap carries kind 'finding' to the phases manager
 *   NF-03  the DAG holds a finding as closed (never open, never queued), so a phase citing it is not blocked
 *   NF-04  the real 09-05 map: RF2 is a finding
 *   NF-05  wired: _phaseBuild refuses a decision or a finding (409 NOT_A_PHASE); the Phases card labels it
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const L = require(path.join(ROOT, 'loom/scanners/phasemap-map.js'));
const D = require(path.join(ROOT, 'lib/phase-dag.js'));

let passed = 0, failed = 0;
const pending = [];
function test(id, desc, fn) {
  pending.push((async () => {
    try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
    catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
  })());
}

const MAP = `spec:
  meta:
    name: t-phasemap
  root_findings:
    RF1_the_store_is_shared:
      evidence: >
        guardian/config.js points at cortex's directory
  phases:
    P1_split_the_store:
      status: OPEN
      depends_on: [RF1_the_store_is_shared]
      files: [guardian/config.js]
`;

test('NF-01', 'a root_findings entry is a finding; a phase stays a phase', () => {
  const ps = L.parsePhasemapText(MAP, 'docs/t-phasemap.spec');
  const rf = ps.find(p => p.id === 'RF1_the_store_is_shared');
  const p1 = ps.find(p => p.id === 'P1_split_the_store');
  assert.strictEqual(rf.kind, 'finding');
  assert.strictEqual(p1.kind, undefined);
});

test('NF-02', 'the roadmap carries kind finding', async () => {
  const R = await import(path.join(ROOT, 'idearium/repo/roadmap.js'));
  const rm = R.buildRoadmap({ projectId: 't', maps: [{ path: 'docs/t-phasemap.spec', text: MAP }] });
  const rf = rm.phases.find(p => p.phase_key === 'RF1_the_store_is_shared');
  assert.ok(rf, 'the finding is still listed (no count changes)');
  assert.strictEqual(rf.kind, 'finding');
  assert.strictEqual(rm.phases.find(p => p.phase_key === 'P1_split_the_store').kind, undefined);
});

test('NF-03', 'the DAG holds a finding closed; the phase citing it is not blocked by it', () => {
  const dag = D.build([{ path: 'docs/t-phasemap.spec', text: MAP }]);
  const rf = dag.nodes['docs/t-phasemap.spec::RF1_the_store_is_shared'];
  assert.ok(rf.finding && rf.done);
  const sl = D.slice(dag, 'docs/t-phasemap.spec::P1_split_the_store');
  assert.ok(!(sl.blockedBy || []).some(k => /RF1/.test(typeof k === 'string' ? k : k.key)), JSON.stringify(sl.blockedBy));
});

test('NF-04', 'the real 09-05 map: RF2 is a finding', () => {
  const rel = 'docs/2026-09-05-observability-sovereignty-and-agent-mesh-phasemap.spec';
  const ps = L.parsePhasemapText(fs.readFileSync(path.join(ROOT, rel), 'utf8'), rel);
  assert.strictEqual(ps.find(p => p.id === 'RF2_shared_data_directory_is_the_root_of_the_crash').kind, 'finding');
});

test('NF-05', 'wired: the build refuses NOT_A_PHASE; the card labels a finding', () => {
  const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
  assert.ok(/node\.kind === 'decision' \|\| node\.kind === 'finding'[\s\S]{0,200}NOT_A_PHASE/.test(api));
  assert.ok(/p\.kind === 'finding'/.test(fs.readFileSync(path.join(ROOT, 'idearium/ui/js/phases.js'), 'utf8')));
});

Promise.all(pending).then(() => {
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
});
