'use strict';
// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-testenv.js — §2026-09-21 COS test environments.
 *
 * WHAT IS REAL: qemu-runtime's real buildQemuArgs/resolveVmConfig, the real
 * GuestAgentClient over a real unix socket at the path buildQemuArgs chose,
 * the real SandboxRunner for the process backend, the real repo-run.
 * WHAT IS EMULATED, and only this: the guest. This machine has no QEMU and
 * no guest image, so a GUEST EMULATOR answers the real QGA wire protocol
 * (guest-sync with stale bytes and the 0xFF sentinel, guest-exec,
 * guest-exec-status with base64 out-data, guest-shutdown) and runs each
 * command on the host with /mnt/cos mapped to the shared directory. That
 * proves the protocol and the orchestration; it does not prove a real
 * guest image boots — that needs COS_TESTENV_BASE_IMAGE on a machine with
 * QEMU, and capabilities() says so.
 */
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

// ── guest emulator: real QGA framing, host execution with /mnt/cos -> shareDir ──
// §0.39.264: the repo reaches the guest as a tar disk (/dev/vdb) unpacked into
// /mnt/cos; the emulator maps /dev/vdb to the disk file qemu was given and
// /mnt/cos to a scratch "guest filesystem", and keeps the host's node on PATH.
function guestEmulator(sockPath, shareDir, log, { disk = null, guestRoot = null } = {}) {
  const procs = new Map(); let nextPid = 100;
  const srv = net.createServer((s) => {
    s.write('{"return": 999}\n');                     // stale bytes from an earlier client
    let buf = '';
    s.on('data', (d) => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        let m; try { m = JSON.parse(line); } catch (_) { continue; }
        log.push(m.execute);
        const reply = (o) => s.write(JSON.stringify(o) + '\n');
        if (m.execute === 'guest-sync') { s.write('\xff'); reply({ return: m.arguments.id }); }
        else if (m.execute === 'guest-ping') reply({ return: {} });
        else if (m.execute === 'guest-shutdown') { /* a real guest does not answer */ }
        else if (m.execute === 'guest-exec') {
          const pid = nextPid++;
          const root = guestRoot || shareDir;
          const argv = (m.arguments.arg || []).map(a => { let x = String(a).split('/mnt/cos').join(root); if (disk) x = x.split('/dev/vdb').join(disk); return x.replace('export PATH=', `export PATH=${path.dirname(process.execPath)}:`); });
          if (/mount -t 9p/.test(argv.join(' '))) { procs.set(pid, { done: true, code: 0, out: '', err: '' }); reply({ return: { pid } }); continue; }
          if (/registry\.npmjs\.org/.test(argv.join(' '))) { const cut = log.includes('link:down'); procs.set(pid, { done: true, code: cut ? 0 : 1, out: '', err: '' }); reply({ return: { pid } }); continue; }
          const st = { done: false, code: null, out: '', err: '' }; procs.set(pid, st);
          const c = cp.spawn(m.arguments.path, argv, { env: { PATH: process.env.PATH } });
          c.stdout.on('data', x => st.out += x); c.stderr.on('data', x => st.err += x);
          c.on('close', (code) => { st.done = true; st.code = code; });
          reply({ return: { pid } });
        } else if (m.execute === 'guest-exec-status') {
          const st = procs.get(m.arguments.pid);
          if (!st) { reply({ error: { class: 'GenericError', desc: 'Invalid parameter pid' } }); continue; }
          reply({ return: st.done ? { exited: true, exitcode: st.code, 'out-data': Buffer.from(st.out).toString('base64'), 'err-data': Buffer.from(st.err).toString('base64') } : { exited: false } });
        } else reply({ error: { class: 'CommandNotFound', desc: `The command ${m.execute} has not been found` } });
      }
    });
  });
  return new Promise(r => srv.listen(sockPath, () => r(srv)));
}

