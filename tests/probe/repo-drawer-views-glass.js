// Clear Glass probe of the repo drawer's Phases · Versions · Machine views (idearium/ui/js/repo-drawer-views.js) — §0.46.0.
// James: "where is any of this? like i dont see any changes." · "always add backend js first, then the ui. can you do that.
// make sure you build the ui."
// The page loads the REAL repo-tasks.js + repo-drawer-views.js + css. The Machine view's answers come from the REAL
// backends (cortex/memory/table-compactor storeReport over a real store dir; ollama/lib/tape runs()/macro() over real
// recorded frames) — the same calls GET /api/store and GET /api/tape make. Driven by Clear Glass, never Playwright.
require(require('path').join(__dirname, '../../lib/test-sandbox.js')).ensure();
const os = require('os'), fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '../..');
process.env.NEXUS_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'rdv-'));
const STORE = fs.mkdtempSync(path.join(os.tmpdir(), 'rdv-store-'));
const SHOT = process.env.PROBE_SHOT_DIR || os.tmpdir();
const U = 'probe-repo-views';
const TC = require(ROOT + '/cortex/memory/table-compactor.js');
const Tape = require(ROOT + '/ollama/lib/tape.js');

(async () => {
  fs.writeFileSync(path.join(STORE, 'event_log.json'), JSON.stringify(Array.from({ length: 2000 }, (_, i) => ({ id: `e${i}`, ts: i }))));
  fs.writeFileSync(path.join(STORE, 'event_log.4242.jsonl'), '{"t":1,"s":1,"id":"x","r":{"id":"x"}}\n');
  process.env.NEXUS_OLLAMA_RUN = 'task-bl15';
  Tape.record({ caller: 'idearium/agent-suite', op: 'generate', model: 'qwen2.5-coder:3b', req: { prompt: 'write lib/notes.js' }, options: { seed: 41 }, res: { text: 'module.exports = {};' }, raw: { eval_count: 40, eval_duration: 2e9, load_duration: 9e8 }, ms: 3100 });
  Tape.record({ caller: 'idearium/agent-suite', op: 'generate', model: 'qwen2.5-coder:3b', req: { prompt: 'write its test' }, options: { seed: 42 }, res: { text: '' }, ms: 45000, ok: false, error: 'ollama sent nothing for 45000 ms' });
  const P = {
    builds: [],
    phases: { summary: { total: 3, complete: 1, ready: 1 }, maps: [{ path: 'docs/notes-phasemap.spec' }], phases: [
      { map: 'docs/notes-phasemap.spec', phase_key: 'NT1', title: 'NT1 · the store', status: 'complete', ready: false, blocked_by: [], runs: 1, lastRun: { state: 'proven', ts: Date.now() - 9e6, provider: 'ollama:qwen:3b' } },
      { map: 'docs/notes-phasemap.spec', phase_key: 'NT2', title: 'NT2 · the api', status: 'planned', ready: true, blocked_by: [], runs: 2, lastRun: { state: 'failed', ts: Date.now() - 6e5, provider: 'claude', error: 'claude: no Claude tab connected — the job waited 300 s in the queue' } },
      { map: 'docs/notes-phasemap.spec', phase_key: 'NT3', title: 'NT3 · the ui', status: 'planned', ready: false, blocked_by: ['NT2'], runs: 0, lastRun: null },
    ] },
  };
  const page = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/ui/css/repo-tasks.css">
<style>:root{--sky:#7dd3fc;--amber:#fbbf24;--text:#d6dde8;--text2:#9aa6b8;--text3:#5f6b7d;--b0:rgba(255,255,255,.06);--b1:rgba(255,255,255,.12);--bg1:#0c1016;--mono:ui-monospace,monospace}body{margin:0;background:#07090d;color:var(--text);font-family:var(--mono);height:100vh}</style></head>
<body><nav id="repo-subnav" style="display:flex;padding:8px"></nav>
<script>const API_BASE='';const CURRENT_API_REPO={uuid:'${U}',name:'notes'};window.toast=()=>{};
async function api(p,o={}){const r=await fetch(API_BASE+p,{headers:{'Content-Type':'application/json'},...o});const d=await r.json();if(!r.ok||d.ok===false)throw new Error(d.error||'failed');return d}
${fs.readFileSync(ROOT + '/idearium/ui/js/app.js', 'utf8').match(/function escapeHtml\(s\)\{[^\n]*\}/)[0]}</script>
<script src="/ui/js/repo-tasks.js"></script><script src="/ui/js/repo-drawer-views.js"></script></body></html>`;
  const srv = http.createServer((q, r) => {
    const j = (o, s = 200) => { r.writeHead(s, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(o)); };
    const u = new URL(q.url, 'http://x');
    if (u.pathname === '/') { r.writeHead(200, { 'Content-Type': 'text/html' }); return r.end(page); }
    if (u.pathname.startsWith('/ui/')) { const f = path.join(ROOT, 'idearium', u.pathname); r.writeHead(200, { 'Content-Type': f.endsWith('.css') ? 'text/css' : 'application/javascript' }); return r.end(fs.readFileSync(f)); }
    if (u.pathname === `/api/repos/${U}/tasks`) return j({ ok: true, tasks: [], running: 0 });
    if (u.pathname === `/api/repos/${U}/phases`) return j({ ok: true, ...P.phases });
    if (u.pathname === `/api/repos/${U}/phases/runs`) return j({ ok: true, runs: [{ phase: 'NT2', map: 'docs/notes-phasemap.spec', state: 'building', ts: Date.now() - 9e5, provider: 'claude' }, { phase: 'NT2', map: 'docs/notes-phasemap.spec', state: 'failed', ts: Date.now() - 6e5, provider: 'claude', error: 'no Claude tab connected' }] });
    if (u.pathname === `/api/repos/${U}/phases/build` && q.method === 'POST') { let b = ''; q.on('data', c => b += c); q.on('end', () => { P.builds.push(JSON.parse(b)); j({ ok: true, runId: 'phrun-x', state: 'building', ladder: { rungs: ['ollama:qwen:3b', 'chatgpt'] } }); }); return; }
    if (u.pathname === `/api/repos/${U}/snapshots`) return j({ ok: true, snapshots: [{ commitId: 'c0ffee1234abcd', ts: Date.now() - 6e4, message: '2 files: lib/notes.js, tests/notes.test.js — by repo_notes', files: { count: 14, bytes: 9000 } }, { commitId: 'beef5678', ts: Date.now() - 6e6, message: 'baseline (import)', files: { count: 12, bytes: 8000 } }] });
    if (u.pathname === '/api/nexus/store') return j({ ok: true, ...TC.storeReport(STORE) });
    if (u.pathname === '/api/nexus/tape') return j({ ok: true, runs: Tape.runs(), replaying: null });
    if (u.pathname.startsWith('/api/nexus/tape/')) return j({ ok: true, run: decodeURIComponent(u.pathname.split('/').pop()), steps: Tape.macro(decodeURIComponent(u.pathname.split('/').pop())) });
    j({ ok: false, error: 'no route ' + q.url }, 404);
  });
  let pass = 0, fail = 0; const check = (n, c, x = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + ' ' + x); } };
  await new Promise(res => srv.listen(0, '127.0.0.1', res));
  const { chromium } = require(ROOT + '/clear-glass/src/driver/glass.js');
  const br = await chromium.launch();
  try {
    const pg = await br.newPage({ viewport: { width: 1100, height: 760 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(`http://127.0.0.1:${srv.address().port}/`);
    await pg.evaluate(() => { rtRepoShown(CURRENT_API_REPO); rtToggleDrawer(true); });
    await pg.waitForTimeout(300);
    const views = (await pg.locator('.rt-view').allTextContents()).map(t => t.trim());
    check('the drawer has six views: tasks, log, control, phases, versions, machine', ['Background tasks', 'Activity log', 'Control', 'Phases', 'Versions', 'Machine'].every(v => views.includes(v)), JSON.stringify(views));

    await pg.click('.rt-view:has-text("Phases")'); await pg.waitForTimeout(400);
    const ph = await pg.locator('#rt-list').innerText();
    check('Phases: each phase, done / ready / blocked, under its phasemap', /notes-phasemap\.spec/i.test(ph) && /NT1/.test(ph) && /NT2/.test(ph) && /after NT2/.test(ph), ph.slice(0, 300));
    check('Phases: why the last run stopped is on the phase', /stopped: claude: no Claude tab connected/.test(ph), ph.slice(0, 400));
    const btns = await pg.evaluate(() => [...document.querySelectorAll('#rt-list .rt-proc')].map(r => [r.querySelector('b') && r.querySelector('b').textContent, [...r.querySelectorAll('.rt-act')].some(b => /build/.test(b.textContent))]));
    check('Phases: a done phase has no build button; the others do', JSON.stringify(btns) === JSON.stringify([['NT1', false], ['NT2', true], ['NT3', true]]), JSON.stringify(btns));
    await pg.evaluate(() => [...document.querySelectorAll('#rt-list .rt-proc')].find(r => /NT2/.test(r.textContent)).querySelector('.rt-act').click()); await pg.waitForTimeout(300);
    check('Phases: its runs open under it, each with its error', /no Claude tab connected/.test(await pg.locator('#rt-list').innerText()) && /building/.test(await pg.locator('#rt-list').innerText()));
    await pg.evaluate(() => [...[...document.querySelectorAll('#rt-list .rt-proc')].find(r => /NT2/.test(r.textContent)).querySelectorAll('.rt-act')].find(b => /build/.test(b.textContent)).click()); await pg.waitForTimeout(400);
    check('Phases: ▶ build starts it through POST phases/build with its map and phase', P.builds.length === 1 && P.builds[0].phase === 'NT2' && P.builds[0].map === 'docs/notes-phasemap.spec', JSON.stringify(P.builds));
    if (process.env.PROBE_SHOT !== '0') await pg.screenshot({ path: path.join(SHOT, 'rdv-phases.png') });

    await pg.click('.rt-view:has-text("Versions")'); await pg.waitForTimeout(400);
    const vs = await pg.locator('#rt-list').innerText();
    check('Versions: every commit — id, when, what changed, by whom', /c0ffee1234/.test(vs) && /lib\/notes\.js, tests\/notes\.test\.js — by repo_notes/.test(vs) && /baseline/.test(vs), vs.slice(0, 300));
    if (process.env.PROBE_SHOT !== '0') await pg.screenshot({ path: path.join(SHOT, 'rdv-versions.png') });

    await pg.click('.rt-view:has-text("Machine")'); await pg.waitForTimeout(500);
    const mc = await pg.locator('#rt-list').innerText();
    check('Machine: the store by table — size, segments, its cap (the real storeReport)', /event_log/.test(mc) && /1 segment/.test(mc) && /cap 50,000/.test(mc), mc.slice(0, 400));
    check('Machine: the Ollama tape — the run, its calls and the failed one (the real runs())', /2 call\(s\)/.test(mc) && /1 failed/.test(mc) && /qwen2\.5-coder:3b/.test(mc), mc.slice(0, 500));
    await pg.click('.rt-proc:has-text("2 call(s)") .rt-act'); await pg.waitForTimeout(400);
    const mac = await pg.locator('#rt-list').innerText();
    check("Machine: a run opens to its macro — each call, seed, tok/s, asked and answered, the failure said", /seed 41/.test(mac) && /20 tok\/s/.test(mac) && /asked \(18 chars\)/.test(mac) && /answered \(20 chars\)/.test(mac) && /ollama sent nothing/.test(mac) && /NEXUS_OLLAMA_REPLAY=task-bl15/.test(mac), mac.slice(0, 700));
    await pg.click('details summary:has-text("asked")'); await pg.waitForTimeout(100);
    check('Machine: what was asked opens in full', await pg.locator('.rt-pre:has-text("write lib/notes.js")').isVisible());
    if (process.env.PROBE_SHOT !== '0') await pg.screenshot({ path: path.join(SHOT, 'rdv-machine.png') });

    await pg.evaluate(() => { rtToggleDrawer(false); rtToggleDrawer(true); }); await pg.waitForTimeout(400);
    check('reopened, the drawer comes back on the view it was on, loaded', /event_log/.test(await pg.locator('#rt-list').innerText()));
    check('no page errors', errs.length === 0, errs.join('; '));
  } finally { await br.close(); srv.close(); }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
