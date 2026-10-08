'use strict';
/**
 * tests/modules/test-phase-proof.test.js — 0.39.303 PH1: a phase run ends in a proof run.
 * James: "It can build it. Piece by piece look at idearium." · "Ollama should be able to start building nexus soon."
 *
 *   PP-01  conditionsFromPhase: a phase's own `conditions:` from its map; none → said, nothing invented from prose
 *   PP-02  feedbackMessage: every unmet promise with what happened and its likely cause; "change nothing that passes"
 *   PP-03  the loop, through the real repo layer, with a stand-in agent: attempt 1 misses a promise → the proof
 *          run catches it → the next attempt's message carries exactly that promise → attempt 2 fixes it → 'proven'
 *   PP-04  an agent that never fixes it → 'unproven' after repos.proof_attempts, naming what is still missing
 *   PP-05  a phase with no conditions → 'no-proof', said, never assumed proven
 *   PP-06  wired: the build chain ends in _provePhase; its two events declared in idearium's taxonomy
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e.message}`); failed++; }
}

const MAP = `spec:
  meta:
    name: fixture
  phases:
    P1_readme:
      layer: interface
      status: OPEN
      does: write the readme
      conditions:
        - says: The project has a readme for the client
          check: { kind: file, path: README.md, contains: Orbit Garden }
        - says: The spec is still there
          check: { kind: file, path: spec/orbit-garden.spec }
    P2_bare:
      layer: interface
      status: OPEN
      does: something with no stated end state
      proof: "prose only"
`;

(async () => {
  console.log('\ntest-phase-proof — a phase run ends in a proof run (0.39.303 PH1)');
  const PR = await imp('idearium/repo/proof-run.js');

  await test('PP-01', "a phase's conditions come from its map; none is said, never invented", async () => {
    const a = PR.conditionsFromPhase(MAP, 'P1_readme');
    assert.strictEqual(a.conditions.length, 2); assert.strictEqual(a.conditions[0].check.kind, 'file');
    assert.match(PR.conditionsFromPhase(MAP, 'P2_bare').source, /declares no conditions/);
    assert.match(PR.conditionsFromPhase(MAP, 'P9_nope').source, /not found/);
    assert.match(PR.conditionsFromPhase('spec: [unclosed', 'P1_readme').source, /does not parse/);
    assert.strictEqual(PR.conditionsFromPhase(MAP + '\n## ADDENDUM x\n# not yaml: [', 'P1').conditions.length, 2, 'addenda below the YAML are ignored; a key prefix finds the phase');
  });

  await test('PP-02', 'the feedback names every unmet promise with what happened and why', async () => {
    const fb = PR.feedbackMessage({ met: 1, total: 2, results: [{ says: 'A', met: true }, { says: 'The readme exists', met: false, evidence: 'README.md does not exist.', cause: 'The file the condition names is not in the project.', output: 'x' }] });
    assert.match(fb, /1 of 2 conditions met/); assert.match(fb, /- The readme exists\n  what happened: README.md does not exist\./); assert.match(fb, /likely cause: The file/); assert.match(fb, /change nothing that already passes/);
    assert.strictEqual(PR.feedbackMessage({ met: 2, total: 2, results: [{ met: true }, { met: true }] }), '');
  });

  process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
  const api = await imp('idearium/api/index.js');
  const R = (m, p, b) => api._route(m, p, b);
  const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
  const realDispatch = RA.dispatch;
  const w = (await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: 'Orbit Garden' })).json.workshop;
  await R('POST', `/api/workshop/${w.uuid}`, { sections: [{ id: 'purpose', body: 'A planner that places garden beds by measured sunlight.' }] });
  const repoUuid = (await R('POST', `/api/workshop/${w.uuid}/save`, {})).json.repoUuid;
  const target = api.getRepoLayer().get(repoUuid);
  const base = (id) => ({ runId: id, repoUuid, targetRepo: repoUuid, map: 'docs/fixture-phasemap.spec', phase: 'P1_readme', title: 'the readme' });

  await test('PP-03', 'attempt 1 misses, the proof catches it, the feedback carries it, attempt 2 fixes it → proven', async () => {
    const seen = [];
    RA.dispatch = async ({ message, session }) => {
      seen.push({ session, message });
      if (/NOT met yet/.test(message) && /The project has a readme for the client/.test(message)) api.getRepoLayer().writeFile(repoUuid, 'README.md', '# Orbit Garden\nPlans beds by sunlight.\n', { preserveWhitespace: true });
      return { ok: true, text: 'done' };
    };
    // attempt 1 is the build the phase run already made — here, it produced no readme
    const r = await api._provePhase({ target, base: base('phrun-pp3'), commitId: 'c1', mapText: MAP, phase: 'P1_readme', message: 'build the readme', dispatch: { provider: 'ollama' } });
    assert.strictEqual(r.state, 'proven', JSON.stringify(r.run && r.run.results));
    assert.strictEqual(r.attempt, 2);
    assert.strictEqual(seen.length, 1, 'one retry');
    assert.match(seen[0].message, /^build the readme\n\nTHE PROOF RUN CHECKED YOUR LAST ATTEMPT: 1 of 2 conditions met/);
    assert.ok(!/The spec is still there/.test(seen[0].message.split('NOT met yet')[1]), 'the met promise is not re-sent as a task');
    assert.strictEqual(seen[0].session, 'phrun-pp3-a2', 'a fresh chat per attempt');
    const report = api.getRepoLayer().readFile(repoUuid, 'proof/PROOF-REPORT.md');
    assert.ok(report && /\*\*READY\.\*\*/.test(report.content), 'the report says READY');
  });

  await test('PP-04', 'an agent that never fixes it → unproven, naming what is still missing', async () => {
    api.getRepoLayer().writeFile(repoUuid, 'README.md', '# Something else\n', { preserveWhitespace: true });
    let calls = 0;
    RA.dispatch = async () => { calls++; return { ok: true, text: 'tried' }; };
    const r = await api._provePhase({ target, base: base('phrun-pp4'), commitId: 'c2', mapText: MAP, phase: 'P1_readme', message: 'build the readme', dispatch: {} });
    assert.strictEqual(r.state, 'unproven'); assert.strictEqual(calls, 1, 'bounded by repos.proof_attempts (default 2)');
    assert.strictEqual(r.run.results.find(x => !x.met).mode, 'content_missing');
    RA.dispatch = async () => ({ ok: false, error: 'provider down' });
    const down = await api._provePhase({ target, base: base('phrun-pp4b'), commitId: 'c3', mapText: MAP, phase: 'P1_readme', message: 'x', dispatch: {} });
    assert.strictEqual(down.state, 'unproven', 'a failed attempt ends the run, said');
  });

  await test('PP-05', 'no conditions → no-proof, never assumed proven', async () => {
    let calls = 0; RA.dispatch = async () => { calls++; return { ok: true }; };
    const r = await api._provePhase({ target, base: { ...base('phrun-pp5'), phase: 'P2_bare' }, commitId: 'c4', mapText: MAP, phase: 'P2_bare', message: 'x', dispatch: {} });
    assert.strictEqual(r.state, 'no-proof'); assert.strictEqual(calls, 0, 'nothing re-run without a judge');
  });
  await test('PP-07', 'no conditions but files → derived: each file exists and each JS file really parses', async () => {
    const map = MAP.replace('      proof: "prose only"\n', '      proof: "prose only"\n      files: [lib/planner.js (the planner), docs/plan.md]\n');
    const d = PR.derivedConditionsFromPhase(map, 'P2_bare');
    assert.deepStrictEqual(d.conditions.map(c => c.says), ['lib/planner.js exists', 'lib/planner.js is valid JavaScript', 'docs/plan.md exists']);
    assert.match(d.source, /derived from phase P2_bare's files/);
    const seen = [];
    RA.dispatch = async ({ message }) => {
      seen.push(message);
      const L = api.getRepoLayer();
      if (seen.length === 1) L.writeFile(repoUuid, 'lib/planner.js', 'module.exports = { plan( ) { return [ }\n', { preserveWhitespace: true });   // broken JS
      else L.writeFile(repoUuid, 'lib/planner.js', 'module.exports = { plan() { return []; } };\n', { preserveWhitespace: true });
      L.writeFile(repoUuid, 'docs/plan.md', '# plan\n', { preserveWhitespace: true });
      return { ok: true };
    };
    process.env.IDEARIUM_TEST_ATTEMPTS = '';
    const r1 = await api._provePhase({ target, base: { ...base('phrun-pp7'), phase: 'P2_bare' }, commitId: 'c5', mapText: map, phase: 'P2_bare', message: 'build the planner', dispatch: {} });
    assert.strictEqual(r1.state, 'unproven', 'attempt 1 wrote nothing, attempt 2 wrote broken JS');
    assert.match(seen[0], /lib\/planner\.js exists/);
    const bad = r1.run.results.find(x => x.says === 'lib/planner.js is valid JavaScript');
    assert.strictEqual(bad.mode, 'command_failed', 'a file only counts once it is real JavaScript');
    const r2 = await api._provePhase({ target, base: { ...base('phrun-pp7b'), phase: 'P2_bare' }, commitId: 'c6', mapText: map, phase: 'P2_bare', message: 'build the planner', dispatch: {} });
    assert.strictEqual(r2.state, 'proven', JSON.stringify(r2.run && r2.run.results.filter(x => !x.met)));
  });
  RA.dispatch = realDispatch;

  await test('PP-06', 'wired: the build chain ends in the proof; its events are declared', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(/_reviewDraft\(\{[^)]*\}\)\)?\s*\n\s*\.catch[^\n]*\n[^\n]*\n\s*\.then\(\(\) => \(\['replied', 'incomplete'\]\.includes\(state\) \? _provePhase\(/.test(src), 'the draft → review → proof chain');
    for (const e of ["'idearium.phase.proven'", "'idearium.phase.attempt.unmet'"]) assert.ok(src.includes(e), e);
    const tax = require(path.join(ROOT, 'idearium/event-taxonomy.cjs'));
    assert.ok(tax.IDEARIUM_PHASE_PROVEN && tax.IDEARIUM_PHASE_ATTEMPT_UNMET);
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 200).unref();
})();
