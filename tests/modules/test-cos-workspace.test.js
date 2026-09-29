'use strict';
/**
 * tests/modules/test-cos-workspace.test.js — 0.39.279. cos/workspace: a repo as a BRANCH of the original, its VM disk as
 * an overlay of the original's, and its desktop. James: "have cos create the vm environment, and each new repo, if
 * applicable could create a branch of the original, to save resources … once its generated, you can open it like a
 * desktop environment".
 *   WS-0x  git worktree branches — real git, in a temp dir (nested inside another repository on purpose)
 *   WS-1x  the VM half — branchDisk / startDesktop / status / stop with QEMU, the process and the guest agent faked
 *   WS-2x  the wiring — qemu websocket display, provision --with desktop, cos-bridge, idearium codegen + routes + page
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { EventEmitter } = require('events');

const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0, failed = 0;
async function t(id, name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${id} ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${id} ${name}\n    ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e}`); }
}
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

(async () => {
  console.log('\n  test-cos-workspace.test.js');
  const W = require(path.join(ROOT, 'cos/workspace/index.js'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-ws-'));
  // an OUTER repository, like the NEXUS tree the idearium projects dir sits in
  git(tmp, 'init', '-q');
  const origin = path.join(tmp, 'projects', 'orig-1');
  fs.mkdirSync(path.join(origin, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(origin, 'docs', 'spec.md'), '# the spec\n');
  fs.writeFileSync(path.join(origin, 'README.md'), 'original\n');

  let first;
  await t('WS-01', 'a branch of the original: its OWN repository first (never a worktree of the tree it sits in), then a worktree on nexus/<name>', () => {
    first = W.branchWorkspace({ originDir: origin, name: 'Lock Service · code' });
    assert.ok(first.ok, JSON.stringify(first));
    assert.strictEqual(first.branch, 'nexus/lock-service-code');
    assert.strictEqual(first.dir, path.join(`${origin}.branches`, 'lock-service-code'));
    assert.strictEqual(fs.realpathSync(git(origin, 'rev-parse', '--show-toplevel')), fs.realpathSync(origin), 'the original is its own repository');
    assert.strictEqual(git(tmp, 'rev-parse', '--show-toplevel'), fs.realpathSync(tmp), 'the outer repository is untouched');
    assert.strictEqual(fs.readFileSync(path.join(first.dir, 'README.md'), 'utf8'), 'original\n');
    assert.strictEqual(git(first.dir, 'rev-parse', '--abbrev-ref', 'HEAD'), 'nexus/lock-service-code');
    assert.ok(fs.statSync(path.join(first.dir, '.git')).isFile(), 'a worktree (.git file → the shared object store), not a copy');
  });

  await t('WS-02', 'the same name again reuses the branch; listBranches names it; changes stay on the branch', () => {
    const again = W.branchWorkspace({ originDir: origin, name: 'Lock Service · code' });
    assert.ok(again.ok && again.reused && again.dir === first.dir);
    assert.deepStrictEqual(W.listBranches(origin).map(b => b.branch), ['nexus/lock-service-code']);
    fs.writeFileSync(path.join(first.dir, 'lock.js'), 'module.exports = 1;\n');
    git(first.dir, 'add', '-A'); git(first.dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'code');
    assert.ok(!fs.existsSync(path.join(origin, 'lock.js')), 'the original\'s files are not touched by the branch');
    assert.ok(git(origin, 'log', '--oneline', 'nexus/lock-service-code').includes('code'), 'one history: the original sees the branch');
  });

  await t('WS-03', 'uncommitted work in the original is snapshotted before a new branch, so the branch starts from what is there', () => {
    fs.writeFileSync(path.join(origin, 'docs', 'spec.md'), '# the spec, edited\n');
    const b = W.branchWorkspace({ originDir: origin, name: 'second' });
    assert.ok(b.ok && !b.reused);
    assert.strictEqual(fs.readFileSync(path.join(b.dir, 'docs', 'spec.md'), 'utf8'), '# the spec, edited\n');
    assert.match(git(origin, 'log', '-1', '--format=%s'), /snapshot before branching/);
  });

  await t('WS-04', 'removeBranch removes the worktree and KEEPS the branch (its commits) unless asked; bad input is refused', () => {
    const r = W.removeBranch({ originDir: origin, dir: path.join(`${origin}.branches`, 'second') });
    assert.ok(r.ok && r.branchKept);
    assert.ok(git(origin, 'branch', '--list', 'nexus/second').includes('nexus/second'));
    assert.strictEqual(W.removeBranch({ originDir: origin, dir: '/nope' }).ok, false);
    assert.match(W.branchWorkspace({ originDir: path.join(tmp, 'missing'), name: 'x' }).error, /does not exist/);
    assert.strictEqual(W.slug('  ../Weird Name!! '), 'weird-name');
  });

  // ── the VM half ─────────────────────────────────────────────────────────
  await t('WS-10', 'branchDisk: a qcow2 overlay backed by the original\'s disk; kept if it exists; no backing = said', () => {
    const backing = path.join(tmp, 'orig.qcow2'); fs.writeFileSync(backing, 'x');
    const calls = [];
    const dest = path.join(tmp, 'branch', 'd.qcow2');
    const r = W.branchDisk({ backing, dest, runImg: (a) => { calls.push(a); fs.writeFileSync(dest, 'y'); } });
    assert.ok(r.ok && !r.reused);
    assert.deepStrictEqual(calls[0], ['create', '-f', 'qcow2', '-F', 'qcow2', '-b', path.resolve(backing), dest]);
    assert.ok(W.branchDisk({ backing, dest, runImg: () => { throw new Error('must not run'); } }).reused);
    assert.match(W.branchDisk({ backing: path.join(tmp, 'none.qcow2'), dest: path.join(tmp, 'z.qcow2') }).error, /does not exist/);
  });

  function fakes() {
    const spawned = [], ran = [];
    const q = { qemuSystemBin: () => 'qemu-system-x86_64', buildQemuArgs: (cfg, id) => ({ args: ['-disk', cfg.disk, '-share', String(cfg.shareDir || cfg.shareDisk)], qga: { transport: 'tcp', port: 1 }, vncDisplayNum: 7, accel: 'tcg', cfg }) };
    const spawn = (bin, args) => { const p = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => p.emit('exit', 0); spawned.push({ bin, args, p }); return p; };
    const ga = { connectWhenReady: async () => ({ run: async (sh, a) => { ran.push(a[1]); return { exitCode: 0, stdout: '', stderr: '' }; }, close() {} }) };
    return { q, spawn, ga, spawned, ran };
  }

  await t('WS-11', 'startDesktop: boots from an overlay of the ORIGINAL\'s desktop disk when it has one, headless on VNC+websocket; copies the repo in', async () => {
    const F = fakes();
    const originState = path.join(tmp, 'c-orig'); fs.mkdirSync(path.join(originState, W.DESKTOP_DIR), { recursive: true });
    fs.writeFileSync(W.desktopDisk(originState), 'orig-disk');
    const made = [];
    const r = W.startDesktop({ compartmentId: 'c-branch', name: 'Lock Service', workDir: first.dir, stateRoot: path.join(tmp, 'c-branch'), originStateRoot: originState,
      baseImage: path.join(tmp, 'orig.qcow2'), _qemu: F.q, _spawn: F.spawn, _ga: F.ga, _runImg: (a) => { made.push(a); fs.writeFileSync(a[a.length - 1], 'ov'); } });
    assert.ok(r.ok, JSON.stringify(r));
    assert.strictEqual(r.branchedFrom, 'original');
    assert.strictEqual(made[0][6], path.resolve(W.desktopDisk(originState)), 'the overlay is backed by the original\'s disk');
    assert.deepStrictEqual(r.ports, { display: 7, vncPort: 5907, wsPort: 5707 });
    assert.strictEqual(r.state, 'booting');
    await new Promise(res => setTimeout(res, 20));
    const s = W.desktopStatus('c-branch');
    assert.strictEqual(s.state, 'running');
    assert.strictEqual(s.repoIn, '/home/nexus/lock-service');
    assert.match(F.ran[0], /\/home\/nexus\/lock-service/);
    assert.ok(W.startDesktop({ compartmentId: 'c-branch', _qemu: F.q, _spawn: F.spawn }).reused, 'a running desktop is reused, never a second VM');
    assert.strictEqual(F.spawned.length, 1);
  });

  await t('WS-12', 'no original disk → the base image; no base image → told how to make one; stop keeps the disk', async () => {
    const F = fakes();
    const r = W.startDesktop({ compartmentId: 'c-solo', stateRoot: path.join(tmp, 'c-solo'), baseImage: path.join(tmp, 'orig.qcow2'), _qemu: F.q, _spawn: F.spawn, _ga: F.ga, _runImg: (a) => fs.writeFileSync(a[a.length - 1], 'ov') });
    assert.ok(r.ok && r.branchedFrom === 'base' && r.repoIn === 'none', JSON.stringify(r));
    const st = W.stopDesktop('c-solo');
    assert.ok(st.ok && st.kept === W.desktopDisk(path.join(tmp, 'c-solo')));
    assert.strictEqual(W.desktopStatus('c-solo').state, 'stopped');
    assert.ok(fs.existsSync(W.desktopDisk(path.join(tmp, 'c-solo'))), 'the branch\'s disk survives a stop');
    const none = W.startDesktop({ compartmentId: 'c-none', stateRoot: path.join(tmp, 'c-none'), _qemu: F.q, _spawn: F.spawn, _host: { base: () => ({ image: null }) } });
    assert.match(none.error, /provision\.js --with desktop/);
    assert.strictEqual(W.desktopStatus('never').state, 'none');
  });

  await t('WS-13', '0.39.280: a VM that dies at once on whpx is retried once in software (tcg) and said; a second death is reported with QEMU\'s words', async () => {
    const F = fakes();
    F.q.buildQemuArgs = (cfg) => ({ args: ['-accel', String(cfg.accelerator)], qga: { transport: 'tcp', port: 1 }, vncDisplayNum: 9, accel: cfg.accelerator || 'whpx', cfg });
    const r = W.startDesktop({ compartmentId: 'c-whpx', stateRoot: path.join(tmp, 'c-whpx'), baseImage: path.join(tmp, 'orig.qcow2'), _qemu: F.q, _spawn: F.spawn, _ga: F.ga, _runImg: (a) => fs.writeFileSync(a[a.length - 1], 'ov') });
    assert.ok(r.ok && r.accel === 'whpx');
    F.spawned[0].p.stderr.emit('data', 'qemu: WHPX: Failed to emulate MMIO access\n');
    F.spawned[0].p.emit('exit', 1);
    assert.strictEqual(F.spawned.length, 2, 'retried once');
    assert.deepStrictEqual(F.spawned[1].args, ['-accel', 'tcg']);
    let s = W.desktopStatus('c-whpx');
    assert.strictEqual(s.state, 'running');
    assert.deepStrictEqual([s.accel, s.accelFallback.from, /WHPX/.test(s.accelFallback.reason)], ['tcg', 'whpx', true]);
    F.spawned[1].p.stderr.emit('data', 'qemu: could not open disk\n');
    F.spawned[1].p.emit('exit', 1);
    assert.strictEqual(F.spawned.length, 2, 'never a third try');
    s = W.desktopStatus('c-whpx');
    assert.deepStrictEqual([s.state, s.exitCode], ['stopped', 1]);
    assert.match(s.error, /could not open disk/);
    const page = fs.readFileSync(path.join(ROOT, 'idearium/ui/desktop.html'), 'utf8');
    assert.match(page, /async function whyUnreachable\(\)/, 'the viewer asks why instead of only saying unreachable');
  });

  // ── wiring ──────────────────────────────────────────────────────────────
  await t('WS-20', 'qemu-runtime: a headless VM\'s screen is also a websocket on 5700+N; desktopPorts says where', () => {
    const q = require(path.join(ROOT, 'cos/compartment/qemu-runtime.js'));
    const b = q.buildQemuArgs({ disk: '/d.qcow2', ramMB: 512, cpus: 1, machineType: 'q35', network: 'none', headless: true, vmStateDir: tmp }, 'comp-x', 'x');
    const p = q.desktopPorts('comp-x');
    assert.strictEqual(b.vncDisplayNum, p.display);
    assert.ok(b.args.includes(`127.0.0.1:${p.display},websocket=${p.wsPort}`), b.args.join(' '));
    assert.deepStrictEqual([p.vncPort - p.display, p.wsPort - p.display], [5900, 5700]);
    assert.deepStrictEqual(W.desktopFor('comp-x'), { host: '127.0.0.1', ...p });
  });

  await t('WS-21', 'provision --with desktop: xfce + lightdm autologin as nexus, graphical boot; nothing of it without the flag', () => {
    const P = require(path.join(ROOT, 'cos/testenv/provision.js'));
    const u = P.userData({ extras: ['desktop'], seedUrl: 'http://s/' });
    assert.ok(['xfce4', 'lightdm', 'firefox-esr'].every(p => u.includes(`  - ${p}`)));
    assert.match(u, /autologin-user=nexus\\nautologin-session=xfce/);
    assert.match(u, /systemctl set-default graphical\.target/);
    assert.ok(!/xfce4|lightdm/.test(P.userData({ extras: [], seedUrl: 'http://s/' })));
  });

  await t('WS-22', 'cos-bridge: branchWorkspace / listBranches / desktop are the door; an unknown compartment is told', () => {
    const B = require(path.join(ROOT, 'lib/cos-bridge.js'));
    assert.strictEqual(B.listBranches(origin).length, 1);
    const d = B.desktop('no-such-compartment-xyz', { action: 'status' });
    assert.strictEqual(d.ok, false);
  });

  await t('WS-23', 'idearium: the Code button makes a branch (worktree + child compartment) unless told not to; desktop routes; the viewer page', () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.match(api, /cosBridge\.branchWorkspace\(\{ originDir: _repoDiskDir\(_origin\.uuid\), name: manifest\.name \}\)/);
    assert.match(api, /_origin && body\.branch !== false && _mode !== 'copy'/);
    assert.match(api, /process\.env\.IDEARIUM_CODE_REPO_MODE \|\| .*getIdeariumValue\('repos\.code_repo_mode'\)/);
    assert.match(api, /parentId: parent/);
    assert.match(api, /materializeDir: branchInfo\.dir, branchOf: _origin\.uuid, branch: branchInfo\.branch/);
    for (const r of ["'repo.desktop.status'", "'repo.desktop.start'", "'repo.desktop.stop'", "'repo.branches'"]) assert.ok(api.includes(r), r);
    const layer = fs.readFileSync(path.join(ROOT, 'idearium/repo/index.js'), 'utf8');
    assert.match(layer, /materializeDir: materializeDir \|\| \(materializeBaseDir/);
    const page = fs.readFileSync(path.join(ROOT, 'idearium/ui/desktop.html'), 'utf8');
    assert.match(page, /@novnc\/novnc@1\.4\.0\/core\/rfb\.js/);
    assert.match(page, /\/api\/repos\/\$\{encodeURIComponent\(repo\)\}\/desktop/);
    const ui = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8');
    assert.match(ui, /function openRepoDesktop\(repoUuid\)/);
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  process.exit(failed ? 1 : 0);
})();
