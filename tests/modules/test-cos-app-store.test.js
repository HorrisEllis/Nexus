'use strict';
// CA-01..13 (0.60.87 COSA1): COS as an application — the version store and zip import. Real zips (lib/zip.js), real folders in a temp root; no network, no Electron.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const Zip = require('../../lib/zip.js'); const S = require('../../cos/app/store.js'); const CLI = require('../../cos/app/cli.js');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); console.log('  ✓ ' + name); passed++; } catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n    ')); failed++; } }
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function mkzip(dir, { project = 'nexus', version = '0.60.65', top, versionFile, files = {}, extra = [], name } = {}) {
  const t = top || `${project}-${version}`; const ents = [{ path: `${t}/VERSION`, data: Buffer.from((versionFile === undefined ? version : versionFile) + '\n') }, { path: `${t}/lib/version.js`, data: Buffer.from(`system: '${version}'`) },
    ...Object.entries(files).map(([p, d]) => ({ path: `${t}/${p}`, data: Buffer.from(d) })), ...extra];
  const f = path.join(dir, name || `${project}-${version}.zip`); fs.writeFileSync(f, Zip.create(ents)); return f;
}
const fresh = () => ({ root: tmp('cos-root-'), dl: tmp('cos-dl-') });
const proj = (root, p = 'nexus') => path.join(root, 'projects', p);

