'use strict';
// run-all: timeout 180000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-disk.test.js — DK1–DK3, 0.60.381 (docs/2026-11-02-cos-disk-phasemap.spec).
 * James, 2026-11-02: "Cos is the wmware. The compartments are the virtual machines/disks." · "Use the spec as metadata then have the actual file be
 * a compressed or virtual disk or envirement."
 *   DK-01  a disk: the metadata first (declaration, spec files by hash, coverage, base), its code layer; its data only when asked; unpacked
 *          byte-identical; standard tar reads it
 *   DK-02  verify names a changed file; unpack refuses an entry that would leave its folder; a file that is not a disk is said
 *   DK-03  through COS's manager: made by a person, listed, inspected, verified; an agent refused; COS's command line `disk`, `disks`
 *   DK-04  a real system (loom) made into a disk and verified
 *   DK-05  in Clear Glass: a system's Disk tab shows its metadata and coverage, makes a disk, verifies it
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), zlib = require('zlib');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron/dist/electron'))) process.env.GLASS_CHROMIUM = c; }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-disk-'));
process.env.COS_MANAGER_DATA = path.join(tmp, 'data', 'manager');
const { createDisks } = require(path.join(ROOT, 'cos/disk/disk.js'));
const { TarWriter } = require(path.join(ROOT, 'cos/testenv/tar.js'));

