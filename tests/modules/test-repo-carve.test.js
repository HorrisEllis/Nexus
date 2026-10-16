'use strict';
/**
 * tests/modules/test-repo-carve.test.js — CV1 (docs/2026-10-16-repo-carve-phasemap.spec), 0.60.112
 * James, 2026-10-16: "can you branch it into a idearium repo?"
 *   CV-01..03  lib/repo-carve.js on a fixture tree: the closure with what pulled each file in, npm split, missing requires,
 *              paths outside the tree refused
 *   CV-04      the real flight_recorder preset over Nexus itself
 *   CV-05..06  POST /api/repos/carve through the real router: dry run, then a real repo with its files, CARVED.json and notes
 *   CV-07      the command row
 *   CV-08      the UI (projects.js) driven in Clear Glass against a stubbed api(); no engine → SKIPPED, said
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const _data = fs.mkdtempSync(path.join(os.tmpdir(), 'carve-'));
const _jaa = fs.mkdtempSync(path.join(os.tmpdir(), 'carve-jaa-'));
process.env.IDEARIUM_DATA_DIR = _data;
process.env.JAA_DATA_DIR = _jaa;
process.on('exit', () => { for (const d of [_data, _jaa]) try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
const assert = require('assert');
const ROOT = path.join(__dirname, '../..');
const CV = require(path.join(ROOT, 'lib/repo-carve.js'));

let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}

const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'carve-tree-'));
const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(tree, rel)), { recursive: true }); fs.writeFileSync(path.join(tree, rel), text); };
put('package.json', JSON.stringify({ name: 'fixture', dependencies: { 'js-yaml': '^4.1.0' } }));
put('prod/index.js', "const h = require('../lib/helper.js');\nconst y = require('js-yaml');\nconst c = require('./conf.json');\nconst g = require('./gone.js');\n// require('../lib/commented.js')\nmodule.exports = { h, y, c, g };\n");
put('prod/conf.json', '{"a":1}');
put('lib/helper.js', "const d = require('./deep');\nconst t = 'commander';\nconst cmd = require('commander');\nmodule.exports = d;\n");
put('lib/deep/index.js', "const fs = require('fs');\nmodule.exports = 1;\n");
put('lib/commented.js', 'module.exports = 0;\n');
put('lib/unrelated.js', 'module.exports = 2;\n');

(async () => {
  await test('CV-01', 'the closure: the seeds, then what their requires pull in, each with the file that pulled it', async () => {
    const p = CV.plan({ root: tree, seeds: ['prod'] });
    assert.strictEqual(p.ok, true, p.error);
    const by = Object.fromEntries(p.files.map(f => [f.path, f.pulledBy]));
    assert.deepStrictEqual(Object.keys(by).sort(), ['lib/deep/index.js', 'lib/helper.js', 'prod/conf.json', 'prod/index.js']);
    assert.strictEqual(by['prod/index.js'], null, 'a seed was named, not pulled');
    assert.strictEqual(by['lib/helper.js'], 'prod/index.js');
    assert.strictEqual(by['lib/deep/index.js'], 'lib/helper.js');
    assert.ok(!by['lib/commented.js'], 'a require in a comment loads nothing');
    assert.ok(!by['lib/unrelated.js']);
    assert.deepStrictEqual([p.seeded, p.pulledIn], [2, 2]);
    assert.deepStrictEqual(p.bySystem, { lib: 2, prod: 2 });
  });

  await test('CV-02', 'npm Nexus installs is a dependency (its pin); one only named is listed; a require to nothing is said', async () => {
    const p = CV.plan({ root: tree, seeds: ['prod'] });
    assert.deepStrictEqual(p.npm, { 'js-yaml': '^4.1.0' });
    assert.deepStrictEqual(p.npmNamedOnly, ['commander']);
    assert.deepStrictEqual(p.missing, [{ from: 'prod/index.js', spec: './gone.js' }]);
    const files = CV.build(p, { root: tree, name: 'prod-repo', nexusVersion: '9.9.9', quote: '"x"' });
    const pkg = JSON.parse(files.find(f => f.path === 'package.json').content);
    assert.deepStrictEqual(pkg.dependencies, { 'js-yaml': '^4.1.0' });
    const carved = JSON.parse(files.find(f => f.path === 'CARVED.json').content);
    assert.strictEqual(carved.nexusVersion, '9.9.9'); assert.strictEqual(carved.files.length, 4);
    assert.match(files.find(f => f.path === 'README.md').content, /James: "x"[\s\S]*4 files \(2 named, 2 pulled in/);
  });

  await test('CV-03', 'only paths inside the tree: ../, absolute and missing paths are refused with the reason', async () => {
    assert.match(CV.plan({ root: tree, seeds: ['../etc'] }).error, /not a path inside Nexus/);
    assert.match(CV.plan({ root: tree, seeds: ['/etc/passwd'] }).error, /not a path inside Nexus/);
    assert.match(CV.plan({ root: tree, seeds: ['nope'] }).error, /does not exist/);
    assert.match(CV.plan({ root: tree, seeds: [] }).error, /name at least one/);
  });

  await test('CV-04', 'the flight_recorder preset over Nexus itself: every seed is in, and what it drags in is counted', async () => {
    const p = CV.plan({ root: ROOT, seeds: CV.PRESETS.flight_recorder.seeds });
    assert.strictEqual(p.ok, true, p.error);
    const paths = new Set(p.files.map(f => f.path));
    for (const f of ['versionium/lib/engine.js', 'intelligence/rfr2/kernel/index.js', 'cos/testenv/index.js', 'lib/code-edit.js']) assert.ok(paths.has(f), f);
    assert.ok(p.pulledIn > 0 && p.files.length < CV.LIMITS.files, `${p.files.length} files`);
    assert.ok(p.files.every(f => !f.path.startsWith('data/') && !f.path.includes('node_modules/')), 'no state, no packages');
    assert.ok('js-yaml' in p.npm);
  });

  const api = await import('../../idearium/api/index.js');
  await test('CV-05', 'POST /api/repos/carve dryRun: the plan, nothing created; a bad preset or a path outside Nexus is a 400', async () => {
    const before = (await api._route('GET', '/api/repos')).json;
    const r = await api._route('POST', '/api/repos/carve', { preset: 'flight_recorder', dryRun: true });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    const d = r.json.data || r.json;
    assert.strictEqual(d.dryRun, true); assert.strictEqual(d.name, 'flight-recorder'); assert.ok(d.files > 50);
    assert.ok(Array.isArray(d.outsideSeeds) && d.outsideSeeds.every(f => f.pulledBy));
    const after = (await api._route('GET', '/api/repos')).json;
    assert.strictEqual(JSON.stringify(after.repos || after).length, JSON.stringify(before.repos || before).length, 'nothing created');
    assert.strictEqual((await api._route('POST', '/api/repos/carve', { preset: 'nope' })).status, 400);
    assert.strictEqual((await api._route('POST', '/api/repos/carve', { name: 'x', seeds: ['../..'] })).status, 400);
    assert.strictEqual((await api._route('POST', '/api/repos/carve', { seeds: ['lib/zip.js'] })).status, 400, 'a name is required');
  });

  await test('CV-06', 'a real carve: a new repo holding the files, package.json, CARVED.json and README, with his words as a note', async () => {
    await import('../../idearium/spec-engine/index.js');
    let r = null;
    for (let i = 0; i < 40; i++) { r = await api._route('POST', '/api/repos/carve', { name: 'carve-fixture', seeds: ['lib/zip.js'] }); if (r.status === 200) break; await new Promise(res => setTimeout(res, 100)); }
    assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    const d = r.json.data || r.json;
    assert.ok(d.repo && d.repo.uuid);
    const repo = (await api._route('GET', `/api/repos/${d.repo.uuid}`)).json;
    const got = JSON.stringify(repo);
    for (const f of ['lib/zip.js', 'package.json', 'CARVED.json', 'README.md']) assert.ok(got.includes(f), `${f} in the repo`);
    const RN = require(path.join(ROOT, 'lib/repo-notes.js'));
    const notes = RN.list({ repoUuid: d.repo.uuid });
    const list = notes.notes || notes;
    assert.ok(list.some(n => n.kind === 'quote' && /branch it into a idearium repo/.test(n.body)), JSON.stringify(list).slice(0, 300));
    assert.ok(list.some(n => n.kind === 'decision' && /to confirm/.test(n.body)));
  });

  await test('CV-07', 'the command: repo carve, with --preset and --dry-run', async () => {
    const rc = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const row = (rc.SPEC || rc.ROWS || rc).find ? (rc.SPEC || rc.ROWS || rc).find(x => x.key === 'repo.carve') : null;
    assert.ok(row, 'the row exists');
    const q = row.req({ args: [], flags: { preset: 'flight_recorder', 'dry-run': true } });
    assert.deepStrictEqual(q, { method: 'POST', path: '/api/repos/carve', body: { preset: 'flight_recorder', dryRun: true } });
    assert.deepStrictEqual(row.req({ args: ['x', 'lib/zip.js', 'versionium'], flags: {} }).body, { name: 'x', seeds: ['lib/zip.js', 'versionium'], dryRun: false });
    assert.ok(row.need({ args: ['x'], flags: {} }));
  });

  // CV-08 — the UI in Clear Glass (AXIOMS §4.1): the real projects.js against a stubbed api()
  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!eng) { console.log('  - CV-08 SKIPPED: Clear Glass has no engine here (no Electron binary, no Chromium) — the browser check did not run'); skipped++; }
  else {
    let browser = null;
    try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - CV-08 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped++; }
    if (browser) {
      console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${eng.kind}`);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carve-ui-'));
      fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
  const CALLS = []; let REPO_DETAIL_OPEN = false; const OPENED = [];
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function enterRepoDetail(u) { OPENED.push(u); }
  async function api(p, opts) {
    const method = (opts && opts.method) || 'GET'; const body = opts && opts.body ? JSON.parse(opts.body) : null; CALLS.push({ p, method, body });
    if (p === '/api/my-projects') return { projects: [], counts: {} };
    if (p === '/api/raid/held') return { agents: null, drops: [] };
    if (p === '/api/repos/carve') return { dryRun: !!body.dryRun, name: body.name, files: 261, seeded: 63, pulledIn: 198, lines: 57975, bySystem: { cos: 68, loom: 13 },
      npm: { 'js-yaml': '^5' }, npmNamedOnly: ['commander'], missing: [{ from: 'a.js', spec: './gone' }], outsideSeeds: [{ path: 'loom/x.js', pulledBy: 'versionium/y.js' }],
      parent: { name: 'nexus' }, ...(body.dryRun ? {} : { repo: { uuid: 'new-uuid' } }) };
    throw new Error('unexpected ' + p);
  }
</script><script src="${pathToFileURL(path.join(ROOT, 'idearium/ui/js/projects.js')).href}"></script></body></html>`);
      try {
        const page = await browser.newPage();
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
        await test('CV-08', 'My projects → Branch from Nexus: Preview says what comes along and why; Create makes the repo and opens it', async () => {
          await page.evaluate(() => openProjects());
          await page.waitForSelector('button:has-text("Branch from Nexus")');
          await page.click('button:has-text("Branch from Nexus")');
          await page.waitForSelector('#carve-preset');
          await page.click('button:has-text("Preview")');
          await page.waitForFunction(() => /would carve/.test(document.getElementById('carve-out').textContent));
          const txt = await page.$eval('#carve-out', e => e.textContent);
          assert.ok(/261 files \(63 named, 198 pulled in\)/.test(txt) && /parent nexus/.test(txt) && /cos 68/.test(txt), txt);
          assert.ok(/named only: commander/.test(txt) && /1 require\(s\) resolve to nothing/.test(txt) && /loom\/x\.js \(by versionium\/y\.js\)/.test(txt), txt);
          await page.click('button:has-text("Create repo")');
          await page.waitForSelector('#carve-out button');
          await page.click('#carve-out button');
          const st = await page.evaluate(() => ({ calls: CALLS.filter(c => c.p === '/api/repos/carve').map(c => c.body), opened: OPENED }));
          assert.deepStrictEqual(st.calls, [{ preset: 'flight_recorder', name: 'flight-recorder', dryRun: true }, { preset: 'flight_recorder', name: 'flight-recorder', dryRun: false }]);
          assert.deepStrictEqual(st.opened, ['new-uuid']);
          assert.deepStrictEqual(errors, []);
        });
      } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
    }
  }

  fs.rmSync(tree, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
  process.exit(failed ? 1 : 0);
})();
