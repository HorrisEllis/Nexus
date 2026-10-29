'use strict';
/**
 * tests/modules/test-project-spine.test.js — finish this or any other project (FA0–FA6, 0.60.286)
 * James, 2026-10-29, uploading Emerge.zip: "take this, and import it into idearium, then create all the capability to finish this or
 * any other project in the repo. convert mds, hardcoded phasemaps, refactor tool for the architecture to use the component registry as
 * the spine, decomposition tool for breaking up each component into it's own file and wire it into the spine."
 *
 *   PS-01  import: a tracked build/ folder survives, a gitignored one is omitted with its reason; .eg is chunked; the wrapper is stripped
 *   PS-02  adapters: javascript, documents and emerge pass the conformance check; forFile picks by extension
 *   PS-03  spine: components and wires with evidence; an unresolved require is unknown; rescanning gives the same; drift is said
 *   PS-04  refactor: move by component id rewrites every consumer and the file's own requires; verify loses no wire; a taken path refused
 *   PS-05  split: three sections → three pieces + the door; same exports when loaded apart; a shared reassigned let kept together; ESM refused
 *   PS-06  convert: an md → an emerge-format spec naming the files it mentions; a spec's build plan → a phasemap whose DAG resolves
 *   PS-07  the door: import the zip through the real router, then spine, convert, split, refactor and finish, each GET a plan and each
 *          apply a repo write; the command rows
 *   PS-08  the Finish tab in Clear Glass (AXIOMS §4.1): the real screen script against the real API — the checklist, a split preview
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const _data = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-'));
const _jaa = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-jaa-'));
process.env.IDEARIUM_DATA_DIR = _data;
process.env.JAA_DATA_DIR = _jaa;
process.env.NEXUS_EVIDENCE = 'off';
process.on('exit', () => { for (const d of [_data, _jaa]) try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
const assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
const quiet = async (f) => { const l = console.log, w = console.warn, e = console.error; console.log = console.warn = console.error = () => {}; try { return await f(); } finally { console.log = l; console.warn = w; console.error = e; } };

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

const KERNEL = `'use strict';
// kernel.js — a file holding three components
const path = require('path');

// ── Paths ──────────────────────────
const ROOT = path.join(__dirname, 'data');
function where(x) { return path.join(ROOT, x); }

// ── Counter ──────────────────────────
let count = 0;
function bump() { count += 1; return count; }
function read() { return count; }

// ── Words ──────────────────────────
const { shout } = require('./util/shout');
function greet(n) { return shout('hi ' + n) + bump(); }

module.exports = { where, bump, read, greet, ROOT };
`;
const FILES = {
  'proj/.gitignore': 'node_modules/\nlang/build/previous/\nout/*\n!out/.gitkeep\n',
  'proj/README.md': '# Proj\n\nThe kernel is `kernel.js`; it uses [shout](util/shout.js).\n\n## Use\n\nRun `node main.js`.\n',
  'proj/main.js': "const k = require('./kernel');\nconsole.log(k.greet('a'));\n",
  'proj/kernel.js': KERNEL,
  'proj/util/shout.js': "module.exports = { shout: (s) => String(s).toUpperCase() };\n",
  'proj/app/use.js': "const { where } = require('../kernel.js');\nmodule.exports = () => where('x');\n",
  'proj/lang/build/current/prelude.js': 'module.exports = 1;\n',
  'proj/lang/build/previous/prelude.js': 'module.exports = 0;\n',
  'proj/lang/core/a.eg': 'use "./b.eg" as b\n\nfn twice(x) {\n  return b.one(x) * 2\n}\n',
  'proj/lang/core/b.eg': 'fn one(x) {\n  return x\n}\n',
  'proj/out/x.txt': 'generated\n',
  'proj/out/.gitkeep': '',
  'proj/spec/core.spec': `spec:
  meta:
    name: proj-core
    build_plan: "each module carries build"
  sections:
    open:
      decisions:
        - { id: D1, question: "Which store?", status: OPEN }
        - { id: D2, question: "Ints?", status: DECIDED, resolution: "yes" }
  modules:
    - id: MOD-A
      name: alpha
      build: { state: built, blocked_by: [], existing: ["kernel.js"] }
    - id: MOD-B
      name: beta
      build: { state: not_built, file: lang/core/b.eg, blocked_by: [MOD-A], next: "write beta" }
    - id: MOD-C
      name: gamma
      build: { state: partial, file: lang/core/a.eg, blocked_by: [D1, D9], next: "finish gamma" }
`,
};
const plainFiles = () => Object.entries(FILES).map(([p, c]) => ({ path: p.replace(/^proj\//, ''), content: c }));

(async () => {
  console.log('\n⬡  Finish any project — import whole, the registry as the spine, refactor, split, convert\n');
  const ZI = require(path.join(ROOT, 'lib/zip-ingest.js'));
  const Zip = require(path.join(ROOT, 'lib/zip.js'));
  const z = new Zip(); for (const [p, c] of Object.entries(FILES)) z.addFile(p, Buffer.from(c));
  const zipBuf = z.toBuffer();

  await test('PS-01', 'import keeps what the project tracks: build/current kept, the gitignored omitted with the reason, .eg chunked', async () => {
    const cfg = require(path.join(ROOT, 'lib/project-import.config.js'));
    const e = ZI.extractZipToFiles({ buf: zipBuf, stripWrapper: true, maxFiles: 1000, maxBytesPerFile: 1e6, maxTotalBytes: 1e8, skipDirs: cfg.ZIP.skipDirs, textExt: cfg.ZIP.textExt });
    assert.ok(e.ok, e.error); assert.strictEqual(e.wrapper, 'proj'); assert.strictEqual(e.stats.gitignore, 'read');
    const real = e.realFiles.map(f => f.path);
    assert.ok(real.includes('lang/build/current/prelude.js'), 'a tracked build folder is kept');
    assert.ok(!real.includes('lang/build/previous/prelude.js') && !real.includes('out/x.txt') && real.includes('out/.gitkeep'), 'the .gitignore decides, negation too');
    assert.deepStrictEqual(e.omitted.map(o => o.why).filter((v, i, a) => a.indexOf(v) === i), ["ignored by the project's .gitignore"]);
    assert.ok(e.included.some(f => f.path === 'lang/core/a.eg'), '.eg is chunked');
    const noIgnore = new Zip(); noIgnore.addFile('p/build/x.js', Buffer.from('1')); noIgnore.addFile('p/src/y.js', Buffer.from('2'));
    const e2 = ZI.extractZipToFiles({ buf: noIgnore.toBuffer(), stripWrapper: true, maxFiles: 10, maxBytesPerFile: 1e6, maxTotalBytes: 1e8 });
    assert.deepStrictEqual([e2.stats.gitignore, e2.realFiles.map(f => f.path)], ['none', ['src/y.js']], 'no .gitignore: the old skip set');
  });

  await test('PS-02', 'adapters: three pass the conformance check; forFile picks by extension', async () => {
    const C = require(path.join(ROOT, 'lib/adapters/contract.js'));
    for (const a of C.adapters()) assert.deepStrictEqual(C.conformance(a), { ok: true, adapter: a.id, failures: [] });
    assert.deepStrictEqual(['a.js', 'b.md', 'c.eg', 'd.spec', 'e.bin'].map(p => (C.forFile(p) || { id: null }).id), ['javascript', 'documents', 'emerge', 'documents', null]);
    const J = C.forFile('k.js'); const u = J.units(KERNEL, 'kernel.js');
    assert.deepStrictEqual([...new Set(u.map(x => x.section).filter(Boolean))], ['Paths', 'Counter', 'Words']);
    assert.strictEqual(J.parse('const x = ;', 'x.js').verdict, 'fail');
    assert.deepStrictEqual(J.dependencies("out.push(`const a = require('./gen')`);\nconst b = require('./real');\n").map(d => d.spec), ['./real'], 'emitted code is not a dependency');
    // 0.60.287 — a "/*" inside a // comment hid the rest of lib/agent-tools/index.js (125 requires seen as 38); _require is Idearium's createRequire
    assert.deepStrictEqual(J.dependencies("// see hooks/*.hooks.js\nconst a = require('./a'); // x /* y\nconst s = '/*'; const b = require('./b');\nconst c = _require('./c');\n").map(d => d.spec), ['./a', './b', './c']);
  });

  const S = require(path.join(ROOT, 'lib/project-spine.js'));
  await test('PS-03', 'spine: components and wires with evidence; unknown said; the same twice; drift said', async () => {
    const files = [...plainFiles(), { path: 'broken.js', content: "require('./nowhere');\n" }];
    const s = S.scan({ files, project: 'proj' });
    const w = (from, to) => s.wires.find(x => x.fromPath === from && x.toPath === to);
    assert.ok(w('main.js', 'kernel.js') && w('main.js', 'kernel.js').evidence === 'discovered:javascript');
    assert.ok(w('lang/core/a.eg', 'lang/core/b.eg') && w('lang/core/a.eg', 'lang/core/b.eg').evidence === 'discovered:emerge');
    assert.ok(w('README.md', 'util/shout.js') && w('README.md', 'util/shout.js').kind === 'reference');
    assert.strictEqual(s.unknown, 1); assert.ok(s.wires.some(x => x.evidence === 'unknown' && x.spec === './nowhere'));
    assert.ok(s.components.find(c => c.path === 'kernel.js').exports.includes('greet'));
    const again = S.scan({ files, project: 'proj' }); assert.deepStrictEqual(again.wires, s.wires);
    assert.ok(S.check(s, files).ok);
    const drift = S.check(s, [...files, { path: 'new.js', content: "require('./kernel');\n" }]);
    assert.deepStrictEqual([drift.ok, drift.added, drift.wiresAdded.length], [false, ['new.js'], 1]);
    const d = S.declare(s, { from: 'kernel.js', to: 'http://127.0.0.1:4800/api', kind: 'http', by: 'james' });
    assert.ok(d.ok); const m = S.merge(s, S.scan({ files, project: 'proj' })); assert.ok(m.wires.some(x => x.evidence === 'declared:james'), 'declared edges survive a rescan');
  });

  await test('PS-04', 'refactor: move by id rewrites consumers and its own requires; verify loses no wire; a taken path refused', async () => {
    const R = require(path.join(ROOT, 'lib/project-refactor.js'));
    const files = plainFiles(); const s = S.scan({ files, project: 'proj' });
    const p = R.move(s, files, { id: 'proj.util.shout', to: 'lib/text/shout.js' });
    assert.ok(p.ok, p.refused);
    const after = new Map(p.writes.map(w => [w.path, w.after]));
    assert.match(after.get('kernel.js'), /require\('\.\/lib\/text\/shout'\)/, 'extension style kept (none)');
    assert.match(after.get('README.md'), /\[shout\]\(lib\/text\/shout\.js\)/);
    assert.ok(after.has('lib/text/shout.js') && p.moves[0].from === 'util/shout.js' && p.verify.ok);
    const k = R.move(s, files, { id: 'proj.kernel', to: 'core/' });
    assert.ok(k.ok, k.refused); const ka = new Map(k.writes.map(w => [w.path, w.after]));
    assert.match(ka.get('core/kernel.js'), /require\('\.\.\/util\/shout'\)/, 'its own requires seen from the new folder');
    assert.match(ka.get('app/use.js'), /require\('\.\.\/core\/kernel\.js'\)/);
    assert.match(R.move(s, files, { id: 'proj.kernel', to: 'main.js' }).refused, /taken/);
    assert.match(R.move(s, files, { id: 'nope', to: 'x.js' }).refused, /no component/);
  });

  await test('PS-05', 'split: sections → pieces + the door; same exports loaded apart; a reassigned let kept together; ESM refused', async () => {
    const X = require(path.join(ROOT, 'lib/project-split.js'));
    const files = plainFiles();
    const pl = X.plan('kernel.js', KERNEL);
    assert.ok(pl.ok, pl.refused); assert.strictEqual(pl.by, 'section');
    assert.deepStrictEqual(pl.pieces.map(p => p.path), ['kernel/paths.js', 'kernel/counter.js', 'kernel/words.js']);
    const counter = pl.pieces.find(p => p.path === 'kernel/counter.js'); assert.deepStrictEqual(counter.names, ['count', 'bump', 'read'], 'count is reassigned: it stays with its users');
    const words = pl.writes.find(w => w.path === 'kernel/words.js').after;
    assert.match(words, /require\('\.\.\/util\/shout'\)/, 'a require rebased to the piece');
    assert.match(words, /const \{ bump \} = require\('\.\/counter\.js'\)/, 'a piece requires the piece it uses');
    assert.match(pl.writes.find(w => w.path === 'kernel/paths.js').after, /__doorDir/, '__dirname means the old folder');
    assert.match(pl.door, /module\.exports = \{ where, bump, read, greet, ROOT \};/, 'the door exports as written');
    const v = X.verify(pl, { files });
    assert.ok(v.ok, JSON.stringify(v).slice(0, 400)); assert.deepStrictEqual(Object.keys(v.after).sort(), ['ROOT', '__name', '__type', 'bump', 'greet', 'read', 'where']);
    assert.match(X.plan('m.mjs', 'export const a = 1;\nexport const b = 2;\n').refused, /ES module/);
    assert.match(X.plan('one.js', "function a() {}\nmodule.exports = { a };\n").refused, /fewer than two/);
    const bad = { ...pl, writes: pl.writes.map(w => (w.path === 'kernel/counter.js' ? { ...w, after: w.after.replace('module.exports = { count, bump, read };', 'module.exports = { count, bump };') } : w)) };
    assert.strictEqual(X.verify(bad, { files }).ok, false, 'a split that changes the exports is caught');
    assert.ok(X.candidates(files).some(c => c.path === 'kernel.js'));
  });

  await test('PS-06', 'convert: md → spec naming its files; a spec build plan → a phasemap whose DAG resolves', async () => {
    const CV = require(path.join(ROOT, 'lib/project-convert.js'));
    const files = plainFiles();
    const m = CV.mdToSpec('README.md', FILES['proj/README.md'], { files, project: 'proj' });
    const doc = require('js-yaml').load(m.text).spec;
    assert.deepStrictEqual([m.target, doc.meta.source_document, Object.keys(doc.sections)], ['README.spec', 'README.md', ['proj', 'use']]);
    assert.deepStrictEqual(doc.modules.map(x => x.path).sort(), ['kernel.js', 'main.js', 'util/shout.js']);
    assert.ok(doc.modules.find(x => x.path === 'kernel.js').exports.includes('greet'));
    const sp = CV.specPlan(FILES['proj/spec/core.spec'], { specPath: 'spec/core.spec' });
    assert.deepStrictEqual(sp.phases.map(p => [p.id, p.status, p.deps]), [['PC1_alpha', 'DONE', []], ['PC2_beta', 'OPEN', ['PC1_alpha']], ['PC3_gamma', 'OPEN', ['PCD1_which_store']]]);
    assert.deepStrictEqual([sp.next, sp.problems], [['PC2_beta'], []], 'gamma waits on the open decision');
    assert.ok(sp.said.some(s => /D9: not a decision or module/.test(s)), 'a blocked_by naming nothing is said, not an edge');
    const pl = CV.plan(files);
    assert.deepStrictEqual([pl.mds.map(x => x.target), pl.specPlans.map(x => x.target)], [['README.spec'], ['spec/core-phasemap.spec']]);
  });

  await test('PS-07', 'the door: import the zip, then spine, convert, split, refactor, finish through the real router; the commands', async () => {
    const api = await import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href);
    await import(pathToFileURL(path.join(ROOT, 'idearium/spec-engine/index.js')).href);
    let made = null;
    for (let i = 0; i < 40; i++) { made = await quiet(() => api._route('POST', '/api/repos/import', { name: 'ps-proj', filename: 'proj.zip', contentBase64: zipBuf.toString('base64') })); if (made.json && (made.json.repo || (made.json.data && made.json.data.repo))) break; await new Promise(r => setTimeout(r, 100)); }
    const repo = made.json.repo || made.json.data.repo; assert.ok(repo && repo.uuid, JSON.stringify(made.json).slice(0, 300));
    const u = repo.uuid; const D = (r) => r.json.data || r.json;
    const fin0 = D(await quiet(() => api._route('GET', `/api/repos/${u}/finish`)));
    assert.deepStrictEqual(fin0.items.map(i => i.id), ['spine', 'unknown-wires', 'docs', 'plans', 'split', 'phases']);
    assert.ok(!fin0.items.find(i => i.id === 'spine').done && !fin0.items.find(i => i.id === 'split').done);
    const sp = D(await quiet(() => api._route('GET', `/api/repos/${u}/spine`)));
    assert.ok(sp.components.some(c => c.path === 'lang/build/current/prelude.js'), 'the kept build file is a component');
    const wr = await quiet(() => api._route('POST', `/api/repos/${u}/spine`, {})); assert.strictEqual(wr.status, 200, JSON.stringify(wr.json).slice(0, 300));
    const cv = D(await quiet(() => api._route('GET', `/api/repos/${u}/convert`))); assert.deepStrictEqual([cv.todo.mds, cv.todo.specPlans], [1, 1]);
    const cva = await quiet(() => api._route('POST', `/api/repos/${u}/convert`, { apply: true }));
    assert.strictEqual(cva.status, 200, JSON.stringify(cva.json).slice(0, 300)); assert.deepStrictEqual(D(cva).writes.map(w => w.path).sort(), ['README.spec', 'spec/core-phasemap.spec']);
    const prev = await quiet(() => api._route('POST', `/api/repos/${u}/split`, { path: 'kernel.js' }));
    assert.strictEqual(prev.status, 200, JSON.stringify(prev.json).slice(0, 400)); assert.strictEqual(D(prev).applied, false); assert.ok(D(prev).verify.ok);
    const ap = await quiet(() => api._route('POST', `/api/repos/${u}/split`, { path: 'kernel.js', apply: true }));
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.json).slice(0, 400));
    const L = api.getRepoLayer();
    assert.match(L.readTextFile(u, 'kernel.js').content, /require\('\.\/kernel\/counter\.js'\)/); assert.ok(!L.readTextFile(u, 'kernel/words.js').error);
    const rf = await quiet(() => api._route('POST', `/api/repos/${u}/refactor`, { op: 'move', id: 'util/shout.js', to: 'lib/shout.js', apply: true }));
    assert.strictEqual(rf.status, 200, JSON.stringify(rf.json).slice(0, 400));
    assert.match(L.readTextFile(u, 'kernel/words.js').content, /require\('\.\.\/lib\/shout'\)/, 'the split piece, now a consumer, was rewritten through the spine');
    assert.ok(L.readTextFile(u, 'util/shout.js').error && !L.readTextFile(u, 'lib/shout.js').error);
    const spine = JSON.parse(L.readTextFile(u, 'nexus.spine.json').content);
    assert.ok(spine.components.some(c => c.path === 'kernel/words.js') && spine.wires.some(w => w.fromPath === 'kernel.js' && w.toPath === 'kernel/counter.js'), 'the pieces are wired into the spine');
    const fin = D(await quiet(() => api._route('GET', `/api/repos/${u}/finish`)));
    assert.ok(fin.items.find(i => i.id === 'spine').done && fin.items.find(i => i.id === 'docs').done && fin.items.find(i => i.id === 'plans').done, JSON.stringify(fin.items));
    const { SPEC } = await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    const row = (k) => SPEC.find(x => x.key === k);
    assert.deepStrictEqual(row('repo.split').req({ repo: { uuid: 'r' }, args: ['a/b.js'], flags: { apply: true } }), { method: 'POST', path: '/api/repos/r/split', body: { path: 'a/b.js', by: 'auto', apply: true, testCmd: null }, timeoutMs: 600000 });
    assert.deepStrictEqual(row('repo.refactor').req({ repo: { uuid: 'r' }, args: ['move', 'x.js', 'y/'], flags: {} }), { method: 'POST', path: '/api/repos/r/refactor', body: { op: 'move', id: 'x.js', to: 'y/', name: undefined, apply: false }, timeoutMs: 120000 });
    assert.deepStrictEqual(row('repo.finish').req({ repo: { uuid: 'r' }, args: [], flags: {} }), { method: 'GET', path: '/api/repos/r/finish', timeoutMs: 120000 });
    assert.ok(row('repo.spine') && row('repo.convert'));
    S._uuid = u; S._api = api;
  });

  await test('PS-08', 'the Finish tab in Clear Glass: the checklist, the components, a split preview with its pieces', async () => {
    const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
    if (!glass.engine()) { console.log('  - PS-08 SKIPPED: Clear Glass has no engine here'); return; }
    assert.ok(S._uuid, 'PS-07 made the repo');
    const http = require('http'); const UI = path.join(ROOT, 'idearium/ui');
    const HTML = `<!doctype html><html><head><link rel="stylesheet" href="/css/repo-spine.css"></head><body><div id="repo-subtab-finish"></div>
      <script>const API_BASE=''; window.toast=(m)=>{document.body.dataset.toast=m};
      async function api(p,o={},t){const r=await fetch(p,{headers:{'Content-Type':'application/json'},...o});const d=await r.json();if(!r.ok||d.ok===false){const e=new Error(d.error||'failed');e.data=d.detail||d;throw e}return d}</script>
      <script src="/js/repo-spine.js"></script><script>renderSpine(document.getElementById('repo-subtab-finish'),{uuid:'${S._uuid}',name:'ps-proj'})</script></body></html>`;
    const srv = http.createServer(async (req, res) => {
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(HTML); }
      if (u.pathname.startsWith('/api/')) { let raw = ''; for await (const c of req) raw += c; const r = await quiet(() => S._api._route(req.method, u.pathname + u.search, raw ? JSON.parse(raw) : undefined)); res.writeHead(r.status, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(r.json)); }
      const f = path.join(UI, path.normalize(u.pathname).replace(/^[/\\]+/, ''));
      if (!f.startsWith(UI) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8' }); fs.createReadStream(f).pipe(res);
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    let browser;
    try {
      browser = await glass.chromium.launch();
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${srv.address().port}/`);
      await page.waitForSelector('.fa-list .fa-item', { timeout: 120000 });
      const items = await page.$$eval('.fa-item b', els => els.map(e => e.textContent));
      assert.deepStrictEqual(items, ['spine', 'unknown-wires', 'docs', 'plans', 'split', 'phases']);
      await page.click('[data-fa="show"]');
      if (process.env.PS_DEBUG) { await new Promise(r => setTimeout(r, 4000)); console.log('DEBUG', JSON.stringify(await page.evaluate(() => [document.getElementById('fa-plan') && document.getElementById('fa-plan').outerHTML.slice(0, 300), document.body.dataset.toast])), errors); }
      await page.waitForFunction(() => /components ·|refused|did not/.test((document.getElementById('fa-plan') || {}).textContent || ''), null, { timeout: 120000 });
      const plan = await page.textContent('#fa-plan');
      assert.ok(/kernel\/words\.js/.test(plan), 'the split pieces are components in the spine');
      if (process.env.PS_SHOT) await page.screenshot({ path: process.env.PS_SHOT, fullPage: true });
      assert.deepStrictEqual(errors, []);
    } finally { try { if (browser) await browser.close(); } catch (_) {} srv.close(); }
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 200).unref();
})();
