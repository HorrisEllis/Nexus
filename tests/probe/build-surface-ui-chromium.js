'use strict';
/**
 * tests/probe/build-surface-ui-chromium.js — 0.39.280 BS8–BS11 in a real page (Clear Glass's engine). The REAL
 * file-manage.js, living-spec.js (build bar), plan-panel.js and repo-environment.js, with the REAL idearium CSS, over a
 * stub API whose answers have the shapes api/build-surface.js returns (those are proven by test-build-surface.test.js).
 * Not the whole idearium page.
 */
const fs = require('fs'), path = require('path'), http = require('http');
const { start } = require('./_glass-probe.js');
const P = start();
const ROOT = P.ROOT;
const U = 'r1';
const posts = [];
const css = P.read('idearium/ui/css/nexus-theme.css') + '\n' + (P.read('idearium/ui/index.html').match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
const page = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div id="file-tree"></div><div id="ide-tabs"></div><div id="ide-code"></div><textarea id="ide-editor"></textarea>
<div id="repo-living-spec"></div><div id="repo-subtab-git"><div class="ds"><input id="gi"><select id="gs"><option>x</option></select><textarea id="gt"></textarea><pre id="gp">log</pre></div></div><input id="ref" class="field-input"><div id="repo-build-start"></div><div id="repo-env-section"></div>
<script>
const API_BASE = '';
let CURRENT_API_REPO = { uuid: '${U}', name: 'lock', files: [{ path: 'src/a.js', bytes: 10 }, { path: 'src/b.js', bytes: 5 }] };
let ACTIVE_API_FILE = 'src/a.js', CURRENT_REPO_SUBTAB = 'spec', CS = { uuid: '${U}', q: 'lock', hits: [{ file: 'src/c.js', line: 3, name: 'useLock' }] };
window.__toasts = [];
function toast(m, t) { window.__toasts.push([m, t]); }
async function api(p, o = {}) { const r = await fetch(p, { headers: { 'Content-Type': 'application/json' }, ...o }); const d = await r.json(); if (!r.ok || d.ok === false) throw new Error(d.error || 'failed'); return d; }
${P.read('idearium/ui/js/app.js').match(/function escapeHtml\(s\)\{[^\n]*\}/)[0]}
function renderApiRepoPanel(repo) {   // the tree rows app.js draws, with the same hooks
  const all = [...repo.files, ...pendingOnlyFiles(repo)];
  document.getElementById('file-tree').innerHTML = all.map(f => { const m = fileStateMark(f.path); return '<div class="tree-node file' + m.cls + '" data-p="' + f.path + '">' + f.path + m.mark + '</div>'; }).join('') + '<div id="sum">' + fileStatesSummary() + '</div>';
  loadFileStates(repo);
}
function setRepoSubtab() {}
function openSettingsConsole() {}
</script>
<script src="/js/file-manage.js"></script><script src="/js/living-spec.js"></script><script src="/js/plan-panel.js"></script><script src="/js/repo-environment.js"></script>
</body></html>`;
const plan = { exists: true, valid: true, problems: [], mapPath: 'spec/lock-phasemap.spec', layers: ['foundation', 'library', 'api', 'cli', 'automation', 'ui'], next: 'LK1_lib',
  phases: [{ id: 'LK0_store', key: 'LK0', layer: 'foundation', status: 'done', axioms: ['§3.1'], does: 'store' }, { id: 'LK1_lib', key: 'LK1', layer: 'library', status: 'pending', axioms: [], does: 'lib' }] };
const srv = http.createServer((q, r) => { let b = ''; q.on('data', c => b += c); q.on('end', () => {
  const j = (o, s = 200) => { r.writeHead(s, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(o)); };
  const u = q.url;
  if (u === '/') { r.writeHead(200, { 'Content-Type': 'text/html' }); return r.end(page); }
  if (u.startsWith('/js/')) { r.writeHead(200, { 'Content-Type': 'application/javascript' }); return r.end(fs.readFileSync(path.join(ROOT, 'idearium/ui', u))); }
  if (q.method === 'POST') posts.push([u, b ? JSON.parse(b) : {}]);
  if (u === `/api/repos/${U}/files/state`) return j({ ok: true, states: { 'src/a.js': { state: 'modified', pending: ['i1'] }, 'src/b.js': { state: 'committed' }, 'src/new.js': { state: 'pending', pending: ['i2'] } }, counts: { modified: 1, pending: 1, committed: 1, withProposals: 2 }, versionNote: null });
  if (u.startsWith(`/api/repos/${U}/spec/plan?`)) return j({ ok: true, ...plan });
  if (u === `/api/repos/${U}/deviation`) return j({ ok: true, reason: 'version', ts: 1, fromBaseline: { fraction: 0.25, added: 1, removed: 0, changed: 2 }, sinceVersion: { fraction: 0.05, added: 0, removed: 0, changed: 1 } });
  if (u === `/api/repos/${U}/spec/build`) return j({ ok: true, phase: 'LK1_lib', layer: 'library', snapshot: 'vtm-abc', targetName: 'lock', mapPath: plan.mapPath, runId: 'phrun-1' });
  if (u === `/api/repos/${U}/manage`) return j({ ok: true, runId: 'manage-1', snapshot: 'vtm-m', state: 'building' });
  if (u.startsWith(`/api/repos/${U}/plan`)) return j({ ok: true, gates: ['mapped', 'snapshot', 'dispatched', 'replied', 'landed', 'closed'], summary: { total: 2, complete: 1, building: 1, failed: 0, progress: 0.75, current: 'LK1_lib' },
    steps: [{ key: 'LK0_store', map: plan.mapPath, title: 'store', layer: 'foundation', status: 'complete', gates: [1, 1, 1, 1, 1, 1].map((x, i) => ({ gate: String(i), passed: true })), gate: null, progress: 1, ledger: [] },
      { key: 'LK1_lib', map: plan.mapPath, title: 'lib', layer: 'library', status: 'active', current: true, run: { runId: 'phrun-1', state: 'building' }, gates: [1, 1, 1, 0, 0, 0].map((x, i) => ({ gate: ['mapped', 'snapshot', 'dispatched', 'replied', 'landed', 'closed'][i], passed: !!x })), gate: 'replied', progress: 0.5,
        ledger: [{ ts: 1, runId: 'phrun-1', state: 'building', snapshot: 'vtm-abc', injected: [] }] }] });
  if (u === `/api/repos/${U}/phases/runs`) return j({ ok: true, runs: [{ runId: 'phrun-1', map: plan.mapPath, phase: 'LK1_lib', state: 'building', ts: 1 }] });
  if (u === `/api/repos/${U}/living-spec`) return j({ ok: true, specs: [{ path: 'spec/lock.spec' }] });
  if (u === `/api/repos/${U}/environment` && q.method === 'GET') return j({ ok: true, options: { ramMB: 2048 }, catalogue: require(path.join(ROOT, 'cos/testenv/environment.js')).options(),
    check: { ok: true, ready: false, checkedAt: 1, downloaded: { ok: true, files: 2 }, configured: { ok: false, stacks: [{ stack: 'node', installed: false, detail: '1 of 1 dependencies not installed here: leftpad' }] }, vm: { available: true, baseImage: 'base.qcow2', runtimes: ['node'], missing: [], extras: [] }, todo: ['node: 1 of 1 dependencies not installed here'], plan: { describe: 'node', install: [{ command: 'npm install', why: '1 dependency' }], suite: [{ command: 'npm test' }], gaps: [] } } });
  if (u === `/api/repos/${U}/environment`) return j({ ok: true, options: JSON.parse(b).options, dropped: [] });
  j({ ok: false, error: 'no route ' + u }, 404);
}); });
srv.listen(0, '127.0.0.1', async () => {
  const b = await P.glass.chromium.launch(); const pg = await b.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(`http://127.0.0.1:${srv.address().port}/`);
  await pg.evaluate(() => renderApiRepoPanel(CURRENT_API_REPO));
  await pg.waitForTimeout(400);
  const tree = await pg.evaluate(() => [...document.querySelectorAll('.tree-node')].map(e => ({ p: e.dataset.p, cls: e.className, op: getComputedStyle(e).opacity, tags: [...e.querySelectorAll('.fs-tag')].map(t => t.textContent) })));
  const pend = tree.find(t => t.p === 'src/new.js');
  P.case('BS8: a proposal-only file is listed and greyed; a modified file is marked M with its proposal P', pend && /fs-row-pending/.test(pend.cls) && Number(pend.op) < 0.6 && tree.find(t => t.p === 'src/a.js').tags.join('') === 'MP', { tree });
  P.case('BS8: the summary names what is uncommitted', /1 modified · 1 pending · 2 proposals/.test(await pg.evaluate(() => document.getElementById('sum').textContent)));
  await pg.evaluate(() => { const ta = document.getElementById('ide-editor'); ta.value = 'a\nb\nc\nd\n'; ta.setSelectionRange(2, 5); openManagePanel(); });
  const mg = await pg.evaluate(() => ({ acts: document.querySelectorAll('.manage-act').length, from: document.getElementById('mg-from').value, to: document.getElementById('mg-to').value, hits: document.querySelectorAll('.manage-hit').length }));
  P.case('BS8: Manage opens with every action, the selected lines prefilled and the Code tab\'s hits as related code', mg.acts === 10 && mg.from === '2' && mg.to === '3' && mg.hits === 1, mg);
  await pg.evaluate(() => { document.querySelector('.manage-act[data-a="debug"]').click(); return submitManage(); });
  const mp = posts.find(x => x[0].endsWith('/manage'));
  P.case('BS8: sent as one job: the file, the action, the lines, the related code', mp && mp[1].action === 'debug' && mp[1].from === '2' && mp[1].to === '3' && mp[1].refs[0].file === 'src/c.js', { body: mp && mp[1] });
  // BS9 + BS11
  await pg.evaluate(() => { LSPEC.uuid = CURRENT_API_REPO.uuid; LSPEC.path = 'spec/lock.spec'; document.getElementById('repo-living-spec').innerHTML = '<div id="ls-build"></div>'; return specBuildLoad('spec/lock.spec'); });
  const bar = await pg.evaluate(() => ({ go: (document.querySelector('.ls-go') || {}).textContent, rows: document.querySelectorAll('.ls-ph').length, dev: (document.querySelector('.ls-dev') || {}).textContent || '' }));
  P.case('BS9: the spec\'s build bar: Build next names the next phase and its layer; phases bottom-up; the deviation line', /Build next · LK1 \(library\)/.test(bar.go) && bar.rows === 2 && /from baseline 25\.0%/.test(bar.dev) && /since last version 5\.0%/.test(bar.dev), bar);
  await pg.evaluate(() => specBuildPhase(null));
  await pg.waitForTimeout(300);
  const pp = await pg.evaluate(() => ({ open: document.getElementById('plan-panel').classList.contains('open'), tasks: document.querySelectorAll('.pp-task').length, cur: document.querySelectorAll('.pp-g.cur').length, sub: document.getElementById('pp-sub').textContent, led: document.querySelectorAll('.pp-led').length }));
  P.case('BS9→BS11: building opens the plan panel: tasks with gates as progress, the current gate pulsing, its ledger expanded (focused run)', pp.open && pp.tasks === 2 && pp.cur === 1 && /1\/2 done/.test(pp.sub) && pp.led === 1, pp);
  await pg.evaluate(() => renderBuildStart(CURRENT_API_REPO)); await pg.waitForTimeout(300);
  P.case('BS11: the build-start card lists the spec with its progress', await pg.evaluate(() => /1\/2 phases · next LK1/.test(document.getElementById('repo-build-start').textContent)));
  // BS10
  await pg.evaluate(() => renderRepoEnvironment(CURRENT_API_REPO)); await pg.waitForTimeout(300);
  const env = await pg.evaluate(() => ({ t: document.getElementById('repo-env-section').textContent, rows: document.querySelectorAll('.env-row').length }));
  P.case('BS10: environment: not ready, why, the install plan, every option', /not ready/.test(env.t) && /leftpad/.test(env.t) && /npm install/.test(env.t) && env.rows >= 15, { rows: env.rows });
  await pg.evaluate(() => { const i = [...document.querySelectorAll('.env-row')].find(r => r.querySelector('.env-k').textContent === 'cpus').querySelector('input'); i.value = '6'; i.dispatchEvent(new Event('change')); return envSave(); });
  const ep = posts.find(x => x[0].endsWith('/environment'));
  P.case('BS10: an edited option is saved with the others kept', ep && ep[1].options.cpus === '6' && ep[1].options.ramMB === 2048, { body: ep && ep[1] });
  // BS18
  const th = await pg.evaluate(() => { const cs = (id) => getComputedStyle(document.getElementById(id)); const ref = cs('ref');
    return { ref: [ref.backgroundColor, ref.color, ref.fontFamily], gi: [cs('gi').backgroundColor, cs('gi').color, cs('gi').fontFamily], gs: cs('gs').backgroundColor, gt: cs('gt').backgroundColor, gp: cs('gp').color, body: getComputedStyle(document.body).backgroundColor }; });
  P.case('BS18: Sync & CI controls wear the shared field style (same background, text colour, font as .field-input)', JSON.stringify(th.gi) === JSON.stringify(th.ref) && th.gs === th.ref[0] && th.gt === th.ref[0] && th.gp !== 'rgb(0, 0, 0)', th);
  P.case('no page errors', errs.length === 0, { errs });
  await b.close(); srv.close(); P.done();
});
