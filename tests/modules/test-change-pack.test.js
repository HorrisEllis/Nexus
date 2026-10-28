'use strict';
/**
 * tests/modules/test-change-pack.test.js — a change to Nexus as one zip dropped in the Versionium tab, applied through the gate (0.60.225)
 * James, 2026-10-28: "no patch file. unless idearium can run it. like i can drag it into the versionium tab and import"
 *
 *   CP-01  build from this repo's own history (0.60.224's commit): the manifest names every file with its before/after hash, never data/**
 *   CP-02  on a machine that has the before-files: check says every file will be written; applyPack writes them through the gate (an apply
 *          record per system); a second check says every file is already here
 *   CP-03  a file changed on the machine since the pack's base: check names the conflict and applyPack writes NOTHING, in any system
 *   CP-04  a pack whose file was edited after it was made is refused (hash), and a path out of the tree or into data/ is refused
 *   CP-05  every apply rolls back by its id, and the files are as they were
 *   CP-06  the route and the tab: a pack is answered as a change pack (checked first, applied on the press), only on a Nexus repo
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const CP = require(path.join(ROOT, 'lib/nexus-self/change-pack.js'));
const Zip = require(path.join(ROOT, 'lib/zip.js'));

let passed = 0, failed = 0;
function test(id, desc, fn) { try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 5).join('\n    ')}`); failed++; } }

console.log('\n⬡  change packs: a change to Nexus, dropped and applied through the gate\n');
const FROM = '9aebb4ad', TO = '0eebef00';   // 0.60.224
let have = true; try { execFileSync('git', ['cat-file', '-e', `${TO}^{commit}`], { cwd: ROOT, stdio: 'ignore' }); } catch (_) { have = false; }
if (!have) { console.log(`  - CP SKIPPED: commit ${TO} is not in this clone (shallow?)`); done(); }
else {
  const buf = CP.build({ from: FROM, to: TO, cwd: ROOT, version: '0.60.224' });
  const pack = CP.read(buf);
  const live = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-live-')), store = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-store-'));
  const before = (p) => { try { return execFileSync('git', ['show', `${FROM}:${p}`], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }); } catch (_) { return null; } };
  for (const f of pack.manifest.files) { const b = before(f.path); if (b) { fs.mkdirSync(path.dirname(path.join(live, f.path)), { recursive: true }); fs.writeFileSync(path.join(live, f.path), b); } }
  let applied = null;

  test('CP-01', 'built from 0.60.224: every file with its before/after hash; no data/**', () => {
    assert.ok(pack.ok, pack.error);
    const paths = pack.manifest.files.map(f => f.path);
    assert.ok(paths.includes('clear-glass/renderer/browser.js') && paths.includes('lib/version.js'), paths.join(', '));
    assert.ok(!paths.some(p => /(^|\/)data\//.test(p)));
    assert.ok(pack.manifest.files.every(f => f.before === null || /^[0-9a-f]{64}$/.test(f.before)));
    assert.strictEqual(pack.manifest.version, '0.60.224');
  });

  test('CP-02', 'the before-files here: every file to write; applied through the gate, one apply per system; then all already here', () => {
    const c = CP.check(pack, { liveRoot: live });
    assert.ok(c.ok, JSON.stringify(c.errors.concat(Object.values(c.systems).flatMap(s => s.conflicts))));
    assert.strictEqual(c.counts.apply, pack.manifest.files.length);
    applied = CP.applyPack(pack, { liveRoot: live, root: store, by: 'test' });
    assert.ok(applied.ok, JSON.stringify(applied));
    assert.deepStrictEqual(applied.applies.map(a => a.system).sort(), Object.keys(c.systems).sort());
    for (const f of pack.manifest.files) if (f.after) assert.ok(fs.readFileSync(path.join(live, f.path)).equals(pack.files.get(f.path)), f.path);
    for (const a of applied.applies) assert.ok(fs.existsSync(path.join(store, 'applies', `${a.applyId}.json`)) || fs.readdirSync(store, { recursive: true }).some(x => String(x).includes(a.applyId)), `record of ${a.applyId}`);
    const again = CP.check(pack, { liveRoot: live });
    assert.deepStrictEqual([again.counts.apply, again.counts.already], [0, pack.manifest.files.length]);
  });

  test('CP-05', 'every apply rolls back by its id: the files are the before-files again', () => {
    const A = require(path.join(ROOT, 'lib/nexus-self/apply.js'));
    for (const a of applied.applies.slice().reverse()) { const r = A.rollback(a.applyId, { liveRoot: live, root: store }); assert.ok(r.ok, JSON.stringify(r)); }
    const c = CP.check(pack, { liveRoot: live });
    assert.strictEqual(c.counts.apply, pack.manifest.files.length, 'back to the base');
  });

  test('CP-03', 'one file changed here since the base: the conflict is named and nothing is written in any system', () => {
    const victim = 'clear-glass/renderer/gig-panel.js';
    fs.appendFileSync(path.join(live, victim), '\n// his own edit\n');
    const snap = new Map(pack.manifest.files.map(f => [f.path, fs.existsSync(path.join(live, f.path)) ? fs.readFileSync(path.join(live, f.path)) : null]));
    const c = CP.check(pack, { liveRoot: live });
    assert.ok(!c.ok && c.systems['clear-glass'].conflicts.some(x => x.path === victim && /changed here/.test(x.why)), JSON.stringify(c.systems['clear-glass']));
    const r = CP.applyPack(pack, { liveRoot: live, root: store });
    assert.ok(!r.ok && r.conflicts.some(x => x.path === victim));
    for (const [p, b] of snap) assert.ok(b === null ? !fs.existsSync(path.join(live, p)) : fs.readFileSync(path.join(live, p)).equals(b), `${p} untouched`);
  });

  test('CP-04', 'an edited file is refused by its hash; a path out of the tree or into data/ is refused', () => {
    const z = new Zip(buf); const ents = z.getEntries().filter(e => !e.isDirectory).map(e => ({ path: e.entryName, data: e.getData() }));
    const one = ents.find(e => e.path === 'lib/version.js');
    const tampered = Zip.create(ents.map(e => e === one ? { path: e.path, data: Buffer.concat([e.data, Buffer.from('//x')]) } : e));
    assert.match(CP.read(tampered).error, /lib\/version\.js does not match its hash/);
    for (const bad of ['../outside.js', 'data/nexus-self/x.json', 'cortex/data/nodes/a.node']) {
      const m = { schema: CP.SCHEMA, from: 'a', to: 'b', files: [{ path: bad, before: null, after: null }] };
      assert.match(CP.read(Zip.create([{ path: CP.MANIFEST, data: Buffer.from(JSON.stringify(m)) }])).error, /path not allowed/, bad);
    }
    assert.ok(!CP.isPack(Zip.create([{ path: 'a.txt', data: Buffer.from('a') }])) && CP.isPack(buf));
  });

  test('CP-06', 'the route answers a pack as a change pack, checked first, applied on the press, only on a Nexus repo; the tab draws it', () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    const i = api.indexOf("CP.isPack(zips[0].buffer)");
    assert.ok(i > 0 && api.indexOf('RH.importHistory(_vcall, repo.uuid', i) > i, 'a pack is recognised before the history import');
    assert.match(api.slice(i, i + 1400), /if \(!repo\.nexusSelf\) return err\(res, 409/);
    assert.match(api.slice(i, i + 1400), /if \(!body\.applyPack\) return ok\(res, \{ changePack: true, manifest, check: CP\.check\(pack\) \}\)/);
    const ui = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/repo-versions.js'), 'utf8');
    assert.ok(/if \(d\.changePack\) return showChangePack\(d, out\)/.test(ui) && /applyPack: true/.test(ui) && /nexus-self\/applies\/\$\{encodeURIComponent\(id\)\}\/rollback/.test(ui));
  });
  for (const d of [live, store]) try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}
  done();
}
function done() { console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0; }