(async () => {
  await test('CA-01 an import installs the release beside others, links data to the persistent folder, and records it', () => {
    const { root, dl } = fresh(); const r = S.importZip(root, mkzip(dl, { files: { 'a.txt': 'hi' } })); assert.strictEqual(r.ok, true, JSON.stringify(r)); assert.strictEqual(r.version, '0.60.65');
    const v = path.join(proj(root), 'versions', '0.60.65'); assert.strictEqual(fs.readFileSync(path.join(v, 'a.txt'), 'utf8'), 'hi'); assert.ok(fs.lstatSync(path.join(v, 'data')).isSymbolicLink());
    assert.strictEqual(fs.realpathSync(path.join(v, 'data')), fs.realpathSync(path.join(proj(root), 'data')));
    const l = S.list(root)[0]; assert.strictEqual(l.versions[0].dataLinked, true); assert.strictEqual(l.versions[0].verified, false);
  });
  await test('CA-02 two versions share ONE data folder: what one writes the other sees', () => {
    const { root, dl } = fresh(); S.importZip(root, mkzip(dl, { version: '0.60.65' })); S.importZip(root, mkzip(dl, { version: '0.60.66' }));
    fs.writeFileSync(path.join(proj(root), 'versions', '0.60.65', 'data', 'jobs.json'), '{"n":1}');
    assert.strictEqual(fs.readFileSync(path.join(proj(root), 'versions', '0.60.66', 'data', 'jobs.json'), 'utf8'), '{"n":1}');
    assert.deepStrictEqual(S.list(root)[0].versions.map(v => v.version), ['0.60.66', '0.60.65'], 'newest first');
  });
  await test('CA-03 the same zip twice is a no-op; different content under the same version is refused and the first is untouched', () => {
    const { root, dl } = fresh(); const z = mkzip(dl, { files: { 'a.txt': 'one' } }); S.importZip(root, z); const again = S.importZip(root, z); assert.strictEqual(again.already, true);
    const other = tmp('cos-dl2-'); const z2 = mkzip(other, { files: { 'a.txt': 'TWO' } }); const r = S.importZip(root, z2); assert.strictEqual(r.ok, false); assert.match(r.error, /already installed with different content/);
    assert.strictEqual(fs.readFileSync(path.join(proj(root), 'versions', '0.60.65', 'a.txt'), 'utf8'), 'one');
  });
  await test('CA-04 checksums: right one verifies, wrong one refuses before extracting, SHA256SUMS beside the zip is found, required-but-missing refuses', () => {
    const { root, dl } = fresh(); const z = mkzip(dl);
    const bad = S.importZip(root, z, { sha256: 'a'.repeat(64) }); assert.strictEqual(bad.ok, false); assert.match(bad.error, /checksum mismatch/); assert.ok(!fs.existsSync(path.join(proj(root), 'versions')), 'nothing was extracted');
    assert.match(S.importZip(root, z, { requireChecksum: true }).error, /no checksum/);
    fs.writeFileSync(path.join(dl, 'SHA256SUMS'), `${sha(z)}  ${path.basename(z)}\n`); const ok = S.importZip(root, z, { requireChecksum: true }); assert.strictEqual(ok.ok, true, JSON.stringify(ok)); assert.strictEqual(ok.verified, true); assert.match(ok.note, /SHA256SUMS/);
  });
  await test('CA-05 a path-traversal entry is refused and nothing is written outside the store', () => {
    const { root, dl } = fresh(); const z = mkzip(dl, { extra: [{ path: '../evil.txt', data: Buffer.from('x') }] }); const r = S.importZip(root, z); assert.strictEqual(r.ok, false); assert.match(r.error, /outside the folder/);
    assert.ok(!fs.existsSync(path.join(root, '..', 'evil.txt'))); assert.ok(!fs.existsSync(path.join(proj(root), 'versions')));
    const abs = S.importZip(root, mkzip(dl, { name: 'abs.zip', extra: [{ path: '/etc/evil', data: Buffer.from('x') }] })); assert.strictEqual(abs.ok, false);
  });
  await test('CA-06 a zip that is not the release it claims to be is refused: VERSION mismatch, no VERSION, two top folders, not a zip', () => {
    const { root, dl } = fresh();
    assert.match(S.importZip(root, mkzip(dl, { versionFile: '9.9.9' })).error, /not the release it claims/);
    const noV = path.join(dl, 'nov.zip'); fs.writeFileSync(noV, Zip.create([{ path: 'nexus-1.0.0/a.txt', data: Buffer.from('x') }])); assert.match(S.importZip(root, noV).error, /no nexus-1\.0\.0\/VERSION/);
    const two = path.join(dl, 'two.zip'); fs.writeFileSync(two, Zip.create([{ path: 'a/x', data: Buffer.from('x') }, { path: 'b/y', data: Buffer.from('y') }])); assert.match(S.importZip(root, two).error, /one top folder/);
    const junk = path.join(dl, 'junk.zip'); fs.writeFileSync(junk, 'not a zip'); assert.match(S.importZip(root, junk).error, /not a readable zip/);
    assert.match(S.importZip(root, path.join(dl, 'missing.zip')).error, /no such file/);
    assert.match(S.importZip(root, mkzip(dl, { top: 'nexus-latest', name: 'latest.zip' })).error, /not <project>-<version>/);
  });
  await test('CA-07 size limits refuse before extracting (zip size, entry count, unpacked size)', () => {
    const { root, dl } = fresh(); const z = mkzip(dl, { files: { 'big.txt': 'x'.repeat(5000) } });
    assert.match(S.importZip(root, z, { limits: { maxZipBytes: 100 } }).error, /over the .* limit/); assert.match(S.importZip(root, z, { limits: { maxEntries: 2 } }).error, /entries, over/); assert.match(S.importZip(root, z, { limits: { maxUncompressed: 1000 } }).error, /unpacks to/);
    assert.ok(!fs.existsSync(path.join(proj(root), 'versions')));
  });
  await test('CA-08 a corrupt zip fails mid-way and leaves nothing: no version folder, no .incoming, no state', () => {
    const { root, dl } = fresh(); const rnd = crypto.randomBytes(400); const z = mkzip(dl, { extra: [{ path: 'nexus-0.60.65/blob.bin', data: rnd }] }); const buf = fs.readFileSync(z);
    const at = buf.indexOf(rnd.subarray(0, 32)); assert.ok(at >= 0, 'incompressible data is stored, so its bytes are findable'); buf[at + 5] ^= 0xff; fs.writeFileSync(z, buf);
    const r = S.importZip(root, z); assert.strictEqual(r.ok, false, JSON.stringify(r)); assert.match(r.error, /import failed and was cleaned up/);
    const vd = path.join(proj(root), 'versions'); assert.deepStrictEqual(fs.existsSync(vd) ? fs.readdirSync(vd) : [], [], 'no half-installed leftovers'); assert.ok(!fs.existsSync(path.join(proj(root), 'state.json')), 'nothing recorded'); assert.ok(S.list(root).every(p => !p.versions.length));
  });

  await test('CA-09 a data/ folder inside the zip is merged into the persistent data without overwriting what is already there', () => {
    const { root, dl } = fresh(); fs.mkdirSync(path.join(proj(root), 'data'), { recursive: true }); fs.writeFileSync(path.join(proj(root), 'data', 'keep.json'), 'MINE');
    const r = S.importZip(root, mkzip(dl, { files: { 'data/keep.json': 'FROM-ZIP', 'data/new.json': 'N' } })); assert.strictEqual(r.ok, true); assert.strictEqual(r.dataMoved, 1);
    assert.strictEqual(fs.readFileSync(path.join(proj(root), 'data', 'keep.json'), 'utf8'), 'MINE'); assert.strictEqual(fs.readFileSync(path.join(proj(root), 'data', 'new.json'), 'utf8'), 'N');
    assert.ok(fs.lstatSync(path.join(proj(root), 'versions', '0.60.65', 'data')).isSymbolicLink());
  });
  await test('CA-10 the inbox: drop zips, good ones install and move to done/, bad ones move to failed/ with the reason', () => {
    const { root, dl } = fresh(); const inbox = path.join(root, 'inbox'); fs.mkdirSync(inbox, { recursive: true });
    fs.copyFileSync(mkzip(dl, { version: '0.60.70' }), path.join(inbox, 'good.zip')); fs.writeFileSync(path.join(inbox, 'bad.zip'), 'nope');
    const rs = S.scanInbox(root); assert.strictEqual(rs.length, 2); assert.strictEqual(rs.find(r => r.file === 'good.zip').ok, true); assert.strictEqual(rs.find(r => r.file === 'bad.zip').ok, false);
    assert.ok(fs.existsSync(path.join(inbox, 'done', 'good.zip'))); assert.ok(fs.existsSync(path.join(inbox, 'failed', 'bad.zip'))); assert.match(fs.readFileSync(path.join(inbox, 'failed', 'bad.zip.why.txt'), 'utf8'), /not a readable zip/);
    assert.strictEqual(S.status(root).inbox.pending, 0); assert.strictEqual(S.list(root)[0].versions[0].version, '0.60.70');
  });
  await test('CA-11 remove moves a version to trash (never deletes), takes the data link out first, and refuses the current one', () => {
    const { root, dl } = fresh(); S.importZip(root, mkzip(dl, { version: '0.60.65' })); S.importZip(root, mkzip(dl, { version: '0.60.66' })); fs.writeFileSync(path.join(proj(root), 'data', 'precious.json'), 'P');
    const sf = path.join(proj(root), 'state.json'); const st = JSON.parse(fs.readFileSync(sf)); st.current = '0.60.66'; fs.writeFileSync(sf, JSON.stringify(st));
    assert.match(S.remove(root, 'nexus', '0.60.66').error, /current version/); const r = S.remove(root, 'nexus', '0.60.65'); assert.strictEqual(r.ok, true);
    assert.ok(fs.existsSync(path.join(r.moved, 'VERSION')), 'kept in trash'); assert.ok(!fs.existsSync(path.join(r.moved, 'data')), 'trash holds no path into live data');
    assert.strictEqual(fs.readFileSync(path.join(proj(root), 'data', 'precious.json'), 'utf8'), 'P', 'the data survived'); assert.deepStrictEqual(S.list(root)[0].versions.map(v => v.version), ['0.60.66']);
  });
  await test('CA-12 the CLI: import / list / status, --json, exit 1 with the reason on a refusal', () => {
    const { root, dl } = fresh(); const lines = []; const run = (...a) => CLI.main([...a, '--root', root], (s) => lines.push(s));
    assert.strictEqual(run('import', mkzip(dl, { version: '0.60.67' })), 0); assert.match(lines.join('\n'), /nexus 0\.60\.67 installed/); assert.match(lines.join('\n'), /NOT verified/);
    lines.length = 0; assert.strictEqual(run('list'), 0); assert.match(lines.join('\n'), /0\.60\.67 .*unverified.*data linked/);
    lines.length = 0; assert.strictEqual(run('import', path.join(dl, 'nope.zip')), 1); assert.match(lines[0], /^✗ no such file/);
    lines.length = 0; assert.strictEqual(run('list', '--json'), 0); assert.strictEqual(JSON.parse(lines[0]).projects[0].project, 'nexus');
    lines.length = 0; assert.strictEqual(run('wat'), 1); assert.match(lines[0], /unknown command/);
  });
  await test('CA-13 the project filter: a zip for another project is refused when one is named', () => {
    const { root, dl } = fresh(); const r = S.importZip(root, mkzip(dl, { project: 'forge', version: '1.2.3' }), { project: 'nexus' }); assert.strictEqual(r.ok, false); assert.match(r.error, /project "forge", not "nexus"/);
    assert.strictEqual(S.importZip(root, mkzip(dl, { project: 'forge', version: '1.2.3', name: 'f.zip' })).project, 'forge');
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