async function main() {
  console.log('\ntest-cos-testenv\n');
  const Q = require(path.join(ROOT, 'cos', 'compartment', 'qemu-runtime.js'));
  const { GuestAgentClient } = require(path.join(ROOT, 'cos', 'compartment', 'guest-agent.js'));
  const TE = require(path.join(ROOT, 'cos', 'testenv', 'index.js'));
  const R = require(path.join(ROOT, 'lib', 'repo-run.js'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-testenv-'));

  // ── qemu args ──
  const cfg = Q.resolveVmConfig(path.join(tmp, 'd.qcow2'), { COS_VM_GUEST_AGENT: '1', COS_VM_SHARE_DIR: tmp }, tmp);
  const a = Q.buildQemuArgs(cfg, 'comp-abc', 't');
  check('guestAgent opens the org.qemu.guest_agent.0 channel', a.args.includes('virtserialport,chardev=qga0,name=org.qemu.guest_agent.0') && !!a.qga);
  check('shareDir exposes the directory to the guest', process.platform === 'linux' ? a.args.some(x => /^local,path=.*mount_tag=cos_share/.test(x)) : a.args.some(x => /^file=fat:rw:/.test(x)));
  const plain = Q.buildQemuArgs(Q.resolveVmConfig(path.join(tmp, 'd.qcow2'), {}, tmp), 'comp-abc', 't');
  check('an existing VM compartment boots exactly as before (both opt-in)', !plain.args.some(x => /qga0|cos_share|virtserialport/.test(x)) && plain.qga === null && plain.share === null);

  // ── QGA client, real protocol ──
  const log = [];
  const sockA = path.join(tmp, 'qga-a.sock');
  const emuA = await guestEmulator(sockA, tmp, log);
  const c = new GuestAgentClient({ transport: 'unix', path: sockA });
  await c.connect(); await c.sync();
  check('sync discards stale bytes and the 0xFF sentinel', true);
  const r1 = await c.run('/bin/sh', ['-c', 'echo out; echo err 1>&2; exit 4']);
  check('guest-exec + status: exit code, stdout and stderr decoded from base64', r1.exitCode === 4 && r1.stdout === 'out\n' && r1.stderr === 'err\n');
  let threw = null; try { await c.execute('guest-exec-status', { pid: 424242 }); } catch (e) { threw = e.message; }
  check('an agent error is thrown with the agent\'s own description', /Invalid parameter pid/.test(threw || ''));
  const slow = await c.run('/bin/sh', ['-c', 'sleep 5'], { timeoutMs: 400 });
  check('a command outliving its timeout reports timedOut', slow.timedOut === true);
  c.close(); emuA.close();

  // ── capabilities ──
  const img = path.join(tmp, 'base.qcow2'); fs.writeFileSync(img, 'x');
  const emptyHome = path.join(tmp, 'no-home');
  const none = TE.capabilities({ env: { COS_TESTENV_HOME: emptyHome, PATH: '' }, _probe: () => false });
  check('no qemu → vm unavailable, naming exactly what is missing and how to install it', !none.vm.ok && /QEMU not found/.test(none.vm.reason) && /install:/.test(none.vm.reason) && /no base image/.test(none.vm.reason));
  check('no base image → the reason names the setup (setup-vm.bat / provision.js)', /setup-vm\.bat|provision\.js/.test(none.vm.reason) && !!none.vm.setup);
  check('the process backend is always available', none.process.ok === true);
  const yes = TE.capabilities({ baseImage: img, env: { COS_TESTENV_HOME: emptyHome }, _probe: () => true });
  check('qemu + an existing base image → vm available on ANY host (no 9p requirement any more)', yes.vm.ok === true, yes.vm.reason);

  // ── the vm backend end to end, guest emulated ──
  const branchRoot = path.join(tmp, 'branch', 'root'); fs.mkdirSync(path.join(branchRoot, 'test'), { recursive: true });
  fs.writeFileSync(path.join(branchRoot, 'test', 'a.test.js'), 'console.log("in guest")');
  fs.writeFileSync(path.join(branchRoot, 'test', 'b.test.js'), 'console.error("nope"); process.exit(2)');
  const events = { overlay: null, discarded: null, spawned: null, killed: false };
  const vlog = [];
  let emu = null;
  const _qemu = {
    ...Q,
    ensureEphemeralOverlay: (base, ov) => { events.overlay = ov; fs.writeFileSync(ov, 'overlay'); },
    discardOverlay: (ov) => { events.discarded = ov; fs.rmSync(ov, { force: true }); },
  };
  const _spawn = (bin, args) => {
    events.spawned = { bin, args };
    const chard = args[args.indexOf('-chardev') + 1] || '';
    const qsock = (chard.match(/path=([^,]+)/) || [])[1];
    // The guest sees only what qemu was told to attach — read it from the real
    // args: a tar disk (0.39.264 default) or a 9p share.
    const virt = args.find(x => /^local,path=/.test(x)) || '';
    const shared = (virt.match(/path=([^,]+)/) || [])[1] || (args.find(x => /^file=fat:rw:/.test(x)) || '').replace(/^file=fat:rw:|,.*$/g, '');
    const diskArg = args.find(x => /format=raw,if=virtio,readonly=on$/.test(x)) || '';
    const disk = (diskArg.match(/^file=([^,]+)/) || [])[1] || null;
    const guestRoot = fs.mkdtempSync(path.join(tmp, 'guest-'));
    guestEmulator(qsock, shared, vlog, { disk, guestRoot }).then(s => { emu = s; });
    return { kill: () => { events.killed = true; if (emu) emu.close(); }, on: () => {}, stderr: null };
  };
  const _qmp = { connect: async () => {}, command: async (c, a) => { vlog.push(`qmp:${c}`); if (c === 'set_link' && a && a.up === false) vlog.push('link:down'); return {}; }, disconnect: () => {} };
  const vm = await TE.run({ backend: 'vm', compartment: { id: 'comp-vm-1' }, root: branchRoot,
    targets: [{ file: 'test/a.test.js', runtimeId: 'node' }, { file: 'test/b.test.js', runtimeId: 'node' }],
    _caps: { vm: { ok: true, baseImage: img }, process: { ok: true } }, _qemu, _spawn, bootTimeoutMs: 8000 });
  check('vm: qemu is spawned with the guest agent and the branch attached as a read-only tar disk', events.spawned && events.spawned.args.includes('virtserialport,chardev=qga0,name=org.qemu.guest_agent.0') && events.spawned.args.some(x => /share\.tar,format=raw,if=virtio,readonly=on$/.test(x)));
  check('vm: network is none', events.spawned.args.includes('-nic') && events.spawned.args[events.spawned.args.indexOf('-nic') + 1] === 'none');
  check('vm: the repo is unpacked in the guest before anything runs', vlog.indexOf('guest-exec') < vlog.lastIndexOf('guest-exec'));
  check('vm: each target runs in the guest with its result', vm.backend === 'vm' && vm.runs.length === 2 && vm.runs[0].passed && /in guest/.test(vm.runs[0].stdout) && vm.runs[1].exitCode === 2 && /nope/.test(vm.runs[1].stderr));
  check('vm: the guest is asked to shut down and qemu is killed', vlog.includes('guest-shutdown') && events.killed);
  check('vm: the ephemeral overlay is discarded — nothing persists', events.overlay && events.discarded === events.overlay && !fs.existsSync(events.overlay));

  // ── §0.39.264: install online, cut the cable, prove it, then test ──
  vlog.length = 0;
  const planned = await TE.run({ backend: 'vm', compartment: { id: 'comp-vm-2' }, root: branchRoot,
    targets: [{ file: 'test/a.test.js', runtimeId: 'node' }],
    plan: { install: [{ command: 'echo installing > installed.txt', why: 'demo' }], suite: [{ command: 'cat installed.txt && node test/a.test.js', why: 'demo', stack: 'node' }] },
    _caps: { vm: { ok: true, baseImage: img }, process: { ok: true } }, _qemu, _spawn, _qmp, bootTimeoutMs: 8000 });
  const netIdx = events.spawned.args.indexOf('-netdev');
  check('vm+install: boots WITH a network device (named nic0) so dependencies can be fetched', netIdx > 0 && events.spawned.args.includes('virtio-net-pci,netdev=net0,id=nic0'));
  check('vm+install: the install command runs first, in the unpacked repo', planned.runs[0].kind === 'install' && planned.runs[0].passed);
  check('vm+install: the cable is pulled over QMP (set_link nic0 off) BEFORE any test', vlog.indexOf('link:down') > -1 && vlog.indexOf('link:down') < vlog.lastIndexOf('guest-exec') && planned.vm.offlineVerified === true);
  check('vm+install: the repo\'s own suite command runs, then the files', planned.runs[1].kind === 'suite' && /installing/.test(planned.runs[1].stdout) && /in guest/.test(planned.runs[1].stdout) && planned.runs[2].kind === 'file');
  check('vm+install: the result says accelerator, network and share', planned.vm && planned.vm.network === 'install' && planned.vm.share === 'disk' && !!planned.vm.accel);
  const leaky = { ..._qmp, command: async () => ({}) };   // a cut that does not take
  let leakErr = null; vlog.length = 0;
  try { await TE.run({ backend: 'vm', compartment: { id: 'comp-vm-3' }, root: branchRoot, targets: [], plan: { install: [{ command: 'true' }], suite: [] },
    _caps: { vm: { ok: true, baseImage: img }, process: { ok: true } }, _qemu, _spawn, _qmp: leaky, bootTimeoutMs: 8000 }); } catch (e) { leakErr = e.message; }
  check('vm+install: if the guest can still resolve names after the cut, NO test runs', /refusing to run tests online/.test(leakErr || ''));
  check('missingRuntimes names what the base image lacks (and cannot tell without a manifest)', JSON.stringify(TE.missingRuntimes({ node: 'v22', python3: '3.11' }, ['node', 'go', 'python3', 'sh'])) === '["go"]' && TE.missingRuntimes(null, ['go']).length === 0);

  let err = null; try { await TE.run({ backend: 'vm', compartment: { id: 'x' }, root: branchRoot, targets: [], _caps: none }); } catch (e) { err = e.message; }
  check('vm requested but unavailable → refused with the reason, never silently downgraded', /vm backend unavailable — QEMU not found/.test(err || ''));
  check('an unknown backend is refused', await TE.run({ backend: 'docker', compartment: {}, targets: [] }).then(() => false, () => true));

  // ── repo-run: auto chooses, and says why ──
  const repoDir = path.join(tmp, 'repo'); fs.mkdirSync(path.join(repoDir, 'test'), { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'test', 'x.test.js'), 'console.log("x")');
  const auto = await R.run({ repo: { uuid: 'r' }, repoDir, mode: 'test', compartment: { id: `rr-${Date.now()}` }, _caps: none });
  check('auto with no VM: runs in the process sandbox and says why', auto.ok && auto.backend === 'process' && /vm unavailable \(QEMU not found/.test(auto.backendReason) && auto.runs[0].passed);
  vlog.length = 0;
  const autoVm = await R.run({ repo: { uuid: 'r' }, repoDir, mode: 'test', compartment: { id: `rr-${Date.now()}` }, _caps: { vm: { ok: true, baseImage: img }, process: { ok: true } }, _qemu, _spawn });
  check('auto with a VM: runs in the VM', autoVm.ok && autoVm.backend === 'vm' && autoVm.runs[0].passed, JSON.stringify(autoVm.errors || autoVm.backendReason));

  const API = fs.readFileSync(path.join(ROOT, 'idearium', 'api', 'index.js'), 'utf8');
  check('Idearium exposes COS test-env capabilities', /case 'repo\.run\.capabilities'[\s\S]{0,120}testenv/.test(API));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail === 0 ? 0 : 1;
  setTimeout(() => process.exit(process.exitCode), 200);
}
main().catch(e => { console.log('  ! crashed:', e.stack); process.exit(1); });
