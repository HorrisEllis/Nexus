'use strict';
// run-all: timeout 240000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-vdisk.test.js — DK6–DK8, 0.60.383 (docs/2026-11-02-cos-disk-phasemap.spec).
 * James, 2026-11-03: "It needs to be a virtual disk. For the virtual envirements for qumu also. Like it holds all the data, snapshots, system state."
 * Real qemu-img and e2fsprogs; skipped, saying which tool is missing, on a host without them.
 *   VD-01  a virtual disk: qemu-img reads a qcow2 with an ext4 inside named for the system; its metadata, files and data read from inside without
 *          mounting; every file verified; a second make refused; a host without the tools said (501), nothing faked
 *   VD-02  snapshots inside the same file: snapshot, change the system, refresh (the snapshot kept), the snapshot still holds the old file,
 *          revert brings it back, drop removes it
 *   VD-03  a file removed inside the disk is named missing by verify
 *   VD-04  through COS's manager and its CLI: make, snapshot, verify; an agent refused; each act on the ledger
 *   VD-05  in Clear Glass: the Disk tab makes the virtual disk, takes a snapshot, lists it, verifies
 *   VD-06  the real Loom with all its data: one qcow2, verified from inside
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron/dist/electron'))) process.env.GLASS_CHROMIUM = c; }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-vdisk-'));
process.env.COS_MANAGER_DATA = path.join(tmp, 'data', 'manager');
const { createVDisks } = require(path.join(ROOT, 'cos/disk/vdisk.js'));

