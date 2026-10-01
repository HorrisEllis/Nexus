'use strict';
// starts idearium: into the test sandbox first (test-test-sandbox's rule), so nothing writes real data.
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/probe/idearium-coding-flow-chromium.js — 0.39.284 W2–W4 in the REAL idearium page, on a REAL idearium (its own
 * port, every store in a temp sandbox), in Clear Glass's page engine. James: "the phases tab needs to populate with the
 * plan" · "below the plan … the worksurface … identicle to yours" · "the create and build tabs should be removed from
 * the repos and moved back to the main navbar" · "make the navigation more dynamic" · "i want to see it working".
 *   the main bar has Create and Build (the repo row does not) · the ink slides under the active tab
 *   an empty Phases tab lists the repo's spec with "⚡ plan from the spec" → the phases appear, bottom-up
 *   Build ▾ → Build this repo → Home's Start building + the Plan panel, the work surface under it:
 *     the agent's two changes as diff cards (+/−, green/red lines), the tools; Apply on the proposed one writes it
 * Usage: node tests/probe/idearium-coding-flow-chromium.js [screenshotDir]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { start } = require('./_glass-probe.js');
const P = start();
const SHOTS = process.argv[2] || process.env.FLOW_SHOTS || null;
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });

const SPEC = ['spec:', '  meta:', '    name: kernel', '  primitives:', '    Port: a typed input or output', '  audio_graph:', '    engine: nodes that process audio in blocks',
  '  api:', '    routes: POST /graph', '  scheduler:', '    loop: runs every 128 samples', '  ui_canvas:', '    panel: nodes drawn on a canvas', ''].join('\n');

