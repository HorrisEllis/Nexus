'use strict';
/**
 * tests/modules/test-setup-job-settles.test.js — 0.39.344. James: "okay its stuck." (his screenshot: the setup at
 * "ready: …base.qcow2", still "setting up · 38:24", and the Environment page reading "running — [object Object]")
 *
 *   SJ-01  a setup that writes its result and never exits is settled on its result line: done, not running
 *   SJ-02  a process still alive after its result is stopped after the linger window, and the log says so
 *   SJ-03  a failed result settles as failed, with its error
 *   SJ-04  the Environment page shows the last log line's text, never [object Object]
 *   SJ-05  provision exits once its result is written
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const ROOT = path.join(__dirname, '../..');
const SJ = require(path.join(ROOT, 'cos/testenv/setup-job.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e.message}`); failed++; }
}
// a provision that says ready, writes its result, and never exits
function lingering(result) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.exitCode = null; child.signalCode = null; child.pid = 4242; child.killed = false;
  child.kill = () => { child.killed = true; child.signalCode = 'SIGTERM'; setImmediate(() => child.emit('exit', null)); };
  setImmediate(() => {
    child.stdout.emit('data', JSON.stringify({ msg: 'ready: C:\\\\Users\\\\x\\\\base.qcow2' }) + '\n');
    child.stdout.emit('data', JSON.stringify({ result }) + '\n');
  });
  return child;
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  let child;
  await test('SJ-01', 'result written, process never exits → done, not running', async () => {
    SJ.start({ _spawn: () => (child = lingering({ ok: true, image: 'base.qcow2' })), _lingerMs: 200 });
    await wait(30);
    const st = SJ.status();
    assert.strictEqual(st.state, 'done', JSON.stringify(st).slice(0, 300));
    assert.ok(st.endedAt);
  });

  await test('SJ-02', 'still alive after its result → stopped, and said', async () => {
    await wait(300);
    assert.strictEqual(child.killed, true);
    assert.ok(SJ.status().log.some(e => /did not exit — stopped it/.test(e.msg)));
    assert.strictEqual(SJ.status().state, 'done', 'stopping it does not turn done into failed');
  });

  await test('SJ-03', 'a failed result settles as failed', async () => {
    SJ.start({ _spawn: () => lingering({ ok: false, error: 'the image did not boot' }), _lingerMs: 50 });
    await wait(30);
    const st = SJ.status();
    assert.strictEqual(st.state, 'failed');
    assert.strictEqual(st.result.error, 'the image did not boot');
    await wait(100);
  });

  await test('SJ-04', 'the Environment page reads the log line\'s text', () => {
    const src = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/repo-environment.js'), 'utf8');
    assert.ok(/e\.msg \|\| e\.text/.test(src), 'a log entry is { msg }, not { text }');
  });

  await test('SJ-05', 'provision exits once its result is written', () => {
    const src = fs.readFileSync(path.join(ROOT, 'cos/testenv/provision.js'), 'utf8');
    assert.ok(/process\.stdout\.write\('', \(\) => process\.exit\(process\.exitCode\)\)/.test(src));
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
