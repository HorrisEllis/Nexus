'use strict';
// §SANDBOX — COS under a throwaway root (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-remote.test.js — §0.39.265
 *
 * James: "i meant like push pull for the compartments remotely."
 * lib/cos-remote.js with two real "machines" — this process and a child
 * process with its OWN COS home — sharing one folder remote:
 *   push → the other machine pulls it as a new compartment (project part
 *   included) → changes it and pushes → this machine is "behind" and pulls
 *   (backup kept, exact changed files) → both change → "diverged", refused
 *   both ways until forced. ssh locations parse; the heavy work runs out of
 *   process; the API and UI are wired.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const R = require(path.join(ROOT, 'lib', 'cos-remote.js'));
const bridge = require(path.join(ROOT, 'lib', 'cos-bridge.js'));

let passed = 0, failed = 0;
async function test(desc, fn) {
  try { await fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-remote-'));
const remoteDir = path.join(tmp, 'shared-remote');          // stands in for a USB drive / OneDrive folder
const machineB = path.join(tmp, 'machine-b-cos');
const put = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };

/** run cos-remote on "the other machine": a child process with its own COS home */
function onB(code) {
  const r = spawnSync(process.execPath, ['-e', `
    const R = require(${JSON.stringify(path.join(ROOT, 'lib', 'cos-remote.js'))});
    const bridge = require(${JSON.stringify(path.join(ROOT, 'lib', 'cos-bridge.js'))});
    const fs = require('fs'), path = require('path');
    (async () => { const out = await (async () => { ${code} })(); process.stdout.write('\\n@@' + JSON.stringify(out)); })().catch(e => { process.stdout.write('\\n@@' + JSON.stringify({ threw: e.message })); });
  `], { env: { ...process.env, COS_DATA_ROOT: machineB }, encoding: 'utf8', timeout: 120000 });
  const line = (r.stdout || '').split('\n').reverse().find(l => l.startsWith('@@'));
  if (!line) throw new Error(`machine B produced no result: ${r.stderr}`);
  return JSON.parse(line.slice(2));
}

(async () => {
  console.log('\n  compartment remotes');
  if (!bridge.available()) { console.log(`  COS unavailable: ${bridge.lastError()} — skipping`); process.exit(0); }

  await test('locations: folders (drive, share, file://) and ssh (user@host:path, ssh://user@host:port/path); anything else refused', () => {
    assert.deepStrictEqual(R.parseLocation(remoteDir), { ok: true, kind: 'folder', dir: remoteDir });
    assert.deepStrictEqual(R.parseLocation('me@nas.local:backups/nexus'), { ok: true, kind: 'ssh', target: 'me@nas.local', port: null, dir: 'backups/nexus' });
    assert.deepStrictEqual(R.parseLocation('ssh://root@203.0.113.9:2222/srv/nexus/'), { ok: true, kind: 'ssh', target: 'root@203.0.113.9', port: 2222, dir: '/srv/nexus' });
    assert.strictEqual(R.parseLocation('me@host:~/').dir, 'nexus-compartments', 'home dir → a default subfolder');
    for (const bad of ['', 'relative/path', 'https://x.com/y', 'me@host:x\nrm -rf /']) assert.ok(!R.parseLocation(bad).ok, JSON.stringify(bad));
    assert.throws(() => R.parseLocation("me@host:a'b"), /quotes/);
  });

  // machine A: a compartment with its own files and a project mount (like an Idearium repo)
  const made = bridge.createCompartment({ name: 'drumpad', purpose: 'a drum machine' });
  assert.ok(made.ok, made.error);
  const A = made.compartment;
  const projA = path.join(tmp, 'drumpad-project');
  put(A.fs.root, 'notes/todo.md', 'kick, snare\n');
  put(projA, 'src/pad.js', 'module.exports = 1;\n');
  put(projA, 'node_modules/x/index.js', 'never travels');
  assert.ok(bridge.mountPath(A.id, { path: projA, role: 'project' }).ok);

  await test('a remote is added per compartment; status before any push is "not-pushed"', async () => {
    assert.ok(R.addRemote(A.id, { name: 'usb', location: remoteDir }).ok);
    assert.ok(!R.addRemote(A.id, { name: 'bad name!', location: remoteDir }).ok);
    const st = await R.status({ compartment: A.id, remote: 'usb' });
    assert.strictEqual(st.state, 'not-pushed');
    assert.strictEqual(st.local.files, 2, 'root + project files, node_modules and the manifest left out');
  });

  await test('push writes bundle + meta; pushing again with nothing changed does nothing', async () => {
    const p = await R.push({ compartment: A.id, remote: 'usb' });
    assert.ok(p.ok && p.files === 2, JSON.stringify(p));
    assert.ok(fs.existsSync(path.join(remoteDir, 'drumpad', 'bundle.zip')) && fs.existsSync(path.join(remoteDir, 'drumpad', 'meta.json')));
    assert.strictEqual((await R.status({ compartment: A.id, remote: 'usb' })).state, 'in-sync');
    assert.ok((await R.push({ compartment: A.id, remote: 'usb' })).nothingToPush);
  });

  await test('the other machine browses the remote and pulls the compartment it does not have — project files included', () => {
    const b = onB(`return await R.browse({ location: ${JSON.stringify(remoteDir)} });`);
    assert.ok(b.ok && b.compartments.length === 1 && b.compartments[0].name === 'drumpad' && b.compartments[0].purpose === 'a drum machine' && !b.compartments[0].here, JSON.stringify(b));
    const r = onB(`return await R.pull({ location: ${JSON.stringify(remoteDir)}, name: 'drumpad' });`);
    assert.ok(r.ok && r.state === 'new' && r.project && r.project.files === 1, JSON.stringify(r));
    assert.strictEqual(fs.readFileSync(path.join(r.root, 'notes', 'todo.md'), 'utf8'), 'kick, snare\n');
    assert.ok(r.root.startsWith(machineB), 'created in machine B\'s own COS home');
    assert.ok(fs.readFileSync(path.join(r.project.dir, 'src', 'pad.js'), 'utf8').includes('module.exports'));
  });

  await test('the other machine changes it and pushes; this machine is "behind" and pulls exactly the changes, with a backup', async () => {
    const r = onB(`const c = bridge.getCompartment('drumpad');
      fs.writeFileSync(path.join(c.fs.root, 'notes', 'todo.md'), 'kick, snare, hat\\n');
      fs.writeFileSync(path.join(c.fs.root, 'notes', 'new.md'), 'from B\\n');
      return await R.push({ compartment: 'drumpad', remote: 'origin' });`);
    assert.ok(r.ok && r.state === 'ahead', JSON.stringify(r));
    assert.strictEqual((await R.status({ compartment: A.id, remote: 'usb' })).state, 'behind');
    assert.match((await R.push({ compartment: A.id, remote: 'usb' })).error, /pull first/);
    const p = await R.pull({ compartment: A.id, remote: 'usb' });
    assert.ok(p.ok && p.state === 'behind' && p.backup && fs.existsSync(p.backup), JSON.stringify(p));
    assert.deepStrictEqual(p.changed.root.sort((a, b) => a.path.localeCompare(b.path)), [{ status: 'A', path: 'notes/new.md' }, { status: 'M', path: 'notes/todo.md' }]);
    assert.strictEqual(fs.readFileSync(path.join(A.fs.root, 'notes', 'todo.md'), 'utf8'), 'kick, snare, hat\n');
    assert.ok(fs.existsSync(path.join(projA, 'node_modules', 'x', 'index.js')), 'skipped folders are never touched');
    assert.strictEqual((await R.status({ compartment: A.id, remote: 'usb' })).state, 'in-sync');
  });

  await test('both sides change → "diverged": push and pull both refuse until forced; a forced pull keeps a backup', async () => {
    put(A.fs.root, 'notes/a-only.md', 'A\n');
    onB(`const c = bridge.getCompartment('drumpad'); fs.writeFileSync(path.join(c.fs.root, 'notes', 'b-only.md'), 'B\\n'); return await R.push({ compartment: 'drumpad', remote: 'origin' });`);
    assert.strictEqual((await R.status({ compartment: A.id, remote: 'usb' })).state, 'diverged');
    assert.match((await R.push({ compartment: A.id, remote: 'usb' })).error, /both changed/);
    assert.match((await R.pull({ compartment: A.id, remote: 'usb' })).error, /both changed/);
    const p = await R.pull({ compartment: A.id, remote: 'usb', force: true });
    assert.ok(p.ok && fs.existsSync(p.backup) && !fs.existsSync(path.join(A.fs.root, 'notes', 'a-only.md')) && fs.existsSync(path.join(A.fs.root, 'notes', 'b-only.md')));
    assert.ok(fs.existsSync(path.join(remoteDir, 'drumpad', 'bundle.prev.zip')), 'the remote keeps the version before the last push');
  });

  await test('a tampered bundle is refused, never applied', async () => {
    onB(`const c = bridge.getCompartment('drumpad'); fs.writeFileSync(path.join(c.fs.root, 'notes', 'x.md'), 'x\\n'); return await R.push({ compartment: 'drumpad', remote: 'origin' });`);
    const bz = path.join(remoteDir, 'drumpad', 'bundle.zip');
    const buf = fs.readFileSync(bz); buf[buf.length - 60] ^= 0xff; fs.writeFileSync(bz, buf);
    const p = await R.pull({ compartment: A.id, remote: 'usb' });
    assert.ok(!p.ok && /checksum|not a zip|content hash|failed/i.test(p.error), JSON.stringify(p));
  });

  await test('runIsolated runs an op in its own process and returns its result', async () => {
    const r = await R.runIsolated('status', { compartment: A.id, remote: 'usb' });
    assert.ok(r.ok && r.compartment === 'drumpad' && ['behind', 'diverged'].includes(r.state), JSON.stringify(r));
    assert.match((await R.runIsolated('nope', {})).error, /unknown op/);
  });

  await test('the API and UI: routes, SSH key by alias, out-of-process ops, pulled project files brought into the repo', () => {
    const API = fs.readFileSync(path.join(ROOT, 'idearium', 'api', 'index.js'), 'utf8');
    for (const a of ['cos.remote.list', 'cos.remote.add', 'cos.remote.remove', 'cos.remote.status', 'cos.remote.push', 'cos.remote.pull', 'cos.remote.browse', 'cos.remote.clone']) assert.ok(API.includes(`'${a}'`), a);
    const i = API.indexOf("case 'cos.remote.list':"), block = API.slice(i, i + 9000);
    assert.ok(/const op = action\.split\('\.'\)\.pop\(\);\s*\n\s*const r = await CR\.runIsolated\(op, \{ compartment: comp\.id, remote: remote\.name, keyPath, force: !!body\.force \}\)/.test(block), 'status/push/pull run out of process');
    assert.ok(/CR\.runIsolated\('browse'/.test(block) && /CR\.runIsolated\('pull', \{ location: body\.location/.test(block) && /resolveSshKey\(\{ compartmentName: comp\.id, alias: remote\.keyAlias \}\)/.test(block));
    assert.ok(/_importFolderAsRepo\(\{ dir: r\.project\.dir/.test(block) && /mountPath\(r\.compartmentId, \{ path: im\.matDir, role: 'project' \}\)/.test(block), 'a pulled project becomes a repo, mounted so it travels next time');
    assert.ok(/_applyChangedFilesToRepo\(/.test(block), 'a pull that changed the project folder updates the repo');
    const APP = fs.readFileSync(path.join(ROOT, 'idearium', 'ui', 'js', 'app.js'), 'utf8');
    for (const f of ['cosRemoteAdd', 'cosRemotePush', 'cosRemotePull', 'cosRemoteStatus', 'openCosRemoteBrowse', 'cosRemoteClone']) assert.ok(APP.includes(`function ${f}(`), f);
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
