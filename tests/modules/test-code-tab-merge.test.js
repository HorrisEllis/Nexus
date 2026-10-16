'use strict';
/**
 * tests/modules/test-code-tab-merge.test.js — CE6 · CE7 · CV1 · CE9 UI (docs/2026-10-15-code-tab-run-state-phasemap.spec,
 * addendum 2026-10-16 (b)), 0.60.82.
 * James: "expand the code tab in repo. the file and code tab merge. all of it from the phases3"
 *
 *   MG-00  the merge in the page's own source: no Files button; setRepoSubtab('files') opens Code; openApiRepoFile opens
 *          the file in the Code tab (the Files opener kept as openApiRepoFileInFiles, §0.3); the new script is loaded
 *   MG-1x  the tab, driven in Clear Glass (the REAL file-manage.js, work-surface.js, code-surface.js, code-tab-panels.js,
 *          repo-tasks.js and repo-drawer-views.js against a stubbed api() that answers like idearium's routes):
 *          MG-10 the Files tab's tree work: the filter narrows; + file creates and opens it; × deletes it (to .trash/)
 *          MG-11 edit by hand: the file in a textarea; Ctrl+S saves through POST …/file and leaves edit mode
 *          MG-12 Manage · History, one menu: the workbench opens on the Code tab's file with the picked lines as its scope;
 *                its rail is one timeline (a manage run, commits with their labels, versions); a tag narrows it; diff
 *                with now shows the patch; restore posts …/versions/restore-file
 *          MG-13 the picked lines with an action: POST …/code/assist with exactly those lines; the transcript says a
 *                change is waiting; the changes are read again
 *          MG-14 runs: the route, each run as a pipeline (goal → steps ✓/✗ → state); opened, its files; rewind asks with
 *                a dry run first, then rewinds
 *          MG-15 responses: the repo agent's exchanges; tasks and log: the Plan panel's views drawn in the Code tab
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
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
function done() { console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`); process.exit(failed ? 1 : 0); }

function harness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-ui-'));
  const css = ['work-surface.css', 'code-surface.css', 'file-manage.css'].map(f => fs.readFileSync(path.join(UI, 'css', f), 'utf8')).join('\n');
  const src = (f) => pathToFileURL(path.join(UI, 'js', f)).href;
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div id="repo-subtab-code" style="height:900px"></div>
<script>
  const CALLS = [];
  let FILES = [{ path: 'src/a.js' }, { path: 'src/b.js' }, { path: 'docs/readme.md' }];
  const REPO = { uuid: 'r1', name: 'daw', localPath: '/x/daw', files: FILES };
  let API_REPOS = [REPO];
  let CURRENT_API_REPO = REPO, CURRENT_REPO_SUBTAB = 'code', ACTIVE_API_FILE = null, API_FILE_DIRTY = false;
  window.confirm = () => true;
  async function themedPrompt() { return 'src/new.js'; }
  async function loadApiRepos() { REPO.files = FILES; }
  function setRepoSubtab(n) { CURRENT_REPO_SUBTAB = n; }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  const TOASTS = []; function toast(m, k) { TOASTS.push([m, k]); }
  const TEXT = { 'src/a.js': 'function a() {\\n  return 2;\\n}\\nmodule.exports = a;', 'src/b.js': 'const b = 1;', 'docs/readme.md': '# daw', 'src/new.js': '' };
  const NOW = Date.now();
  async function api(p, opts) {
    const method = (opts && opts.method) || 'GET';
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    CALLS.push({ p, method, body });
    if (p.endsWith('/surface')) return method === 'PUT' ? body : { open: null };
    if (p.includes('/file?path=') && method === 'DELETE') { const fp = decodeURIComponent(p.split('path=')[1]); FILES = FILES.filter(f => f.path !== fp); return { ok: true }; }
    if (p.endsWith('/file') && method === 'POST') { if (!FILES.some(f => f.path === body.path)) FILES = FILES.concat([{ path: body.path }]); TEXT[body.path] = body.content; return { ok: true }; }
    if (p.includes('/file?path=')) return { content: TEXT[decodeURIComponent(p.split('path=')[1])] ?? '' };
    if (p.includes('/file/versions?')) return { versions: [{ commitId: 'c2abcdef1234', wall: NOW - 1000, kind: 'changed', message: '1 file: src/a.js', sha256: 'aa' }, { commitId: 'c1abcdef1234', wall: NOW - 9000, kind: 'added', message: 'baseline', sha256: 'bb' }] };
    if (p.includes('/history?path=')) return { commits: [{ commitId: 'c2abcdef1234', ts: NOW - 1000, op: 'write', message: '1 file: src/a.js', provenance: { by: ['james'], refs: [], files: [] }, labels: [{ kind: 'edit', action: 'fix', path: 'src/a.js' }] }] };
    if (p.includes('/versions/diff?')) return { files: [{ path: 'src/a.js', status: 'changed', patch: '@@ -1,2 +1,2 @@\\n function a() {\\n-  return 1;\\n+  return 2;' }] };
    if (p.endsWith('/versions/restore-file')) return { ok: true, commitId: body.commitId, path: body.path };
    if (p.endsWith('/phases/runs')) return { runs: [{ runId: 'manage-1', phase: 'DEBUG', map: 'file:src/a.js', state: 'replied', ts: NOW - 5000, provider: 'ollama' }] };
    if (p.endsWith('/agent/settings')) return { provider: 'auto', providers: ['auto', 'ollama'] };
    if (p.endsWith('/funnel') && method === 'POST') return { intent: 'change', enters: true, stoppedAt: 'phase', chunks: [],
      dependencies: { files: [{ path: 'src/a.js', why: 'named in the phase', exists: true }], requires: [{ path: 'src/b.js', by: 'src/a.js' }], consumers: [{ path: 'src/c.js', of: 'src/a.js' }], source: 'evidence' },
      spec: { specs: [{ path: 'spec/daw.spec', from: 'owning system' }], source: 'owning system' }, phase: null,
      missing: [{ step: 'phase', why: 'no open phase maps src/a.js — a phase is mapped first' }], lines: [] };
    if (p.endsWith('/code/assist')) return { ok: true, action: body.action, path: body.path, from: body.from, to: body.to, provider: 'ollama:big', inject: { uuid: 'i7' }, checksumBefore: 'ab', checksumAfter: 'cd' };
    if (p.includes('/runs?')) return { runs: [{ runId: 'r1__s1', goal: 'fix the return in a.js', status: 'done', attempt: 2, providers: [{ provider: 'chatgpt', attempt: 1 }, { provider: 'ollama', attempt: 2 }], stepCount: 3,
        steps: [{ n: 1, name: 'idearium.code_read.tool', ok: true }, { n: 2, name: 'idearium.code_edit.tool', ok: false, error: 'stale' }, { n: 3, name: 'idearium.code_edit.tool', ok: true }],
        filesRead: ['src/a.js'], filesChanged: ['src/a.js'], events: [{ kind: 'fallback', text: 'chatgpt → ollama', attempt: 1, at: NOW - 3000 }], updatedAt: NOW - 2000 }] };
    if (/\\/runs\\/[^/]+\\/rewind$/.test(p)) return { ok: true, runId: 'r1__s1', dryRun: !!body.dryRun, to: { commitId: 'c1abcdef1234', ts: NOW - 9000 }, results: [{ path: 'src/a.js', done: !body.dryRun, dryRun: !!body.dryRun }] };
    if (p.includes('/agent/history')) return { exchanges: [{ ok: true, provider: 'ollama', message: 'what does a do', response: 'it returns two', ts: NOW - 4000, elapsedMs: 1200 }] };
    if (p.includes('/tasks?')) return { tasks: [{ id: 't1', kind: 'chat', status: 'done', title: 'chat about a.js', startedAt: NOW - 8000, endedAt: NOW - 7000, steps: [] }] };
    if (p.includes('/activity?')) return { rows: [{ id: 'l1', ts: NOW - 6000, kind: 'inject.applied', status: 'applied', actor: 'james', title: 'src/a.js — applied' }], more: false };
    if (p.includes('/code/overview')) return { files: 3, chunks: 1, lines: 6, languages: ['js'], repo: { writeMode: 'propose', pendingProposals: 0 } };
    if (p.includes('/code/outline')) return { chunks: [{ id: 'c-a', lines: '1-3', kind: 'function', name: 'a' }] };
    if (p.endsWith('/agent/route')) return { ok: true, route: [{ provider: 'ollama:big', backend: 'ollama', model: 'big' }, { provider: 'gemini', backend: 'guardian', agent: 'gemini' }], pinned: null };
    if (p.endsWith('/worksurface')) return { files: [], totals: {} };
    if (p.endsWith('/files/state')) return { states: {}, counts: {} };
    return {};
  }
</script>
<script src="${src('file-manage.js')}"></script>
<script src="${src('work-surface.js')}"></script>
<script src="${src('code-surface.js')}"></script>
<script src="${src('code-tab-panels.js')}"></script>
<script src="${src('repo-tasks.js')}"></script>
<script src="${src('repo-drawer-views.js')}"></script>
</body></html>`);
  return path.join(dir, 'index.html');
}

(async () => {
  await test('MG-00', 'the merge in the page\'s source: no Files button; files → code; openApiRepoFile opens in Code; the new script loads', async () => {
    const html = fs.readFileSync(path.join(UI, 'index.html'), 'utf8');
    const app = fs.readFileSync(path.join(UI, 'js', 'app.js'), 'utf8');
    assert.ok(!/data-subtab="files"/.test(html), 'no Files button');
    assert.ok(/id="repo-subtab-files"/.test(html), 'the Files panel is archived, not deleted');
    assert.ok(/<script src="js\/code-tab-panels\.js"><\/script>/.test(html));
    assert.ok(/if \(name === 'files'\) name = 'code';/.test(app));
    const fn = app.slice(app.indexOf('async function openApiRepoFile('), app.indexOf('async function openApiRepoFileInFiles('));
    assert.ok(/setRepoSubtab\('code'\)/.test(fn) && /return csOpen\(filePath\)/.test(fn), fn);
  });

  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!eng) { console.log('  - MG-10…MG-15 SKIPPED: Clear Glass has no engine here (no Electron binary, no Chromium) — the browser checks did not run'); skipped += 6; return done(); }
  let browser;
  try { browser = await glass.chromium.launch(); }
  catch (e) { console.log(`  - MG-10…MG-15 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped += 6; return done(); }
  console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${eng.kind}`);
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(harness()).href);
    await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} renderRepoCode(REPO); });
    await page.waitForSelector('.cs-file[data-path="src/a.js"]');
    const calls = (re, method) => page.evaluate(([s, m]) => CALLS.filter(c => new RegExp(s).test(c.p) && (!m || c.method === m)), [re.source, method || null]);

    await test('MG-10', 'the tree: the filter narrows; + file creates and opens it; × deletes it', async () => {
      await page.evaluate(() => cxFilter('read'));
      assert.deepStrictEqual(await page.$$eval('.cs-file', els => els.map(e => e.dataset.path)), ['docs/readme.md']);
      assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.id), 'cs-filter', 'the filter keeps focus');
      await page.evaluate(() => cxFilter(''));
      await page.click('button:has-text("+ file")');
      await page.waitForFunction(() => CS.open === 'src/new.js');
      assert.strictEqual((await calls(/\/file$/, 'POST')).pop().body.path, 'src/new.js');
      assert.ok(await page.$('.cs-file[data-path="src/new.js"]'));
      await page.evaluate(() => cxDeleteFile('src/new.js'));
      await page.waitForFunction(() => !document.querySelector('.cs-file[data-path="src/new.js"]'));
      assert.strictEqual((await calls(/\/file\?path=src%2Fnew\.js$/, 'DELETE')).length, 1);
      assert.strictEqual(await page.evaluate(() => CS.open), null, 'the deleted file is closed');
    });

    await test('MG-11', 'edit by hand: a textarea; Ctrl+S saves through POST …/file and leaves edit mode', async () => {
      await page.evaluate(() => csOpen('src/b.js'));
      await page.waitForSelector('#cs-code [data-ln="1"]');
      await page.click('button:has-text("edit")');
      await page.waitForSelector('#cs-editor');
      assert.strictEqual(await page.$eval('#cs-editor', t => t.value), 'const b = 1;');
      await page.evaluate(() => { const t = document.getElementById('cs-editor'); t.value = 'const b = 2;'; t.dispatchEvent(new Event('input')); t.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true })); });
      await page.waitForFunction(() => !CX.editing && document.querySelector('#cs-code'));
      const save = (await calls(/\/file$/, 'POST')).pop();
      assert.deepStrictEqual(save.body, { path: 'src/b.js', content: 'const b = 2;' });
      assert.strictEqual(await page.evaluate(() => CS.text), 'const b = 2;');
    });

    await test('MG-12', 'Manage · History, one menu: the Code tab\'s file and lines; one timeline; a tag narrows; diff; restore', async () => {
      await page.evaluate(() => csOpen('src/a.js'));
      await page.waitForSelector('#cs-code [data-ln="3"]');
      await page.evaluate(() => { csPickLine({}, 2); csPickLine({ shiftKey: true }, 3); });
      await page.click('button:has-text("manage · history")');
      await page.waitForSelector('#manage-modal.open');
      assert.strictEqual(await page.$eval('.mg-file', e => e.textContent), 'src/a.js');
      assert.deepStrictEqual(await page.evaluate(() => [document.getElementById('mg-from').value, document.getElementById('mg-to').value, MANAGE.scope]), ['2', '3', 'lines']);
      await page.waitForFunction(() => (MANAGE.timeline || []).length === 3);
      const rows = await page.$$eval('#mg-history .mg-run', els => els.map(e => e.querySelector('.mg-t').textContent.trim()));
      assert.strictEqual(rows.length, 3, JSON.stringify(rows));
      assert.ok(/edit fix/.test(rows[0]) && /debug · replied/.test(rows[1]) && /added/.test(rows[2]), JSON.stringify(rows));
      await page.evaluate(() => manageTag('edit'));
      assert.strictEqual(await page.$$eval('#mg-history .mg-run', els => els.length), 1);
      await page.evaluate(() => manageTag('all'));
      await page.click('#mg-history .mg-ver button:has-text("diff with now")');
      await page.waitForSelector('.mg-diff-body');
      assert.ok(await page.$eval('.mg-diff-body .mg-plus', e => /return 2/.test(e.textContent)));
      await page.click('#mg-history .mg-ver button:has-text("restore")');
      await page.waitForFunction(() => CALLS.some(c => c.p.endsWith('/versions/restore-file')));
      assert.deepStrictEqual((await calls(/\/versions\/restore-file$/, 'POST')).pop().body, { commitId: 'c2abcdef1234', path: 'src/a.js', by: 'person' });
      await page.evaluate(() => closeManagePanel());
    });

    await test('MG-13', 'the picked lines with an action: exactly those lines go to …/code/assist; a change is said to be waiting', async () => {
      await page.waitForSelector('.cx-act[data-a="fix"]');
      await page.click('.cx-act[data-a="fix"]');
      await page.waitForFunction(() => !CS.agent.busy);
      const a = (await calls(/\/code\/assist$/, 'POST')).pop();
      assert.deepStrictEqual([a.body.path, a.body.from, a.body.to, a.body.action], ['src/a.js', 2, 3, 'fix']);
      const last = await page.evaluate(() => CS.agent.lines[CS.agent.lines.length - 1]);
      assert.ok(/waiting above the code/.test(last.text) && /ollama:big/.test(last.meta), JSON.stringify(last));
      await page.evaluate(() => { CS.agent.draft = ''; });
      await page.click('.cx-act[data-a="change"]');
      assert.ok(await page.evaluate(() => TOASTS.some(t => /say how to change/.test(t[0]))), 'change needs words');
    });

    await test('MG-14', 'runs: the route; each run a pipeline; opened, its files; rewind asks with a dry run first', async () => {
      await page.click('.cx-tab:has-text("runs")');
      await page.waitForSelector('.cx-run');
      assert.deepStrictEqual(await page.$$eval('.cx-route .cx-hop', els => els.map(e => e.textContent)), ['ollama:big', 'gemini']);
      assert.deepStrictEqual(await page.$$eval('.cx-run .cx-step', els => els.map(e => [e.textContent.trim(), e.classList.contains('bad')])), [['✓ code_read', false], ['✗ code_edit', true], ['✓ code_edit', false]]);
      await page.click('.cx-run-head');
      await page.waitForSelector('.cx-run-body');
      const body = await page.$eval('.cx-run-body', e => e.textContent);
      assert.ok(/chatgpt#1, ollama#2/.test(body) && /fallback/.test(body) && /src\/a\.js/.test(body), body);
      await page.click('button:has-text("rewind this run")');
      await page.waitForFunction(() => CALLS.filter(c => /\/rewind$/.test(c.p)).length === 2);
      const rw = await calls(/\/rewind$/, 'POST');
      assert.deepStrictEqual([rw[0].body.dryRun, rw[1].body.dryRun], [true, undefined]);
    });

    // §FN4 0.60.95 — James: "Every thing the agents do. Needs to determine dependancies, spec, phase, then chunk."
    await test('MG-16', 'work: the open file\'s dependencies, spec, phase and chunks, in his order; where it stops is said', async () => {
      await page.click('.cx-tab:has-text("work")');
      await page.waitForSelector('.cx-work-step');
      const steps = await page.$$eval('.cx-work-step', els => els.map(e => [e.querySelector('b').textContent, e.classList.contains('cx-work-off')]));
      assert.deepStrictEqual(steps, [['dependencies', false], ['spec', false], ['phase', true], ['chunks', true]]);
      const txt = await page.$eval('.cx-work', e => e.textContent);
      assert.ok(/src\/b\.js/.test(txt) && /used by/.test(txt) && /spec\/daw\.spec/.test(txt), txt);
      assert.ok(/stopped at phase: no open phase maps src\/a\.js/.test(txt), txt);
      const f = await calls(/\/funnel$/, 'POST');
      assert.ok(f.length >= 1 && /^change src\/a\.js/.test(f[0].body.request), JSON.stringify(f));
    });

    await test('MG-15', 'responses: the exchanges; tasks and log: the Plan panel\'s views drawn in the Code tab', async () => {
      await page.click('.cx-tab:has-text("responses")');
      await page.waitForSelector('.cx-resp');
      assert.ok(/it returns two/.test(await page.$eval('.cx-resp', e => e.textContent)));
      await page.click('.cx-tab:has-text("tasks")');
      await page.waitForFunction(() => document.querySelector('#cs-rt-list .rt-row'));
      assert.ok(/chat about a\.js/.test(await page.$eval('#cs-rt-list', e => e.textContent)));
      await page.click('.cx-tab:has-text("log")');
      await page.waitForFunction(() => /applied/.test((document.getElementById('cs-rt-list') || {}).textContent || ''));
      await page.click('.cx-tab:has-text("activity")');
      await page.waitForSelector('#cs-activity');
      await wait(100);
      assert.deepStrictEqual(errors, []);
    });
  } finally { await browser.close(); }
  done();
})();
