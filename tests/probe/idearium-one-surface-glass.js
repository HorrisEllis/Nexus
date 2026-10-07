// Clear Glass probe of IDEARIUM ITSELF — §0.47.0 OS6 (docs/2026-10-07-idearium-one-surface-phasemap.spec).
// James: "stop, this is idearium. not sure what that is." · "needs to not be overwhelming, clean and beautiful" · "all agent
// options go into the agents tab" · "look in the agent settings and plan, and code tab for the propals" · "the spec engine
// needs to have autocomplete for the areas that are blank".
// Not a stub page: Idearium's REAL index.html, every real script, served by the REAL Idearium API (startAPI) on a sandboxed
// store. Versionium's own routes are served on its port; cortex's /api/store and ollama's /api/tape are answered by their
// real handlers (cortex/memory/table-compactor storeReport, ollama/routes/tape.js) on their configured ports.
// Driven by Clear Glass's engine (clear-glass/src/driver/glass.js), never Playwright (AXIOMS §4.1).
process.env.NEXUS_VERSION_SETTLE_MS = '150';
require(require('path').join(__dirname, '../../lib/test-sandbox.js')).ensure();
const os = require('os'), fs = require('fs'), path = require('path'), http = require('http'), net = require('net');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '../..');
const SHOT = process.env.PROBE_SHOT_DIR || os.tmpdir();
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

