'use strict';
/**
 * tests/modules/test-canvas-compartments.test.js — CN1–CN4 (docs/2026-10-16-canvas-compartments-phasemap.spec), 0.60.83.
 * James: "here, use this. what about using cos for the canvas, then each tool a nested compartment? … creating templates
 *        for cos and ideariun spec workshop" (with Eravos-merged.zip)
 *
 *   CC-01  the COS archetypes eravos-canvas, eravos-tool, eravos-sound-tool validate and are offered in the template
 *          picker; his canvas code is in them byte for byte; a tool laid out has no __MARK__ and no {{…}} left
 *   CC-02  a tool's markers default by his build/new-tool.mjs rules (eravos.<tool> in music, eravos.<domain>.<tool> else)
 *   CC-03  POST /api/canvas (idearium's real router): one canvas compartment, one NESTED compartment per tool (COS's own
 *          tree), each linked into tools/<domain>/tools/<category>/<tool>/ and recorded as a mount; canvas.json lists them
 *          with their acceptance lines; his build/index-tools.mjs wrote the loaders; his build/validate.mjs passes
 *   CC-04  a tool added later is another nested compartment; a duplicate, a bad id, an unknown canvas and a sound tool
 *          outside the music domain are refused; his music domain (core) comes with a music tool
 *   CC-05  the spec-workshop templates eravos-canvas / eravos-tool: listed, seeded, every SECTION a real block id
 *   CC-06  the commands canvas list · new · show · add-tool build their requests
 *   CC-10  in Clear Glass: the canvas, served by HIS serve.js, loads both nested tools (OrganismFactory.defined); his
 *          tests/run.html runs each tool's own contract (TH.toolContract) and every one passes
 * No engine on the machine: the browser part is SKIPPED, said, never passed.
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '../..');

let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
function done() { console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`); process.exit(failed ? 1 : 0); }

(async () => {
  const R = require(path.join(ROOT, 'cos/archetype/registry.js'));
  const FTP = require(path.join(ROOT, 'lib/file-tree-plan.js'));
  const E = require(path.join(ROOT, 'cos/archetype/eravos.js'));

  await test('CC-01', 'the archetypes validate and are offered; his canvas code byte for byte; a laid-out tool has no marker left', async () => {
    for (const n of ['eravos-canvas', 'eravos-tool', 'eravos-sound-tool']) assert.ok(R.getBuiltInArchetype(n), n);
    const ids = FTP.listCosTemplates().map(t => t.id);
    for (const n of ['eravos-canvas', 'eravos-tool', 'eravos-sound-tool']) assert.ok(ids.includes(`cos-archetype:${n}`), n);
    const c = FTP.fromCosTemplate('cos-archetype:eravos-canvas', { name: 'Lab' });
    const k = c.files.find(f => f.path === 'canvas/kernel/kernel.js');
    assert.strictEqual(k.content, fs.readFileSync(path.join(ROOT, 'cos/archetype/eravos-canvas/canvas/kernel/kernel.js'), 'utf8'));
    assert.ok(c.files.some(f => f.path === 'templates/tool/__TOOL__.engine.js'), 'the canvas keeps his markers in its own templates/ (its build/new-tool.mjs reads them)');
    assert.ok(!c.files.some(f => /(^|\/)(shots|perf|run)\.mjs$/.test(f.path)), 'no Playwright script ships (CG-001b)');
    const t = FTP.fromCosTemplate('cos-archetype:eravos-tool', { name: 'Shimmer', vars: { slug: 'fx-shimmer', domain: 'music', category: 'effects' } });
    assert.deepStrictEqual(t.files.map(f => f.path).sort(), ['README.md', 'fx-shimmer.engine.js', 'fx-shimmer.spec', 'fx-shimmer.test.js', 'fx-shimmer.ui.js', 'packs/factory/pack.json', 'preview.svg', 'tool.json']);
    const all = t.files.map(f => f.content).join('\n');
    assert.ok(!/__[A-Z_]+__/.test(all) && !/\{\{\w+\}\}/.test(all), 'every marker filled');
  });

  await test('CC-02', 'his new-tool.mjs rules: eravos.<tool> in music, eravos.<domain>.<tool> elsewhere; the category label', async () => {
    assert.strictEqual(E.toolVars({ slug: 'pads', domain: 'music', category: 'drums-and-rhythm' }).toolId, 'eravos.pads');
    const v = E.toolVars({ slug: 'curves', domain: 'image', category: 'adjust' });
    assert.deepStrictEqual([v.toolId, v.categoryLabel, v.author], ['eravos.image.curves', 'Adjust', 'me']);
    assert.deepStrictEqual(E.acceptance('acceptance (each):\n  - one\n  - two\nnext:'), ['one', 'two']);
  });

  const api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));
  const cb = require(path.join(ROOT, 'lib/cos-bridge.js'));
  let canvas = null;

  await test('CC-03', 'POST /api/canvas: a canvas compartment, a NESTED compartment per tool, linked in, his loaders, his validate passes', async () => {
    const r = await quiet(() => api._route('POST', '/api/canvas', { name: 'Beat Lab', tools: [
      { slug: 'fx-shimmer', label: 'Shimmer', domain: 'music', category: 'effects', sound: true },
      { slug: 'note-pad', label: 'Note Pad', domain: 'notes', category: 'text' }] }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 400));
    canvas = r.json.canvas;
    assert.deepStrictEqual(r.json.domains, ['music', 'notes']);
    const tree = cb.tree(canvas.id);
    assert.deepStrictEqual(tree.children.map(c => c.name).sort(), [`${canvas.name}--fx-shimmer`, `${canvas.name}--note-pad`]);
    for (const t of r.json.tools) {
      const child = cb.getCompartment(t.compartmentId);
      assert.strictEqual(child.parentId, canvas.id, 'nested under the canvas');
      assert.strictEqual(fs.realpathSync(path.join(canvas.root, t.linkedAt)), fs.realpathSync(child.fs.root), 'linked into the canvas');
      assert.ok(t.acceptance.length >= 2, 'its acceptance lines');
    }
    const parent = cb.getCompartment(canvas.id);
    assert.strictEqual(parent.fs.mounts.filter(m => m.role === 'tool').length, 2, 'each tool a recorded mount');
    const m = JSON.parse(fs.readFileSync(path.join(canvas.root, 'canvas.json'), 'utf8'));
    assert.deepStrictEqual(m.tools.map(t => t.id), ['eravos.fx-shimmer', 'eravos.notes.note-pad']);
    const loader = fs.readFileSync(path.join(canvas.root, 'tools/music/tools/index.js'), 'utf8');
    assert.ok(/GENERATED by build\/index-tools\.mjs/.test(loader) && /fx-shimmer\.engine\.js/.test(loader), 'his index-tools wrote the loader');
    assert.ok(/ERAVOS_DOMAINS = \["music","notes"\]/.test(fs.readFileSync(path.join(canvas.root, 'tools/index.js'), 'utf8')));
    const v = execFileSync(process.execPath, ['build/validate.mjs'], { cwd: canvas.root, encoding: 'utf8' });
    assert.ok(/✓ \d+ manifest\(s\) valid/.test(v), v);
    const show = await api._route('GET', `/api/canvas/${canvas.id}`);
    assert.deepStrictEqual(show.json.tools.map(t => t.linked), [true, true]);
    assert.ok((await api._route('GET', '/api/canvas')).json.canvases.some(c => c.id === canvas.id && c.tools === 2));
  });

  await test('CC-04', 'a tool added later is another nested compartment; duplicate, bad id and unknown canvas refused', async () => {
    const r = await quiet(() => api._route('POST', `/api/canvas/${canvas.id}/tools`, { slug: 'curves', label: 'Curves', domain: 'image', category: 'adjust' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.tool.id, 'eravos.image.curves');
    assert.strictEqual(cb.getCompartment(r.json.tool.compartmentId).parentId, canvas.id);
    assert.deepStrictEqual(r.json.domains, ['image', 'music', 'notes']);
    assert.strictEqual((await quiet(() => api._route('POST', `/api/canvas/${canvas.id}/tools`, { slug: 'curves', label: 'x', domain: 'image', category: 'adjust' }))).status, 400);
    assert.strictEqual((await quiet(() => api._route('POST', `/api/canvas/${canvas.id}/tools`, { slug: 'Bad Id', domain: 'image', category: 'adjust' }))).status, 400);
    assert.strictEqual((await quiet(() => api._route('POST', '/api/canvas/no-such-canvas/tools', { slug: 'x', domain: 'a', category: 'b' }))).status, 404);
    assert.strictEqual((await api._route('GET', '/api/canvas/no-such-canvas')).status, 404);
    const snd = await quiet(() => api._route('POST', `/api/canvas/${canvas.id}/tools`, { slug: 'bleep', domain: 'image', category: 'x', sound: true }));
    assert.deepStrictEqual([snd.status, /music domain/.test(snd.json.error)], [400, true], 'a sound tool needs the music domain\'s audio engine');
    assert.ok(fs.existsSync(path.join(canvas.root, 'tools/music/core/sdk-music.js')), 'his music domain (core) came with the music tool');
  });

  await test('CC-05', 'the spec-workshop templates: listed, seeded, every SECTION a real block', async () => {
    const T = await import(pathToFileURL(path.join(ROOT, 'idearium/spec-engine/templates.js')).href);
    const blocks = require('js-yaml').load(fs.readFileSync(path.join(ROOT, 'idearium/spec-engine/blocks.yaml'), 'utf8')).blocks.map(b => b.id);
    for (const id of ['eravos-canvas', 'eravos-tool']) {
      assert.ok(T.listTemplates().some(t => t.id === id && t.hasSeed), id);
      const secs = [...T.readSeed(id).matchAll(/^## SECTION: (\w+)/gm)].map(m => m[1]);
      assert.ok(secs.length >= 7, `${id}: ${secs.length} sections`);
      for (const s of secs) assert.ok(blocks.includes(s), `${id}: ${s} is a block`);
    }
    assert.ok(/TH\.toolContract/.test(T.readSeed('eravos-tool')) && /the canvas and the tools are separate/.test(T.readSeed('eravos-canvas')), 'quoted from his files');
  });

  await test('CC-06', 'the commands: canvas list · new · show · add-tool', async () => {
    const RC = await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    const row = (k) => RC.SPEC.find(x => x.key === k);
    assert.deepStrictEqual(row('canvas.new').req({ args: ['Beat', 'Lab'], flags: {} }).body, { name: 'Beat Lab' });
    const add = row('canvas.add-tool').req({ args: ['c1', 'music', 'effects', 'fx-x', 'Fx', 'X'], flags: { sound: true } });
    assert.deepStrictEqual([add.path, add.body], ['/api/canvas/c1/tools', { domain: 'music', category: 'effects', slug: 'fx-x', label: 'Fx X', sound: true }]);
    assert.ok(row('canvas.add-tool').need({ args: ['c1', 'music'], flags: {} }));
    assert.strictEqual(row('canvas.show').req({ args: ['c1'], flags: {} }).path, '/api/canvas/c1');
  });

  // ── CC-10 the canvas in Clear Glass, served by his serve.js ──
  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!canvas || !eng) { console.log(`  - CC-10 SKIPPED: ${!canvas ? 'no canvas was made (CC-03 failed)' : 'Clear Glass has no engine here'} — the browser check did not run`); skipped++; return done(); }
  let browser, srv;
  try {
    const port = 47000 + Math.floor(Math.random() * 2000);
    srv = spawn(process.execPath, ['serve.js', '--port', String(port)], { cwd: canvas.root, stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 700));
    browser = await glass.chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await test('CC-10', 'served by HIS serve.js: the canvas loads its nested tools; each tool\'s own contract passes on his harness', async () => {
      await page.goto(`http://localhost:${port}/canvas/index.html`);
      await page.waitForFunction(() => window.OrganismFactory && window.OrganismFactory.defined().length >= 3, null, { timeout: 20000 });
      const ids = await page.evaluate(() => window.OrganismFactory.defined().map(d => d.id).sort());
      for (const id of ['eravos.fx-shimmer', 'eravos.image.curves', 'eravos.notes.note-pad']) assert.ok(ids.includes(id), `${id} in ${ids.join(', ')}`);
      await page.goto(`http://localhost:${port}/tests/run.html`);
      await page.waitForFunction(() => window.__results, null, { timeout: 60000 });
      const r = await page.evaluate(() => ({ pass: window.__results.pass, total: window.__results.total, fail: window.__results.results.filter(x => !x.ok).map(x => `${x.suite} — ${x.test}: ${x.err}`) }));
      assert.ok(r.total > 0, 'the tools\' tests ran');
      assert.deepStrictEqual(r.fail, [], `${r.pass}/${r.total}`);
      console.log(`    · his harness: ${r.pass}/${r.total} passed`);
    });
  } catch (e) { console.log(`  - CC-10 SKIPPED: Clear Glass could not start (${String(e.message).split('\n')[0]})`); skipped++; }
  finally { try { if (browser) await browser.close(); } catch (_) {} try { if (srv) srv.kill(); } catch (_) {} }
  done();
})();
