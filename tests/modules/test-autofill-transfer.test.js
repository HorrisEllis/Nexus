'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-autofill-transfer.test.js — AT1–AT5 (0.60.256). Map: docs/2026-10-26-autofill-transfer-phasemap.spec
 * James, 2026-10-26: "continue. look at autofill. i want to be able to import and export the data. have a download template button
 * just the fiverr gigs, also fix it so its .gig not .gig.json."
 *
 *   AT-01  export → import into empty stores is lossless: profiles (ids kept), learned fields with their selectors, the gig
 *   AT-02  a merge: a newer copy replaces, an older one is kept, a new id is added; importing the same file twice doubles nothing
 *   AT-03  refused and named, never dropped: an unknown field type, a learned row with no site; a gig file sent here is told where it goes
 *   AT-04  undo puts back exactly what the import replaced (profiles, the gig, a learned field's earlier value, a new one removed)
 *   AT-05  wired: IPC and /cli doors, preload, the Settings pane (Export, Import, Undo, the Fiverr gig template), rows, the agent tool,
 *          the co-pilot, the registry, the event taxonomy, loom
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// real stores, in a folder of their own
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-at-'));
process.env.CG_JAA_DIR = path.join(TMP, 'jaa');
process.env.APPDATA = TMP;
const { AutofillStore } = require('../../clear-glass/src/autofill/store.js');
const { SiteSettingsStore } = require('../../clear-glass/src/site-settings/store.js');
const { JaaRows } = require('../../clear-glass/src/storage/jaa.js');
const T = require('../../clear-glass/src/autofill/transfer.js');
{ const l = console.log; console.log = (...a) => { if (!/^\[jaa\]/.test(String(a[0]))) l(...a); }; }   // the store's own lines, or the runner miscounts

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const fresh = (tag) => {
  process.env.CG_JAA_DIR = path.join(TMP, `jaa-${tag}`);
  const store = new AutofillStore(); store.load();
  const site = new SiteSettingsStore(); site.load && site.load();
  return { store, site, undoRows: new JaaRows(`cg_autofill_import_undo`, {}) };
};
const GIG = { title: 'I will build a node.js scraper', tags: ['scraping'], description: 'x'.repeat(130), packages: { basic: { name: 'Basic', description: 'one site' } }, faq: [], requirements: ['the site'] };

(async () => {
  console.log('\n  test-autofill-transfer — AT1–AT5 the autofill data out and in\n');

  let file = null;
  await test('AT-01', 'export → import into empty stores is lossless', () => {
    const a = fresh('a');
    const p = a.store.createProfile({ label: 'Main', fields: { 'given-name': 'James', email: 'j@example.com', headline: 'Node.js developer' } });
    a.store.setLastGig(GIG);
    assert.ok(a.site.set('https://jobs.example.com/apply', 'autofill.field.cand_q7', 'years-experience'));
    a.site.set('https://jobs.example.com/apply', 'autofill.selector.cand_q7', '#q7');
    const e = T.exportAll({ store: a.store, siteSettings: a.site, now: Date.parse('2026-10-26T12:00:00Z') });
    assert.ok(e.ok && e.filename === 'autofill-2026-10-26.autofill', e.filename);
    assert.deepStrictEqual(e.counts, { profiles: 1, learned: 1, gig: 1 });
    assert.ok(/^# Clear Glass autofill data/.test(e.text) && /format: clearglass\.autofill\/1/.test(e.text), 'YAML with its format line');
    file = e.text;
    const b = fresh('b');
    const r = T.importAll({ store: b.store, siteSettings: b.site, text: file, undoRows: b.undoRows });
    assert.ok(r.ok, r.error);
    assert.deepStrictEqual(r.counts, { profilesAdded: 1, profilesReplaced: 0, profilesKept: 0, learned: 1, gig: 1 });
    assert.deepStrictEqual(r.refused, []);
    const got = b.store.getProfile(p.id);
    assert.ok(got, 'the id is kept');
    assert.deepStrictEqual(got.fields, p.fields);
    assert.deepStrictEqual(b.store.getLastGig(), GIG);
    const all = b.site.getAllForOrigin('https://jobs.example.com/');
    assert.deepStrictEqual([all['autofill.field.cand_q7'], all['autofill.selector.cand_q7']], ['years-experience', '#q7']);
    assert.ok(T.parseTransfer(JSON.stringify({ format: T.FORMAT, profiles: [], learned: [] })).ok, 'JSON loads too');
  });

  await test('AT-02', 'a merge keeps the newer profile; the same file twice doubles nothing', () => {
    const c = fresh('c');
    T.importAll({ store: c.store, siteSettings: c.site, text: file, undoRows: c.undoRows });
    const id = c.store.listProfiles()[0].id;
    c.store.updateProfile(id, { label: 'Mine, edited later' });
    const again = T.importAll({ store: c.store, siteSettings: c.site, text: file, undoRows: c.undoRows });
    assert.deepStrictEqual([again.counts.profilesAdded, again.counts.profilesReplaced, again.counts.profilesKept], [0, 0, 1], 'his newer copy is kept');
    assert.strictEqual(c.store.getProfile(id).label, 'Mine, edited later');
    assert.strictEqual(c.store.listProfiles().length, 1, 'nothing doubled');
    const yaml = require('js-yaml'); const d = yaml.load(file);
    d.profiles[0].updatedAt = Date.now() + 60000; d.profiles[0].label = 'From the file, newer';
    d.profiles.push({ id: 'second', label: 'Second', fields: { email: 'b@example.com' }, updatedAt: 1 });
    const r = T.importAll({ store: c.store, siteSettings: c.site, text: yaml.dump(d), undoRows: c.undoRows });
    assert.deepStrictEqual([r.counts.profilesAdded, r.counts.profilesReplaced], [1, 1]);
    assert.strictEqual(c.store.getProfile(id).label, 'From the file, newer');
  });

  await test('AT-03', 'refused and named, never dropped silently', () => {
    const d = fresh('d');
    const text = require('js-yaml').dump({ format: T.FORMAT, profiles: [{ id: 'bad', label: 'Bad', fields: { 'shoe-size': '11' } }, { id: 'ok', label: 'Ok', fields: { email: 'x@example.com' } }],
      learned: [{ fieldKey: 'q1', fieldType: 'email' }] });
    const r = T.importAll({ store: d.store, siteSettings: d.site, text, undoRows: d.undoRows });
    assert.ok(r.ok);
    assert.strictEqual(r.counts.profilesAdded, 1);
    assert.ok(r.refused.some(x => x.what === 'profile' && x.item === 'Bad' && /unknown autofill field type\(s\): shoe-size/.test(x.why)), JSON.stringify(r.refused));
    assert.ok(r.refused.some(x => x.what === 'learned' && /origin/.test(x.why)));
    const g = T.parseTransfer('format: clearglass.gig/1\ntitle: I will x\npackages: {}\n');
    assert.ok(!g.ok && /gig file/.test(g.error), g.error);
    assert.ok(!T.parseTransfer('').ok && !T.parseTransfer('just words').ok);
  });

  await test('AT-04', 'undo puts back exactly what the import replaced', () => {
    const e = fresh('e');
    const mine = e.store.createProfile({ label: 'Mine', fields: { email: 'me@example.com' } });
    e.store.setLastGig({ ...GIG, title: 'I will keep my own gig' });
    e.site.set('https://jobs.example.com/apply', 'autofill.field.cand_q7', 'email');
    const before = { profiles: e.store.listProfiles(), gig: e.store.getLastGig() };
    const r = T.importAll({ store: e.store, siteSettings: e.site, text: file, undoRows: e.undoRows });
    assert.ok(r.ok && r.undo && r.counts.gig === 1 && r.counts.learned === 1);
    assert.strictEqual(e.store.listProfiles().length, 2);
    assert.strictEqual(e.site.getAllForOrigin('https://jobs.example.com/')['autofill.field.cand_q7'], 'years-experience');
    const u = T.undoLast({ store: e.store, siteSettings: e.site, undoRows: e.undoRows });
    assert.ok(u.ok, u.error);
    assert.deepStrictEqual(e.store.listProfiles().map(p => p.id), before.profiles.map(p => p.id), 'the imported profile is gone, his kept');
    assert.strictEqual(e.store.getProfile(mine.id).label, 'Mine');
    assert.deepStrictEqual(e.store.getLastGig(), before.gig, 'his gig is back');
    const all = e.site.getAllForOrigin('https://jobs.example.com/');
    assert.strictEqual(all['autofill.field.cand_q7'], 'email', 'the learned field\'s earlier value is back');
    assert.ok(!('autofill.selector.cand_q7' in all), 'the selector the import added is gone');
    assert.ok(!T.undoLast({ store: e.store, siteSettings: e.site, undoRows: e.undoRows }).ok, 'nothing to undo twice');
  });

  await test('AT-05', 'wired: doors, preload, Settings, rows, agent tool, co-pilot, registry, taxonomy, loom', async () => {
    const b = read('clear-glass/src/ipc/bridge.js');
    for (const s of ["'/cli/autofill/export'", "'/cli/autofill/import'", "'/cli/autofill/import/undo'", "ipcMain.handle('autofill:export'", "ipcMain.handle('autofill:import'", "ipcMain.handle('autofill:import:undo'", "new JaaRows('cg_autofill_import_undo'"]) assert.ok(b.includes(s), s);
    const pre = read('clear-glass/src/preload/index.js');
    for (const s of ['exportAll:', 'importAll:', 'importUndo:']) assert.ok(pre.includes(s), s);
    const ui = read('clear-glass/renderer/settings/sections/autofill.js');
    for (const s of ["btn('Export autofill data'", "btn('Import a file…'", "btn('Undo the last import'", "btn('Download Fiverr gig template'", 'cg.autofill.exportAll()', 'cg.autofill.importAll(text)', 'cg.autofill.importUndo()', 'transferPane(rerender),']) assert.ok(ui.includes(s), s);
    const C = await import(require('url').pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    const ex = C.SPEC.find(r => r.key === 'autofill.export'), im = C.SPEC.find(r => r.key === 'autofill.import');
    assert.deepStrictEqual(ex.req({ args: [], flags: {} }), { system: 'clear-glass', method: 'GET', path: '/cli/autofill/export' });
    assert.deepStrictEqual(im.req({ args: ['undo'], flags: {} }).path, '/cli/autofill/import/undo');
    const f = path.join(TMP, 'x.autofill'); fs.writeFileSync(f, file);
    assert.deepStrictEqual([im.req({ args: [f], flags: {} }).path, im.req({ args: [f], flags: {} }).body.text], ['/cli/autofill/import', file]);
    const tool = require('../../lib/agent-tools/tools/autofill/autofill-manage.js');
    for (const a of ['export', 'import', 'importUndo']) assert.ok(tool.REAL_ACTIONS[a], a);
    assert.ok(read('clear-glass/src/copilot/tools.js').includes("name: 'autofill.export'") && read('clear-glass/src/copilot/bridge.js').includes("action === 'autofill.import'"));
    const reg = read('clear-glass/registry-components.js');
    for (const s of ["'autofill:export'", "'autofill:import'", "'autofill:import:undo'", "'autofill.imported'"]) assert.ok(reg.includes(s), s);
    const tax = require('../../clear-glass/src/event-taxonomy.js'); const keys = Object.keys(tax.EVENTS || tax);
    for (const k of ['AUTOFILL_EXPORTED', 'AUTOFILL_IMPORTED', 'AUTOFILL_IMPORT_UNDONE']) assert.ok(keys.includes(k), k);
    assert.ok(read('loom/maps/economy-map.js').includes("I('clear-glass/src/autofill/transfer.js')"), 'loom has the transfer module and its wires');
  });

  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
