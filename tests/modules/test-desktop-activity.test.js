'use strict';
/**
 * tests/modules/test-desktop-activity.test.js — §0.39.370 DT1: the repo's desktop (COS) is a source of its activity.
 * James: "hooks into the desktop envirement."
 *   DA-01  a run in the repo's compartment (lib/cos-run.js) is a 'run' task: started, then passed with its count
 *   DA-02  a run that fails names the files that failed; a refused run says why
 *   DA-03  both are rows of the repo's activity log
 *   DA-04  the desktop setup (cos/testenv/setup-job.js) tells whoever started it each step and its end (onEvent)
 *   DA-05  the repo's setup route makes it a 'setup' task: provision's lines as steps, ready or failed at the end
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const ROOT = path.join(__dirname, '..', '..');
const CR = require(path.join(ROOT, 'lib/cos-run.js'));
const RAct = require(path.join(ROOT, 'lib/repo-activity.js'));
const AL = require(path.join(ROOT, 'lib/activity-log/compartment.js'));
const SJ = require(path.join(ROOT, 'cos/testenv/setup-job.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e.message}`); failed++; }
}

(async () => {
  console.log('\n⬡  THE DESKTOP INTO THE LOG — runs and the setup are the repo\'s tasks\n');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'da-'));
  fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = 1;\n');
  const cb = require(path.join(ROOT, 'lib/cos-bridge.js'));
  const comp = cb.createCompartment({ name: `da-${Date.now()}` }).compartment;
  const repo = { uuid: `da-repo-${Date.now()}`, compartmentId: comp.id };
  const runs = () => RAct.list(repo.uuid).tasks.filter(t => t.kind === 'run');

  await test('DA-01', "a run in the compartment is a 'run' task: started, then passed with its count", async () => {
    const r = await CR.run({ repo, repoDir: dir, compartment: comp, option: 'check.syntax' });
    assert.ok(r.ok && r.failed === 0, JSON.stringify(r.errors || r.runs));
    const t = runs()[0];
    assert.ok(t && t.status === 'done' && /check\.syntax/.test(t.title), JSON.stringify(t));
    assert.match(t.steps[t.steps.length - 1].text, /done in .*1\/1 passed|done in/);
  });

  await test('DA-02', 'a failing run names what failed; a refused run says why', async () => {
    fs.writeFileSync(path.join(dir, 'broken.js'), 'function (\n');
    const r = await CR.run({ repo, repoDir: dir, compartment: comp, option: 'check.syntax' });
    assert.ok(r.ok && r.failed > 0, 'the run itself happened');
    const t = runs().find(x => x.status === 'failed' && /broken\.js/.test((x.result || {}).error || ''));
    assert.ok(t, JSON.stringify(runs().map(x => [x.status, x.result && x.result.error])));
    const refused = await CR.run({ repo: { uuid: repo.uuid }, repoDir: dir, option: 'check.syntax' });
    assert.ok(!refused.ok);
    assert.ok(runs().some(x => x.status === 'failed' && /no COS compartment/.test((x.result || {}).error || '')));
  });

  await test('DA-03', 'each run is in the repo\'s activity log: started, then ok or failed', () => {
    const rows = AL.list(repo.uuid, { kind: 'task.run', limit: 50 }).rows;
    assert.strictEqual(rows.filter(x => x.status === 'running').length, 3);
    assert.deepStrictEqual(rows.filter(x => x.status !== 'running').map(x => x.status).sort(), ['failed', 'failed', 'ok']);
  });

  await test('DA-04', 'the setup tells whoever started it each step and its end', async () => {
    const heard = [];
    const fake = () => {
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      child.exitCode = null; child.signalCode = null; child.pid = 1; child.kill = () => { child.signalCode = 'SIGTERM'; };
      setImmediate(() => {
        child.stdout.emit('data', JSON.stringify({ msg: 'downloading the Debian image' }) + '\n');
        child.stderr.emit('data', 'qemu-img: warning\n');
        child.stdout.emit('data', JSON.stringify({ result: { ok: true } }) + '\n');
        child.exitCode = 0; child.emit('exit', 0);
      });
      return child;
    };
    SJ.start({ _spawn: fake, _lingerMs: 50, onEvent: (e) => heard.push(e) });
    await new Promise(r => setTimeout(r, 80));
    assert.deepStrictEqual(heard.map(e => e.kind), ['step', 'step', 'end'], JSON.stringify(heard));
    assert.strictEqual(heard[1].stderr, true);
    assert.strictEqual(heard[2].result.ok, true);
  });

  await test('DA-05', "the repo's setup route makes it a 'setup' task (provision lines as steps)", () => {
    const bs = fs.readFileSync(path.join(ROOT, 'idearium/api/build-surface.js'), 'utf8');
    assert.ok(/RAct\.begin\(\{ repoUuid: uuid, kind: 'setup'/.test(bs) && /RAct\.note\(task, e\.msg, e\.stderr\)/.test(bs) && /setup-job\.js'\)\.start\(\{[^}]*onEvent \}\)/.test(bs));
    // the same shape, driven: a setup task with its steps and its end
    const t = RAct.begin({ repoUuid: repo.uuid, kind: 'setup', message: 'set up the desktop — desktop', provider: 'cos · testenv' });
    RAct.note(t, 'downloading the Debian image'); RAct.note(t, 'qemu-img: warning', true);
    RAct.end(t, { ok: true, text: 'the desktop is ready' });
    const s = RAct.list(repo.uuid).tasks.find(x => x.kind === 'setup');
    assert.ok(s.status === 'done' && s.steps.some(x => x.bad && /warning/.test(x.text)));
  });

  console.log(`\n  ${passed} passed · ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
