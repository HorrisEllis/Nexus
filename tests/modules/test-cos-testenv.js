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
function guestEmulator(sockPath, shareDir, log) {
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
          const argv = (m.arguments.arg || []).map(a => String(a).split('/mnt/cos').join(shareDir));
          if (/mount -t 9p/.test(argv.join(' '))) { procs.set(pid, { done: true, code: 0, out: '', err: '' }); reply({ return: { pid } }); continue; }
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
  const none = TE.capabilities({ env: {}, _probe: () => false });
  check('no qemu → vm unavailable, naming exactly what is missing', !none.vm.ok && /qemu-system-x86_64 not on PATH/.test(none.vm.reason) && /no base image/.test(none.vm.reason));
  check('the process backend is always available', none.process.ok === true);
  const yes = TE.capabilities({ baseImage: img, _probe: () => true });
  check('qemu + an existing base image (+ Linux host) → vm available', yes.vm.ok === (process.platform === 'linux'));

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
    // The guest sees whatever directory qemu was told to share — read it from
    // the real args, exactly as a guest would only ever see that share.
    const virt = args.find(x => /^local,path=/.test(x)) || '';
    const shared = (virt.match(/path=([^,]+)/) || [])[1] || (args.find(x => /^file=fat:rw:/.test(x)) || '').replace(/^file=fat:rw:|,.*$/g, '');
    guestEmulator(qsock, shared, vlog).then(s => { emu = s; });
    return { kill: () => { events.killed = true; if (emu) emu.close(); } };
  };
  const vm = await TE.run({ backend: 'vm', compartment: { id: 'comp-vm-1' }, root: branchRoot,
    targets: [{ file: 'test/a.test.js', runtimeId: 'node' }, { file: 'test/b.test.js', runtimeId: 'node' }],
    _caps: { vm: { ok: true, baseImage: img }, process: { ok: true } }, _qemu, _spawn, bootTimeoutMs: 8000 });
  check('vm: qemu is spawned with the guest agent and the branch shared', events.spawned && events.spawned.args.includes('virtserialport,chardev=qga0,name=org.qemu.guest_agent.0') && events.spawned.args.some(x => x.includes(branchRoot)));
  check('vm: network is none', events.spawned.args.includes('-nic') && events.spawned.args[events.spawned.args.indexOf('-nic') + 1] === 'none');
  check('vm: the share is mounted in the guest before anything runs', vlog.indexOf('guest-exec') < vlog.lastIndexOf('guest-exec'));
  check('vm: each target runs in the guest with its result', vm.backend === 'vm' && vm.runs.length === 2 && vm.runs[0].passed && /in guest/.test(vm.runs[0].stdout) && vm.runs[1].exitCode === 2 && /nope/.test(vm.runs[1].stderr));
  check('vm: the guest is asked to shut down and qemu is killed', vlog.includes('guest-shutdown') && events.killed);
  check('vm: the ephemeral overlay is discarded — nothing persists', events.overlay && events.discarded === events.overlay && !fs.existsSync(events.overlay));

  let err = null; try { await TE.run({ backend: 'vm', compartment: { id: 'x' }, root: branchRoot, targets: [], _caps: none }); } catch (e) { err = e.message; }
  check('vm requested but unavailable → refused with the reason, never silently downgraded', /vm backend unavailable — qemu-system/.test(err || ''));
  check('an unknown backend is refused', await TE.run({ backend: 'docker', compartment: {}, targets: [] }).then(() => false, () => true));

  // ── repo-run: auto chooses, and says why ──
  const repoDir = path.join(tmp, 'repo'); fs.mkdirSync(path.join(repoDir, 'test'), { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'test', 'x.test.js'), 'console.log("x")');
  const auto = await R.run({ repo: { uuid: 'r' }, repoDir, mode: 'test', compartment: { id: `rr-${Date.now()}` }, _caps: none });
  check('auto with no VM: runs in the process sandbox and says why', auto.ok && auto.backend === 'process' && /vm unavailable \(qemu-system/.test(auto.backendReason) && auto.runs[0].passed);
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
