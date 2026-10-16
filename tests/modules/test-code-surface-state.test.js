'use strict';
/**
 * tests/modules/test-code-surface-state.test.js — CE8 (docs/2026-10-15-code-tab-run-state-phasemap.spec), 0.60.79.
 * James: "so the cli can read the current worksurface in the code tab."
 *
 *   SS-01  idearium/lib/surface-state.cjs: set / get; a new file clears the old lines and chunk; a bad range is refused;
 *          rev counts every write; who set it is kept
 *   SS-02  GET / PUT /api/repos/:uuid/surface through idearium's real router: the picked lines come back with their text,
 *          the proposals waiting are listed; a file not in the repo is 404, a bad range 400, an unknown repo 404
 *   SS-03  the CLI rows (idearium/cli/route-commands.js): code open --lines, code select a b / --chunk / --clear build the
 *          request the route takes; code surface prints the open file and its lines
 *   SS-1x  the tab, driven in Clear Glass (the REAL code-surface.js against a stubbed api()):
 *          SS-10 opening a file and picking lines publishes the surface once it settles (PUT …/surface, by ui)
 *          SS-11 a change made from the CLI (idearium.surface.changed, by cli) opens that file with those lines picked,
 *                and is not sent back
 *          SS-12 the tab opens where the surface was left (GET …/surface on load)
 * No engine on the machine: the browser part is SKIPPED, said, never passed.
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '../..');
const UI = path.join(ROOT, 'idearium', 'ui');

let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
function done() { console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`); process.exit(failed ? 1 : 0); }

function harness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce8-ui-'));
  const css = fs.readFileSync(path.join(UI, 'css', 'code-surface.css'), 'utf8');
  const src = (f) => pathToFileURL(path.join(UI, 'js', f)).href;
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div id="repo-subtab-code" style="height:800px"></div>
<script>
  const CALLS = [];
  const REPO = { uuid: 'r1', name: 'daw', files: [{ path: 'src/a.js' }, { path: 'src/b.js' }] };
  let CURRENT_API_REPO = REPO, CURRENT_REPO_SUBTAB = 'code';
  let SURFACE = { repoUuid: 'r1', open: null, sel: null, chunk: null, filters: {}, by: null, rev: 0 };
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function toast() {}
  const TEXT = { 'src/a.js': 'function a() {\\n  return 2;\\n}\\nmodule.exports = a;\\n', 'src/b.js': 'const b = 1;\\nconst c = 2;\\nconst d = 3;\\nmodule.exports = { b, c, d };\\n' };
  async function api(p, opts) {
    const method = (opts && opts.method) || 'GET';
    CALLS.push({ p, method, body: opts && opts.body ? JSON.parse(opts.body) : null });
    if (p.endsWith('/surface')) return method === 'PUT' ? { ...SURFACE, ...JSON.parse(opts.body) } : SURFACE;
    if (p.includes('/file?path=')) return { content: TEXT[decodeURIComponent(p.split('path=')[1])] || '' };
    if (p.includes('/code/overview')) return { files: 2, chunks: 0, lines: 9, languages: ['js'], repo: { writeMode: 'propose', pendingProposals: 0 } };
    if (p.includes('/code/outline')) return { chunks: [] };
    if (p.endsWith('/agent/route')) return { ok: true, route: [], pinned: null };
    if (p.endsWith('/worksurface')) return { files: [], totals: {} };
    if (p.endsWith('/files/state')) return { states: {}, counts: {} };
    return {};
  }
</script>
<script src="${src('file-manage.js')}"></script>
<script src="${src('work-surface.js')}"></script>
<script src="${src('code-surface.js')}"></script>
</body></html>`);
  return path.join(dir, 'index.html');
}

(async () => {
  const SS = require(path.join(ROOT, 'idearium/lib/surface-state.cjs'));

  await test('SS-01', 'set / get; a new file clears the old lines and chunk; a bad range is refused; rev counts; who is kept', async () => {
    const u = `ss01-${Date.now()}`;
    assert.deepStrictEqual([SS.get(u).open, SS.get(u).rev], [null, 0]);
    let s = SS.set(u, { open: 'src/a.js', sel: { from: 9, to: 3 }, chunk: 'c-a' }, { by: 'cli' });
    assert.deepStrictEqual([s.open, s.sel, s.chunk, s.by, s.rev], ['src/a.js', { from: 3, to: 9 }, 'c-a', 'cli', 1]);
    assert.deepStrictEqual(SS.get(u).sel, { from: 3, to: 9 }, 'kept on disk');
    s = SS.set(u, { open: 'src/b.js' });
    assert.deepStrictEqual([s.open, s.sel, s.chunk, s.by, s.rev], ['src/b.js', null, null, 'ui', 2]);
    assert.throws(() => SS.set(u, { sel: { from: 0 } }), /line numbers/);
    assert.throws(() => SS.set(u, { open: '../etc/passwd' }), /inside the repo/);
    s = SS.set(u, { filters: { changedOnly: 1, mode: 'grep', q: 'x' } });
    assert.deepStrictEqual(s.filters, { changedOnly: true, mode: 'grep', q: 'x' });
  });

  process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
  process.env.COPILOT_URL = 'http://127.0.0.1:9';
  const api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));
  const L = api.getRepoLayer();
  let made = null;
  for (let i = 0; i < 20; i++) {
    made = await quiet(async () => L.ingest({ name: `ce8-${Date.now()}`, source: 'test', compartmentId: 'c-ce8', files: [{ path: 'src/a.js', content: 'one\ntwo\nthree\nfour\n' }] }));
    if (!(made && made.error && /no spec-engine/.test(made.error))) break;
    await new Promise(x => setTimeout(x, 250));
  }
  const u = made.repo.uuid;

  await test('SS-02', 'GET / PUT …/surface: the picked lines with their text, the proposals waiting; 404 / 400 said', async () => {
    let r = await api._route('GET', `/api/repos/${u}/surface`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.open, null);
    r = await api._route('PUT', `/api/repos/${u}/surface`, { open: 'src/a.js', sel: { from: 2, to: 3 }, by: 'cli' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.deepStrictEqual([r.json.open, r.json.by, r.json.lines && r.json.lines.text, r.json.lines && r.json.lines.to], ['src/a.js', 'cli', 'two\nthree', 3]);
    await quiet(async () => require(path.join(ROOT, 'lib/repo-inject.js')).propose({ layer: L, repo: L.get(u), path: 'src/new.js', content: 'x\n', source: { kind: 'test' } }));
    r = await api._route('GET', `/api/repos/${u}/surface`);
    assert.deepStrictEqual(r.json.pending.map(p => p.path), ['src/new.js']);
    assert.deepStrictEqual(r.json.sel, { from: 2, to: 3 }, 'kept between calls');
    assert.strictEqual((await api._route('PUT', `/api/repos/${u}/surface`, { open: 'src/nope.js' })).status, 404);
    assert.strictEqual((await api._route('PUT', `/api/repos/${u}/surface`, { sel: { from: 'x' } })).status, 400);
    assert.strictEqual((await api._route('GET', '/api/repos/nope-ce8/surface')).status, 404);
  });

  await test('SS-03', 'the CLI rows: code open --lines, code select a b / --chunk / --clear; code surface prints it', async () => {
    const RC = await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    const row = (k) => RC.SPEC.find(x => x.key === k);
    const repo = { uuid: 'r9', name: 'r' };
    assert.deepStrictEqual(row('code.open').req({ repo, args: ['src/a.js'], flags: { lines: '12-40' } }), { method: 'PUT', path: '/api/repos/r9/surface', body: { open: 'src/a.js', sel: { from: 12, to: 40 }, by: 'cli' } });
    assert.ok(row('code.open').req({ repo, args: ['src/a.js'], flags: { lines: 'x' } }).error);
    assert.deepStrictEqual(row('code.select').req({ repo, args: ['7', '3'], flags: {} }).body, { by: 'cli', sel: { from: 3, to: 7 } });
    assert.deepStrictEqual(row('code.select').req({ repo, args: [], flags: { chunk: 'c-a' } }).body, { by: 'cli', chunk: 'c-a' });
    assert.deepStrictEqual(row('code.select').req({ repo, args: [], flags: { clear: true } }).body, { by: 'cli', sel: null, chunk: null });
    assert.ok(row('code.select').need({ repo, args: [], flags: {} }));
    const t = RC.renderText(row('code.surface'), { open: 'src/a.js', sel: { from: 2, to: 3 }, lines: { from: 2, to: 3, text: 'two\nthree' }, pending: [{ uuid: 'i1', path: 'src/new.js' }], run: null, by: 'cli', rev: 4 });
    assert.ok(/src\/a\.js/.test(t) && /lines 2–3/.test(t) && /3 {2}three/.test(t) && /1 proposal waiting/.test(t) && /set by cli/.test(t), t);
  });

  // ── SS-1x the tab in Clear Glass ──
  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!eng) { console.log('  - SS-10…SS-12 SKIPPED: Clear Glass has no engine here (no Electron binary, no Chromium) — the browser checks did not run'); skipped += 3; return done(); }
  let browser;
  try { browser = await glass.chromium.launch(); }
  catch (e) { console.log(`  - SS-10…SS-12 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped += 3; return done(); }
  console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${eng.kind}`);
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const puts = () => page.evaluate(() => CALLS.filter(c => c.method === 'PUT' && c.p.endsWith('/surface')).map(c => c.body));

    await page.goto(pathToFileURL(harness()).href);
    await page.evaluate(() => renderRepoCode(REPO));
    await page.waitForSelector('.cs-file[data-path="src/a.js"]');

    await test('SS-10', 'opening a file and picking lines publishes the surface once it settles (by ui)', async () => {
      await page.evaluate(() => csOpen('src/a.js'));
      await page.waitForSelector('#cs-code [data-ln="2"]');
      await page.click('#cs-code [data-ln="2"] .cs-g');
      await page.evaluate(() => csPickLine({ shiftKey: true }, 3));   // shift-click widens (the gutter's own handler)
      await page.waitForFunction(() => CALLS.some(c => c.method === 'PUT' && c.p.endsWith('/surface') && JSON.parse(JSON.stringify(c.body)).sel), null, { timeout: 4000 });
      const last = (await puts()).pop();
      assert.deepStrictEqual([last.open, last.sel, last.by], ['src/a.js', { from: 2, to: 3 }, 'ui']);
      const n = (await puts()).length;
      await page.evaluate(() => csPaint());
      await new Promise(x => setTimeout(x, 700));
      assert.strictEqual((await puts()).length, n, 'an unchanged surface is not sent again');
    });

    await test('SS-11', 'a change from the CLI (idearium.surface.changed, by cli) opens that file with those lines picked; not sent back', async () => {
      const n = (await puts()).length;
      await page.evaluate(() => codeSurfaceOnEvent({ type: 'idearium.surface.changed', payload: { repoUuid: 'r1', open: 'src/b.js', sel: { from: 2, to: 3 }, chunk: null, by: 'cli', rev: 9 } }));
      await page.waitForFunction(() => CS.open === 'src/b.js' && CS.sel && CS.sel.to === 3 && document.querySelector('#cs-code [data-ln="3"].sel'));
      assert.deepStrictEqual(await page.$$eval('#cs-code .cs-ln.sel', els => els.map(e => +e.dataset.ln)), [2, 3]);
      await new Promise(x => setTimeout(x, 700));
      assert.strictEqual((await puts()).length, n, 'the followed surface is not echoed');
      await page.evaluate(() => codeSurfaceOnEvent({ type: 'idearium.surface.changed', payload: { repoUuid: 'r1', open: 'src/a.js', sel: null, by: 'ui', rev: 10 } }));
      await new Promise(x => setTimeout(x, 200));
      assert.strictEqual(await page.evaluate(() => CS.open), 'src/b.js', 'its own echo (by ui) is ignored');
    });

    await test('SS-12', 'the tab opens where the surface was left (GET …/surface on load)', async () => {
      await page.evaluate(() => { SURFACE = { repoUuid: 'r2', open: 'src/a.js', sel: { from: 4, to: 4 }, chunk: null, filters: {}, by: 'cli', rev: 3 }; REPO.uuid = 'r2'; renderRepoCode(REPO); });
      await page.waitForFunction(() => CS.open === 'src/a.js' && CS.sel && CS.sel.from === 4 && document.querySelector('#cs-code [data-ln="4"].sel'));
      assert.deepStrictEqual(errors, []);
    });
  } finally { await browser.close(); }
  done();
})();
