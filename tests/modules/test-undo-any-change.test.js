'use strict';
/**
 * tests/modules/test-undo-any-change.test.js — FR3 (docs/2026-10-16-repo-carve-phasemap.spec), 0.60.117
 * James, 2026-10-17: "Next and Merge." — undo any change an agent made, keeping every later edit.
 *   UN-01  merge3: one side, the other, both the same way, a clash (named), nothing changed, line endings kept
 *   UN-02  the map's proof: three changes to one file, the middle one undone — the first and third kept, all three in the history
 *   UN-03  a later change on the same lines: refused, the file untouched, the lines named; without merge the old refusal stands
 *   UN-04  a created file edited since, or a file deleted since: refused, said (undoing would lose the later edits)
 *   UN-05  through the real router: POST …/injects/:id/revert merges by default (merge:false keeps the old refusal); the command
 *   UN-06  the Code tab's Undo button in Clear Glass against a stubbed api(); no engine → SKIPPED, said
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const _data = fs.mkdtempSync(path.join(os.tmpdir(), 'un-'));
const _jaa = fs.mkdtempSync(path.join(os.tmpdir(), 'un-jaa-'));
process.env.IDEARIUM_DATA_DIR = _data;
process.env.JAA_DATA_DIR = _jaa;
process.env.NEXUS_EVIDENCE = 'off';
process.on('exit', () => { for (const d of [_data, _jaa]) try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
const assert = require('assert');
const ROOT = path.join(__dirname, '../..');
const { merge3 } = require(path.join(ROOT, 'versionium/lib/merge3.js'));
const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
const quiet = async (f) => { const l = console.log, w = console.warn; console.log = console.warn = () => {}; try { return await f(); } finally { console.log = l; console.warn = w; } };

let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}

function layerOver(dir) {
  return {
    readFile(u, p) { const f = path.join(dir, p); return fs.existsSync(f) ? { content: fs.readFileSync(f, 'utf8') } : { error: 'no such file' }; },
    readTextFile(u, p) { return this.readFile(u, p); },
    writeTextFile(u, p, text) { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), text); return { ok: true }; },
    deleteTextFile(u, p) { try { fs.unlinkSync(path.join(dir, p)); } catch (_) {} return { ok: true }; },
    deleteFile(u, p) { return this.deleteTextFile(u, p); },
    refresh() { return { ok: true }; },
  };
}
const V0 = 'a\nb\nc\nd\ne\n', V1 = 'a\nB1\nc\nd\ne\n', V2 = 'a\nB1\nc\nD2\ne\n', V3 = 'a\nB1\nc\nD2\ne\nf3\n';

(async () => {
  await test('UN-01', 'merge3: one side, the other, both the same way, a clash named, nothing changed, line endings kept', async () => {
    assert.deepStrictEqual(merge3(V2, V3, V1), { ok: true, text: 'a\nB1\nc\nd\ne\nf3\n', changed: true }, 'undo the middle: d back, f3 kept');
    assert.strictEqual(merge3('x\ny\n', 'x\ny\n', 'X\ny\n').text, 'X\ny\n', 'only theirs changed');
    assert.strictEqual(merge3('x\ny\n', 'x\nY\n', 'x\ny\n').text, 'x\nY\n', 'only ours changed');
    assert.strictEqual(merge3('x\ny\n', 'Z\ny\n', 'Z\ny\n').text, 'Z\ny\n', 'both the same way: once');
    const c = merge3(V2, 'a\nB1\nc\nD3\ne\n', V1);
    assert.strictEqual(c.ok, false); assert.deepStrictEqual(c.conflicts, [{ at: 4, base: 'D2', ours: 'D3', theirs: 'd' }]);
    assert.deepStrictEqual(merge3('p\n', 'p\n', 'p\n'), { ok: true, text: 'p\n', changed: false });
    assert.strictEqual(merge3('a\r\nb\r\nc\r\n', 'a\r\nb\r\nc\r\nd\r\n', 'a\r\nB\r\nc\r\n').text, 'a\r\nB\r\nc\r\nd\r\n', 'CRLF kept byte for byte');
    assert.strictEqual(merge3('a\nb', 'a\nb\nc', 'A\nb').text, 'A\nb\nc', 'no trailing newline kept as it was');
  });

  const repo = { uuid: 'un-repo' }, hat = { name: 'the_builder', uuid: 'h1' };
  const change = async (layer, content) => {
    const p = await quiet(() => RI.propose({ layer, repo, hat, path: 'lib/x.txt', content, source: { kind: 'agent' } }));
    assert.ok(p.ok, JSON.stringify(p).slice(0, 200));
    const a = await quiet(() => RI.apply(p.inject.uuid, { layer, approvedBy: 'james' }));
    assert.ok(a.ok, JSON.stringify(a).slice(0, 200));
    return p.inject.uuid;
  };
  const fixture = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'un-repo-')); fs.mkdirSync(path.join(dir, 'lib')); fs.writeFileSync(path.join(dir, 'lib/x.txt'), V0); return dir; };

  await test('UN-02', 'three changes, the middle one undone: the first and third kept, all three still in the history', async () => {
    const dir = fixture(), layer = layerOver(dir);
    const c1 = await change(layer, V1), c2 = await change(layer, V2), c3 = await change(layer, V3);
    const old = RI.revert(c2, { layer });
    assert.strictEqual(old.ok, false); assert.strictEqual(old.conflict, true, 'without merge: the refusal as it was');
    const r = await quiet(() => RI.revert(c2, { layer, merge: true }));
    assert.ok(r.ok && r.merged, JSON.stringify(r).slice(0, 300));
    assert.strictEqual(fs.readFileSync(path.join(dir, 'lib/x.txt'), 'utf8'), 'a\nB1\nc\nd\ne\nf3\n');
    assert.deepStrictEqual([RI.get(c1).status, RI.get(c2).status, RI.get(c3).status], ['applied', 'reverted', 'applied']);
    assert.match(RI.get(c2).history.slice(-1)[0].event, /merged with the later edits/);
    assert.ok(RI.get(c2).revertMerged && RI.get(c2).revertMerged.afterSha256);
    const CR = require(path.join(ROOT, 'lib/change-record.js'));
    assert.match(CR.record(RI.get(c2), {}).undo.how, /later edits were kept/);
  });

  await test('UN-03', 'a later change on the same lines: refused, the file untouched, the lines named', async () => {
    const dir = fixture(), layer = layerOver(dir);
    await change(layer, V1); const c2 = await change(layer, V2); await change(layer, 'a\nB1\nc\nD3\ne\n');
    const before = fs.readFileSync(path.join(dir, 'lib/x.txt'), 'utf8');
    const r = RI.revert(c2, { layer, merge: true });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.conflict, true);
    assert.match(r.errors[0], /a later change edited the same lines.*line 4: this change wrote "D2", the file now has "D3", before it was "d"/);
    assert.strictEqual(r.merge.conflicts.length, 1);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'lib/x.txt'), 'utf8'), before, 'nothing changed');
    assert.strictEqual(RI.get(c2).status, 'applied');
  });

  await test('UN-04', 'a file this change created and someone edited since, or a file deleted since: refused, said', async () => {
    const dir = fixture(), layer = layerOver(dir);
    const p = await quiet(() => RI.propose({ layer, repo, hat, path: 'lib/new.txt', content: 'one\n', source: { kind: 'agent' } }));
    await quiet(() => RI.apply(p.inject.uuid, { layer, approvedBy: 'james' }));
    fs.writeFileSync(path.join(dir, 'lib/new.txt'), 'one\ntwo\n');
    assert.match(RI.revert(p.inject.uuid, { layer, merge: true }).errors[0], /created by this change and edited since/);
    const c = await change(layer, V1);
    fs.unlinkSync(path.join(dir, 'lib/x.txt'));
    assert.match(RI.revert(c, { layer, merge: true }).errors[0], /deleted after this change/);
  });

  const api = await import('../../idearium/api/index.js');
  await test('UN-05', 'the real route merges by default (merge:false keeps the old refusal); the repo undo command', async () => {
    await import('../../idearium/spec-engine/index.js');
    let made = null;
    for (let i = 0; i < 40; i++) { made = await api._route('POST', '/api/repos', { name: 'un-fixture', bare: true, source: 'create' }); if (made.json && made.json.repo) break; await new Promise(r => setTimeout(r, 100)); }
    const uuid = made.json.repo.uuid;
    const put = async (content) => {
      const p = await quiet(() => api._route('POST', `/api/repos/${uuid}/injects`, { path: 'notes.txt', content }));
      const id = ((p.json.data || p.json).inject || {}).uuid;
      assert.ok(id, JSON.stringify(p.json).slice(0, 200));
      const a = await quiet(() => api._route('POST', `/api/repos/${uuid}/injects/${id}/apply`, {}));
      assert.strictEqual(a.status, 200, JSON.stringify(a.json).slice(0, 200));
      return id;
    };
    await put(V1); const mid = await put(V2); await put(V3);
    const no = await quiet(() => api._route('POST', `/api/repos/${uuid}/injects/${mid}/revert`, { merge: false }));
    assert.strictEqual(no.status, 409);
    const r = await quiet(() => api._route('POST', `/api/repos/${uuid}/injects/${mid}/revert`, {}));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    assert.strictEqual((r.json.data || r.json).merged, true);
    const rc = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const row = (rc.SPEC || rc.ROWS || rc).find(x => x.key === 'repo.undo');
    assert.deepStrictEqual(row.req({ repo: { uuid: 'u' }, args: ['i1'], flags: {} }), { method: 'POST', path: '/api/repos/u/injects/i1/revert', body: {} });
    assert.deepStrictEqual(row.req({ repo: { uuid: 'u' }, args: ['i1'], flags: { 'no-merge': true } }).body, { merge: false });
    assert.ok(row.need({ args: [], flags: {} }));
  });

  // UN-06 — the Undo button in Clear Glass (AXIOMS §4.1)
  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!eng) { console.log('  - UN-06 SKIPPED: Clear Glass has no engine here — the browser check did not run'); skipped++; }
  else {
    let browser = null;
    try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - UN-06 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped++; }
    if (browser) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'un-ui-'));
      fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="panel"></div><script>
  const CALLS = []; const CURRENT_API_REPO = { uuid: 'r1' }; window.confirm = () => true; let STATUS = 'applied';
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  async function api(p, o) { CALLS.push([p, (o && o.method) || 'GET']);
    if (p.startsWith('/api/repos/r1/changes?')) return { changes: [{ id: 'i-2', path: 'lib/x.txt', op: 'write', status: STATUS, lines: { added: 1, removed: 1 }, agent: 'the_builder', checked: null, batch: null, landed: [], undo: STATUS === 'applied', holes: [] }] };
    if (p === '/api/repos/r1/changes/i-2') return { change: { id: 'i-2' }, lines: ['i-2 write lib/x.txt — ' + STATUS] };
    if (p === '/api/repos/r1/injects/i-2/revert') { STATUS = 'reverted'; return { ok: true, merged: true, inject: { path: 'lib/x.txt' } }; }
    throw new Error('unexpected ' + p); }
</script><script src="${pathToFileURL(path.join(ROOT, 'idearium/ui/js/code-tab-panels.js')).href}"></script>
<script>CX.panel = 'changes'; function _cxPaintPanel() { document.getElementById('panel').innerHTML = _cxChanges(); }</script></body></html>`);
      try {
        const page = await browser.newPage();
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
        await test('UN-06', 'the changes panel: open a change, Undo, and it says the later edits were kept; the row is now reverted', async () => {
          await page.evaluate(() => cxChangesLoad(CURRENT_API_REPO));
          await page.waitForSelector('.cx-change[data-id="i-2"]');
          await page.click('.cx-change[data-id="i-2"]');
          await page.waitForSelector('.cx-change-undo');
          await page.click('.cx-change-undo');
          await page.waitForFunction(() => /undone — the later edits were kept/.test(document.getElementById('panel').textContent));
          assert.ok(/reverted/.test(await page.$eval('.cx-change-st', e => e.textContent)));
          assert.ok(await page.evaluate(() => CALLS.some(c => c[0] === '/api/repos/r1/injects/i-2/revert' && c[1] === 'POST')));
          assert.deepStrictEqual(errors, []);
        });
      } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
    }
  }

  console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
  process.exit(failed ? 1 : 0);
})();
