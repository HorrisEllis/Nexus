'use strict';
/**
 * tests/modules/test-copilot-orchestrates.test.js — PC29 b: a request to Copilot becomes a pipeline run in COS
 * James, 2026-11-25: "Need copilot to orchastrate nexus." (Nexus's Copilot) · "everything goes to the pipeline. each request."
 *
 *   CO-01  "build EMB10" is a pipeline request; "build a house" and questions are not
 *   CO-02  the pipeline that builds the phase is found and started through the command table, his words as RAID's proof
 *   CO-03  none, or more than one, is said, never guessed; a refusal is said with its reason
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const path = require('path');
const I = require(path.join(__dirname, '..', '..', 'copilot', 'intents.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 3).join('\n    ')}`); failed++; } }
const P = (id, name, phase) => ({ id, name, tasks: [{ id: 'build', step: { type: 'script', config: { script: 'build-phase.js', input: { phase } } } }] });
const fake = (pipelines, start = { result: { ok: true, runId: 'r-1' } }) => { const calls = [];
  return { calls, execute: async (i, ctx) => { calls.push({ command: i.command, args: i.args, flags: i.flags, agent: ctx && ctx.agent }); return i.command === 'cos pipelines' ? { result: { pipelines } } : start; } }; };

(async () => {
  console.log('\n⬡  Copilot orchestrates Nexus: a request is a run (PC29 b)\n');
  await test('CO-01', '"build EMB10" is a pipeline request; others are not', async () => {
    for (const s of ['build EMB10', 'build the EMB10', 'run PC26', 'start EMB3']) assert.strictEqual(I.classifyIntent(s), 'pipeline', s);
    for (const s of ['build a house', 'what is EMB10', 'tell me about PC26']) assert.notStrictEqual(I.classifyIntent(s), 'pipeline', s);
  });
  await test('CO-02', 'the pipeline that builds the phase is started through the command table, his words as the proof', async () => {
    const C = fake([P('a', 'Build EMB10', 'EMB10_the_engine_decisions_in_emerge'), P('b', 'Build EMB11', 'EMB11_x')]);
    const r = await I.handlePipeline('build EMB10 please', { command: C });
    assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.pipelineId, 'a'); assert.strictEqual(r.runId, 'r-1');
    const s = C.calls.find((c) => c.command === 'cos pipeline-start');
    assert.deepStrictEqual([s.args, s.agent], [['a'], 'copilot']); assert.match(s.flags.why, /his request to Copilot: "build EMB10 please"/);
  });
  await test('CO-03', 'none or several are said, never guessed; a refusal is said with its reason', async () => {
    let r = await I.handlePipeline('build ZZ9', { command: fake([P('a', 'x', 'EMB10_y')]) }); assert.match(r.text, /No pipeline in COS builds ZZ9/);
    const two = fake([P('a', 'one', 'EMB10_y'), P('b', 'two', 'EMB10')]);
    r = await I.handlePipeline('build EMB10', { command: two }); assert.match(r.text, /2 pipelines build EMB10/); assert.ok(!two.calls.some((c) => c.command === 'cos pipeline-start'), 'nothing started');
    r = await I.handlePipeline('build EMB10', { command: fake([P('a', 'one', 'EMB10_y')], { refused: true, reason: 'RAID did not approve' }) });
    assert.strictEqual(r.ok, false); assert.match(r.text, /did not start "one": RAID did not approve/);
  });
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
