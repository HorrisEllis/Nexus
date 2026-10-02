'use strict';
// §0.39.282 — starts NEXUS processes: into the test sandbox first (test-test-sandbox's rule), so nothing writes real data.
require('../../lib/test-sandbox.js').ensure();
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
  await t('WS-05', '0.39.284 W1: branchWorkspaceAsync gives the same branch as the sync one (a new original, a new name, a reuse)', async () => {
    const o2 = path.join(tmp, 'projects', 'orig-async');
    fs.mkdirSync(o2, { recursive: true }); fs.writeFileSync(path.join(o2, 'a.txt'), 'a\n');
    const r = await W.branchWorkspaceAsync({ originDir: o2, name: 'Async Thing' });
    assert.ok(r.ok, JSON.stringify(r));
    assert.strictEqual(r.branch, 'nexus/async-thing');
    assert.strictEqual(r.reused, false);
    assert.strictEqual(fs.realpathSync(git(o2, 'rev-parse', '--show-toplevel')), fs.realpathSync(o2));
    assert.strictEqual(fs.readFileSync(path.join(r.dir, 'a.txt'), 'utf8'), 'a\n');
    const again = await W.branchWorkspaceAsync({ originDir: o2, name: 'Async Thing' });
    assert.ok(again.ok && again.reused && again.dir === r.dir, JSON.stringify(again));
    const same = W.branchWorkspace({ originDir: o2, name: 'Async Thing' });
    assert.ok(same.ok && same.reused && same.dir === r.dir, 'the sync one sees the async one\'s branch');
    assert.deepStrictEqual((await W.listBranchesAsync(o2)).map(b => b.branch), W.listBranches(o2).map(b => b.branch));
    const bad = await W.branchWorkspaceAsync({ originDir: path.join(tmp, 'nope'), name: 'x' });
    assert.strictEqual(bad.ok, false);
  });

  await t('WS-06', '0.39.284 W1: while git works (a slow git), the event loop keeps running — timers fire; the sync one would starve them', async () => {
    const slow = path.join(tmp, 'slow-git.js');
    fs.writeFileSync(slow, `#!/usr/bin/env node\nconst a=process.argv.slice(2);const {execFileSync}=require('child_process');\nconst t=Date.now();while(Date.now()-t<250){}\ntry{process.stdout.write(execFileSync('git',a,{cwd:process.cwd(),encoding:'utf8',stdio:['ignore','pipe','pipe']}));}catch(e){process.stderr.write(String(e.stderr||''));process.exit(e.status||1);}\n`);
    fs.chmodSync(slow, 0o755);
    const o3 = path.join(tmp, 'projects', 'orig-slow');
    fs.mkdirSync(o3, { recursive: true }); fs.writeFileSync(path.join(o3, 'b.txt'), 'b\n');
    let ticks = 0; const iv = setInterval(() => ticks++, 20);
    const r = await W.branchWorkspaceAsync({ originDir: o3, name: 'slow', git: slow });
    clearInterval(iv);
    assert.ok(r.ok, JSON.stringify(r));
    assert.ok(ticks >= 20, `the timer fired ${ticks} times while git ran (several 250 ms calls)`);
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.match(api, /await cosBridge\.branchWorkspaceAsync\(\{ originDir: _repoDiskDir\(_origin\.uuid\), name: manifest\.name \}\)/);
  });

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
    const pw = [];
    const ga = { connectWhenReady: async () => ({ run: async (sh, a) => { ran.push(a[1]); return { exitCode: 0, stdout: '', stderr: '' }; },
      setUserPassword: async (u, p) => { pw.push([u, p]); return {}; }, close() {} }) };
    return { q, spawn, ga, spawned, ran, pw };
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

  await t('WS-14', '0.39.282 N20: the desktop account gets its password through the guest agent, the status shows the login, a bad name is refused', async () => {
    const F = fakes();
    const r = W.startDesktop({ compartmentId: 'c-login', name: 'Pw', workDir: first.dir, stateRoot: path.join(tmp, 'c-login'), baseImage: path.join(tmp, 'orig.qcow2'),
      login: { user: 'dev', password: 's3cret' }, _qemu: F.q, _spawn: F.spawn, _ga: F.ga, _runImg: (a) => fs.writeFileSync(a[a.length - 1], 'ov') });
    assert.ok(r.ok, JSON.stringify(r));
    await new Promise(res => setTimeout(res, 20));
    assert.deepStrictEqual(F.pw, [['dev', 's3cret']]);
    const s = W.desktopStatus('c-login');
    assert.deepStrictEqual(s.login, { user: 'dev', password: 's3cret', applied: 'set' });
    assert.strictEqual(s.repoIn, '/home/dev/pw', 'the repo lands in that account\'s home');
    const bad = W.startDesktop({ compartmentId: 'c-badlogin', stateRoot: path.join(tmp, 'c-badlogin'), baseImage: path.join(tmp, 'orig.qcow2'),
      login: { user: 'x; rm -rf /', password: 'p' }, _qemu: F.q, _spawn: F.spawn, _ga: F.ga, _runImg: (a) => fs.writeFileSync(a[a.length - 1], 'ov') });
    await new Promise(res => setTimeout(res, 20));
    assert.strictEqual(F.pw.length, 1, 'no password call for an invalid name');
    assert.match(W.desktopStatus('c-badlogin').login.applied, /refused/);
    const P = require(path.join(ROOT, 'cos/testenv/provision.js'));
    const sh = P.provisionScript({ extras: ['desktop'], login: P.desktopLogin({ user: 'nexus', password: "it's" }) });
    assert.match(sh, /printf '%s:%s\\n' "\$U" 'it'\\''s' \| chpasswd/);
    assert.deepStrictEqual(P.desktopLogin(null, {}), { user: 'nexus', password: 'nexus' }, 'the generic default the atlas lists');
    assert.throws(() => P.desktopLogin({ user: 'Bad User' }), /not a valid login name/);
    const cfg = require(path.join(ROOT, 'idearium/lib/config-core.cjs'));
    const schema = cfg.SCHEMA || cfg.schema || cfg.CONFIG_SCHEMA;
    if (schema && schema.desktop) assert.ok(schema.desktop.user && schema.desktop.password, 'desktop.user / desktop.password are settings');
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

  await t('WS-15', "0.39.293 DK1 — James: \"i cant login to my desktop envirement in idearium with the default credientials\": an image without the desktop is refused with the fix; an overlay is tied to its base; a stale one is archived, never deleted", async () => {
    const F = fakes();
    const img = path.join(tmp, 'dk-base.qcow2'); fs.writeFileSync(img, 'base');
    const host = (m) => ({ base: () => ({ image: img, manifest: m }) });
    const runImg = (a) => fs.writeFileSync(a[a.length - 1], 'ov');
    // 1. the image the setup used to build: no desktop in it → said, with the fix; no VM booted
    const no = W.startDesktop({ compartmentId: 'c-dk0', stateRoot: path.join(tmp, 'c-dk0'), _qemu: F.q, _spawn: F.spawn, _ga: F.ga, _runImg: runImg,
      _host: host({ createdAt: '2026-10-01T10:00:00.000Z', userDataSha256: 'a', extras: ['go'] }) });
    assert.ok(!no.ok && no.code === 'NO_DESKTOP_IN_IMAGE', JSON.stringify(no));
    assert.match(no.error, /without the desktop[\s\S]*--with desktop/);
    assert.ok(!fs.existsSync(W.desktopDisk(path.join(tmp, 'c-dk0'))), 'no disk made for a VM nobody can use');
    // 2. a desktop image: the overlay is made and stamped with the base it was made over
    const m1 = { createdAt: '2026-10-01T10:00:00.000Z', userDataSha256: 'a', extras: ['desktop'] };
    const r1 = W.startDesktop({ compartmentId: 'c-dk1', stateRoot: path.join(tmp, 'c-dk1'), _qemu: F.q, _spawn: F.spawn, _ga: F.ga, _runImg: runImg, _host: host(m1) });
    assert.ok(r1.ok, JSON.stringify(r1));
    const disk = W.desktopDisk(path.join(tmp, 'c-dk1'));
    const stampFile = disk.replace(/\.qcow2$/, '.json');
    assert.match(JSON.parse(fs.readFileSync(stampFile, 'utf8')).baseId, /^manifest:2026-10-01T10:00:00\.000Z:a$/);
    W.stopDesktop('c-dk1');
    // 3. same base again → the same disk, nothing archived
    fs.writeFileSync(disk, 'ov-with-work');
    const r2 = W.startDesktop({ compartmentId: 'c-dk1', stateRoot: path.join(tmp, 'c-dk1'), _qemu: F.q, _spawn: F.spawn, _ga: F.ga, _runImg: runImg, _host: host(m1) });
    assert.ok(r2.ok && !r2.staleDiskArchived); assert.strictEqual(fs.readFileSync(disk, 'utf8'), 'ov-with-work');
    W.stopDesktop('c-dk1');
    // 4. the base rebuilt → the old overlay is kept beside (renamed), a fresh one made over the new base
    const m2 = { createdAt: '2026-10-02T09:00:00.000Z', userDataSha256: 'b', extras: ['desktop'] };
    const r3 = W.startDesktop({ compartmentId: 'c-dk1', stateRoot: path.join(tmp, 'c-dk1'), _qemu: F.q, _spawn: F.spawn, _ga: F.ga, _runImg: runImg, _host: host(m2) });
    assert.ok(r3.ok && r3.staleDiskArchived, JSON.stringify(r3));
    assert.strictEqual(fs.readFileSync(r3.staleDiskArchived, 'utf8'), 'ov-with-work', 'the stale disk is archived, not deleted (§0.3)');
    assert.strictEqual(fs.readFileSync(disk, 'utf8'), 'ov');
    assert.match(JSON.parse(fs.readFileSync(stampFile, 'utf8')).baseId, /:b$/);
    W.stopDesktop('c-dk1');
    // 5. a branch whose original's disk was made over the OLD base branches from the base, not from it
    const r4 = W.startDesktop({ compartmentId: 'c-dk2', stateRoot: path.join(tmp, 'c-dk2'), originStateRoot: path.join(tmp, 'c-dk0x'), _qemu: F.q, _spawn: F.spawn, _ga: F.ga, _runImg: runImg, _host: host(m2) });
    assert.ok(r4.ok && r4.branchedFrom === 'base');
    fs.mkdirSync(path.dirname(W.desktopDisk(path.join(tmp, 'c-dk3o'))), { recursive: true });
    fs.writeFileSync(W.desktopDisk(path.join(tmp, 'c-dk3o')), 'origin');
    fs.writeFileSync(W.desktopDisk(path.join(tmp, 'c-dk3o')).replace(/\.qcow2$/, '.json'), JSON.stringify({ baseId: 'manifest:2026-10-01T10:00:00.000Z:a' }));
    const r5 = W.startDesktop({ compartmentId: 'c-dk3', stateRoot: path.join(tmp, 'c-dk3'), originStateRoot: path.join(tmp, 'c-dk3o'), _qemu: F.q, _spawn: F.spawn, _ga: F.ga, _runImg: runImg, _host: host(m2) });
    assert.ok(r5.ok && r5.branchedFrom === 'base', 'an original made over another base is not branched from');
    fs.writeFileSync(W.desktopDisk(path.join(tmp, 'c-dk3o')).replace(/\.qcow2$/, '.json'), JSON.stringify({ baseId: 'manifest:2026-10-02T09:00:00.000Z:b' }));
    W.stopDesktop('c-dk3'); fs.renameSync(W.desktopDisk(path.join(tmp, 'c-dk3')), W.desktopDisk(path.join(tmp, 'c-dk3')) + '.moved');
    fs.rmSync(W.desktopDisk(path.join(tmp, 'c-dk3')).replace(/\.qcow2$/, '.json'), { force: true });
    const r6 = W.startDesktop({ compartmentId: 'c-dk3', stateRoot: path.join(tmp, 'c-dk3'), originStateRoot: path.join(tmp, 'c-dk3o'), _qemu: F.q, _spawn: F.spawn, _ga: F.ga, _runImg: runImg, _host: host(m2) });
    assert.ok(r6.ok && r6.branchedFrom === 'original', 'an original made over this base is');
    W.stopDesktop('c-dk3'); W.stopDesktop('c-dk2');
    // 6. the setup job lets the desktop through; the wizard offers it, on by default
    assert.match(fs.readFileSync(path.join(ROOT, 'cos/testenv/setup-job.js'), 'utf8'), /\(go\|ruby\|php\|rust\|desktop\)/);
    const app = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8');
    assert.match(app, /extras: \['desktop'\] \}/); assert.match(app, /class="vm-setup-extra" value="desktop"/);
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

  await t('WS-14', '0.39.280 BS14: git errors are git\'s own error lines, never its CRLF warnings; a CRLF-configured git makes the branch without warnings', () => {
    const warn = Array.from({ length: 40 }, (_, i) => `warning: in the working copy of 'f${i}.json', LF will be replaced by CRLF the next time Git touches it`).join('\n');
    assert.strictEqual(W.gitWhy({ stderr: warn + '\nfatal: \'nexus/x\' is already checked out at \'/y\'', status: 128 }), "fatal: 'nexus/x' is already checked out at '/y'");
    assert.strictEqual(W.gitWhy({ stderr: warn, status: 1 }), 'git exited 1', 'only warnings → the exit status, not the warnings');
    assert.match(W.gitWhy({ code: 'ETIMEDOUT' }), /timed out after 600s/);
    const o = path.join(tmp, 'crlf-orig'); fs.mkdirSync(o, { recursive: true });
    fs.writeFileSync(path.join(o, 'atlas.json'), '{"a":1}\n');
    const prev = process.env.GIT_CONFIG_PARAMETERS;
    process.env.GIT_CONFIG_PARAMETERS = "'core.autocrlf'='true' 'core.safecrlf'='warn'";   // what a Windows git config does
    try { const r = W.branchWorkspace({ originDir: o, name: 'crlf code' }); assert.ok(r.ok, JSON.stringify(r)); }
    finally { if (prev === undefined) delete process.env.GIT_CONFIG_PARAMETERS; else process.env.GIT_CONFIG_PARAMETERS = prev; }
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
    assert.match(u, /U='nexus'/);   // §0.39.282 N20 the account comes from desktopLogin() (settings desktop.user)
    assert.match(u, /autologin-user=%s\\nautologin-session=xfce\\n' "\$U"/);
    assert.match(u, /chpasswd/);
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
    assert.match(api, /cosBridge\.branchWorkspaceAsync\(\{ originDir: _repoDiskDir\(_origin\.uuid\), name: manifest\.name \}\)/);
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
