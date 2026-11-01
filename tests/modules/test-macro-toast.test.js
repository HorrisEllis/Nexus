'use strict';
/**
 * tests/modules/test-macro-toast.test.js — MB4: the macro toast's controls on the real runner and the real recorder. 0.60.359.
 * James, 2026-11-01: "also the macro toast for playback and recording, shows what step your on, out of how many. with a pause and skip, goes
 * back one step." Map: docs/2026-11-01-macro-blocks-phasemap.spec MB4.
 *   MT-01 playback reports step i of n for every step, and done
 *   MT-02 pause holds the run before the next step; resume goes on
 *   MT-03 skip passes a step (said in the results); back runs the step before again
 *   MT-04 stop ends the run where it is, said
 *   MT-05 recording: pause keeps nothing that happens; back drops the last step; each change reported with its step count
 */
require('../../lib/test-sandbox.js').ensure();
process.env.JAA_DATA_DIR = require('path').join(require('os').tmpdir(), `mt-test-${Date.now()}`);
const assert = require('assert'), path = require('path'), fs = require('fs'), os = require('os');
const ROOT = path.join(__dirname, '..', '..');
const M = require(path.join(ROOT, 'lib/agent-tools/tools/clear-glass/macro.js'));
const { createControl } = require(path.join(ROOT, 'lib/agent-tools/tools/clear-glass/macro-control.js'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 3).join('\n    ')}`); failed++; } }
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
const steps = ['a', 'b', 'c', 'd'].map(s => ({ action: 'navigate', data: { url: `about:blank#${s}` } }));
const runner = () => { const ran = []; return { ran, runStep: async ({ data }) => { ran.push(data.url.slice(-1)); await tick(5); return { ok: true, result: {} }; } }; };

(async () => {
  console.log('\n⬡  the macro toast (MB4)\n');
  const c = await M.execute({ action: 'create', name: 'mt-four', urlPattern: null, steps });
  assert.ok(!c.error, c.error);

  await test('MT-01', 'playback reports step i of n for every step, and done', async () => {
    const seen = []; const ctl = createControl({ name: 'mt-four', onChange: (s) => seen.push(s) }); const p = runner();
    const r = await M.execute({ action: 'run', name: 'mt-four', agentId: 'x', skipSnapshot: true, runStep: p.runStep, control: ctl });
    assert.ok(r.ok, r.error);
    assert.deepStrictEqual([...new Set(seen.filter(s => !s.done).map(s => `${s.i + 1}/${s.n}`))], ['1/4', '2/4', '3/4', '4/4']);
    assert.ok(seen[seen.length - 1].done && seen[seen.length - 1].ok);
  });

  await test('MT-02', 'pause holds the run before the next step; resume goes on', async () => {
    const ctl = createControl({ name: 'mt-four' }); const p = runner();
    ctl.pause();
    const run = M.execute({ action: 'run', name: 'mt-four', agentId: 'x', skipSnapshot: true, runStep: p.runStep, control: ctl });
    await tick(120); assert.deepStrictEqual(p.ran, [], 'a step ran while paused');
    assert.strictEqual(ctl.state().paused, true);
    ctl.resume(); const r = await run; assert.ok(r.ok); assert.deepStrictEqual(p.ran, ['a', 'b', 'c', 'd']);
  });

  await test('MT-03', 'skip passes a step (said); back runs the step before again', async () => {
    // driven by the run's own reports: at step a skip; at step c (first time) go back; so b runs twice
    let backed = false;
    const ctl = createControl({ name: 'mt-four', onChange: (s) => { if (s.done) return; if (s.i === 0 && !ctl.state().done && !ctl._skipped) { ctl._skipped = true; setImmediate(() => ctl.skip()); } if (s.i === 2 && !backed) { backed = true; setImmediate(() => ctl.back()); } } });
    ctl.pause();   // each turn waits until the report above answers it
    const p = runner();
    const orig = ctl.turn; ctl.turn = async (i, n, st) => { ctl.pause(); return orig(i, n, st); };
    setTimeout(() => {}, 0);
    const watcher = setInterval(() => { const s = ctl.state(); if (s.paused && !(s.i === 0 && !ctl._skipped) && !(s.i === 2 && !backed)) ctl.resume(); }, 10);
    const r = await M.execute({ action: 'run', name: 'mt-four', agentId: 'x', skipSnapshot: true, runStep: p.runStep, control: ctl });
    clearInterval(watcher);
    assert.ok(r.ok, r.error);
    assert.deepStrictEqual(p.ran, ['b', 'b', 'c', 'd'], JSON.stringify(p.ran));
    assert.ok(r.results.some(x => x.step === 0 && x.skipped && x.by === 'person'));
  });

  await test('MT-04', 'stop ends the run where it is, said', async () => {
    const ctl = createControl({ name: 'mt-four' }); const p = runner(); ctl.pause();
    const run = M.execute({ action: 'run', name: 'mt-four', agentId: 'x', skipSnapshot: true, runStep: p.runStep, control: ctl });
    await tick(40); ctl.stop(); const r = await run;
    assert.deepStrictEqual([r.ok, r.stopped, p.ran.length], [false, true, 0]); assert.ok(/stopped by a person at step 1 of 4/.test(r.error));
    assert.ok(ctl.state().done);
  });

  await test('MT-05', 'recording: pause keeps nothing; back drops the last step; each change reported', async () => {
    const { LiveRecorder } = require(path.join(ROOT, 'clear-glass/src/macros/live-recording.js'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-rec-'));
    let queue = []; const said = [];
    const wc = { on() {}, removeListener() {} };
    const R = new LiveRecorder({ dir, getWebContents: () => wc, evalJs: async (w, code) => (/start|INSTALL|location/.test(code) && !/splice|drain|DRAIN/i.test(code) ? 'about:blank' : (() => { const q = queue; queue = []; return q; })()),
      setTimer: () => 0, clearTimer: () => {}, onProgress: (s) => said.push(s) });
    const st = await R.start({ agentId: 't', name: 'mt-rec' }); assert.ok(st.ok, st.error);
    const click = (sel, ts) => ({ type: 'click', sel, ts });
    queue = [click('#a', 1)]; await R.flush('t');
    queue = [click('#b', 2)]; await R.flush('t');
    const two = R.status('t').steps;
    R.pause('t'); queue = [click('#c', 3)]; await R.flush('t');
    assert.strictEqual(R.status('t').steps, two, 'a paused recording kept a step');
    R.resume('t'); R.back('t');
    assert.strictEqual(R.status('t').steps, two - 1, 'back did not drop the last step');
    assert.ok(said.some(s => s.kind === 'recording' && s.paused) && said.some(s => s.i === two - 1), JSON.stringify(said.slice(-3)));
    const done = await R.stop('t'); assert.ok(done.ok); assert.ok(said[said.length - 1].done);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
