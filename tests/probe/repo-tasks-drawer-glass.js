// Clear Glass probe of a repo's Tasks drawer and its Activity log view (idearium/ui/js/repo-tasks.js + css) — §0.39.369 AL2.
// James: "the background tasks, i want that for each repo" · "I also want to have a full extensive activity log in each repo."
// The page loads the REAL repo-tasks.js/css; GET /api/repos/:uuid/tasks and /activity are served by the REAL
// lib/repo-activity.js and lib/activity-log/compartment.js (the same calls idearium/api/index.js's cases make).
// Driven through Clear Glass's own engine (clear-glass/src/driver/glass.js), never Playwright (AXIOMS §4.1).
require(require('path').join(__dirname, '../../lib/test-sandbox.js')).ensure();
const os = require('os'), fs = require('fs'), path = require('path'), http = require('http');
process.env.JAA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-probe-'));
const ROOT = path.join(__dirname, '../..');
const RAct = require(ROOT + '/lib/repo-activity.js');
const AL = require(ROOT + '/lib/activity-log/compartment.js');
const U = 'probe-repo-rt';
const SHOT = process.env.PROBE_SHOT_DIR || os.tmpdir();

(async () => {
  // the scenario from James's log: phase BL15 — the 3b wrote nothing, the 7b and 16b skipped for memory, chatgpt writing
  RAct.phaseRow({ uuid: 'phrun-p-1-started', runId: 'phrun-p-1', repoUuid: U, map: 'nexus/core', phase: 'BL15', state: 'building', ts: Date.now() - 300000 });
  await RAct.run({ repoUuid: U, hat: 'repo_probe', session: 'phrun-p-1', message: 'Build phase BL15', provider: 'ollama:qwen:3b' }, async () => ({ ok: false, error: 'the reply changed no file' }));
  RAct.phaseRow({ uuid: 'phrun-p-1-incomplete', runId: 'phrun-p-1', repoUuid: U, state: 'incomplete', provider: 'ollama:qwen:3b', rung: 1, rungs: 4, error: 'the reply changed no file', ts: Date.now() });
  RAct.phaseRow({ uuid: 'phrun-p-1-r2t1-skipped', runId: 'phrun-p-1', repoUuid: U, state: 'skipped', memorySkip: true, provider: 'ollama:qwen:7b', rung: 2, rungs: 4, error: 'not enough memory to load it now — needs ~5.3GB; 1.3GB available', ts: Date.now() });
  const live = RAct.begin({ repoUuid: U, hat: 'repo_probe', session: 'phrun-p-1-r4t1', message: 'Build phase BL15', provider: 'chatgpt' });
  AL.record({ compartment: U, kind: 'inject.proposed', status: 'proposed', actor: 'repo_probe', title: 'lib/agent-tools/index.js — proposed', ref: 'inj-1' });
  AL.record({ compartment: U, kind: 'inject.reverted', status: 'reverted', actor: 'person', title: 'lib/agent-tools/index.js — reverted', ref: 'inj-0', detail: 'a bare path, not code' });
  AL.record({ compartment: U, kind: 'fault.wrote-nothing', status: 'failed', actor: 'ollama:qwen:3b', title: 'wrote-nothing · BL15 — the reply changed no file', ref: 'f-1' });
  for (let i = 0; i < 85; i++) AL.record({ compartment: U, kind: 'task.chat', status: 'ok', actor: 'chatgpt', title: `chat — earlier message ${i}`, ts: Date.now() - 86400000 * 2 - i * 60000 });

  const page = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/ui/css/repo-tasks.css">
<style>:root{--sky:#7dd3fc;--sky2:#bae6fd;--amber:#fbbf24;--violet:#a78bfa;--text:#d6dde8;--text2:#9aa6b8;--text3:#5f6b7d;--b0:rgba(255,255,255,.06);--b1:rgba(255,255,255,.12);--bg1:#0c1016;--mono:ui-monospace,monospace}body{margin:0;background:#07090d;color:var(--text);font-family:var(--mono);height:100vh}</style></head>
<body><nav id="repo-subnav" style="display:flex;padding:8px"></nav>
<script>const API_BASE='';const CURRENT_API_REPO={uuid:'${U}',name:'nexus/core'};
async function api(p,o={}){const r=await fetch(API_BASE+p,{headers:{'Content-Type':'application/json'},...o});const d=await r.json();if(!r.ok||d.ok===false)throw new Error(d.error||'failed');return d}
${fs.readFileSync(ROOT + '/idearium/ui/js/app.js', 'utf8').match(/function escapeHtml\(s\)\{[^\n]*\}/)[0]}</script>
<script src="/ui/js/repo-tasks.js"></script></body></html>`;
  const srv = http.createServer((q, r) => {
    const j = (o, s = 200) => { r.writeHead(s, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(o)); };
    const u = new URL(q.url, 'http://x');
    if (u.pathname === '/') { r.writeHead(200, { 'Content-Type': 'text/html' }); return r.end(page); }
    if (u.pathname.startsWith('/ui/')) { const f = path.join(ROOT, 'idearium', u.pathname); r.writeHead(200, { 'Content-Type': f.endsWith('.css') ? 'text/css' : 'application/javascript' }); return r.end(fs.readFileSync(f)); }
    if (u.pathname === `/api/repos/${U}/tasks`) return j({ ok: true, ...RAct.list(U, { limit: 120 }) });
    if (u.pathname === `/api/repos/${U}/activity`) {
      const p = Object.fromEntries(u.searchParams);
      return j({ ok: true, ...AL.list(U, { kind: p.kind || null, actor: p.actor || null, status: p.status || null, q: p.q || null, before: Number(p.before) || null, limit: Number(p.limit) || 100 }), ...(p.facets ? { facets: AL.facets(U) } : {}) });
    }
    // §0.39.372 NC2 — the Control view's routes: a guardian system repo, its desktop running with one checkpoint
    if (u.pathname === `/api/repos/${U}/system` && q.method === 'GET') return j({ ok: true, system: 'guardian', supervisor: 'autopilot', processes: [{ name: 'guardian', status: CTL.status, pid: 4242, port: 7820, restarts: 2, crashesInWindow: 0 }] });
    if (u.pathname === `/api/repos/${U}/desktop` && q.method === 'GET') return j({ ok: true, state: 'running' });
    if (u.pathname === `/api/repos/${U}/desktop/checkpoints`) return j({ ok: true, checkpoints: [{ tag: 'cp-abc1-x1y2', label: 'before build BL15', ts: Date.now() - 60000, present: true }] });
    if (q.method === 'POST' && u.pathname.startsWith(`/api/repos/${U}/`)) { let b = ''; q.on('data', c => b += c); q.on('end', () => { CTL.posts.push({ path: u.pathname.slice(`/api/repos/${U}/`.length), body: b ? JSON.parse(b) : {} }); if (/system\/stop/.test(u.pathname)) CTL.status = 'held'; j({ ok: true }); }); return; }
    j({ ok: false, error: 'no route ' + q.url }, 404);
  });
  const CTL = { status: 'stable', posts: [] };
  let pass = 0, fail = 0; const check = (n, c, x = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + ' ' + x); } };
  await new Promise(res => srv.listen(0, '127.0.0.1', res));
  const { chromium } = require(ROOT + '/clear-glass/src/driver/glass.js');
  const br = await chromium.launch();
  try {
    const pg = await br.newPage({ viewport: { width: 1100, height: 760 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(`http://127.0.0.1:${srv.address().port}/`);
    await pg.evaluate(() => { rtRepoShown(CURRENT_API_REPO); rtToggleDrawer(true); });
    await pg.waitForTimeout(300);
    check('the Tasks button counts what is running (1: the phase, with its attempt)', (await pg.locator('#rt-btn-count').textContent()).trim() === '1');
    check('Tasks view: the phase and its attempts', await pg.locator('.rt-row.rt-running .rt-k-phase').count() === 1);
    await pg.click('text=Activity log'); await pg.waitForTimeout(300);
    const n = await pg.locator('.rt-lrow').count();
    check(`Log view: the newest page, paged (${n} rows, older… offered)`, n === 80 && await pg.locator('.rt-more').count() === 1);
    check('rows by day, newest first', await pg.locator('.rt-day').count() >= 2);
    if (process.env.PROBE_SHOT !== '0') await pg.screenshot({ path: path.join(SHOT, 'rt-log.png') });
    await pg.click('.rt-more'); await pg.waitForTimeout(300);
    check('older… loads the next page back', await pg.locator('.rt-lrow').count() > 80);
    await pg.click('.rt-f:has-text("inject")'); await pg.waitForTimeout(300);
    check('a kind chip filters (inject: proposed + reverted)', await pg.locator('.rt-lrow').count() === 2);
    await pg.click('.rt-lrow:has-text("reverted")'); await pg.waitForTimeout(100);
    check('a row opens to its detail (the reason it was undone)', await pg.locator('.rt-lrow .rt-body:has-text("a bare path")').count() === 1);
    await pg.click('.rt-f:has-text("all")'); await pg.waitForTimeout(300);
    await pg.click('.rt-f:has-text("failed")'); await pg.waitForTimeout(300);
    const failedTitles = await pg.locator('.rt-lrow .rt-ltitle').allTextContents();
    check(`failed shows only failures (${failedTitles.length})`, failedTitles.length >= 2 && failedTitles.some(t => /wrote-nothing/.test(t)));
    await pg.click('.rt-f:has-text("failed")'); await pg.waitForTimeout(300);
    await pg.fill('.rt-q', 'memory'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300);
    check('search finds the memory skip', (await pg.locator('.rt-lrow .rt-ltitle').allTextContents()).some(t => /not enough memory/.test(t)));
    await pg.fill('.rt-q', ''); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300);
    const before = await pg.locator('.rt-lrow').count();
    RAct.end(live, { ok: true, text: 'x'.repeat(300), injects: { injects: [{ path: 'lib/agent-tools/index.js' }] } });
    const row = AL.list(U, { limit: 1 }).rows[0];
    await pg.evaluate((p) => rtLogIn(p), { repoUuid: U, row });
    check('a row written now arrives live at the top', await pg.locator('.rt-lrow').count() === before + 1 && /done in/.test((await pg.locator('.rt-lrow .rt-ltitle').allTextContents())[0]));
    // the Control view
    await pg.evaluate(() => { window.confirm = () => true; window.toast = () => {}; });
    await pg.click('text=Control'); await pg.waitForTimeout(300);
    check('Control: the system\'s process as the supervisor sees it', await pg.locator('.rt-proc:has-text("pid 4242")').count() === 1);
    await pg.click('.rt-act:has-text("restart")'); await pg.waitForTimeout(300);
    check('restart asks the supervisor through the repo\'s system route', CTL.posts.some(p => p.path === 'system/restart' && p.body.process === 'guardian'));
    await pg.click('.rt-act:has-text("stop")'); await pg.waitForTimeout(300);
    check('a stopped system offers start (and no stop)', (await pg.locator('.rt-act').allTextContents()).filter(t => t.trim() === '▶ start').length === 1 && !(await pg.locator('.rt-act').allTextContents()).some(t => /stop/.test(t)));
    await pg.click('.rt-act:has-text("checkpoint now")'); await pg.waitForTimeout(300);
    check('the desktop: checkpoint by hand', CTL.posts.some(p => p.path === 'desktop/checkpoint'));
    check('its checkpoints, each with rewind', await pg.locator('.rt-proc:has-text("before build BL15") .rt-rewind').count() === 1);
    if (process.env.PROBE_SHOT !== '0') await pg.screenshot({ path: path.join(SHOT, 'rt-control.png') });
    check('no page errors', errs.length === 0, errs.join('; '));
  } finally { await br.close(); srv.close(); }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
