'use strict';
// clear-glass/test/webextensions.test.js — src/plugins/webextensions.js against
// fake Electron sessions: folder/.zip/.crx install, load into every persistent
// session (including ones created later), disable/enable, remove.
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const AdmZip = require('adm-zip');
let pass = 0;
const t = async (n, fn) => { await fn(); pass++; console.log(`[PASS] ${n}`); };
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-wx-'));
process.env.HOME = home; delete process.env.APPDATA;
const { WebExtensionHost, crxToZip } = require('../src/plugins/webextensions');

function fakeSession(key, persistent = true) {
  const loaded = new Map();
  return { key, loaded, isPersistent: () => persistent, extensions: {
    loadExtension: async (dir) => { if (dir.includes('broken')) throw new Error('Manifest file is missing or unreadable'); const id = 'e' + loaded.size; loaded.set(id, dir); return { id, name: path.basename(dir) }; },
    removeExtension: (id) => loaded.delete(id) } };
}
const listeners = {};
const app = { on: (ev, fn) => { listeners[ev] = fn; } };
const def = fakeSession('default');
const session = { defaultSession: def };
const mkExt = (dir, extra = {}) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Blocker', version: '1.2.3', permissions: ['storage'], host_permissions: ['<all_urls>'], ...extra })); return dir; };

(async () => {
  const host = new WebExtensionHost({ session, app });
  host.load(); host.attach();
  const folder = mkExt(path.join(home, 'src', 'blocker'));

  await t('folder install loads into the default session and records permissions', async () => {
    const r = await host.install({ source: folder });
    assert.ok(r.ok && !r.loadError);
    assert.strictEqual(def.loaded.size, 1);
    assert.deepStrictEqual(r.extension.permissions, ['storage', '<all_urls>']);
    assert.strictEqual(r.extension.owned, false);
  });
  await t('a session created later gets every enabled extension; in-memory sessions are skipped', async () => {
    const later = fakeSession('persist:agent-x'); listeners['session-created'](later);
    const mem = fakeSession('mem', false); listeners['session-created'](mem);
    await new Promise(r => setTimeout(r, 10));
    assert.strictEqual(later.loaded.size, 1); assert.strictEqual(mem.loaded.size, 0);
    assert.strictEqual(host.list()[0].loadedIn, 2);
  });
  await t('.zip (with a wrapping folder) and .crx (CRX3 header) unpack into ~/.clear-glass/extensions', async () => {
    const zdir = mkExt(path.join(home, 'z', 'wrap'), { name: 'Zipped' });
    const zip = new AdmZip(); zip.addLocalFolder(path.join(home, 'z', 'wrap'), 'wrap');
    const zpath = path.join(home, 'x.zip'); zip.writeZip(zpath);
    const rz = await host.install({ source: zpath });
    assert.ok(rz.extension.dir.startsWith(path.join(home, '.clear-glass', 'extensions')), rz.extension.dir);
    assert.strictEqual(rz.extension.name, 'Zipped');
    const zipBuf = fs.readFileSync(zpath);
    const header = Buffer.from([1, 2, 3, 4, 5]);
    const crx = Buffer.concat([Buffer.from('Cr24'), Buffer.from([3, 0, 0, 0]), Buffer.from([header.length, 0, 0, 0]), header, zipBuf]);
    assert.ok(crxToZip(crx).equals(zipBuf));
    fs.writeFileSync(path.join(home, 'x.crx'), crx);
    const rc = await host.install({ source: path.join(home, 'x.crx') });
    assert.strictEqual(rc.reinstalled, true, 'same bytes → same unpack dir → same record');
    void zdir;
  });
  await t('disable unloads everywhere; enable loads again', async () => {
    const id = host.list().find(x => x.name === 'Blocker').id;
    await host.setEnabled(id, false);
    assert.ok(![...def.loaded.values()].includes(folder));
    await host.setEnabled(id, true);
    assert.ok([...def.loaded.values()].includes(folder));
  });
  await t('a refused load is kept on the record, not hidden', async () => {
    const r = await host.install({ source: mkExt(path.join(home, 'broken-ext')) });
    assert.match(r.loadError, /Manifest/);
    assert.match(host.list().find(x => x.dir.includes('broken')).lastError, /Manifest/);
  });
  await t('registry survives a restart (JAA), remove deletes only what Clear Glass unpacked', async () => {
    require('../src/storage/jaa').store().flushAll();
    const again = new WebExtensionHost({ session: { defaultSession: fakeSession('d2') }, app: { on() {} } });
    assert.strictEqual(again.load().length, 3);
    const zipped = host.list().find(x => x.name === 'Zipped');
    host.remove(zipped.id);
    assert.ok(!fs.existsSync(zipped.ownedRoot));
    host.remove(host.list().find(x => x.name === 'Blocker').id);
    assert.ok(fs.existsSync(folder), 'your folder is left alone');
  });
  await t('not a WebExtension → clear error', async () => {
    const bad = path.join(home, 'nomf'); fs.mkdirSync(bad);
    await assert.rejects(host.install({ source: bad }), /no manifest.json/);
  });
  fs.rmSync(home, { recursive: true, force: true });
  console.log(`\n${pass} passed`);
  process.exit(0);
})().catch(e => { console.error('[FAIL]', e); process.exit(1); });