let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 5).join('\n    ')}`); failed++; } }
const W = (f, s) => { fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.writeFileSync(path.join(tmp, f), s); };
const wait = async (fn, ms = 15000) => { const until = Date.now() + ms; while (Date.now() < until) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 100)); } throw new Error('timed out waiting'); };
const req = (port, method, p, body) => new Promise((res, rej) => { const b = body ? JSON.stringify(body) : ''; const q = http.request({ host: '127.0.0.1', port, path: p, method, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) } }, r => { let t = ''; r.on('data', c => t += c); r.on('end', () => { try { res({ status: r.statusCode, j: JSON.parse(t) }); } catch (e) { rej(e); } }); }); q.on('error', rej); q.end(b); });

(async () => {
  console.log('\n⬢  COS virtual disks: one qcow2 per system — metadata, files, data, snapshots (DK6–DK8)\n');
  W('VERSION', '9.9.9\n');
  W('alpha/compartment.json', JSON.stringify({ schema: 'nexus.compartment/1', name: 'alpha', runtime: { process: { name: 'alpha', cmd: 'node', args: ['alpha/server.js'] } }, data: { dataDir: 'alpha/data' } }));
  W('alpha/server.js', 'module.exports = "version one";\n');
  W('alpha/spec/alpha.spec', 'spec:\n  modules:\n    - id: MOD-ALPHA\n      path: alpha/server.js\n');
  W('alpha/data/memory.json', '{"his":"data"}\n');
  const V = createVDisks({ root: tmp, dir: path.join(tmp, 'vd') });
  const t = V.tools();
  if (!t.ok) {
    console.log(`  - VD-01..VD-06 SKIPPED: ${t.why}`);
    await test('VD-00', 'without the tools: said, and nothing made', async () => { await assert.rejects(() => V.make('alpha', { by: 'person' }), (e) => e.code === 501 && /not on this host/.test(e.message)); });
    console.log(`\n  ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
  }
  const raw = (f) => { const r = path.join(tmp, `r-${Date.now()}.raw`); execFileSync(t.qemuImg, ['convert', '-U', '-O', 'raw', f, r]); return r; };

  await test('VD-01', 'a qcow2 with ext4 inside; metadata, files and data read from inside; verified; again refused; no tools said', async () => {
    const m = await V.make('alpha', { by: 'person' });
    assert.strictEqual(m.format, 'qcow2'); assert.strictEqual(m.file, 'alpha.qcow2'); assert.ok(m.actualSize < m.virtualSize, 'only what is written takes room');
    const r = raw(m.path); const stats = execFileSync(t.debugfs, ['-R', 'stats', r], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    assert.match(stats, /Filesystem volume name:\s+alpha/); assert.match(stats, /Filesystem features:.*extent/); fs.rmSync(r);
    const i = V.info('alpha');
    assert.deepStrictEqual([i.metadata.schema, i.metadata.kind, i.metadata.metadata.declaredBy], ['nexus.cos.disk/1', 'virtual', 'alpha/compartment.json']);
    assert.strictEqual(i.metadata.layers.state.files, 1, 'all its data, by default');
    const out = path.join(tmp, 'x1'); V.extract('alpha', out);
    assert.strictEqual(fs.readFileSync(path.join(out, 'code/alpha/server.js'), 'utf8'), 'module.exports = "version one";\n');
    assert.strictEqual(fs.readFileSync(path.join(out, 'state/alpha/data/memory.json'), 'utf8'), '{"his":"data"}\n');
    assert.ok(fs.existsSync(path.join(out, '.cos/spec/alpha/spec/alpha.spec')), 'the spec, as metadata, inside');
    assert.deepStrictEqual(V.verify('alpha').ok, true);
    await assert.rejects(() => V.make('alpha', { by: 'person' }), (e) => e.code === 409);
    const none = createVDisks({ root: tmp, dir: path.join(tmp, 'vd2'), env: { PATH: path.join(tmp, 'nowhere') } });
    assert.strictEqual(none.tools().ok, false); assert.deepStrictEqual(none.tools().missing, ['qemu-img', 'mke2fs', 'debugfs']);
    await assert.rejects(() => none.make('alpha', { by: 'person' }), (e) => e.code === 501 && /COS can still make the compressed \.disk/.test(e.message));
  });

  await test('VD-02', 'snapshots inside: snapshot, change, refresh (kept), the snapshot holds the old file, revert, drop', async () => {
    V.snapshot('alpha', 'one', { by: 'person' });
    W('alpha/server.js', 'module.exports = "version two";\n');
    const r = await V.refresh('alpha', { by: 'person' });
    assert.deepStrictEqual(r.snapshots.map(s => s.tag), ['one'], 'the snapshot survives the refresh');
    const now = path.join(tmp, 'x2'); V.extract('alpha', now, { layers: ['code'] }); assert.match(fs.readFileSync(path.join(now, 'code/alpha/server.js'), 'utf8'), /version two/);
    const old = path.join(tmp, 'x3'); V.extract('alpha', old, { layers: ['code'], snapshot: 'one' }); assert.match(fs.readFileSync(path.join(old, 'code/alpha/server.js'), 'utf8'), /version one/);
    assert.strictEqual(V.verify('alpha', { snapshot: 'one' }).ok, true, 'the snapshot verifies against its own metadata');
    assert.throws(() => V.snapshot('alpha', 'one', { by: 'person' }), (e) => e.code === 409);
    assert.throws(() => V.snapshot('alpha', 'bad name!', { by: 'person' }), /snapshot's name/);
    assert.throws(() => V.snapshot('alpha', 'x', { by: 'agent:a' }), (e) => e.code === 403);
    V.revert('alpha', 'one', { by: 'person' });
    const back = path.join(tmp, 'x4'); V.extract('alpha', back, { layers: ['code'] }); assert.match(fs.readFileSync(path.join(back, 'code/alpha/server.js'), 'utf8'), /version one/);
    V.dropSnapshot('alpha', 'one', { by: 'person' }); assert.deepStrictEqual(V.snapshots('alpha').snapshots, []);
  });

  await test('VD-03', 'a file removed inside the disk is named by verify', () => {
    const f = V.pathOf('alpha'); const r = raw(f);
    execFileSync(t.debugfs, ['-w', '-R', 'rm /code/alpha/server.js', r], { stdio: 'ignore' });
    const bad = path.join(tmp, 'bad.qcow2'); execFileSync(t.qemuImg, ['convert', '-O', 'qcow2', r, bad]); fs.copyFileSync(bad, path.join(tmp, 'vd', 'beta.qcow2')); fs.rmSync(r);
    const v = V.verify('beta'); assert.strictEqual(v.ok, false); assert.deepStrictEqual(v.missing, ['alpha/server.js']);
    fs.rmSync(path.join(tmp, 'vd', 'beta.qcow2'));
  });

  const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
  const sup = createSupervisor({ root: tmp, ledgerFile: path.join(tmp, 'data', 'manager', 'ledger.jsonl'), log: () => {} });
  const srv = require(path.join(ROOT, 'cos/manager/server.js')).createServer(sup, { root: tmp }); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const M = srv.address().port;
  const base = '/api/cos/systems/alpha/vdisk';

  await test('VD-04', 'through COS\'s manager and its CLI: make, snapshot, verify; an agent refused; on the ledger', async () => {
    let r = await req(M, 'GET', base); assert.ok(r.j.tools.ok); assert.strictEqual(r.j.disk, null, 'the manager keeps its own disks (COS\'s data)');
    r = await req(M, 'POST', `${base}/make`, { by: 'agent:x' }); assert.strictEqual(r.status, 403);
    r = await req(M, 'POST', `${base}/make`, { by: 'person' }); assert.strictEqual(r.status, 200, JSON.stringify(r.j)); assert.strictEqual(r.j.format, 'qcow2');
    r = await req(M, 'POST', `${base}/snapshot`, { by: 'person', tag: 'first' }); assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.j.snapshots.map(s => s.tag), ['first']);
    r = await req(M, 'GET', `${base}/verify`); assert.strictEqual(r.j.verify.ok, true);
    r = await req(M, 'GET', base); assert.strictEqual(r.j.disk.snapshots.length, 1); assert.strictEqual(r.j.disk.metadata.layers.state.files, 1);
    r = await req(M, 'POST', '/api/cos/cli', { line: 'vdisk alpha', by: 'person' }); assert.ok(r.j.ok && /alpha\.qcow2: qcow2/.test(r.j.lines[0]) && r.j.lines.some(l => /snapshot first/.test(l)), r.j.lines.join('\n'));
    r = await req(M, 'POST', '/api/cos/cli', { line: 'vdisk alpha snapshot second', by: 'agent:x' }); assert.strictEqual(r.j.ok, false);
    assert.ok(sup.ledger({ system: 'alpha', limit: 100 }).filter(e => e.kind === 'vdisk' && e.by === 'person').length >= 2);
    await req(M, 'POST', `${base}/drop-snapshot`, { by: 'person', tag: 'first' });
  });

  const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - VD-05 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  if (browser) {
    await test('VD-05', 'in Clear Glass: the Disk tab takes a snapshot, lists it, verifies', async () => {
      const ui = require(path.join(ROOT, 'cos/ui/serve.js')).createServer({ port: 0, manager: `http://127.0.0.1:${M}` });
      await new Promise(r => ui.listen(0, '127.0.0.1', r)); const U = ui.address().port;
      const page = await browser.newPage({ viewport: { width: 1360, height: 980 } }); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${U}/shell/#/c/alpha/disk`);
      const SR = `(() => { const f = document.querySelector('iframe[data-page="cockpit"]'); const d = f && f.contentDocument; const s = d && d.querySelector('#sections > .on'); return s && s.shadowRoot; })()`;
      await wait(async () => page.evaluate(`(() => { const r = ${SR}; return !!(r && r.querySelector('#vd-snap')); })()`), 20000);
      await page.evaluate(`(() => { const r = ${SR}; r.querySelector('#vd-tag').value = 'from-the-tab'; r.querySelector('#vd-snap').click(); })()`);
      await page.waitForFunction(() => !document.getElementById('confirm').hidden); await page.evaluate(() => document.getElementById('confirm-yes').click());
      await wait(async () => page.evaluate(`!!${SR}.querySelector('#vd-snaps li[data-tag="from-the-tab"]')`));
      await page.evaluate(`${SR}.querySelector('#vd-verify').click()`);
      await wait(async () => page.evaluate(`/all \\d+ files match/.test(${SR}.querySelector('#vd-v').textContent)`));
      if (process.env.VD_SHOTS) await page.screenshot({ path: path.join(process.env.VD_SHOTS, 'cos-vdisk.png') });
      assert.ok((await req(M, 'GET', base)).j.disk.snapshots.some(s => s.tag === 'from-the-tab'));
      assert.deepStrictEqual(errors, [], 'no page error'); ui.close();
    });
    await browser.close();
  }

  await test('VD-06', 'the real Loom with all its data: one qcow2, verified from inside', async () => {
    const R = createVDisks({ root: ROOT, dir: path.join(tmp, 'real') });
    const m = await R.make('loom', { by: 'test' });
    const i = R.info('loom'); assert.ok(i.metadata.layers.state && i.metadata.layers.state.files > 0, 'its data is on it');
    assert.strictEqual(R.verify('loom').ok, true); assert.ok(m.actualSize < 64 * 1048576, `${m.actualSize} bytes`);
  });

  sup.shutdown({ by: 'test' }); srv.close();
  await new Promise(r => setTimeout(r, 200)); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
