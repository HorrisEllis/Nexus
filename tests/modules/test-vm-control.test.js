'use strict';
/**
 * tests/modules/test-vm-control.test.js — §0.39.371 VM1 + CK1.
 * James: "I want to use snapshots, pause, rewind, etc. like full VMware style. Not actual VMware."
 * A stand-in QEMU speaks QMP on a unix socket the way QEMU does (greeting, qmp_capabilities, query-status, stop, cont,
 * human-monitor-command savevm / loadvm / info snapshots), registered as a running desktop session. Nothing else is
 * faked: cos/workspace/vm-control.js, lib/cos-bridge.js desktopControl, lib/repo-activity.js and the activity log run.
 *   VC-01  status, pause, resume over QMP
 *   VC-02  a checkpoint is a live snapshot (savevm) kept in the index with its label and what it was taken before
 *   VC-03  checkpoints lists them newest first, each checked against the VM's own snapshot list
 *   VC-04  rewind loads it (loadvm); an unknown or malformed tag is refused, nothing sent
 *   VC-05  QEMU's refusal is said; a 9p-shared desktop refuses live checkpoints; a desktop not running says so
 *   VC-06  CK1: a task on a repo whose desktop runs is checkpointed before its work — on the task and in the log
 *   VC-07  wired: the routes, the checkpointer, the drawer's rewind
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const VC = require(path.join(ROOT, 'cos/workspace/vm-control.js'));
const WS = require(path.join(ROOT, 'cos/workspace/index.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e.message}`); failed++; }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vmc-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} });
// the stand-in QEMU: its state, the commands it was sent
const vm = { running: true, snaps: new Set(), sent: [], refuse: null };
function qemu(sockPath) {
  return new Promise((resolve) => {
    const srv = net.createServer((c) => {
      c.write(JSON.stringify({ QMP: { version: { qemu: { major: 8 } }, capabilities: [] } }) + '\n');
      let buf = '';
      c.on('data', (d) => {
        buf += d; let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
          vm.sent.push(m.execute === 'human-monitor-command' ? m.arguments['command-line'] : m.execute);
          const reply = (r) => c.write(JSON.stringify({ return: r }) + '\n');
          if (m.execute === 'qmp_capabilities') reply({});
          else if (m.execute === 'query-status') reply({ running: vm.running, status: vm.running ? 'running' : 'paused' });
          else if (m.execute === 'stop') { vm.running = false; c.write(JSON.stringify({ event: 'STOP' }) + '\n'); reply({}); }
          else if (m.execute === 'cont') { vm.running = true; reply({}); }
          else if (m.execute === 'human-monitor-command') {
            const cl = m.arguments['command-line'];
            if (vm.refuse && cl.startsWith(vm.refuse.cmd)) { reply(vm.refuse.say); continue; }
            if (cl.startsWith('savevm ')) { vm.snaps.add(cl.slice(7)); reply(''); }
            else if (cl.startsWith('loadvm ')) reply(vm.snaps.has(cl.slice(7)) ? '' : `Error: Snapshot '${cl.slice(7)}' does not exist in one or more devices`);
            else if (cl === 'info snapshots') reply(`ID TAG VM SIZE DATE VM CLOCK\n${[...vm.snaps].map((t, k) => `${k + 1} ${t} 512 MiB 2026-10-07 00:00:01`).join('\n')}`);
            else reply('');
          }
        }
      });
    });
    srv.listen(sockPath, () => resolve(srv));
  });
}

(async () => {
  console.log('\n⬡  THE DESKTOP LIKE VMWARE — pause, live checkpoints, rewind; the log is the rewind\n');
  const cb = require(path.join(ROOT, 'lib/cos-bridge.js'));
  const comp = cb.createCompartment({ name: `vmc-${Date.now()}` }).compartment;
  const sock = path.join(tmp, 'qmp.sock');
  const srv = await qemu(sock);
  const disk = path.join(tmp, '.cos-desktop', 'desktop.qcow2');
  fs.mkdirSync(path.dirname(disk), { recursive: true });
  const session = { compartmentId: comp.id, disk, exited: null, built: { qmp: { transport: 'unix', path: sock }, share: { kind: 'disk' } } };
  WS._sessions.set(comp.id, session);

  await test('VC-01', 'status, pause and resume over QMP', async () => {
    assert.deepStrictEqual(await VC.status(comp.id), { ok: true, running: true, status: 'running' });
    assert.deepStrictEqual(await cb.desktopControl(comp.id, 'pause'), { ok: true, status: 'paused' });
    assert.deepStrictEqual(await cb.desktopControl(comp.id, 'resume'), { ok: true, status: 'running' });
    assert.ok(vm.sent.includes('stop') && vm.sent.includes('cont'));
  });

  let first, second;
  await test('VC-02', 'a checkpoint is a live snapshot (savevm), kept with its label and what it was taken before', async () => {
    first = await cb.desktopControl(comp.id, 'checkpoint', { label: 'before build BL15', causedBy: 'task-abc' });
    assert.ok(first.ok, first.error);
    assert.match(first.checkpoint.tag, VC.TAG_RE);
    assert.ok(vm.sent.includes(`savevm ${first.checkpoint.tag}`));
    const idx = JSON.parse(fs.readFileSync(path.join(path.dirname(disk), 'checkpoints.json'), 'utf8'));
    assert.deepStrictEqual([idx[0].tag, idx[0].label, idx[0].causedBy], [first.checkpoint.tag, 'before build BL15', 'task-abc']);
    await new Promise(r => setTimeout(r, 5));
    second = await cb.desktopControl(comp.id, 'checkpoint', { label: 'by hand' });
  });

  await test('VC-03', "checkpoints: newest first, each checked against the VM's own snapshot list", async () => {
    vm.snaps.delete(first.checkpoint.tag);   // deleted inside QEMU behind our back
    const l = await cb.desktopControl(comp.id, 'checkpoints');
    assert.deepStrictEqual(l.checkpoints.map(x => [x.tag, x.present]), [[second.checkpoint.tag, true], [first.checkpoint.tag, false]]);
    vm.snaps.add(first.checkpoint.tag);
  });

  await test('VC-04', 'rewind loads it (loadvm); an unknown or malformed tag is refused and nothing is sent', async () => {
    const r = await cb.desktopControl(comp.id, 'rewind', { tag: first.checkpoint.tag });
    assert.ok(r.ok, r.error);
    assert.ok(vm.sent.includes(`loadvm ${first.checkpoint.tag}`));
    const n = vm.sent.length;
    assert.match((await VC.rewind(comp.id, 'cp-nope-0000')).error, /no checkpoint/);
    assert.match((await VC.rewind(comp.id, 'x; quit')).error, /not a checkpoint tag/);
    assert.strictEqual(vm.sent.length, n, 'a refused rewind sends nothing to QEMU');
  });

  await test('VC-05', "QEMU's refusal is said; a 9p-shared desktop refuses live checkpoints; a stopped desktop says so", async () => {
    vm.refuse = { cmd: 'savevm', say: "Error: Device 'drive0' is writable but does not support snapshots" };
    const r = await VC.checkpoint(comp.id, { label: 'x' });
    assert.ok(!r.ok && /savevm refused: Error: Device/.test(r.error), JSON.stringify(r));
    vm.refuse = null;
    session.built.share = { kind: '9p' };
    const p = await VC.checkpoint(comp.id, {});
    assert.strictEqual(p.code, 'NO_LIVE_SNAPSHOT_SHARE');
    session.built.share = { kind: 'disk' };
    assert.match((await VC.pause('no-such-compartment')).error, /not running/);
  });

  await test('VC-06', 'CK1: a task on a repo whose desktop runs is checkpointed before its work — on the task and in the log', async () => {
    const RAct = require(path.join(ROOT, 'lib/repo-activity.js'));
    const AL = require(path.join(ROOT, 'lib/activity-log/compartment.js'));
    const repoUuid = `vmc-repo-${Date.now()}`;
    const order = [];
    RAct.setCheckpointer(async ({ label, causedBy }) => { order.push('checkpoint'); return cb.desktopControl(comp.id, 'checkpoint', { label, causedBy }); });
    await RAct.run({ repoUuid, message: 'change the readme', provider: 'claude-code' }, async () => { order.push('work'); return { ok: true, text: 'done' }; });
    assert.deepStrictEqual(order, ['checkpoint', 'work'], 'the checkpoint is taken before the work');
    const t = RAct.list(repoUuid).tasks[0];
    assert.ok(t.checkpoint && vm.snaps.has(t.checkpoint), JSON.stringify(t));
    const row = AL.list(repoUuid, { kind: 'checkpoint' }).rows[0];
    assert.ok(row && row.kind === 'checkpoint.saved' && row.ref === t.id && row.detail.tag === t.checkpoint);
    // the desktop refuses: the work still runs, and why there is no checkpoint is said
    vm.refuse = { cmd: 'savevm', say: 'Error: no space left' };
    await RAct.run({ repoUuid, message: 'second', provider: 'x' }, async () => ({ ok: true, text: '' }));
    vm.refuse = null;
    const t2 = RAct.list(repoUuid).tasks.find(x => /second/.test(x.title));
    assert.ok(t2.status === 'done' && t2.steps.some(s => s.bad && /no checkpoint before this: savevm refused/.test(s.text)));
    assert.ok(AL.list(repoUuid, { kind: 'checkpoint.failed' }).rows.length === 1);
    RAct.setCheckpointer(null);
  });

  await test('VC-07', 'wired: the routes, the checkpointer, the drawer\'s rewind', () => {
    const idx = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(/\['api','repos',    ':uuid','desktop',':op'\],  'repo\.desktop\.control'\]/.test(idx) && /case 'repo\.desktop\.control': \{/.test(idx));
    assert.ok(/RAct\.setCheckpointer\(async/.test(idx) && /desktop\.checkpoint_before/.test(idx));
    assert.ok(/kind = op === 'checkpoint' \? 'checkpoint\.saved' : op === 'rewind' \? 'checkpoint\.restored'/.test(idx), "the person's desktop acts are log rows");
    const ui = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/repo-tasks.js'), 'utf8');
    assert.ok(/async function rtRewind\(tag\b/.test(ui) && /desktop\/rewind/.test(ui) && /rewind the desktop to before this/.test(ui));
  });

  WS._sessions.delete(comp.id);
  srv.close();
  console.log(`\n  ${passed} passed · ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
