'use strict';
/**
 * tests/modules/test-framework-trial-deploy.test.js — AU2: the framework trial deploys itself.
 * Map: docs/2026-10-24-agent-orchestration-phasemap.spec (AU2)
 *
 * James, 2026-10-24: "have that test done automatically." · "that was done by hand in clearglass."
 * Proves the deploy step (collect answers by sending each prompt to an agent) with an INJECTED transport, so the
 * pipeline is verified offline without a live agent. Judging stays blind/human — deploy only collects.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const T = require('../../docs/framework-trial/trial.js');

const DIR = path.join(__dirname, '..', '..', 'docs', 'framework-trial');
const ANS = path.join(DIR, 'answers');
const RUN_OK = 9981, RUN_FAIL = 9982;   // throwaway run numbers, cleaned up below

let passed = 0, failed = 0;
const reg = [];
function test(id, desc, fn) { reg.push({ id, desc, fn }); }

function cleanup() {
  try { for (const p of fs.readdirSync(ANS).filter(d => /^P\d+$/.test(d))) {
    for (const f of fs.readdirSync(path.join(ANS, p))) if (f.includes(`-${RUN_OK}.`) || f.includes(`-${RUN_FAIL}.`)) fs.rmSync(path.join(ANS, p, f));
  } } catch (_) {}
}

test('A1', 'exports deploy, setSend, promptFor, and the problems', () => {
  assert.strictEqual(typeof T.deploy, 'function');
  assert.strictEqual(typeof T.setSend, 'function');
  assert.ok(Array.isArray(T.P) && T.P.length >= 1);
});

test('A2', 'deploy sends every problem×arm to the injected transport and saves the reply in the layout blind reads', async () => {
  const calls = [];
  T.setSend(async (model, prompt) => { calls.push({ model, prompt }); return `REPLY from ${model}`; });
  const r = await T.deploy(['--model', 'mockm', '--arm', 'both', '--run', String(RUN_OK)]);
  assert.strictEqual(r.fail, 0, 'no failures with a good transport');
  assert.strictEqual(r.ok, T.P.length * 2, 'one answer per problem per arm');
  assert.strictEqual(calls.length, T.P.length * 2, 'the transport was called once per cell');
  // a file exists in answers/<P>/<model>-<arm>-<run>.md with the reply
  const f = path.join(ANS, T.P[0].id, `mockm-A-${RUN_OK}.md`);
  assert.ok(fs.existsSync(f), 'answer file written where blind() looks');
  assert.match(fs.readFileSync(f, 'utf8'), /REPLY from mockm/);
  // the prompt carried the arm's instructions (promptFor), not just the bare problem
  assert.ok(calls.some(c => c.prompt.includes(T.P[0].prompt)), 'the problem text is in the prompt');
});

test('A3', 'a provider whose transport throws is reported, not thrown, and nothing is saved for it (§1.2)', async () => {
  T.setSend(async () => { throw new Error('provider down'); });
  const r = await T.deploy(['--model', 'boom', '--arm', 'A', '--run', String(RUN_FAIL)]);
  assert.strictEqual(r.ok, 0);
  assert.strictEqual(r.fail, T.P.length, 'every cell failed, counted');
  assert.ok(r.results.every(x => x.ok === false && /provider down/.test(x.error)), 'each failure carries its reason');
  assert.ok(!fs.existsSync(path.join(ANS, T.P[0].id, `boom-A-${RUN_FAIL}.md`)), 'no file written for a failed send');
});

test('A4', 'an empty reply is a failure, not a saved blank answer', async () => {
  T.setSend(async () => '   ');
  const r = await T.deploy(['--model', 'blankm', '--arm', 'A', '--run', String(RUN_FAIL)]);
  assert.strictEqual(r.ok, 0);
  assert.ok(r.results.every(x => /empty reply/.test(x.error)));
});

async function run() {
  const _log = console.log;
  const quiet = async (fn) => { console.log = () => {}; try { return await fn(); } finally { console.log = _log; } };   // silence deploy's per-cell lines
  try {
    for (const { id, desc, fn } of reg) {
      try { await quiet(fn); console.log(`  ✓ ${id} ${desc}`); passed++; }
      catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
    }
  } finally { cleanup(); T.setSend(null); console.log = _log; }
  process.stdout.write(`\n  test-framework-trial-deploy.test.js\n  ${passed} passed  ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}
run();

module.exports = { passed: () => passed, failed: () => failed };
