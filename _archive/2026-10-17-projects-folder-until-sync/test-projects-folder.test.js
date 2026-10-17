'use strict';
// PF-01..06 (0.60.139 COSA14): his projects folder, found and brought into Idearium.
// James, 2026-10-17: "these are all my projects i have so far. way more. in some folders. i was hoping to use idearium and cos to manage them"
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
require('../../lib/test-sandbox.js').ensure();
const REPO = path.resolve(__dirname, '..', '..');
const PF = require('../../idearium/lib/projects-folder.cjs');
let passed = 0, failed = 0; const tests = [];
const test = (n, f) => tests.push([n, f]);
const quiet = async (fn) => { const k = { log: console.log, warn: console.warn, info: console.info, error: console.error }; console.log = console.warn = console.info = console.error = () => {}; try { return await fn(); } finally { Object.assign(console, k); } };
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-root-'));
const put = (rel, txt = 'x\n') => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), txt); };
put('Behavior Engine/package.json', '{"name":"behavior-engine","version":"1.0.0"}\n'); put('Behavior Engine/src/index.js', 'module.exports = 1;\n'); put('Behavior Engine/node_modules/dep/index.js');
put('Eravos/Eravos Canvas/index.html', '<!doctype html>\n'); put('Eravos/Eravos DAW/main.py'); fs.mkdirSync(path.join(root, 'Eravos/Eravos DAW/.git'), { recursive: true });
put('Notes/ideas.txt', 'an idea\n'); fs.mkdirSync(path.join(root, 'Empty'), { recursive: true });

test('PF-01 the scan: projects by their markers, also inside group folders; a folder of files is a project too (weak); only an empty one is not', () => {
  const r = PF.scan(root);
  const by = Object.fromEntries(r.projects.map(p => [p.rel, p]));
  assert.ok(by['Behavior Engine'] && by['Behavior Engine'].markers.includes('package.json'));
  assert.deepStrictEqual([by['Eravos/Eravos Canvas'].group, by['Eravos/Eravos DAW'].group], ['Eravos', 'Eravos']);
  assert.ok(by['Eravos/Eravos DAW'].markers.includes('.git'));
  assert.ok(by['Notes'] && by['Notes'].weak && by['Notes'].markers[0] === 'files');
  assert.deepStrictEqual(r.groups.map(g => [g.rel, g.projects]), [['Eravos', 2]]);
  assert.deepStrictEqual(r.notRecognized.map(n => n.rel), ['Empty']);
  assert.strictEqual(by['Behavior Engine'].size.files, 2, 'node_modules is not counted');
});
test('PF-02 the zip: the import\'s skip rules and caps; too big is refused and said; the folder is never written', () => {
  const before = fs.readdirSync(path.join(root, 'Behavior Engine')).sort();
  const z = PF.zipFolder(path.join(root, 'Behavior Engine'));
  assert.ok(z.ok && z.files === 2 && z.skipped.some(s => s.rel === 'node_modules'));
  const { extractZipToFiles } = require('../../lib/zip-ingest.js');
  const ex = extractZipToFiles({ buf: z.buf, maxFiles: 100, maxBytesPerFile: 1e6, maxTotalBytes: 1e7 });
  assert.ok(ex.ok && ex.included.some(f => f.path.endsWith('src/index.js')));
  const big = PF.zipFolder(path.join(root, 'Behavior Engine'), { maxFiles: 1 });
  assert.ok(!big.ok && /more than 1 files/.test(big.error));
  assert.deepStrictEqual(fs.readdirSync(path.join(root, 'Behavior Engine')).sort(), before);
});
test('PF-03 the state is kept in Idearium\'s data dir (the sandbox in a test), across reads', () => {
  const s = PF.writeState({ root, imported: {} });
  assert.deepStrictEqual(PF.readState(), s);
  assert.ok(require('../../idearium/lib/data-dir.cjs').ideariumDataDir().startsWith(process.env.NEXUS_TEST_SANDBOX));
});
test('PF-04 the routes end to end: set the folder, scan, bring one project in through the zip import, and it shows as in', async () => {
  const api = await quiet(async () => import(path.join(REPO, 'idearium/api/index.js')));
  const set = await quiet(async () => api._route('POST', '/api/my-projects/folder', { root }));
  const s = set.json.data || set.json;
  assert.strictEqual(set.status, 200, JSON.stringify(set.json).slice(0, 200)); assert.strictEqual(s.counts.projects, 4);
  const target = s.projects.find(p => p.rel === 'Behavior Engine').path;
  // the spec engine loads on first use (a running server has it long before he presses import): wait for it, as a server would
  let imp, d;
  for (let i = 0; i < 40; i++) {
    imp = await quiet(async () => api._route('POST', '/api/my-projects/folder/import', { paths: [target] }));
    d = imp.json.data || imp.json;
    if (!(d.results && d.results[0] && /no spec-engine/.test(d.results[0].error || ''))) break;
    await new Promise(r => setTimeout(r, 250));
  }
  assert.strictEqual(imp.status, 200); assert.ok(d.results[0].ok, JSON.stringify(d.results[0]).slice(0, 300));
  const again = await quiet(async () => api._route('GET', '/api/my-projects/folder'));
  const a = again.json.data || again.json;
  assert.strictEqual(a.imported, 1); assert.ok(a.projects.find(p => p.rel === 'Behavior Engine').imported.uuid === d.results[0].repo.uuid);
});
test('PF-05 a path outside the projects folder is refused; no folder set, or a folder that is not there, is said', async () => {
  const api = await quiet(async () => import(path.join(REPO, 'idearium/api/index.js')));
  const out = await quiet(async () => api._route('POST', '/api/my-projects/folder/import', { paths: [os.tmpdir()] }));
  assert.ok(/not inside the projects folder/.test((out.json.data || out.json).results[0].error));
  const none = await quiet(async () => api._route('POST', '/api/my-projects/folder', { root: path.join(root, 'no-such') }));
  assert.strictEqual(none.status, 404);
});
test('PF-06 the commands, and the panel calls the routes (the folder is read, never changed)', () => {
  const { SPEC } = require('../../idearium/cli/route-commands.js');
  const f = SPEC.find(r => r.key === 'projects.folder'), i = SPEC.find(r => r.key === 'projects.import');
  assert.deepStrictEqual([f.req({ args: ['D:\\Projects'], flags: {} }).method, f.req({ args: [], flags: {} }).method], ['POST', 'GET']);
  assert.deepStrictEqual(i.req({ args: ['a', 'b'], flags: {} }).body, { paths: ['a', 'b'] });
  const ui = fs.readFileSync(path.join(REPO, 'idearium/ui/js/projects.js'), 'utf8');
  assert.ok(ui.includes("api('/api/my-projects/folder'") && ui.includes("'/api/my-projects/folder/import'") && ui.includes('Bring in the ticked'));
});

(async () => {
  for (const [n, f] of tests) { try { await f(); passed++; console.log(`  ✓ ${n}`); } catch (e) { failed++; console.log(`  ✗ ${n}\n    ${e.message}`); } }
  fs.rmSync(root, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
