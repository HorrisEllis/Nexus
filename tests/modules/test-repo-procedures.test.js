'use strict';
// PR-01..07 (0.60.118 DK1): a repo's replayable procedures — tool calls kept as .procedure files, replayed in order.
// James, 2026-10-17: "maybe buttons for agent tools, for the repo, to execute. replayable proceedures?"
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'proc-'));
process.env.REPO_PROCEDURES_DIR = path.join(tmp, 'procedures');
process.env.RUN_STATE_DIR = path.join(tmp, 'run-state');
const q = console.log; console.log = () => {};
const P = require('../../lib/repo-procedures.js');
const RS = require('../../lib/run-state.js');
console.log = q;
let passed = 0, failed = 0;
const tests = [];
const test = (n, f) => tests.push([n, f]);
const repoUuid = 'repo-1';

test('PR-01 a procedure saved by hand is a .procedure file that reads back the same', async () => {
  const r = P.save({ repoUuid, name: 'read the readme', steps: [{ tool: 'idearium.code_read', args: { path: 'README.md' } }] });
  assert.ok(r.ok, r.error);
  const f = path.join(process.env.REPO_PROCEDURES_DIR, repoUuid, `${r.procedure.id}.procedure`);
  assert.ok(fs.existsSync(f), 'the file exists');
  assert.ok(/type: procedure/.test(fs.readFileSync(f, 'utf8')), 'a node-export envelope of type procedure');
  const back = P.get(repoUuid, r.procedure.id);
  assert.deepStrictEqual(back.steps, [{ tool: 'idearium.code_read', args: { path: 'README.md' } }]);
});
test('PR-02 a step with no tool or with args that are not an object is refused, naming the step', async () => {
  const r = P.save({ repoUuid, steps: [{ tool: 'a', args: {} }, { tool: '', args: {} }, { tool: 'c', args: 'x' }] });
  assert.strictEqual(r.ok, false); assert.match(r.error, /step 2, 3/);
});
test('PR-03 replay runs each step in order through the injected runner and keeps the run on the file', async () => {
  const s = P.save({ repoUuid, name: 'two', steps: [{ tool: 't1', args: { a: 1 } }, { tool: 't2', args: { b: 2 } }] });
  const seen = [];
  const r = await P.replay(repoUuid, s.procedure.id, { runTool: async (tool, args) => { seen.push([tool, args]); return { ok: true, result: { tool } }; } });
  assert.ok(r.ok); assert.deepStrictEqual(seen, [['t1', { a: 1 }], ['t2', { b: 2 }]]);
  const back = P.get(repoUuid, s.procedure.id);
  assert.strictEqual(back.runCount, 1); assert.strictEqual(back.runs[0].results.length, 2); assert.ok(back.runs[0].ok);
});
test('PR-04 the first failing step stops the replay and is named; later steps do not run', async () => {
  const s = P.save({ repoUuid, name: 'three', steps: [{ tool: 'ok1', args: {} }, { tool: 'bad', args: {} }, { tool: 'never', args: {} }] });
  const seen = [];
  const r = await P.replay(repoUuid, s.procedure.id, { runTool: async (tool) => { seen.push(tool); return tool === 'bad' ? { ok: false, error: 'path is required' } : { ok: true }; } });
  assert.strictEqual(r.ok, false); assert.deepStrictEqual(seen, ['ok1', 'bad']);
  assert.strictEqual(r.run.stoppedAt, 2); assert.strictEqual(r.run.of, 3); assert.match(r.run.results[1].error, /path is required/);
});
test('PR-05 a run\'s tool calls become a procedure; a step whose arguments were cut is left out and named, a failed call skipped', async () => {
  const run = RS.begin({ repoUuid, session: 's1', goal: 'look around' });
  RS.step(run.runId, { name: 'idearium.code_map', arguments: {}, ok: true });
  RS.step(run.runId, { name: 'idearium.code_read', arguments: { path: 'src/a.js' }, ok: true });
  RS.step(run.runId, { name: 'idearium.code_search', arguments: { q: 'x'.repeat(300) }, ok: true });   // kept cut at 110 chars
  RS.step(run.runId, { name: 'idearium.code_read', arguments: {}, ok: false, error: 'path is required' });
  const r = P.fromRun({ repoUuid, runId: run.runId });
  assert.ok(r.ok, r.error);
  assert.deepStrictEqual(r.procedure.steps.map(s => s.tool), ['idearium.code_map', 'idearium.code_read']);
  assert.deepStrictEqual(r.cut.map(c => c.tool), ['idearium.code_search']);
  assert.deepStrictEqual(r.procedure.from, { kind: 'run', runId: run.runId });
});
test('PR-06 remove archives the file, never deletes it; the list no longer shows it', async () => {
  const s = P.save({ repoUuid, name: 'gone', steps: [{ tool: 't', args: {} }] });
  const r = P.remove(repoUuid, s.procedure.id);
  assert.ok(r.ok && fs.existsSync(r.archived));
  assert.ok(!P.list(repoUuid).some(p => p.id === s.procedure.id));
});
test('PR-07 the procedures persist: a fresh module reads them back from disk', async () => {
  const n = P.list(repoUuid).length;
  delete require.cache[require.resolve('../../lib/repo-procedures.js')];
  const P2 = require('../../lib/repo-procedures.js');
  assert.strictEqual(P2.list(repoUuid).length, n); assert.ok(n >= 4);
});
(async () => {
  for (const [n, f] of tests) { try { await f(); console.log('  ✓ ' + n); passed++; } catch (e) { console.log('  ✗ ' + n + '\n    ' + String(e.message).split('\n')[0]); failed++; } }
  console.log(`\n  ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
