'use strict';
/**
 * tests/modules/test-mco3-versionium-tab.js — the Versionium repo subtab
 * (idearium/ui/js/app.js §VERSIONIUM, idearium/ui/index.html).
 *
 * §12.2 — no hand-written records. The fake `fetch` below stands in for the
 * server, but every response body is produced by the REAL library: records
 * from snapshot.buildSnapshotRecord() over a real repo that has really been
 * through the import pipeline, list rows from summarizeRepoSnapshots(), the
 * same functions the API routes call. What is under test is the view, fed
 * with the shapes the server actually sends.
 *
 * MCO-B: commits now go through versionium's REAL engine and the REAL per-file
 * layer (in-process), and the restore route runs the real restoreRepoSnapshot()
 * over a small RepoLayer stand-in that writes real files to the repo directory.
 * The real RepoLayer is exercised over real HTTP separately (CHANGELOG-0.39.176).
 *
 * jsdom is a devDependency. Without it this file says so and exits 0 with
 * nothing counted — it does not pretend to have passed.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (_) {
  console.log('SKIP: jsdom is not installed (devDependency) — Versionium tab NOT verified');
  console.log('\n✓ mco3-versionium-tab: 0 passed, 0 failed (skipped)\n');
  process.exit(0);
}

process.env.VERSIONIUM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mco3ui-versionium-'));
process.env.JAA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mco3ui-cortex-'));

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const pipeline = await import(path.join(ROOT, 'idearium/repo/import-pipeline.js'));
  const verifyLazy = await import(path.join(ROOT, 'idearium/repo/verify-lazy.js'));
  const snap = await import(path.join(ROOT, 'idearium/repo/snapshot.js'));
  const restoreMod = await import(path.join(ROOT, 'idearium/repo/snapshot-restore.js'));
  const workQueue = require(path.join(ROOT, 'lib/work-queue.js'));
  const engine = require(path.join(ROOT, 'versionium/lib/engine.js'));
  const filesLib = require(path.join(ROOT, 'versionium/lib/files.js'));
  const { jaaDB } = require(path.join(ROOT, 'versionium/lib/store.js'));

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mco3ui-'));
  const NODE_DIR = path.join(ROOT, 'idearium/data/nodes/repository');
  const createdUuids = [];

  // ── a real indexed repo, plus a never-indexed one ──────────────────────
  const FILES = {
    'package.json': JSON.stringify({ name: 'ui', dependencies: { express: '^5.0.0' } }),
    'src/a.js': "const { b } = require('./b.js');\nmodule.exports = { a: b + 1 };\n",
    'src/b.js': 'const b = 2;\nmodule.exports = { b };\n',
    'src/b.test.js': "require('./b.js');\nconsole.log('ok');\n",
    'assets/logo.bin': Buffer.from([0, 1, 2, 250, 0, 255]).toString('latin1'),
  };
  const repoDir = path.join(tmpRoot, 'ui-repo');
  for (const [rel, c] of Object.entries(FILES)) {
    fs.mkdirSync(path.dirname(path.join(repoDir, rel)), { recursive: true });
    fs.writeFileSync(path.join(repoDir, rel), rel.endsWith('.bin') ? Buffer.from(c, 'latin1') : c);
  }
  const REPO = { uuid: 'mco3ui-repo', name: 'ui-repo', source: 'drop', files: Object.keys(FILES).map(p => ({ path: p })) };
  createdUuids.push(REPO.uuid);
  const runPipeline = async () => { pipeline.runImportPipeline(REPO, repoDir); await workQueue.get(verifyLazy.QUEUE_NAME).drain(); };

  const bareDir = path.join(tmpRoot, 'bare');
  fs.mkdirSync(bareDir, { recursive: true }); fs.writeFileSync(path.join(bareDir, 'x.js'), '1;\n');
  const BARE = { uuid: 'mco3ui-bare', name: 'bare', source: 'drop', files: [{ path: 'x.js' }] };

  // ── the fake server: real library, real engine, real shapes ─────────────
  let serverDown = false; let fileLayerOn = true;
  const restoreMode = { ignore: [] };
  const calls = []; const restoreBodies = [];
  const dirFor = (uuid) => (uuid === REPO.uuid ? repoDir : uuid === BARE.uuid ? bareDir : null);
  const repoFor = (uuid) => (uuid === REPO.uuid ? REPO : uuid === BARE.uuid ? BARE : null);
  const res = (status, body) => ({ ok: status >= 200 && status < 300, status, statusText: String(status), json: async () => body });
  const allRows = () => jaaDB.query('versionium_commits', r => r.system === snap.SNAPSHOT_SYSTEM, 1e9);
  const commitFn = async (payload) => { await sleep(4); return engine.commit(payload); }; // distinct wall times
  const fileLayerFor = (repo) => ({
    limits: async () => filesLib.limits(),
    plan: async (tree) => filesLib.plan({ repository: repo.uuid, tree }),
    record: async ({ commitId, tree, contents }) => filesLib.record({ repository: repo.uuid, commitId, tree, contents }),
  });
  const layerFor = (repo) => ({
    limits: async () => filesLib.limits(),
    tree: async (id) => filesLib.tree(repo.uuid, id),
    content: async (id, p) => filesLib.content(repo.uuid, id, p),
  });
  // A RepoLayer stand-in that writes REAL files into the repo directory.
  const fakeRepoLayer = (repo, dir) => ({
    writeFile(u, p, text) { if (restoreMode.ignore.includes(p)) return { ok: true }; const abs = path.join(dir, p); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, text, 'utf8'); if (!repo.files.some(f => f.path === p)) repo.files.push({ path: p }); return { ok: true }; },
    deleteFile(u, p) { const abs = path.join(dir, p); if (!fs.existsSync(abs)) return { error: 'not found' }; fs.rmSync(abs); repo.files = repo.files.filter(f => f.path !== p); return { ok: true }; },
    refresh() {}, get() { return repo; },
  });
  const takeFor = (repo, dir, extra = {}) => snap.commitRepoSnapshot({ repo, repoDir: dir, commit: commitFn, fileLayer: fileLayerOn ? fileLayerFor(repo) : null, ...extra });

  const fakeFetch = async (url, opts = {}) => {
    const u = new URL(String(url)); const method = (opts.method || 'GET').toUpperCase();
    calls.push(`${method} ${u.pathname}`);
    const m = /^\/api\/repos\/([^/]+)\/(snapshot|snapshots)(?:\/([^/]+))?(?:\/(restore))?$/.exec(u.pathname);
    if (!m) return res(200, {});
    const [, uuid, kind, commitId, action] = m;
    if (serverDown) return res(502, { ok: false, error: '[nexus-client] versionium unreachable at 127.0.0.1:3754 — ECONNREFUSED' });
    const repo = repoFor(uuid); if (!repo) return res(404, { ok: false, error: `repo not found: ${uuid}` });
    if (kind === 'snapshot' && method === 'POST') {
      const body = opts.body ? JSON.parse(opts.body) : {};
      const r = await takeFor(repo, dirFor(uuid), { message: body.message || null });
      if (!r.ok) return res(r.code === 'NOT_INDEXED' ? 409 : 500, { ok: false, error: r.error, detail: { code: r.code } });
      return res(200, { ok: true, repoUuid: uuid, commitId: r.commit.commitId, record: r.record, files: r.files });
    }
    if (kind === 'snapshots' && !commitId) return res(200, { ok: true, repoUuid: uuid, snapshots: snap.summarizeRepoSnapshots(allRows(), uuid) });
    const row = allRows().find(x => x.commitId === commitId);
    if (!row || !snap.isRepoSnapshotState(row.state) || row.state.repository !== uuid) return res(404, { ok: false, error: `no snapshot ${commitId} for repo ${uuid}` });
    if (action === 'restore' && method === 'POST') {
      const body = opts.body ? JSON.parse(opts.body) : {}; restoreBodies.push(body);
      const dryRun = body.dryRun !== false; const dir = dirFor(uuid);
      const result = await restoreMod.restoreRepoSnapshot({
        repo, repoDir: dir, commitId, record: row.state, layer: layerFor(repo), repoLayer: fakeRepoLayer(repo, dir), dryRun,
        takeSnapshot: () => takeFor(repo, dir, { message: `pre-restore snapshot (before restoring ${commitId})` }),
      });
      return res(200, { ok: true, repoUuid: uuid, commitId, dryRun, result });
    }
    return res(200, { ok: true, repoUuid: uuid, commitId, ts: row.wall, message: row.message, record: row.state });
  };

  // ── the real UI, evaluated in jsdom ─────────────────────────────────────
  const UI = path.join(ROOT, 'idearium/ui');
  const html = fs.readFileSync(path.join(UI, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost:4800/ui/index.html' });
  const { window } = dom;
  window.fetch = fakeFetch;
  window.EventSource = function () { this.close = () => {}; this.addEventListener = () => {}; };
  window.requestAnimationFrame = () => 0;
  window.HTMLCanvasElement.prototype.getContext = () => null;

  const appSrc = fs.readFileSync(path.join(UI, 'js/app.js'), 'utf8');
  // app.js's top-level `let`s are only reachable from inside the same eval.
  window.eval(appSrc + `
    window.__ui = {
      use(repo) { API_BASE = 'http://localhost:4800'; CONNECTED = true; CURRENT_API_REPO = repo; API_REPOS = [repo]; SNAP_OPEN = null; },
      open() { setRepoSubtab('versionium'); },
      take() { return takeRepoSnapshot(CURRENT_API_REPO.uuid); },
      openSnap(id) { return openRepoSnapshot(CURRENT_API_REPO.uuid, id); },
      event(ev) { return refreshOnEvent(ev); },
      subtab() { return CURRENT_REPO_SUBTAB; },
      preview(id) { return previewRepoRestore(CURRENT_API_REPO.uuid, id); },
      restore() { return runRepoRestore(); },
    };`);
  const d = window.document; const q = (s) => d.querySelector(s);
  const panel = () => q('#repo-subtab-versionium');
  const text = () => panel().textContent;
  const settle = () => sleep(150);
  const toastText = () => [...d.querySelectorAll('#toast-area .toast')].map(x => x.textContent).join(' | ');

  console.log('\n── structure ────────────────────────────────────────────');
  await t('a Versionium nav button and its panel exist', () => {
    const btn = q('.repo-subtab-btn[data-subtab="versionium"]');
    assert.ok(btn, 'no nav button'); assert.ok(panel(), 'no panel');
    assert.strictEqual(btn.textContent.trim(), 'Versionium');
  });
  await t('every nav button has a matching panel (no orphaned tab)', () => {
    for (const b of d.querySelectorAll('.repo-subtab-btn')) assert.ok(q(`#repo-subtab-${b.dataset.subtab}`), b.dataset.subtab);
  });

  console.log('\n── empty repo, no snapshots ─────────────────────────────');
  await runPipeline();
  window.__ui.use(REPO); window.__ui.open(); await settle();
  await t('activating the tab makes its panel the active one', () => {
    assert.ok(panel().classList.contains('active'));
    assert.strictEqual(window.__ui.subtab(), 'versionium');
    assert.ok(q('.repo-subtab-btn[data-subtab="versionium"]').classList.contains('active'));
  });
  await t('no snapshots: says so, offers the take-snapshot control, says what a snapshot keeps', () => {
    assert.ok(/none yet/.test(text()));
    assert.ok(q('#snap-take') && q('#snap-msg'));
    assert.ok(/first copy, then diffs/.test(text()));
  });

  console.log('\n── taking a snapshot ────────────────────────────────────');
  q('#snap-msg').value = 'first <img src=x onerror=alert(1)>';
  await window.__ui.take(); await settle();
  const rec1 = allRows()[0] && allRows()[0].state;
  const ID1 = allRows()[0] && allRows()[0].commitId;
  await t('taking one commits through the (real-library) server and lists it', () => {
    assert.strictEqual(allRows().length, 1);
    assert.strictEqual(d.querySelectorAll('#repo-subtab-versionium .snap-row').length, 1);
    assert.ok(new RegExp('snapshot ' + ID1).test(toastText()), toastText());
  });
  await t('the new snapshot opens automatically with all nine §33 fields shown', () => {
    const keys = [...panel().querySelectorAll('#snap-detail span')].map(s => s.textContent).filter(x => /^(source|git|atlas|chunks|graph|deps|env|tests|verify)$/.test(x));
    assert.deepStrictEqual(keys, ['source', 'git', 'atlas', 'chunks', 'graph', 'deps', 'env', 'tests', 'verify']);
  });
  await t('displayed values are the record\'s real values, not placeholders', () => {
    const mr = rec1.mustRecord; const tx = text();
    assert.ok(tx.includes(mr.sourceHash.value.slice(0, 12)), 'source hash');
    assert.ok(tx.includes(mr.atlasVersion.sha256.slice(0, 12)), 'atlas sha');
    assert.ok(tx.includes(`${mr.chunkIndexVersion.chunkCount} chunks`), 'chunk count');
    assert.ok(tx.includes(`${mr.graphVersion.nodeCount} nodes`), 'graph nodes');
    assert.ok(tx.includes(`${mr.testState.testsRun}/${mr.testState.testsFound} run`), 'test counts');
    assert.ok(tx.includes('L0✓') && tx.includes('L8–'), 'tier marks (L8 not_applicable shows –)');
  });
  await t('an unavailable field shows its stated reason, not a blank or a 0', () => {
    assert.strictEqual(rec1.mustRecord.gitCommit.available, false);
    assert.ok(text().includes(rec1.mustRecord.gitCommit.reason), 'git reason missing');
  });
  await t('HTML in the snapshot message is escaped, not injected', () => {
    assert.strictEqual(panel().querySelectorAll('img').length, 0, 'an <img> was injected');
    assert.ok(text().includes('first <img src=x onerror=alert(1)>'), 'message text not shown literally');
  });
  await t('first snapshot says there is nothing to compare against', () => {
    assert.ok(/first snapshot of this repo/.test(text()));
  });

  console.log('\n── a changed repo: stale flag and the since-previous strip ──');
  fs.appendFileSync(path.join(repoDir, 'src/b.js'), '// edited after indexing\n');
  q('#snap-msg').value = 'edited, not reindexed';
  await window.__ui.take(); await settle();
  await t('a snapshot of stale indexes is flagged in the list and in the detail', () => {
    const r = [...d.querySelectorAll('.snap-row')].find(x => /edited, not reindexed/.test(x.textContent));
    assert.ok(r && /stale index/.test(r.textContent), 'no stale badge in list');
    assert.ok(/STALE/.test(text()) && /src\/b\.js/.test(text()), 'no STALE detail naming the file');
    assert.ok(/on disk [0-9a-f]{12} · indexed [0-9a-f]{12}/.test(text()), 'a stale source row should show both hashes');
  });
  await t('the strip against the previous snapshot: source changed, atlas/chunks/graph same', () => {
    const tx = text();
    assert.ok(new RegExp('since ' + ID1).test(tx), tx.slice(0, 200));
    assert.ok(/changed\s+source/.test(tx), 'source not reported changed');
    for (const k of ['atlas', 'chunks', 'graph']) assert.ok(new RegExp(`same\\s+${k}`).test(tx), `${k} should be same`);
  });
  await runPipeline();
  q('#snap-msg').value = 'reindexed';
  await window.__ui.take(); await settle();
  await t('after a real reindex the new snapshot is fresh and the strip shows the indexes changed', () => {
    const rowsEls = [...d.querySelectorAll('.snap-row')];
    assert.strictEqual(rowsEls.length, 3);
    assert.ok(!/stale index/.test(rowsEls[0].textContent), 'newest should not be stale');
    assert.ok(/changed\s+atlas/.test(text()), 'atlas identity should have changed after reindex');
  });
  await t('list is newest first', () => {
    const msgs = [...d.querySelectorAll('.snap-row')].map(x => x.textContent);
    assert.ok(/reindexed/.test(msgs[0]) && /first/.test(msgs[2]));
  });
  await t('clicking an older row opens that snapshot\'s own detail', async () => {
    await window.__ui.openSnap(ID1); await settle();
    assert.ok(new RegExp(ID1).test(q('#snap-detail').textContent));
    assert.ok(/first snapshot of this repo/.test(q('#snap-detail').textContent));
  });

  console.log('\n── restore from the tab (MCO-B) ─────────────────────────');
  window.__ui.use(REPO); window.__ui.open(); await settle();
  const idsNewestFirst = () => allRows().slice().sort((a, b) => b.wall - a.wall).map(r => r.commitId);
  const stateIds = idsNewestFirst();
  const restoreSnapId = stateIds[0]; // the newest, fresh snapshot ('reindexed')
  const bytesAtSnap = {}; for (const f of REPO.files) bytesAtSnap[f.path] = fs.readFileSync(path.join(repoDir, f.path));
  await window.__ui.openSnap(restoreSnapId); await settle();
  await t('a snapshot with a file layer shows what it kept and a preview-restore control', () => {
    assert.ok(/files · \d+ bytes kept/.test(text()), text().slice(-300));
    assert.ok([...panel().querySelectorAll('button')].some(b => /preview restore/.test(b.textContent)));
  });
  await t('the list marks snapshots that kept files', () => {
    assert.ok(/\d+ files kept/.test(panel().textContent));
  });

  // drift: edit, delete, add
  fs.writeFileSync(path.join(repoDir, 'src/b.js'), 'const b = 999;\nmodule.exports = { b };\n');
  fs.rmSync(path.join(repoDir, 'src/a.js')); REPO.files = REPO.files.filter(f => f.path !== 'src/a.js');
  fs.writeFileSync(path.join(repoDir, 'src/added.js'), 'module.exports = "added";\n'); REPO.files.push({ path: 'src/added.js' });
  const drifted = {}; for (const f of REPO.files) drifted[f.path] = fs.readFileSync(path.join(repoDir, f.path));

  await window.__ui.preview(restoreSnapId); await settle();
  await t('preview lists exactly what would be written and deleted, and changes nothing on disk', () => {
    const tx = q('#snap-restore-out').textContent;
    assert.ok(/would write \(2\)/.test(tx) && /src\/a\.js/.test(tx) && /src\/b\.js/.test(tx), tx);
    assert.ok(/would delete \(1\)/.test(tx) && /src\/added\.js/.test(tx), tx);
    assert.ok([...q('#snap-restore-out').querySelectorAll('button')].some(b => /restore 3 file change/.test(b.textContent)));
    for (const [p, b] of Object.entries(drifted)) assert.ok(fs.readFileSync(path.join(repoDir, p)).equals(b), `${p} changed by a preview`);
    assert.strictEqual(restoreBodies[restoreBodies.length - 1].dryRun, true);
  });

  const postsBefore = restoreBodies.length;
  window.confirm = () => false;
  await window.__ui.restore(); await settle();
  await t('declining the confirmation sends NO restore request and changes nothing', () => {
    assert.strictEqual(restoreBodies.length, postsBefore);
    for (const [p, b] of Object.entries(drifted)) assert.ok(fs.readFileSync(path.join(repoDir, p)).equals(b), p);
  });

  window.confirm = (msg) => { window.__lastConfirm = msg; return true; };
  await window.__ui.restore(); await settle();
  await t('confirming asks first (naming the counts and the undo), sends dryRun:false, and shows the VERIFIED result', () => {
    assert.ok(/Restore 2 file\(s\) and delete 1 file\(s\)/.test(window.__lastConfirm) && /undone/.test(window.__lastConfirm), window.__lastConfirm);
    assert.strictEqual(restoreBodies[restoreBodies.length - 1].dryRun, false);
    assert.ok(/restored and verified against the files on disk: 2 written, 1 deleted/.test(q('#snap-restore-out').textContent), q('#snap-restore-out').textContent);
  });
  await t('GATE: the files on disk are byte-for-byte the snapshot\'s (Buffer.equals), incl. the binary', () => {
    for (const [p, b] of Object.entries(bytesAtSnap)) assert.ok(fs.readFileSync(path.join(repoDir, p)).equals(b), p);
    assert.ok(!fs.existsSync(path.join(repoDir, 'src/added.js')));
  });
  const undoBtn = () => [...q('#snap-restore-out').querySelectorAll('button')].find(b => /^undo/.test(b.textContent));
  await t('an undo control names the pre-restore snapshot that was taken first', () => {
    assert.ok(undoBtn(), 'no undo button');
    const preId = /vtm-[0-9a-f]+/.exec(undoBtn().textContent)[0];
    assert.ok(allRows().some(r => r.commitId === preId && /pre-restore/.test(r.message)));
  });
  await t('UNDO: previewing and running the pre-restore snapshot brings the drifted files back exactly', async () => {
    const preId = /vtm-[0-9a-f]+/.exec(undoBtn().textContent)[0];
    await window.__ui.preview(preId); await settle();
    await window.__ui.restore(); await settle();
    for (const [p, b] of Object.entries(drifted)) assert.ok(fs.readFileSync(path.join(repoDir, p)).equals(b), `${p} not restored by the undo`);
  });

  // a repo layer that claims success but writes nothing: the panel must not say "verified"
  fs.writeFileSync(path.join(repoDir, 'src/b.js'), 'const b = 12345;\n');
  restoreMode.ignore = ['src/b.js'];
  await window.__ui.preview(restoreSnapId); await settle();
  await window.__ui.restore(); await settle();
  await t('an unverified restore is shown as NOT matching, names the file, and offers the undo — never "verified"', () => {
    const tx = q('#snap-restore-out').textContent;
    assert.ok(/does not match the snapshot after the restore/.test(tx) && /src\/b\.js: differs after restore/.test(tx), tx);
    assert.ok(!/verified against the files on disk/.test(tx));
    assert.ok(undoBtn());
  });
  restoreMode.ignore = [];

  // a changed binary blocks the restore whole
  fs.writeFileSync(path.join(repoDir, 'assets/logo.bin'), Buffer.from([9, 9, 0, 9]));
  await window.__ui.preview(restoreSnapId); await settle();
  await t('a changed binary: preview says BLOCKED, names it, and offers no restore button', () => {
    const tx = q('#snap-restore-out').textContent;
    assert.ok(/BLOCKED/.test(tx) && /assets\/logo\.bin/.test(tx), tx);
    assert.ok(![...q('#snap-restore-out').querySelectorAll('button')].some(b => /^restore/.test(b.textContent)));
  });

  // a snapshot taken without a file layer
  fileLayerOn = false;
  q('#snap-msg').value = 'no file layer'; await window.__ui.take(); await settle();
  fileLayerOn = true;
  await t('a snapshot with no file layer says it cannot restore files and has no preview control', () => {
    assert.ok(/no file layer — this snapshot recorded derived state only, so it cannot restore files/.test(text()));
    assert.ok(![...panel().querySelectorAll('button')].some(b => /preview restore/.test(b.textContent)));
  });

  console.log('\n── failure states are shown, not swallowed ──────────────');
  window.__ui.use(BARE); window.__ui.open(); await settle();
  await window.__ui.take(); await settle();
  await t('taking a snapshot of a never-indexed repo shows the server\'s NOT_INDEXED message', () => {
    assert.ok(/snapshot failed/.test(toastText()) && /import pipeline/.test(toastText()), toastText());
    assert.strictEqual(allRows().filter(r => r.state.repository === BARE.uuid).length, 0);
  });
  await t('the take button is re-enabled after a failure', () => assert.strictEqual(q('#snap-take').disabled, false));

  serverDown = true;
  window.__ui.use(REPO); window.__ui.open(); await settle();
  await t('versionium unreachable: the panel says so and says where snapshots live', () => {
    assert.ok(/could not read snapshots/.test(text()) && /versionium/.test(text()));
    assert.ok(/unreachable/.test(text()), 'the real error text should be shown');
  });
  serverDown = false;

  console.log('\n── live refresh and stale-render guard ──────────────────');
  window.__ui.use(REPO); window.__ui.open(); await settle();
  await t('an idearium.repo.snapshot.committed event for this repo re-reads the list', async () => {
    const before = calls.filter(c => c === `GET /api/repos/${REPO.uuid}/snapshots`).length;
    window.__ui.event({ type: 'idearium.repo.snapshot.committed', payload: { repoUuid: REPO.uuid, commitId: 'vtm-x' } });
    await settle();
    assert.ok(calls.filter(c => c === `GET /api/repos/${REPO.uuid}/snapshots`).length > before);
  });
  await t('...and one for a DIFFERENT repo does not', async () => {
    const before = calls.length;
    window.__ui.event({ type: 'idearium.repo.snapshot.committed', payload: { repoUuid: 'someone-else' } });
    await settle();
    assert.strictEqual(calls.slice(before).filter(c => /snapshots$/.test(c)).length, 0);
  });
  await t('switching subtab away while a load is in flight does not paint over the new tab', async () => {
    window.__ui.open();                 // starts a load
    window.eval('setRepoSubtab("home")'); // leaves immediately
    await settle();
    assert.ok(!/snapshots \(/.test(d.querySelector('#repo-subtab-home').textContent), 'versionium content leaked into Home');
    assert.strictEqual(window.__ui.subtab(), 'home');
  });

  fs.rmSync(tmpRoot, { recursive: true, force: true });
  for (const u of createdUuids) fs.rmSync(path.join(NODE_DIR, `${u}.repository`), { force: true });
  console.log(`\n${fail ? '✗' : '✓'} mco3-versionium-tab: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