let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 5).join('\n    ')}`); failed++; } }
const W = (f, s) => { fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.writeFileSync(path.join(tmp, f), s); };
const wait = async (fn, ms = 10000) => { const until = Date.now() + ms; while (Date.now() < until) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 100)); } throw new Error('timed out waiting'); };
const req = (port, method, p, body) => new Promise((res, rej) => { const b = body ? JSON.stringify(body) : ''; const q = http.request({ host: '127.0.0.1', port, path: p, method, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) } }, r => { let t = ''; r.on('data', c => t += c); r.on('end', () => { try { res({ status: r.statusCode, j: JSON.parse(t) }); } catch (e) { rej(e); } }); }); q.on('error', rej); q.end(b); });

(async () => {
  console.log('\n⬢  COS disks: the spec as metadata, the files in one compressed file (DK1–DK3)\n');
  W('VERSION', '9.9.9\n');
  W('alpha/compartment.json', JSON.stringify({ schema: 'nexus.compartment/1', name: 'alpha', runtime: { process: { name: 'alpha', cmd: 'node', args: ['alpha/server.js'] } }, data: { dataDir: 'alpha/data' } }));
  W('alpha/server.js', 'require("http").createServer((q, r) => r.end("ok")).listen(0);\n');
  W('alpha/lib/deep/' + 'very-long-folder-name/'.repeat(6) + 'thing.js', 'module.exports = 42;\n');
  W('alpha/spec/alpha.spec', 'spec:\n  modules:\n    - id: MOD-ALPHA\n      path: alpha/server.js\n');
  W('alpha/data/memory.json', '{"his":"data"}\n');
  W('alpha/node_modules/x/index.js', 'never travels\n');
  const D = createDisks({ root: tmp, dir: path.join(tmp, 'disks') });
  let made;

  await test('DK-01', 'a disk: metadata first, code; data only when asked; unpacked byte-identical; standard tar reads it', async () => {
    made = await D.pack('alpha', { by: 'person' });
    assert.ok(made.ok && /^alpha-9\.9\.9-[0-9a-f]{12}\.disk$/.test(made.file), made.file);
    const i = D.inspect(made.file);
    assert.strictEqual(i.schema, 'nexus.cos.disk/1'); assert.strictEqual(i.metadata.declaredBy, 'alpha/compartment.json'); assert.strictEqual(i.metadata.declaration.name, 'alpha');
    assert.deepStrictEqual(i.metadata.spec.map(s => s.path).sort(), ['alpha/compartment.json', 'alpha/spec/alpha.spec']);
    assert.deepStrictEqual([i.metadata.coverage.namedBySpec, i.metadata.coverage.codeFiles], [1, 2], 'its spec names alpha/server.js of its two code files');
    assert.deepStrictEqual([i.base.kernel, i.base.nexus], ['lib', '9.9.9']); assert.strictEqual(i.layers.state, null);
    assert.ok(!i.files.some(f => /data\/memory\.json|node_modules/.test(f.path)), 'neither its data nor node_modules');
    const out = path.join(tmp, 'un'); D.unpack(made.file, out);
    for (const f of ['alpha/server.js', 'alpha/spec/alpha.spec', 'alpha/lib/deep/' + 'very-long-folder-name/'.repeat(6) + 'thing.js']) assert.strictEqual(fs.readFileSync(path.join(out, f), 'utf8'), fs.readFileSync(path.join(tmp, f), 'utf8'), f);
    const withData = await D.pack('alpha', { withState: true, by: 'person' });
    assert.ok(/-with-state\.disk$/.test(withData.file)); assert.deepStrictEqual(D.inspect(withData.file).layers.state.files, 1);
    D.unpack(withData.file, path.join(tmp, 'un2'), { layers: ['code', 'state'] }); assert.strictEqual(fs.readFileSync(path.join(tmp, 'un2/alpha/data/memory.json'), 'utf8'), '{"his":"data"}\n');
    let tarOk = true; try { execFileSync('tar', ['--version'], { stdio: 'ignore' }); } catch (_) { tarOk = false; }
    if (tarOk) { const l = execFileSync('tar', ['-tzf', path.join(tmp, 'disks', made.file)], { encoding: 'utf8' }).split('\n'); assert.strictEqual(l[0], 'disk.json'); assert.ok(l.includes('code/alpha/server.js')); }
    await assert.rejects(() => D.pack('alpha', { by: 'agent:x' }), /an agent proposes/);
  });

  await test('DK-02', 'verify names a changed file; unpack refuses an escape; not a disk said', () => {
    assert.deepStrictEqual(D.verify(made.file).ok, true);
    const f = path.join(tmp, 'disks', made.file); const raw = zlib.gunzipSync(fs.readFileSync(f));
    const at = raw.indexOf(Buffer.from('listen(0)')); raw.write('listen(1)', at); fs.writeFileSync(path.join(tmp, 'disks', 'tampered.disk'), zlib.gzipSync(raw));
    const v = D.verify('tampered.disk'); assert.strictEqual(v.ok, false); assert.deepStrictEqual(v.changed, ['alpha/server.js']);
    const evil = path.join(tmp, 'evil.tar'); const fd = fs.openSync(evil, 'w'); const w = new TarWriter(fd);
    const mj = Buffer.from(JSON.stringify({ schema: 'nexus.cos.disk/1', files: [] })); w.entry({ path: 'disk.json', mode: 0o644, size: mj.length, mtime: 0, type: '0' }); w._write(mj); w._write(Buffer.alloc(512 - mj.length % 512));
    const bad = Buffer.from('x'); w.entry({ path: 'code/../../escaped.txt', mode: 0o644, size: 1, mtime: 0, type: '0' }); w._write(bad); w._write(Buffer.alloc(511)); w.end(); fs.closeSync(fd);
    fs.writeFileSync(path.join(tmp, 'disks', 'evil.disk'), zlib.gzipSync(fs.readFileSync(evil)));
    assert.throws(() => D.unpack('evil.disk', path.join(tmp, 'un3')), /would leave/); assert.ok(!fs.existsSync(path.join(tmp, 'escaped.txt')));
    fs.writeFileSync(path.join(tmp, 'disks', 'plain.disk'), zlib.gzipSync(Buffer.alloc(1024)));
    assert.throws(() => D.inspect('plain.disk'), /no disk\.json inside/);
    assert.throws(() => D.inspect('../etc/passwd'), /not a disk name/);
  });

  // through COS's manager over the same fixture tree
  const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
  const sup = createSupervisor({ root: tmp, ledgerFile: path.join(tmp, 'data', 'manager', 'ledger.jsonl'), log: () => {} });
  const srv = require(path.join(ROOT, 'cos/manager/server.js')).createServer(sup, { root: tmp }); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const M = srv.address().port;

  await test('DK-03', 'through COS\'s manager: made, listed, inspected, verified; an agent refused; the command line', async () => {
    let r = await req(M, 'GET', '/api/cos/systems/alpha/disk'); assert.strictEqual(r.status, 200, JSON.stringify(r.j)); assert.strictEqual(r.j.metadata.declaredBy, 'alpha/compartment.json'); assert.strictEqual(r.j.coverage.pct, 50);
    r = await req(M, 'POST', '/api/cos/systems/alpha/disk', { by: 'agent:x' }); assert.strictEqual(r.status, 403);
    r = await req(M, 'POST', '/api/cos/systems/alpha/disk', { by: 'person' }); assert.strictEqual(r.status, 200, JSON.stringify(r.j)); const file = r.j.file;
    r = await req(M, 'GET', '/api/cos/disks'); assert.ok(r.j.disks.some(d => d.file === file)); assert.strictEqual(r.j.dir, path.join(tmp, 'data', 'disks'));
    r = await req(M, 'GET', `/api/cos/disks/${encodeURIComponent(file)}`); assert.strictEqual(r.j.disk.system, 'alpha'); assert.ok(!r.j.disk.files, 'the metadata, not the file list');
    r = await req(M, 'GET', `/api/cos/disks/${encodeURIComponent(file)}/verify`); assert.strictEqual(r.j.verify.ok, true);
    r = await req(M, 'GET', '/api/cos/systems/nope/disk'); assert.strictEqual(r.status, 404);
    r = await req(M, 'POST', '/api/cos/cli', { line: 'disk alpha', by: 'person' }); assert.ok(r.j.ok && /its spec names 1 of 2 code files \(50%\)/.test(r.j.lines[0]), r.j.lines.join('\n'));
    r = await req(M, 'POST', '/api/cos/cli', { line: `disk verify ${file}`, by: 'person' }); assert.match(r.j.lines[0], /every one of \d+ files matches/);
    r = await req(M, 'POST', '/api/cos/cli', { line: 'disk alpha make', by: 'agent:x' }); assert.strictEqual(r.j.ok, false);
    r = await req(M, 'POST', '/api/cos/cli', { line: 'disks', by: 'person' }); assert.ok(r.j.lines.some(l => l.startsWith(file)));
    assert.ok(sup.ledger({ system: 'alpha' }).some(e => e.kind === 'disk' && e.by === 'person'), 'a disk made is on the ledger');
  });

  await test('DK-04', 'a real system: loom made into a disk and verified', async () => {
    const R = createDisks({ root: ROOT, dir: path.join(tmp, 'real-disks') });
    const r = await R.pack('loom', { by: 'test' });
    assert.ok(r.files > 50, `${r.files} files`); assert.strictEqual(r.metadata.declaredBy, 'loom/compartment.json');
    assert.ok(!R.inspect(r.file).files.some(f => f.path.startsWith('loom/data/')), 'its data stays out');
    assert.strictEqual(R.verify(r.file).ok, true);
  });

  const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - DK-05 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  if (browser) {
    await test('DK-05', 'in Clear Glass: the Disk tab shows the metadata and coverage, makes a disk, verifies it', async () => {
      const ui = require(path.join(ROOT, 'cos/ui/serve.js')).createServer({ port: 0, manager: `http://127.0.0.1:${M}` });
      await new Promise(r => ui.listen(0, '127.0.0.1', r)); const U = ui.address().port;
      const page = await browser.newPage({ viewport: { width: 1360, height: 860 } }); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${U}/shell/#/c/alpha/disk`);
      const SR = `(() => { const f = document.querySelector('iframe[data-page="cockpit"]'); const d = f && f.contentDocument; const s = d && d.querySelector('#sections > .on'); return s && s.shadowRoot; })()`;
      try { await wait(async () => page.evaluate(`(() => { const r = ${SR}; return !!(r && r.querySelector('#meta span') && /50%/.test(r.querySelector('#cov').textContent)); })()`), 20000); }
      catch (e) { throw new Error('disk tab: ' + await page.evaluate(`(() => { const f = document.querySelector('iframe[data-page="cockpit"]'); const d = f && f.contentDocument; const r = ${SR}; return JSON.stringify({ hash: location.hash, frame: !!f, src: f && f.getAttribute('src'), sections: d && d.getElementById('sections') && d.getElementById('sections').innerHTML.slice(0, 200), body: d && d.body && d.body.innerText.slice(0, 300), root: r && r.innerHTML.slice(0, 300) }); })()`) + ' ' + errors.join(' | ')); }
      await page.evaluate(`${SR}.querySelector('#make').click()`);
      await page.waitForFunction(() => !document.getElementById('confirm').hidden); await page.evaluate(() => document.getElementById('confirm-yes').click());
      const n = sup.ledger({ system: 'alpha', limit: 500 }).filter(e => e.kind === 'disk').length;
      await wait(() => sup.ledger({ system: 'alpha', limit: 500 }).filter(e => e.kind === 'disk').length > n);   // made, and on the ledger as his act
      await wait(async () => page.evaluate(`${SR}.querySelector('#make').textContent === 'Make a disk' && !${SR}.querySelector('#make').disabled`));
      await new Promise(r => setTimeout(r, 300));
      await page.evaluate(`${SR}.querySelector('#disks li[data-file] button').click()`);
      await wait(async () => page.evaluate(`/all \\d+ match/.test(${SR}.querySelector('#disks li[data-file] .v').textContent)`));
      if (process.env.DK_SHOTS) await page.screenshot({ path: path.join(process.env.DK_SHOTS, 'cos-disk.png') });
      assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('#nav-main a[data-page="proposals"] .badge')).display), 'none', 'no proposals: no badge (it read 0 since MG18)');
      assert.deepStrictEqual(errors, [], 'no page error'); ui.close();
    });
    await browser.close();
  }

  sup.shutdown({ by: 'test' }); srv.close();
  await new Promise(r => setTimeout(r, 200)); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
