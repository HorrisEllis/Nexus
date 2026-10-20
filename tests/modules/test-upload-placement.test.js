'use strict';
/**
 * tests/modules/test-upload-placement.test.js — UP1–UP3 (0.60.173): a zip uploaded with an intent is placed, waits for him, and
 * only his answer writes.
 * Map: docs/2026-10-19-upload-intent-and-page-map-phasemap.spec
 * James, 2026-10-19: "upload zip with an intent, have it map to nexus using a tool, then ask me with the option to edit the
 * location and where they go in relation to the system or the registry."
 *
 *   UP-01  plan(), pure: a wrapper folder is stripped only when that lands on real paths; an existing path is a replace (identical
 *          bytes say identical); a folder that exists is used; the intent picks a system when the zip says nothing; junk and ..
 *          paths are skipped and said; requires resolve against the tree AND the upload; requiredBy names who a replace can break
 *   UP-02  answer() and learn(): his path wins; two files to one path is refused; an identical file is skipped unless he gives it a
 *          path; his move is learned and plan() uses it first next time ("why: learned")
 *   UP-03  through the real router: create → needs-you, nothing written; list shows it open; a bad answer is refused and writes
 *          nothing; his answer writes text where he said (one moved, one skipped); answering twice is refused; the next upload
 *          of the same zip reads his rule first; the command rows exist
 *   UP-04  the Code tab's upload panel in Clear Glass (stubbed api): the open upload shows every row with its system, why and
 *          neighbours; an alternative picked, a file skipped → the answer it sends carries exactly that; no engine → SKIPPED, said
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');

let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn, er = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; console.error = er; } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const UPL = require(path.join(ROOT, 'lib/upload-placement.js'));
const sha = (s) => require('crypto').createHash('sha256').update(s).digest('hex');
const TREE = {
  'lib/bus.js': "module.exports = {};\n",
  'lib/ledger.js': "const bus = require('./bus.js');\nmodule.exports = { bus };\n",
  'cortex/memory/store.js': "const L = require('../../lib/ledger.js');\nmodule.exports = {};\n",
  'clear-glass/src/page/reader.js': "module.exports = {};\n",
  'README.md': '# repo\n',
};
const tree = () => UPL.index({ paths: Object.keys(TREE), sha: (p) => (TREE[p] != null ? sha(TREE[p]) : null), readText: (p) => TREE[p] });
const F = (p, text) => ({ path: p, text });

(async () => {
  await test('UP-01', 'plan(): strip only onto real paths, replace/identical, folders, intent, junk, requires and requiredBy', async () => {
    const p = UPL.plan({ intent: 'a page reader for clear glass', tree: tree(), files: [
      F('feature-x/lib/ledger.js', "const bus = require('./bus.js');\nconst h = require('./helper.js');\nmodule.exports = { bus, h };\n"),
      F('feature-x/lib/bus.js', TREE['lib/bus.js']),
      F('feature-x/lib/helper.js', "module.exports = 1;\n"),
      F('feature-x/blocks.js', "const t = require('./nowhere.js');\n"),
      F('feature-x/__MACOSX/._ledger.js', 'x'),
      F('feature-x/.DS_Store', 'x'),
    ] });
    assert.deepStrictEqual([p.strip.k, p.strip.wrapper], [1, 'feature-x'], 'the wrapper is packaging: it lands lib/ on real paths');
    const by = Object.fromEntries(p.rows.map(r => [r.rel, r]));
    assert.deepStrictEqual([by['lib/ledger.js'].to, by['lib/ledger.js'].action, by['lib/ledger.js'].system], ['lib/ledger.js', 'replace', 'lib']);
    assert.strictEqual(by['lib/bus.js'].action, 'identical');
    assert.deepStrictEqual([by['lib/helper.js'].to, by['lib/helper.js'].action, by['lib/helper.js'].why], ['lib/helper.js', 'create', 'dir-exists']);
    assert.ok(/^clear-glass\//.test(by['blocks.js'].to) && by['blocks.js'].why === 'intent-system', JSON.stringify(by['blocks.js']));
    assert.strictEqual(p.skipped.length, 2, 'junk is skipped and said');
    const req = by['lib/ledger.js'].requires;
    assert.deepStrictEqual(req.map(q => [q.spec, q.in]), [['./bus.js', 'tree'], ['./helper.js', 'upload']], 'requires resolve against the tree and the upload');
    assert.ok(req.every(q => q.discovered === 'js-require-scan'), 'every edge says where it came from (NC0)');
    assert.ok(by['blocks.js'].warnings && /nowhere/.test(by['blocks.js'].warnings[0]), 'a require that resolves nowhere is said');
    assert.deepStrictEqual(by['lib/ledger.js'].requiredBy, ['cortex/memory/store.js']);
    assert.ok(/a replace can break/.test(by['lib/ledger.js'].risk));
    // no strip when nothing lands; .. never accepted; a non-JS file's requires are unknown, not empty
    const q = UPL.plan({ intent: 'notes', tree: tree(), files: [F('stuff/a.md', '# a'), F('../evil.js', 'x')] });
    assert.deepStrictEqual([q.strip.k, q.rows.length, q.rows[0].to, q.rows[0].requires], [0, 1, 'stuff/a.md', 'unknown']);
    assert.ok(/unsafe/.test(q.skipped[0].why));
    // two files to one path are flagged
    const c = UPL.plan({ intent: 'x', tree: tree(), files: [F('lib/ledger.js', 'a'), F('w/lib/ledger.js', 'b')] });
    assert.strictEqual(c.stats.conflicts, 2, 'both rows name the other'); assert.ok(c.rows.every(r => r.conflict), JSON.stringify(c.rows.map(r => [r.from, r.to])));
  });

  await test('UP-02', 'answer() and learn(): his path wins, collisions refused, identical skipped, his move read first next time', async () => {
    const files = [F('drop/notes.js', 'module.exports = 1;\n'), F('drop/bus.js', TREE['lib/bus.js'])];
    const p = UPL.plan({ intent: 'cortex memory', tree: tree(), files });
    const a = UPL.answer(p, [{ from: 'drop/notes.js', to: 'cortex/memory/notes.js' }]);
    assert.ok(a.ok, a.errors.join('; '));
    assert.deepStrictEqual(a.writes.map(w => [w.from, w.to, w.edited]), [['drop/notes.js', 'cortex/memory/notes.js', true]]);
    assert.ok(a.skipped.some(s => s.from === 'drop/bus.js' && /identical/.test(s.why)), 'identical: skipped unless he gives it a path');
    assert.ok(!UPL.answer(p, [{ from: 'drop/notes.js', to: '../x.js' }]).ok, 'outside the repo is refused');
    const both = UPL.answer(p, [{ from: 'drop/notes.js', to: 'lib/n.js' }, { from: 'drop/bus.js', to: 'lib/n.js' }]);
    assert.ok(!both.ok && /both go to lib\/n\.js/.test(both.errors[0]), both.errors.join('; '));
    assert.ok(!UPL.answer(p, [{ from: 'nope.js', to: 'x.js' }]).ok, 'a file not in the upload is refused');
    const rules = UPL.learn(p, [{ from: 'drop/notes.js', to: 'cortex/memory/notes.js' }], []);
    assert.deepStrictEqual(rules.map(r => [r.kind, r.from, r.to, r.n]), [['dir', 'drop', 'cortex/memory', 1]]);
    const again = UPL.plan({ intent: 'anything', tree: tree(), files: [F('drop/other.js', 'x')], learned: rules });
    assert.deepStrictEqual([again.rows[0].to, again.rows[0].why], ['cortex/memory/other.js', 'learned']);
    assert.deepStrictEqual(UPL.learn(p, [{ from: 'drop/notes.js', to: 'cortex/memory/notes.js' }], rules)[0].n, 2, 'counted, not replaced');
  });

  // ── UP-03: the real router (Versionium stubbed — the harness of test-plan-conflict) ──
  const api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));
  const { treeHashOf } = await import(path.join(ROOT, 'idearium/repo/snapshot-files.js'));
  const vers = await new Promise((res, rej) => {
    const s = http.createServer((q, r) => { let b = ''; q.on('data', d => { b += d; }); q.on('end', () => { const body = b ? JSON.parse(b) : {}; r.setHeader('content-type', 'application/json');
      const out = q.url.startsWith('/api/versionium/commit') ? { commit: { commitId: `vup-${Date.now()}`, branch: body.branch || 'x', wall: Date.now() } }
        : q.url.startsWith('/api/versionium/files/limits') ? { maxRequestBytes: 50e6, maxFileBytes: 20e6, maxFiles: 100000 }
        : q.url.startsWith('/api/versionium/files/plan') ? { ok: true, need: [], have: (body.tree || []).map(t => t.path) }
        : q.url.startsWith('/api/versionium/files/record') ? { ok: true, recorded: true, treeHash: treeHashOf(body.tree || []) }
        : q.url.startsWith('/api/versionium/history') ? { commits: [] } : null;
      r.statusCode = out ? 200 : 404; r.end(JSON.stringify(out || { error: 'stub' })); }); });
    s.on('error', rej); s.listen(require(path.join(ROOT, 'lib/nexus-client.js')).resolve('versionium').port, '127.0.0.1', () => res(s));
  });
  const R = (m, p, b) => quiet(() => api._route(m, p, b));
  const D = (r) => r.json.data || r.json;

  await test('UP-03', 'the router: waits, refuses a bad answer, writes his answer only, learns; the command rows', async () => {
    let made = null;
    for (let i = 0; i < 20; i++) { made = await R('POST', '/api/spec-engine/specs', { name: `up-probe-${Date.now()}`, type: 'system', description: 'an upload probe' }); if (made.status !== 503) break; await wait(250); }
    const repoUuid = D(made).repoUuid;
    assert.ok(repoUuid, JSON.stringify(made.json).slice(0, 300));
    const { createZip } = require(path.join(ROOT, 'lib/zip-writer.js'));
    const zipB64 = createZip([{ path: 'pkg/lib/greet.js', content: "module.exports = (n) => `hi ${n}`;\n" },
      { path: 'pkg/lib/extra.js', content: 'module.exports = 2;\n' }, { path: 'pkg/notes.md', content: '# notes\n' }]).toString('base64');
    assert.strictEqual((await R('POST', `/api/repos/${repoUuid}/uploads`, { contentBase64: zipB64 })).status, 400, 'no intent, refused');
    const c = await R('POST', `/api/repos/${repoUuid}/uploads`, { name: 'pkg.zip', intent: 'a greeting helper', contentBase64: zipB64 });
    assert.strictEqual(c.status, 200, JSON.stringify(c.json).slice(0, 300));
    const up = D(c);
    assert.strictEqual(up.state, 'needs-you');
    assert.strictEqual(up.plan.rows.length, 3);
    const layer = api.getRepoLayer();
    const has = (p) => { const f = layer.readFile(repoUuid, p); return !!(f && f.content != null); };
    assert.ok(!up.plan.rows.some(r => has(r.to)), 'nothing written by uploading');
    const l = D(await R('GET', `/api/repos/${repoUuid}/uploads`));
    assert.deepStrictEqual(l.open.map(u => u.uuid), [up.uuid]);
    const greet = up.plan.rows.find(r => /greet/.test(r.from)), extra = up.plan.rows.find(r => /extra/.test(r.from)), notes = up.plan.rows.find(r => /notes/.test(r.from));
    const bad = await R('POST', `/api/repos/${repoUuid}/uploads/${up.uuid}/answer`, { rows: [{ from: greet.from, to: 'src/x.js' }, { from: extra.from, to: 'src/x.js' }] });
    assert.strictEqual(bad.status, 400); assert.ok(!has('src/x.js'), 'a refused answer writes nothing');
    const a = await R('POST', `/api/repos/${repoUuid}/uploads/${up.uuid}/answer`, { rows: [{ from: greet.from, to: 'src/greet.js' }, { from: notes.from, skip: true }] });
    assert.strictEqual(a.status, 200, JSON.stringify(a.json).slice(0, 400));
    const ad = D(a);
    assert.strictEqual(ad.written, 2, JSON.stringify(ad.results));
    assert.ok(has('src/greet.js') && has(extra.to), 'written where he said (and the untouched row where proposed)');
    assert.ok(!has(notes.to), 'skipped: not written');
    assert.strictEqual((await R('POST', `/api/repos/${repoUuid}/uploads/${up.uuid}/answer`, { rows: [] })).status, 409, 'answered once');
    assert.strictEqual(D(await R('GET', `/api/repos/${repoUuid}/uploads`)).open.length, 0);
    const c2 = D(await R('POST', `/api/repos/${repoUuid}/uploads`, { name: 'pkg.zip', intent: 'again', contentBase64: zipB64 }));
    const g2 = c2.plan.rows.find(r => /greet/.test(r.from));
    assert.ok(g2.to === 'src/greet.js' && (g2.why === 'learned' || g2.why === 'exists'), JSON.stringify(g2));
    assert.ok(c2.plan.rows.some(r => r.why === 'learned') || g2.action === 'identical', 'his rule is read first');
    const RC = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const rows = (RC.SPEC || RC).filter(r => /^repo\.upload/.test(r.key)).map(r => r.key);
    assert.deepStrictEqual(rows, ['repo.upload', 'repo.uploads', 'repo.upload-answer']);
  });

  vers.close();

  // UP-04 — the panel in Clear Glass (AXIOMS §4.1)
  const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
  const eng = glass.engine();
  let browser = null;
  if (!eng) { console.log('  - UP-04 SKIPPED: Clear Glass has no engine here — the browser check did not run'); skipped++; }
  else { try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - UP-04 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped++; } }
  if (browser) {
    const os = require('os'); const { pathToFileURL } = require('url');
    const UI = path.join(ROOT, 'idearium', 'ui');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'up-ui-'));
    const plan = UPL.plan({ intent: 'a page reader for clear glass', tree: tree(), files: [F('w/lib/ledger.js', "const b = require('./bus.js');\n"), F('w/blocks.js', 'x'), F('w/lib/bus.js', TREE['lib/bus.js'])] });
    const one = { uuid: 'upload-1', name: 'w.zip', intent: 'a page reader for clear glass', state: 'needs-you', plan };
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="panel"></div><script>
  const CALLS = []; const CURRENT_API_REPO = { uuid: 'r1' }; const ONE = ${JSON.stringify(one)};
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function toast() {}
  async function api(p, o) { CALLS.push({ p, body: o && o.body ? JSON.parse(o.body) : null });
    if (p === '/api/repos/r1/uploads') return { uploads: [{ uuid: 'upload-1', name: 'w.zip', intent: ONE.intent, state: 'needs-you', stats: ONE.plan.stats }], rules: [] };
    if (p === '/api/repos/r1/uploads/upload-1') return ONE;
    if (p === '/api/repos/r1/uploads/upload-1/answer') return { written: 1, results: [{ ok: true, from: 'w/lib/ledger.js', to: 'lib/ledger.js' }], skipped: [], errors: [] };
    throw new Error('unexpected ' + p); }
</script><script src="${pathToFileURL(path.join(UI, 'js', 'code-tab-panels.js')).href}"></script><script src="${pathToFileURL(path.join(UI, 'js', 'upload-intent.js')).href}"></script>
<script>CX.panel = 'upload'; function _cxPaintPanel() { document.getElementById('panel').innerHTML = _cxUpload(); }</script></body></html>`);
    try {
      const page = await browser.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
      await test('UP-04', 'the upload panel: rows with system, why, neighbours; a picked alternative and a skip are what the answer sends', async () => {
        await page.evaluate(() => cxUploadLoad(CURRENT_API_REPO));
        await page.waitForSelector('.up-row input.up-to');
        const rows = await page.$$eval('.up-row', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
        assert.strictEqual(rows.length, 3);
        const ledger = rows.find(r => /w\/lib\/ledger\.js/.test(r));
        assert.ok(/replace/.test(ledger) && /\blib\b/.test(ledger) && /exists-after-strip/.test(ledger) && /required by cortex\/memory\/store\.js/.test(ledger) && /a replace can break/.test(ledger) && /requires lib\/bus\.js \(tree\)/.test(ledger), ledger);
        assert.ok(/needs you/.test(await page.$eval('.up-sum', e => e.textContent)));
        const blocks = rows.find(r => /w\/blocks\.js/.test(r));
        assert.ok(/clear-glass/.test(blocks) && /intent-system/.test(blocks), blocks);
        // pick the first alternative for blocks.js, skip ledger.js
        const altTo = plan.rows.find(r => r.from === 'w/blocks.js').alternatives[0].to;
        await page.evaluate((to) => cxUploadEdit('w/blocks.js', 'to', to), altTo);
        await page.evaluate(() => { cxUploadEdit('w/lib/ledger.js', 'skip', true); _cxUploadPaint(); });
        await page.evaluate(() => cxUploadAnswer());
        await page.waitForFunction(() => CALLS.some(c => /answer$/.test(c.p)));
        const sent = await page.evaluate(() => CALLS.find(c => /answer$/.test(c.p)).body);
        assert.deepStrictEqual(sent, { rows: [{ from: 'w/lib/ledger.js', skip: true }, { from: 'w/blocks.js', to: altTo }] });
        assert.deepStrictEqual(errors, []);
      });
    } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  }

  console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
  process.exit(failed ? 1 : 0);
})();
