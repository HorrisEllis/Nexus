'use strict';
/**
 * tests/modules/test-template-picker.test.js — 0.39.357 RS5 (docs/2026-10-05-spec-workshop-rebuild-phasemap.spec)
 * James: "opens a pick template screen like photoshop does when you first open it. with a custom or manual option with a
 * plus sign. then you pick a template from the list, including all the quick spec options" · asked whether the
 * workshop's start page becomes it: "yes with a custom or manual."
 *   TP-01  the lib: a template's sections (its seeds, the MINIMUM it does not fill laid out empty, never over what the
 *          source has), CUSTOM is nothing, a COS template's files in Build Order, a saved one verbatim; saved versions
 *   TP-02  idearium's real router: every quick-spec template (genesis first, the default; the COS archetypes and
 *          blueprints) and the saved ones, previewed; create with a template and a mode; save → v1, again → v2;
 *          a built-in is not removable; a saved one is archived, its versions kept
 *   TP-03  Clear Glass, the real page against the real router: + CUSTOM / MANUAL first and selected; genesis previewed;
 *          tabs; a COS template's files; double-click creates from a template; SAVE AS TEMPLATE → SAVED, then V2;
 *          REMOVE; Enter on the title with CUSTOM is a blank manual spec; ?from=idea: opens the picker with the idea
 *          as START FROM; a mode picked is the mode it opens in
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const UI = path.join(ROOT, 'idearium', 'ui');

let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
function done() { console.log(`\n  template-picker: ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`); process.exit(failed ? 1 : 0); }
const BLOCKS = require('js-yaml').load(fs.readFileSync(path.join(ROOT, 'idearium/spec-engine/blocks.yaml'), 'utf8')).blocks.map(b => ({ id: b.id, title: b.title }));

(async () => {
  const WS = await import(pathToFileURL(path.join(ROOT, 'idearium/lib/workshop.js')).href);

  await test('TP-01', 'the lib: seeds, the MINIMUM laid out, never over the source; CUSTOM is nothing; COS files; saved versions', () => {
    const t = { id: 'event-system', label: 'Event System' };
    const secs = WS.templateSections({ template: t, seeds: { events: 'ring buffer' }, blocks: BLOCKS });
    assert.deepStrictEqual(secs.map(x => x.part), ['meta', 'purpose', 'schema', 'api', 'events', 'build_order'], 'the MINIMUM parts and what it seeds, in block order');
    assert.strictEqual(secs.find(x => x.part === 'events').body, 'ring buffer');
    assert.ok(secs.filter(x => x.part !== 'events').every(x => x.body === ''), 'nothing invented for the rest');
    assert.ok(!WS.templateSections({ template: t, seeds: { events: 'x' }, blocks: BLOCKS, have: ['purpose', 'events'] }).some(x => ['purpose', 'events'].includes(x.part)), 'never over what the source has');
    assert.deepStrictEqual(WS.templateSections({ template: WS.CUSTOM, blocks: BLOCKS }), []);
    const cos = WS.templateSections({ template: { id: 'cos-archetype:web', label: 'COS · web' }, cosFiles: [{ path: 'index.js', layer: 'runtime' }, { path: 'test/a.test.js', layer: 'test' }], blocks: BLOCKS });
    assert.match(cos.find(x => x.part === 'build_order').body, /Starting files from COS · web[\s\S]*- runtime: index\.js\n- test: test\/a\.test\.js/);
    const saved = WS.templateSections({ template: { id: 'saved:x' }, saved: [{ title: 'Why', body: 'because', part: 'purpose' }], blocks: BLOCKS });
    assert.deepStrictEqual(saved, [{ title: 'Why', body: 'because', part: 'purpose', by: 'template' }]);
    const pv = WS.previewOf({ template: t, seeds: { events: 'ring buffer' }, blocks: BLOCKS });
    assert.strictEqual(pv.length, 11); assert.deepStrictEqual(pv.filter(p => p.filled).map(p => p.id), ['events']);
    assert.strictEqual(pv.filter(p => p.laid && !p.filled).length, 5);
    // makeSession keeps a section's part and takes the mode and the template
    const w = WS.makeSession({ title: 'T', sections: secs, mode: 'manual', template: { id: t.id, label: t.label } }).session;
    assert.strictEqual(w.mode, 'manual'); assert.strictEqual(w.sections.find(x => x.part === 'events').body, 'ring buffer');
    assert.strictEqual(WS.partsOf(w, BLOCKS).find(p => p.id === 'events').filled, true);
    // saved: a new name is v1; from it, no new name is its next version; archived hides it, the rows stay
    const rows = [];
    const r1 = WS.templateRow(w, { label: 'Harbour events', rows }); rows.push(r1.row);
    assert.strictEqual(r1.row.slug, 'harbour-events'); assert.strictEqual(r1.row.version, 1); assert.deepStrictEqual(r1.row.basedOn, { id: 'event-system', label: 'Event System', version: null });
    const w2 = WS.makeSession({ title: 'T2', sections: [{ title: 'Purpose', body: 'more' }], template: { id: 'saved:harbour-events', label: 'Harbour events', version: 1 } }).session;
    const r2 = WS.templateRow(w2, { rows }); rows.push(r2.row);
    assert.strictEqual(r2.row.slug, 'harbour-events'); assert.strictEqual(r2.row.version, 2);
    let L = WS.savedTemplates(rows); assert.strictEqual(L.length, 1); assert.strictEqual(L[0].version, 2); assert.strictEqual(L[0].versions, 2); assert.strictEqual(L[0].sections[0].body, 'more');
    rows.push(WS.archiveRow(rows, 'harbour-events').row);
    assert.deepStrictEqual(WS.savedTemplates(rows), []); assert.strictEqual(rows.length, 3, 'every version kept');
    assert.ok(WS.archiveRow(rows, 'harbour-events').error);
    assert.ok(WS.templateRow({ sections: [] }).error);
  });

  // ── the real router ──
  process.env.COPILOT_URL = 'http://127.0.0.1:9';
  process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
  const api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));
  for (let i = 0; i < 40; i++) { const r = await quiet(() => api._route('GET', '/api/workshop/templates')); if (r.status === 200) break; await new Promise(x => setTimeout(x, 250)); }
  const R = (m, u, b) => quiet(() => api._route(m, u, b));

  await test('TP-02', 'the router: every quick-spec template previewed (genesis first); create with a template and mode; save v1 → v2; remove archives', async () => {
    const t = await R('GET', '/api/workshop/templates');
    assert.strictEqual(t.status, 200, JSON.stringify(t.json));
    const L = t.json.templates;
    assert.strictEqual(L[0].id, 'custom'); assert.strictEqual(L[0].mode, 'manual');
    const docs = L.filter(x => x.group === 'document');
    assert.strictEqual(docs[0].id, 'genesis'); assert.strictEqual(docs[0].default, true);
    const SE = await import(pathToFileURL(path.join(ROOT, 'idearium/spec-engine/templates.js')).href);
    assert.deepStrictEqual(docs.map(x => x.id).sort(), SE.listTemplates().map(x => x.id).filter(x => x !== 'custom').sort(), 'every spec-document template (spec-engine\'s custom is the + card)');
    const FTP = require(path.join(ROOT, 'lib/file-tree-plan.js'));
    assert.deepStrictEqual(L.filter(x => /^cos-/.test(x.group)).map(x => x.id), FTP.listCosTemplates().map(x => x.id), 'every COS archetype and blueprint — the quick spec\'s options');
    assert.ok(L.every(x => x.preview.length === 11), 'each previewed on the 11 parts');
    assert.ok(docs.find(x => x.id === 'genesis').preview.find(p => p.id === 'meta').filled, 'genesis fills its meta');
    assert.ok(L.find(x => x.id === 'cos-archetype:web-server').files.some(f => f.path === 'index.js'));
    assert.ok(!L.some(x => x._seeds || x.sections), 'the list carries previews, not the seeds');

    const w = (await R('POST', '/api/workshop', { template: 'event-system', title: 'Tide events' })).json.workshop;
    assert.strictEqual(w.mode, 'assisted'); assert.deepStrictEqual(w.template, { id: 'event-system', label: 'Event System', group: 'document' });
    assert.ok(w.sections.find(x => x.part === 'events').body.length > 100, 'its events seeded from its seed file');
    const c = (await R('POST', '/api/workshop', { template: 'custom', title: 'Bare' })).json.workshop;
    assert.strictEqual(c.mode, 'manual'); assert.strictEqual(c.sections.length, 1, 'CUSTOM: a blank document');
    const s = (await R('POST', '/api/workshop', { template: 'genesis', mode: 'stretched' })).json.workshop;
    assert.strictEqual(s.mode, 'stretched'); assert.match(s.title, /Full Nexus/, 'no title: the template names it');
    const idea = (await R('POST', '/api/ideas', { text: 'A tide clock for the harbour' })).json;
    const ideaUuid = (idea.idea || idea.data || idea).uuid;
    const wi = (await R('POST', '/api/workshop', { from: { kind: 'idea', id: ideaUuid }, template: 'api-service' })).json.workshop;
    assert.strictEqual(wi.sections[0].id, 'idea'); assert.strictEqual(wi.sections.filter(x => /purpose/i.test(x.title) || x.part === 'purpose').length, 1, 'the idea\'s Purpose is not laid out twice');
    assert.ok(wi.sections.find(x => x.part === 'api').body.length > 50);
    assert.strictEqual((await R('POST', '/api/workshop', { template: 'nope' })).status, 404);

    const v1 = await R('POST', '/api/workshop/templates', { workshop: w.uuid, label: 'Harbour events' });
    assert.strictEqual(v1.status, 200, JSON.stringify(v1.json)); assert.strictEqual(v1.json.version, 1);
    const from = (await R('POST', '/api/workshop', { template: 'saved:harbour-events', title: 'Again' })).json.workshop;
    assert.strictEqual(from.sections.length, w.sections.length, 'opens with what was saved');
    const v2 = await R('POST', '/api/workshop/templates', { workshop: from.uuid });
    assert.strictEqual(v2.json.version, 2); assert.strictEqual(v2.json.template.versions, 2);
    assert.strictEqual((await R('POST', '/api/workshop/templates/genesis/remove')).status, 400, 'a built-in template is a file in the codebase');
    assert.strictEqual((await R('POST', '/api/workshop/templates/saved:harbour-events/remove')).json.kept, true);
    assert.ok(!(await R('GET', '/api/workshop/templates')).json.templates.some(x => x.group === 'saved'), 'no longer offered');
    const { loadTable } = await import(pathToFileURL(path.join(ROOT, 'idearium/lib/db.js')).href);
    assert.strictEqual(loadTable(WS.TEMPLATE_TABLE).filter(r => r.slug === 'harbour-events' && !r.archived).length, 2, 'both versions kept (§0.3)');
    assert.strictEqual((await R('POST', '/api/workshop/templates/saved:harbour-events/remove')).status, 404);
    const C = JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'idearium/interaction-contract.json'), 'utf8')));
    for (const p of ['"/api/workshop/templates"', '"/api/workshop/templates/:tid/remove"']) assert.ok(C.includes(p), `${p} in the contract`);
  });

  // ── the page, in Clear Glass, against the real router ──
  const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
  const srv = http.createServer((req, res) => {
    let raw = ''; req.on('data', c => { raw += c; }); req.on('end', async () => {
      const u = new URL(req.url, 'http://x');
      if (u.pathname.startsWith('/api/')) {
        const r = await R(req.method, u.pathname + u.search, raw ? JSON.parse(raw) : {});
        res.writeHead(r.status || 200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(r.json));
      }
      const f = path.join(UI, u.pathname.replace(/^\//, ''));
      if (!f.startsWith(UI) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}`;
  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!eng) { console.log('  - TP-03 SKIPPED: Clear Glass has no engine here (no Electron binary, no Chromium) — the browser checks did not run'); skipped++; srv.close(); return done(); }
  let browser;
  try { browser = await glass.chromium.launch(); }
  catch (e) { console.log(`  - TP-03 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped++; srv.close(); return done(); }
  console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${eng.kind}`);
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const W = () => page.evaluate(() => window.WORKSHOP.W);
    const home = async () => { await page.click('#home'); await page.waitForSelector('#start:not(.hidden) #np[data-ready] .np-card[data-id="custom"]'); };
    await test('TP-03', 'Clear Glass: + CUSTOM / MANUAL first; templates previewed in tabs; create from one; save as template → V2; remove; ?from=idea', async () => {
      await page.goto(`${url}/workshop.html`);
      await page.waitForSelector('#npGrid .np-card[data-id="genesis"]');
      const ids = await page.$$eval('#npGrid .np-card', els => els.map(e => e.dataset.id));
      assert.deepStrictEqual(ids.slice(0, 2), ['custom', 'genesis'], '+ CUSTOM / MANUAL first, then genesis');
      assert.ok(await page.$('#npGrid .np-card.custom.on .np-th.plus'), 'the plus card, selected');
      assert.match(await page.textContent('#npName'), /CUSTOM \/ MANUAL/);
      assert.match(await page.textContent('.np-mode.on'), /MANUAL/, 'custom is manual');
      assert.match(await page.textContent('#npGrid .np-card[data-id="genesis"] .np-m'), /DEFAULT/);
      // genesis previewed: meta lit, the rest of the MINIMUM laid out
      await page.click('#npGrid .np-card[data-id="genesis"]');
      assert.match(await page.textContent('#npName'), /Full Nexus/);
      assert.ok(await page.$('#npParts .np-part.on[data-part="meta"]'));
      assert.strictEqual((await page.$$('#npParts .np-part.laid')).length, 4);
      assert.match(await page.textContent('.np-mode.on'), /ASSISTED/);
      // tabs: the COS archetypes, with their files
      await page.click('.np-tab[data-g="cos-archetype"]');
      const cards = await page.$$eval('#npGrid .np-card', els => els.map(e => e.dataset.id));
      assert.ok(cards.length > 5 && cards.slice(1).every(x => x.startsWith('cos-archetype:')), 'only the archetypes (and the + card)');
      await page.click('#npGrid .np-card[data-id="cos-archetype:web-server"]');
      assert.match(await page.textContent('#npFiles'), /STARTING FILES · 3[\s\S]*index\.js/);
      assert.ok(await page.$('#npParts .np-part.on[data-part="build_order"]'));
      // the DOCUMENT tab, filtered; double-click creates from it
      await page.click('.np-tab[data-g="document"]');
      await page.fill('#npQ', 'event');
      await page.waitForSelector('#npGrid .np-card[data-id="event-system"]');
      await page.fill('#beginTitle', 'Harbour bus');
      await page.dblclick('#npGrid .np-card[data-id="event-system"]');
      await page.waitForSelector('#writer:not(.hidden) .doc-title');
      let w = await W();
      assert.strictEqual(w.title, 'Harbour bus'); assert.strictEqual(w.template.id, 'event-system'); assert.strictEqual(w.mode, 'assisted');
      assert.ok(w.sections.find(x => x.part === 'events').body.length > 100);
      assert.match(await page.textContent('#docMeta'), /TEMPLATE · Event System/i);
      assert.match(await page.textContent('#minNote'), /MINIMUM 0 OF 5/, 'the MINIMUM laid out, empty');
      // SAVE AS TEMPLATE → it is in SAVED
      await page.click('#tplSave'); await page.fill('.dlg input', 'Bus template'); await page.click('.dlg [data-ok]');
            await page.waitForSelector('.toast:has-text("V1")');
      await home();
      await page.click('.np-tab[data-g="saved"]'); await page.fill('#npQ', '');
      await page.waitForSelector('#npGrid .np-card[data-id="saved:bus-template"]');
      assert.match(await page.textContent('#npGrid .np-card[data-id="saved:bus-template"] .np-m'), /SAVED · V1/);
      // open it, save it again with its name: its next version
      await page.click('#npGrid .np-card[data-id="saved:bus-template"]');
      assert.ok(await page.locator('#npRemove').isVisible(), 'a saved template can be removed');
      await page.fill('#beginTitle', 'Harbour bus two'); await page.click('#beginBtn');
      await page.waitForSelector('#writer:not(.hidden) .doc-title');
      w = await W(); assert.strictEqual(w.template.id, 'saved:bus-template'); assert.strictEqual(w.title, 'Harbour bus two');
      await page.click('#tplSave');
      assert.strictEqual(await page.$eval('.dlg input', e => e.value), 'Bus template', 'its name, to save the next version');
      await page.click('.dlg [data-ok]'); await page.waitForSelector('.toast:has-text("V2")');
      await home();
      await page.click('.np-tab[data-g="saved"]');
      assert.match(await page.textContent('#npGrid .np-card[data-id="saved:bus-template"] .np-m'), /V2 OF 2/);
      // REMOVE: archived, gone from the picker
      await page.click('#npGrid .np-card[data-id="saved:bus-template"]');
      await page.click('#npRemove'); await page.click('.dlg [data-ok]');
      await page.waitForSelector('#npGrid .np-card[data-id="saved:bus-template"]', { state: 'detached' });
      assert.match(await page.textContent('.np-tab[data-g="saved"]'), /SAVED\s*0/);
      assert.ok(!(await page.locator('#npRemove').isVisible()), 'a built-in has no REMOVE');
      // CUSTOM, by the keyboard: Enter on the title is a blank manual spec
      await page.click('.np-tab[data-g="all"]');
      await page.click('#npGrid .np-card[data-id="custom"]');
      await page.fill('#beginTitle', 'Bare'); await page.keyboard.press('Enter');
      await page.waitForSelector('#writer:not(.hidden) .doc-title');
      w = await W(); assert.strictEqual(w.mode, 'manual'); assert.strictEqual(w.sections.length, 1); assert.strictEqual(w.template.id, 'custom');
      assert.ok(!/TEMPLATE ·/.test(await page.textContent('#docMeta')), 'custom names no template');
      // a promoted idea: the picker first, the idea as START FROM; a mode picked is the mode it opens in
      const idea = (await R('POST', '/api/ideas', { text: 'A lighthouse that logs every ship' })).json; const iu = (idea.idea || idea.data || idea).uuid;
      await page.goto(`${url}/workshop.html?from=idea:${iu}`);
      await page.waitForSelector('#npFrom .np-chip');
      assert.match(await page.textContent('#npFrom'), /IDEA · A lighthouse that logs every ship/);
      assert.ok(await page.$('#srcIdea.on'));
      await page.click('#npGrid .np-card[data-id="genesis"]'); await page.click('.np-mode[data-mode="stretched"]');
      await page.click('#beginBtn');
      await page.waitForSelector('#writer:not(.hidden) .doc-title');
      w = await W();
      assert.deepStrictEqual([w.source.kind, w.sections[0].id, w.mode, w.template.id], ['idea', 'idea', 'stretched', 'genesis']);
      // START FROM picked in the sheet, then cleared
      await home();
      await page.click('#srcIdea'); await page.waitForSelector(`#picker .it[data-id="${iu}"]`);
      await page.dblclick(`#picker .it[data-id="${iu}"]`); await page.waitForSelector('#picker', { state: 'detached' });
      assert.match(await page.textContent('#npFrom'), /IDEA ·/);
      await page.click('#npFrom .x'); assert.strictEqual((await page.textContent('#npFrom')).trim(), ''); assert.ok(await page.$('#srcNone.on'));
      const src = fs.readFileSync(path.join(UI, 'js', 'template-picker.js'), 'utf8');
      assert.deepStrictEqual([...src.matchAll(/title="([^"$]*)"/g)].map(m => m[1]).filter(t => /[a-z]/.test(t)), [], 'no lowercase tooltip');
      assert.deepStrictEqual(errors, [], 'nothing threw');
    });
  } finally { await browser.close(); srv.close(); }
  done();
})().catch(e => { console.error(e); process.exit(1); });