(async () => {
  const ports = require(path.join(ROOT, 'lib/nexus-config.js')).getPath('ports', {});
  const servers = [];
  const serve = (port, handler) => new Promise((res, rej) => { const s = http.createServer(handler); s.once('error', rej); s.listen(port, '127.0.0.1', () => { servers.push(s); res(); }); });
  // versionium: its own routes
  const vr = [require(path.join(ROOT, 'versionium/routes/versionium.js')), require(path.join(ROOT, 'versionium/routes/files.js'))];
  await serve(ports.versionium, async (req, rs) => { const url = new URL(req.url, 'http://x'); const ctx = { method: req.method, url, pathname: url.pathname };
    for (const r of vr) { try { if (await r.handle(req, rs, ctx)) return; } catch (_) { rs.writeHead(500); rs.end('{}'); return; } } rs.writeHead(404); rs.end('{}'); });
  // cortex /api/store and ollama /api/tape: their real handlers
  const TC = require(path.join(ROOT, 'cortex/memory/table-compactor.js'));
  await serve(ports.cortex, (req, rs) => { rs.writeHead(200, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify({ ok: true, ...TC.storeReport(process.env.JAA_DATA_DIR) })); });
  const TapeRoutes = require(path.join(ROOT, 'ollama/routes/tape.js'));
  await serve(ports.ollama, async (req, rs) => { const url = new URL(req.url, 'http://x'); if (!(await TapeRoutes.handle(req, rs, { method: req.method, url, pathname: url.pathname }))) { rs.writeHead(404); rs.end('{}'); } });

  process.env.IDEARIUM_PORT = String(await freePort());
  const api = await quiet(() => import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href));
  const R = (m, p, b) => quiet(() => api._route(m, p, b));
  // a repo made the way James makes one: an idea in the workshop, saved — with one part left blank
  const w0 = (await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: 'Orchard Ledger' })).json.workshop;
  await R('POST', `/api/workshop/${w0.uuid}`, { sections: [{ id: 'purpose', body: 'Track every tree in an orchard.' }, { add: true, title: 'Data schema', body: 'A tree has a species, a row and a planted date.' }, { add: true, title: 'Integration', body: '' }] });
  const U = (await R('POST', `/api/workshop/${w0.uuid}/save`, {})).json.repoUuid;
  const RV = require(path.join(ROOT, 'lib/repo-versions.js')), RAct = require(path.join(ROOT, 'lib/repo-activity.js'));
  await quiet(() => RV.flush(U));
  await RAct.run({ repoUuid: U, hat: 'repo_orchard', kind: 'chat', message: 'write the tree store' }, async () => {
    await R('POST', `/api/repos/${U}/file`, { path: 'src/trees.js', content: 'module.exports = { trees: [] };\n' });
    return { ok: true };
  });
  await quiet(() => RV.flush(U));
  await R('POST', `/api/repos/${U}/file`, { path: 'src/trees.js', content: 'module.exports = { trees: [], add(t) { this.trees.push(t); } };\n' });
  await quiet(() => RV.flush(U));
  await R('POST', `/api/repos/${U}/injects`, { path: 'src/rows.js', content: 'module.exports = { rows: 12 };\n' });   // a proposal waiting
  const Tape = require(path.join(ROOT, 'ollama/lib/tape.js'));
  Tape.record({ caller: 'idearium/agent-suite', op: 'generate', model: 'qwen2.5-coder:3b', req: { prompt: 'write src/trees.js' }, options: { seed: 7 }, res: { text: 'module.exports = {};' }, raw: { eval_count: 30, eval_duration: 1e9 }, ms: 1200 });

  await quiet(() => api.startAPI());
  await new Promise(r => setTimeout(r, 600));
  const BASE = `http://127.0.0.1:${process.env.IDEARIUM_PORT}`;

  let pass = 0, fail = 0; const check = (n, c, x = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + ' ' + x); } };
  const { chromium } = require(ROOT + '/clear-glass/src/driver/glass.js');
  const br = await chromium.launch();
  try {
    const pg = await br.newPage({ viewport: { width: 1600, height: 960 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(`${BASE}/`);
    for (let i = 0; i < 40 && !(await pg.evaluate((u) => typeof API_REPOS !== 'undefined' && API_REPOS.some(r => r.uuid === u), U)); i++) await pg.waitForTimeout(250);
    check('the real Idearium page connects to the real API and lists the repo', await pg.evaluate((u) => API_REPOS.some(r => r.uuid === u), U));
    await pg.evaluate((u) => { setView('repo'); enterRepoDetail(u); }, U); await pg.waitForTimeout(800);
    check('no Tasks button, no second drawer — one surface', await pg.evaluate(() => !document.getElementById('rt-btn') && !document.getElementById('rt-drawer')));

    // the Plan panel holds tasks · log · control · versions · machine
    await pg.evaluate(() => { localStorage.setItem('idearium.rt.view', 'log'); RT_VIEW = 'log'; openPlanPanel(); }); await pg.waitForTimeout(800);
    await pg.evaluate(() => rtToggleDrawer(true)); await pg.waitForTimeout(900);
    const views = await pg.evaluate(() => [...document.querySelectorAll('#plan-panel #pp-log .rt-view')].map(b => b.textContent.trim()));
    check('the Plan panel\'s activity section: tasks · log · control · versions · machine', JSON.stringify(views) === JSON.stringify(['tasks', 'log', 'control', 'versions', 'machine']), JSON.stringify(views));
    const log = await pg.evaluate(() => document.querySelector('#plan-panel #rt-list').innerText);
    check('log: the repo\'s activity (the agent\'s write is a commit, by its hat)', /commit/.test(log) && /repo_orchard/.test(log), log.slice(0, 300));
    if (process.env.PROBE_SHOT !== '0') await pg.screenshot({ path: path.join(SHOT, 'idearium-plan-log.png') });
    await pg.evaluate(() => rtView('versions')); await pg.waitForTimeout(900);
    const vs = await pg.evaluate(() => document.querySelector('#plan-panel #rt-list').innerText);
    check('versions: the commits, newest first, with the files they touched', /trees\.js/.test(vs), vs.slice(0, 300));
    await pg.evaluate(() => rtView('machine')); await pg.waitForTimeout(1200);
    const mc = await pg.evaluate(() => document.querySelector('#plan-panel #rt-list').innerText);
    check('machine: cortex\'s store and the Ollama tape, through Idearium', /MEMORY STORE|memory store/i.test(mc) && /qwen2\.5-coder:3b/.test(mc), mc.slice(0, 300));
    if (process.env.PROBE_SHOT !== '0') await pg.screenshot({ path: path.join(SHOT, 'idearium-plan-machine.png') });
    await pg.evaluate(() => closePlanPanel());

    // the Code tab: the open file's history; versions opens the Plan on that file
    await pg.evaluate(() => setRepoSubtab('code')); await pg.waitForTimeout(800);
    await pg.evaluate(() => csOpen('src/trees.js')); await pg.waitForTimeout(1200);
    const hist = await pg.evaluate(() => (document.querySelector('.cs-hist') || {}).innerText || '');
    check('Code tab: the open file says its versions and who last changed it', /2 versions/.test(hist) && /last changed/.test(hist), hist);
    if (process.env.PROBE_SHOT !== '0') await pg.screenshot({ path: path.join(SHOT, 'idearium-code.png') });
    await pg.evaluate(() => csHistoryInPlan()); await pg.waitForTimeout(1000);
    const fv = await pg.evaluate(() => ({ on: RT_VIEW, f: RT_MORE.file, text: document.querySelector('#plan-panel #rt-list').innerText }));
    check('… and opens the Plan on that file\'s versions only', fv.on === 'versions' && fv.f === 'src/trees.js' && (fv.text.match(/vtm-/g) || []).length === 2, JSON.stringify(fv).slice(0, 300));
    await pg.evaluate(() => closePlanPanel());

    // §0.48.0 OS9 — no Agent tab: the agent is the Code tab's (one conversation, its commands, who it is)
    check('no Agent tab in the repo\'s tabs', await pg.evaluate(() => !document.querySelector('.repo-subtab-btn[data-subtab="agent"]')));
    await pg.evaluate(() => setRepoSubtab('agent')); await pg.waitForTimeout(1200);
    check('asking for the Agent tab opens Code', await pg.evaluate(() => CURRENT_REPO_SUBTAB === 'code'));
    const ident = await pg.evaluate(() => (document.querySelector('#repo-subtab-code .cs-ident') || {}).innerText || '');
    check('Code tab: the agent says who it is in one line, with options ↗', /indexed|not indexed/.test(ident) && /options/.test(ident), ident);
    await pg.evaluate(() => { CS.agent.draft = '/help'; csAsk(); }); await pg.waitForTimeout(800);
    const talk = await pg.evaluate(() => (document.getElementById('cs-talk') || {}).innerText || '');
    check('Code tab: its commands work here (/help)', /\/help|\/tools|commands/i.test(talk) && talk.length > 60, talk.slice(0, 200));
    if (process.env.PROBE_SHOT !== '0') await pg.screenshot({ path: path.join(SHOT, 'idearium-code-agent.png') });

    // §0.48.0 OS8 — every agent setting under Settings → Agents, native; no iframe anywhere
    await pg.evaluate(() => { setRepoSubtab('settings'); }); await pg.waitForTimeout(500);
    const groups = await pg.evaluate(() => [...document.querySelectorAll('#repo-subtab-settings .rs-group')].map(g => g.textContent.trim()));
    const items = await pg.evaluate(() => [...document.querySelectorAll('#repo-subtab-settings .rs-item[data-rs^="agent-"]')].map(b => b.textContent.trim()));
    check('Settings → Agents: behaviour · prompt · hat & tools · models', groups.includes('Agents') && JSON.stringify(items) === JSON.stringify(['Behaviour', 'Prompt', 'Hat & tools', 'Models']), JSON.stringify({ groups, items }));
    await pg.evaluate(() => repoSettingsShow('agent-behaviour')); await pg.waitForTimeout(1500);
    const beh = await pg.evaluate(() => ({ n: document.querySelectorAll('#ao-behaviour .ao-select').length, t: document.getElementById('ao-behaviour').innerText }));
    check('Behaviour: who answers, its model, tools, the code it writes — controls', beh.n === 4 && /who answers/.test(beh.t) && /code it writes/.test(beh.t), JSON.stringify(beh).slice(0, 200));
    if (process.env.PROBE_SHOT !== '0') await pg.screenshot({ path: path.join(SHOT, 'idearium-settings-agents.png') });
    await pg.evaluate(() => repoSettingsShow('agent-hat')); await pg.waitForTimeout(1500);
    check('Hat & tools: the hat, drawn here', /hat|forge/i.test(await pg.evaluate(() => document.getElementById('ao-hat').innerText)));
    await pg.evaluate(() => repoSettingsShow('desktop')); await pg.waitForTimeout(900);
    check('Settings: no iframe (desktop drawn natively)', await pg.evaluate(() => document.querySelectorAll('#repo-subtab-settings iframe').length === 0 && /compartment|virtual machine/i.test(document.getElementById('rs-desktop-detail').innerText)));

    // the Spec tab: what is blank, and ✦ draft them
    await pg.evaluate(() => setRepoSubtab('spec')); await pg.waitForTimeout(2000);
    const bl = await pg.evaluate(() => (document.getElementById('ls-blanks') || {}).innerText || '');
    check('Spec tab: the blank part is named, with ✦ draft them', /1 blank/.test(bl) && /Integration/.test(bl) && /draft them/.test(bl), bl);
    if (process.env.PROBE_SHOT !== '0') await pg.screenshot({ path: path.join(SHOT, 'idearium-spec.png') });

    check('no page errors', errs.length === 0, errs.slice(0, 3).join('; '));
  } finally { await br.close(); for (const s of servers) s.close(); }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
