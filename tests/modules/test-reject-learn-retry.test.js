'use strict';
/**
 * tests/modules/test-reject-learn-retry.test.js — RL1–RL4 (docs/2026-10-16-reject-learn-retry-phasemap.spec), 0.60.105.
 * James: "when i reject a propasal, the agent needs to understand the failure mode ad try again, after learning"
 *        · "why so much regression?"
 *
 *   RL-01  rejectionModes: the evidence names the mode (no-parse, regressed, exports-lost, gutted, decls-lost);
 *          'rejected' with his reason only when nothing else explains it
 *   RL-02  learnRejection logs one fault per mode WITH the phase, so precedent(phase) gives it to the next attempt
 *   RL-03  the lesson text carries the modes, what was lost, and the agent's own diagnosis
 *   RL-04  the reject path runs in order: tell (the modes named) → its diagnosis → the lesson logged → the retry, whose
 *          note carries the lesson and the diagnosis; an agent that does not answer does not hold the retry
 *   RL-05  the agent screen refuses lost exports and a gutted JS file (his intent-hat-router shape); a person is not refused
 *   RL-06  the agent screen refuses a data file cut by over 40% that loses keys (his schema.intent shape, 54 → 31); a
 *          one-value edit passes
 *   RL-07  the door: GET …/lessons through idearium's real router, and the `repo lessons` command row
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 6).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };

(async () => {
  const PF = require(path.join(ROOT, 'lib/phase-faults.js'));
  const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
  const PHASE = `RLX_${Date.now().toString(36)}`;
  const gutted = { path: 'lib/x.js', lines: { before: 124, after: 34 }, symbols: { lost: ['suggestHat', 'route'], added: [] }, exports: { lost: [] }, regressions: 0, tests: { results: [] } };

  await test('RL-01', 'rejectionModes reads the mode off the evidence; his reason alone only when nothing else explains it', async () => {
    assert.deepStrictEqual(PF.rejectionModes(gutted).map(m => m.mode), ['gutted']);
    assert.deepStrictEqual(PF.rejectionModes({ ...gutted, exports: { lost: ['suggestHat'] }, regressions: 2, tests: { results: [{ file: 't.js', verdict: 'REGRESSION' }] } }).map(m => m.mode), ['regressed', 'exports-lost', 'gutted']);
    assert.deepStrictEqual(PF.rejectionModes({ ...gutted, parseError: 'SyntaxError' }).map(m => m.mode)[0], 'no-parse');
    assert.deepStrictEqual(PF.rejectionModes({ ...gutted, lines: { before: 124, after: 120 } }).map(m => m.mode), ['decls-lost']);
    const r = PF.rejectionModes({ ...gutted, lines: { before: 10, after: 10 }, symbols: { lost: [] } }, 'wrong hat');
    assert.deepStrictEqual([r[0].mode, /wrong hat/.test(r[0].why)], ['rejected', true]);
  });

  let lesson = null;
  await test('RL-02', 'learnRejection: one fault per mode, with the phase, so precedent(phase) gives it to the next attempt', async () => {
    lesson = await quiet(() => PF.learnRejection({ node: { uuid: 'inj-1', path: 'lib/x.js', repoUuid: 'r-rl', source: { kind: 'agent' } }, evidence: gutted, reason: 'it deleted half the router',
      run: { phase: PHASE, map: 'docs/x-phasemap.spec', runId: 'run-1' }, diagnosis: 'I sent back only the part I changed.', agent: 'gemini' }));
    assert.strictEqual(lesson.faults.filter(Boolean).length, 1, 'one mode, one fault row');
    const p = PF.precedent(PHASE);
    assert.strictEqual(p.faults.length, 1);
    assert.ok(/sent back a cut-down file/.test(p.text) && /lib\/x\.js/.test(p.text) && /suggestHat/.test(p.text), p.text);
    assert.ok(/it said: I sent back only the part I changed/.test(p.text) && /James: "it deleted half the router"/.test(p.text), p.text);
  });

  await test('RL-03', 'the lesson text: the modes, what was lost, the diagnosis, and the whole-file rule', async () => {
    assert.ok(/gutted: 124 → 34 lines/.test(lesson.text) && /Your own diagnosis when told: I sent back only/.test(lesson.text) && /Send the WHOLE file/.test(lesson.text), lesson.text);
  });

  const api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));
  await test('RL-04', 'reject runs in order: tell (modes named) → diagnosis → lesson logged → retry carrying both; no answer does not hold the retry', async () => {
    const order = []; let toldModes = null, note = null;
    const deps = {
      runForInject: () => ({ phase: PHASE, map: 'docs/x-phasemap.spec', runId: 'run-2', repoUuid: 'r-rl' }),
      tell: async (repo, n, reason, modes) => { order.push('tell'); toldModes = modes.map(m => m.mode); return { ok: true, text: 'I dropped suggestHat because I only rewrote the top.' }; },
      autoRetry: async (run, kind, nt) => { order.push(`retry:${kind}`); note = nt; return { ok: true }; },
    };
    const n = { uuid: 'inj-2', path: 'lib/x.js', repoUuid: 'r-rl', source: { kind: 'agent' }, evidence: gutted };
    const before = PF.precedent(PHASE).faults.length;
    const r = await quiet(() => api._learnFromRejectionForTest({ uuid: 'r-rl' }, n, 'too much deleted', { deps }));
    assert.deepStrictEqual(order, ['tell', 'retry:reject']);
    assert.deepStrictEqual(toldModes, ['gutted']);
    assert.strictEqual(PF.precedent(PHASE).faults.length, before + 1, 'the lesson was logged before the retry was asked');
    assert.ok(/gutted/.test(note) && /Your own diagnosis when told: I dropped suggestHat/.test(note) && /James's reason: too much deleted/.test(note), note);
    assert.strictEqual(r.diagnosis, 'I dropped suggestHat because I only rewrote the top.');
    // the agent does not answer: the retry still goes, on the classified modes
    order.length = 0;
    const r2 = await quiet(() => api._learnFromRejectionForTest({ uuid: 'r-rl' }, { ...n, uuid: 'inj-3' }, null, { deps: { ...deps, tell: async () => { order.push('tell'); return { ok: false, error: 'no answer' }; } } }));
    assert.deepStrictEqual([order, r2.diagnosis, /gutted/.test(note)], [['tell', 'retry:reject'], null, true]);
    // tell:false and retry:false are honoured
    order.length = 0;
    await quiet(() => api._learnFromRejectionForTest({ uuid: 'r-rl' }, { ...n, uuid: 'inj-4' }, null, { tell: false, retry: false, deps }));
    assert.deepStrictEqual(order, []);
  });

  await test('RL-05', 'agent screen: lost exports and a gutted JS file are refused, naming what was lost; a person is not refused', async () => {
    const fns = Array.from({ length: 12 }, (_, i) => `function f${i}(x) {\n  return x + ${i};\n}\n`).join('\n');
    const base = `'use strict';\n${fns}\nmodule.exports = { ${Array.from({ length: 12 }, (_, i) => `f${i}`).join(', ')} };\n`;
    const noExp = base.replace('f11 };', '};').replace(/function f11[\s\S]*?\n}\n/, '');
    const why = await quiet(() => RI.screen({ path: 'lib/y.js', content: noExp, base, byAgent: true }));
    assert.ok(/removes exports the file has \(f11\)/.test(why || ''), why);
    const kept = `'use strict';\n${Array.from({ length: 3 }, (_, i) => `function f${i}(x) {\n  return x + ${i};\n}\n`).join('\n')}\nconst f3 = 0, f4 = 0, f5 = 0, f6 = 0, f7 = 0, f8 = 0, f9 = 0, f10 = 0, f11 = 0;\nmodule.exports = { ${Array.from({ length: 12 }, (_, i) => `f${i}`).join(', ')} };\n`;
    const why2 = await quiet(() => RI.screen({ path: 'lib/y.js', content: kept, base, byAgent: true }));
    assert.ok(/cut the file from \d+ lines to \d+ and lose/.test(why2 || ''), `gutted, exports kept by name: ${why2}`);
    assert.strictEqual(await quiet(() => RI.screen({ path: 'lib/y.js', content: noExp, base, byAgent: false })), null, 'a person may');
    assert.strictEqual(await quiet(() => RI.screen({ path: 'lib/y.js', content: base.replace('x + 3', 'x + 30'), base, byAgent: true })), null, 'a real edit passes');
  });

  await test('RL-06', 'agent screen: his schema.intent cut 54 → 31 losing keys is refused; a one-value edit passes', async () => {
    const s = fs.readFileSync(path.join(ROOT, 'lib/node-schemas/schema.intent'), 'utf8');
    const cut = s.split('\n').slice(0, 20).concat(['  fields:', '    name:', '      type: string']).join('\n') + '\n'.repeat(8);
    const why = await quiet(() => RI.screen({ path: 'lib/node-schemas/schema.intent', content: cut, base: s, byAgent: true }));
    assert.ok(/lose \d+ declaration\(s\) or key\(s\) \(payload\.fields\./.test(why || ''), why);
    assert.strictEqual(await quiet(() => RI.screen({ path: 'lib/node-schemas/schema.intent', content: s.replace('summary: null', 'summary: hats'), base: s, byAgent: true })), null);
  });

  await test('RL-07', 'the door: GET …/lessons on the real router; the repo lessons command row', async () => {
    const L = api.getRepoLayer();
    const made = await quiet(async () => L.ingest({ name: `rl-${Date.now()}`, source: 'test', compartmentId: 'c-rl', files: [{ path: 'a.js', content: 'module.exports = 1;\n' }] }));
    const u = made && made.repo && made.repo.uuid;
    assert.ok(u, JSON.stringify(made && made.error));
    await quiet(() => PF.learnRejection({ node: { uuid: 'inj-5', path: 'a.js', repoUuid: u, source: { kind: 'agent' } }, evidence: gutted, run: { phase: PHASE, map: 'm', runId: 'r5' } }));
    const r = await quiet(() => api._route('GET', `/api/repos/${u}/lessons?phase=${PHASE}`));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.ok(r.json.faults.length >= 1 && r.json.faults.every(f => f.meta.repoUuid === u) && /WHAT WENT WRONG/.test(r.json.precedent), JSON.stringify(r.json).slice(0, 400));
    assert.strictEqual((await quiet(() => api._route('GET', '/api/repos/nope/lessons'))).status, 404);
    const RC = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const row = (RC.SPEC || RC.ROWS || RC.rows || []).find(x => x.key === 'repo.lessons');
    assert.ok(row, 'the command row exists');
    assert.strictEqual(row.req({ repo: { uuid: u }, flags: { phase: PHASE }, args: [] }).path, `/api/repos/${u}/lessons?phase=${PHASE}`);
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