(async () => {
  const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'idearium-flow-probe-'));
  const port = await freePort();
  const env = { ...process.env, IDEARIUM_PORT: String(port), NEXUS_SELF_AUTOSYNC: '0', NEXUS_SELF_DIR: path.join(SB, 'self'),
    IDEARIUM_DATA_DIR: path.join(SB, 'idearium'), JAA_DATA_DIR: path.join(SB, 'jaa'), COS_DATA_ROOT: path.join(SB, 'cos'),
    NEXUS_INJECT_DIR: path.join(SB, 'inject'), NEXUS_DATA_ROOT: path.join(SB, 'data'), COPILOT_INJECTION_DIR: path.join(SB, 'cinj'),
    NEXUS_VERSIONIUM_URL: 'http://127.0.0.1:9' };
  delete env.NEXUS_TEST_SANDBOX;
  const id = spawn(process.execPath, [path.join(P.ROOT, 'idearium/api/index.js')], { env, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  const J = async (m, p, b) => { const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return r.json(); };
  let b;
  try {
    for (let i = 0; i < 60; i++) { try { const r = await fetch(base + '/health'); if (r.ok) break; } catch (_) {} await new Promise(r => setTimeout(r, 500)); }
    const made = await J('POST', '/api/repos', { name: 'kernel-flow', source: 'test', files: [
      { path: 'source/specs/kernel.spec', content: SPEC }, { path: 'src/state.js', content: 'export const state = {\n  ports: [],\n};\n' }] });
    const repo = (made.data && made.data.repo) || made.repo;
    P.case('a real repo with a spec and a source file', !!(repo && repo.uuid), { made: JSON.stringify(made).slice(0, 200) });
    const U = repo.uuid;
    // the agent's work: one change applied, one waiting (what a phase build leaves behind)
    await J('POST', `/api/repos/${U}/injects`, { path: 'src/state.js', content: 'export const state = {\n  ports: [],\n  graph: new Map(),\n};\n\nexport function reset() { state.graph.clear(); }\n', apply: true, asAgent: true });
    await J('POST', `/api/repos/${U}/injects`, { path: 'src/graph.js', content: "import { state } from './state.js';\n\nexport function addNode(id, node) {\n  state.graph.set(id, node);\n  return node;\n}\n", asAgent: true });

    b = await P.glass.chromium.launch();
    const pg = await b.newPage({ viewport: { width: 1500, height: 950 } });
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    const shot = (n) => SHOTS ? pg.screenshot({ path: path.join(SHOTS, n) }) : null;
    await pg.goto(base + '/');
    await pg.waitForFunction(() => typeof API_REPOS !== 'undefined' && API_REPOS.length > 0, null, { timeout: 30000 });

    // ── the main bar ──
    const bar = await pg.evaluate(() => ({
      main: [...document.querySelectorAll('#tabbar > .tab-btn, #tabbar > .tab-group > .tab-group-btn')].map(x => x.textContent.replace(/[▾⌂🗂✎▦⊞]/g, '').trim()),
      inRepoRow: document.querySelectorAll('#repo-subnav .tab-group').length,
      ink: !!document.querySelector('#tabbar > .nav-ink.on'),
    }));
    P.case('W4: the main bar is Welcome · Repos · Create · Build (and the repo row has no Create/Build); the ink sits under the active tab',
      /Welcome,Repos.*,Create,Build/.test(bar.main.join()) && bar.inRepoRow === 0 && bar.ink, bar);
    const ink1 = await pg.evaluate(() => document.querySelector('#tabbar > .nav-ink').style.left);
    await pg.evaluate(() => setView('repo'));
    await pg.waitForSelector('.repo-block', { timeout: 15000 });
    await pg.waitForTimeout(450);
    const ink2 = await pg.evaluate(() => document.querySelector('#tabbar > .nav-ink').style.left);
    P.case('W4: the ink moves to the tab that becomes active', ink1 !== ink2, { ink1, ink2 });

    // ── the repo, its empty Phases tab ──
    await pg.click('.repo-block:has-text("kernel-flow")');
    await pg.waitForSelector('#repo-subnav .repo-subtab-btn.active', { timeout: 15000 });
    await pg.evaluate(() => setRepoSubtab('phases'));
    await pg.waitForSelector('#ph-plan-specs .ph-plan-row', { timeout: 20000 });
    const empty = await pg.evaluate(() => [...document.querySelectorAll('#ph-plan-specs .ph-plan-row')].map(r => r.textContent));
    P.case('W2: an empty Phases tab lists the repo\'s spec with "plan from the spec" and "ask the agent"', empty.length === 1 && /kernel\.spec/.test(empty[0]) && /plan from the spec/.test(empty[0]) && /ask the agent/.test(empty[0]), { empty });
    await shot('1-phases-empty.png');
    await pg.click('#ph-plan-specs .ph-plan-row button:has-text("plan from the spec")');
    await pg.waitForFunction(() => /KE0|KE1/.test(document.getElementById('repo-subtab-phases').textContent), null, { timeout: 20000 });
    await pg.waitForTimeout(400);
    const ph = await pg.evaluate(() => document.getElementById('repo-subtab-phases').textContent);
    P.case('W2: the phases land in the tab — every section a phase, bottom-up (foundation → ui)', /primitives/.test(ph) && /audio_graph/.test(ph) && /ui_canvas/.test(ph) && /scheduler/.test(ph), { ph: ph.replace(/\s+/g, ' ').slice(0, 300) });
    await shot('2-phases-planned.png');

    // ── Build ▾ → Build this repo ──
    await pg.click('#tabbar .tab-group[data-group="build"] .tab-group-btn');   // click opens it too (toggleTabGroup); the engine has no hover
    await pg.waitForFunction(() => Number(getComputedStyle(document.querySelector('.tab-group[data-group="build"] .tab-dropdown')).opacity) > 0.9, null, { timeout: 3000 }).catch(() => {});
    const dd = await pg.evaluate(() => { const d = document.querySelector('.tab-group[data-group="build"] .tab-dropdown'); const cs = getComputedStyle(d); return { vis: cs.visibility, op: cs.opacity, first: d.querySelector('.tab-sub').textContent }; });
    P.case('W4: Build ▾ opens (an animated dropdown) with "Build this repo" first', dd.vis === 'visible' && Number(dd.op) > 0.5 && /Build this repo/.test(dd.first), dd);
    await shot('3-build-menu.png');
    await pg.click('.tab-group[data-group="build"] .tab-sub-lead');
    await pg.waitForSelector('#plan-panel.open', { timeout: 10000 });
    await pg.waitForSelector('#pp-ws .ws-card', { timeout: 20000 });
    await pg.waitForTimeout(500);
    const ws = await pg.evaluate(() => ({
      subtab: CURRENT_REPO_SUBTAB, start: !!document.querySelector('#repo-build-start .bs-card'),
      cards: [...document.querySelectorAll('#pp-ws .ws-card')].map(c => ({ name: c.querySelector('.ws-name').textContent, st: c.querySelector('[class*="ws-st-"]').textContent,
        plus: c.querySelector('.ws-head .ws-plus').textContent, minus: c.querySelector('.ws-head .ws-minus').textContent, adds: c.querySelectorAll('.ws-add').length, dels: c.querySelectorAll('.ws-del').length,
        acts: [...c.querySelectorAll('.ws-head .ws-act')].map(a => a.textContent) })),
      tools: (document.querySelector('#pp-ws .ws-tools-head') || {}).textContent || '',
      sum: (document.querySelector('#pp-ws .ws-sum') || {}).textContent || '',
    }));
    const byName = Object.fromEntries(ws.cards.map(c => [c.name, c]));
    P.case('W4: Build this repo → the repo\'s Home (Start building) with the Plan panel open', ws.subtab === 'home' && ws.start, { subtab: ws.subtab, start: ws.start });
    P.case('W3: the work surface under the plan — a card per changed file, +/− counts, green and red lines', ws.cards.length === 2 && byName['state.js'] && byName['graph.js']
      && byName['state.js'].plus === '+3' && byName['state.js'].minus === '−0' && byName['state.js'].adds === 3 && byName['graph.js'].adds === 6, { cards: ws.cards });
    P.case('W3: the applied change offers Revert; the waiting one Apply and Reject; the header counts them', byName['state.js'].acts.join() === 'Revert' && byName['graph.js'].acts.join() === 'Apply,Reject'
      && /2 files/.test(ws.sum) && /1 waiting/.test(ws.sum), { acts: ws.cards.map(c => c.acts), sum: ws.sum });
    P.case('W3: the tools strip names the scope and how many tools the agent is given', /scope/.test(ws.tools) && /\d+ given/.test(ws.tools), { tools: ws.tools });
    await pg.evaluate(() => { document.getElementById('plan-panel').classList.add('wide'); WSURF.showTools = true; wsPaint(); });
    await pg.waitForTimeout(300);
    await shot('4-work-surface.png');
    await pg.click('#pp-ws .ws-card[data-path="src/graph.js"] .ws-act-apply');
    await pg.waitForFunction(() => { const c = document.querySelector('#pp-ws .ws-card[data-path="src/graph.js"]'); return c && /applied/.test(c.textContent); }, null, { timeout: 15000 });
    const file = await J('GET', `/api/repos/${U}/injects`);
    const applied = ((file.data || file).injects || []).filter(x => x.path === 'src/graph.js' && x.status === 'applied').length;
    P.case('W3: Apply on the card writes the file (the inject is applied) and the card turns applied', applied === 1, { applied });
    await shot('5-applied.png');
    // ── W7 the Architect tab: the repo's component registry + wiring map ──
    await pg.evaluate(() => { document.getElementById('plan-panel').classList.remove('open'); setRepoSubtab('architect'); });
    await pg.waitForSelector('#repo-arch-registry .ar-title', { timeout: 15000 });
    await pg.evaluate(() => archReindex());
    await pg.waitForSelector('#repo-arch-registry .ar-node', { timeout: 60000 });
    await pg.waitForTimeout(400);
    const ar = await pg.evaluate(() => ({ nodes: document.querySelectorAll('#repo-arch-registry .ar-node').length, edges: document.querySelectorAll('#repo-arch-registry .ar-edge').length,
      rows: document.querySelectorAll('#repo-arch-registry .ar-tbl tbody tr').length, chips: document.querySelector('#repo-arch-registry .ar-head').textContent.replace(/\s+/g, ' ') }));
    P.case('W7: the Architect tab shows the repo\'s component registry — a node per file, the wire graph.js ← state.js, the table', ar.nodes >= 3 && ar.edges >= 1 && ar.rows >= 3, ar);
    if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, '8-architect.png') });

    // ── W5 the look: idearium in the main UI's palette; the settings console's Appearance switches it live ──
    const tok = await pg.evaluate(() => { const cs = getComputedStyle(document.documentElement); return { theme: document.documentElement.dataset.theme, ink: cs.getPropertyValue('--nx-ink').trim(), bg: getComputedStyle(document.body).backgroundColor }; });
    P.case('W5: idearium paints in the main UI\'s palette by default (ink #080814)', tok.theme === 'nexus' && tok.ink === '#080814' && tok.bg === 'rgb(8, 8, 20)', tok);
    const sp = await b.newPage({ viewport: { width: 1300, height: 900 } }); sp.on('pageerror', e => errs.push(`settings: ${e.message}`));
    await sp.goto(base + '/settings.html?view=appearance');
    await sp.waitForSelector('[data-theme-pick="graphite"]', { timeout: 15000 });
    if (SHOTS) await sp.screenshot({ path: path.join(SHOTS, '6-appearance.png') });
    await sp.click('[data-theme-pick="graphite"]');
    await sp.waitForTimeout(600);
    const cfg = await J('GET', '/api/config');
    const after = await sp.evaluate(() => ({ theme: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor, on: (document.querySelector('.ap-card.on .ap-name') || {}).textContent }));
    P.case('W5: Appearance → Graphite applies at once and is saved to idearium\'s config (ui.theme)', after.theme === 'graphite' && after.bg === 'rgb(17, 17, 19)' && /Graphite/.test(after.on) && ((cfg.data || cfg).config.ui.theme === 'graphite'), { after, saved: (cfg.data || cfg).config.ui });
    await sp.click('[data-accent-pick="violet"]'); await sp.waitForTimeout(400);
    if (SHOTS) await sp.screenshot({ path: path.join(SHOTS, '7-appearance-graphite.png') });
    await pg.goto(base + '/'); await pg.waitForFunction(() => typeof API_REPOS !== 'undefined' && API_REPOS.length > 0, null, { timeout: 30000 }); await pg.waitForTimeout(500);
    const idTheme = await pg.evaluate(() => ({ theme: document.documentElement.dataset.theme, accent: document.documentElement.dataset.accent }));
    P.case('W5: idearium, reloaded, follows the choice (graphite · violet) — one look everywhere', idTheme.theme === 'graphite' && idTheme.accent === 'violet', idTheme);
    await J('POST', '/api/config', { key: 'ui.theme', value: 'nexus' }); await J('POST', '/api/config', { key: 'ui.accent', value: 'cycle' });
    P.case('no page errors', errs.length === 0, { errs: errs.slice(0, 5) });
  } catch (e) { P.case('probe ran', false, { error: e.stack }); }
  finally {
    try { if (b) await b.close(); } catch (_) {}
    try { id.kill(); } catch (_) {}
    try { fs.rmSync(SB, { recursive: true, force: true }); } catch (_) {}
    P.done();
  }
})();
