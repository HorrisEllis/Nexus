'use strict';
// §0.39.282 — starts NEXUS processes: into the test sandbox first (test-test-sandbox's rule), so nothing writes real data.
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/probe/nexus-atlas-home.js — 0.39.263, extended in 0.39.264 (the written-out atlas, nested atlases, Create/Build only inside a repo).
 * James: "nexus is the repo, not 15, just nexus, then clicking inside of it, shows the rest of
 * them in … the nexus atlas, wire that completely in as the homepage of the nexus repo, and
 * everything referenced can be opened in idearium, including each system."
 * Boots a REAL idearium on a free port with every store in a temp sandbox, syncs two systems
 * of the real tree into the nexus repo (the snapshot itself is the whole tree), and walks the UI
 * in Clear Glass's own engine: library → nexus → atlas Home → a file reference → back → an
 * atlas doc → a system block → that system's Home.
 * Usage: node tests/probe/nexus-atlas-home.js [screenshotDir]   (exit 0 = all pass, 3 = no page engine)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { start } = require('./_glass-probe.js');
const P = start();
const SHOTS = process.argv[2] || null;

const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });

(async () => {
  const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-atlas-probe-'));
  const port = await freePort();
  const env = { ...process.env, IDEARIUM_PORT: String(port), NEXUS_SELF_AUTOSYNC: '0', NEXUS_SELF_DIR: path.join(SB, 'self'),
    IDEARIUM_DATA_DIR: path.join(SB, 'idearium'), JAA_DATA_DIR: path.join(SB, 'jaa'), COS_DATA_ROOT: path.join(SB, 'cos'),
    NEXUS_INJECT_DIR: path.join(SB, 'inject'), NEXUS_DATA_ROOT: path.join(SB, 'data'), COPILOT_INJECTION_DIR: path.join(SB, 'cinj') };
  delete env.NEXUS_TEST_SANDBOX;
  const id = spawn(process.execPath, [path.join(P.ROOT, 'idearium/api/index.js')], { env, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  let b;
  try {
    for (let i = 0; i < 60; i++) { try { const r = await fetch(base + '/health'); if (r.ok) break; } catch (_) {} await new Promise(r => setTimeout(r, 500)); }
    const sync = await (await fetch(base + '/api/nexus-self/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wait: true, only: ['guardian', 'loom'] }) })).json();
    P.case('the nexus repo syncs from an immutable snapshot of the live tree', !!(sync.ok && sync.snapshot), { snapshot: String(sync.snapshot || sync.error).slice(0, 16) });

    b = await P.glass.chromium.launch();
    const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    const shot = (n) => SHOTS ? pg.screenshot({ path: path.join(SHOTS, n) }) : null;
    await pg.goto(base + '/');
    await pg.waitForFunction(() => typeof API_REPOS !== 'undefined' && API_REPOS.length > 0, null, { timeout: 20000 });
    // §0.39.264 — "this in idearium needs to only show in nested compartments/repos"
    const vis = () => pg.evaluate(() => { const d = (el) => el ? getComputedStyle(el).display !== 'none' : null;
      return { create: d(document.querySelector('.tab-group[data-group="create"]')), build: d(document.querySelector('.tab-group[data-group="build"]')), counters: d(document.getElementById('stat-ideas').parentElement) }; });
    const top = await vis();
    P.case('top level: no Create, no Build, no ideas/specs counters — they belong to a repo', top.create === false && top.build === false && top.counters === false, top);
    await pg.evaluate(() => setView('repo'));
    await pg.waitForSelector('.repo-block', { timeout: 15000 });
    const cards = await pg.$$eval('.repo-block .repo-block-name', xs => xs.map(x => x.textContent));
    P.case('the library shows one repo for Nexus, not one per system', cards.length === 1 && cards[0] === 'nexus', { cards });
    await shot('1-library.png');

    await pg.click('.repo-block:has-text("nexus")');
    await pg.waitForSelector('#nx-atlas-doc .nx-link', { timeout: 30000 });
    const home = await pg.evaluate(() => ({ h1: (document.querySelector('#nx-atlas-doc h1') || {}).textContent, systems: document.querySelectorAll('.nx-sys').length,
      links: document.querySelectorAll('#nx-atlas-doc .nx-link').length, live: document.querySelectorAll('.nx-live').length }));
    P.case("its Home is docs/atlases/nexus-atlas.md with every system as a block and live numbers under each module", /NEXUS/.test(home.h1 || '') && home.systems >= 14 && home.live >= 8 && home.links >= 40, home);
    await shot('2-atlas.png');
    const inside = await vis();
    P.case('inside a repo: Create, Build and the counters appear', inside.create && inside.build && inside.counters, inside);
    await pg.evaluate(() => toggleTabTree(true));
    const tree = await pg.evaluate(() => { const t = document.getElementById('tab-tree'); const top = [...t.children].map(c => (c.querySelector(':scope > .tt-head .tt-label') || c.querySelector(':scope > .tt-label') || {}).textContent).filter(Boolean);
      return { top, nested: /work in this repo/.test(t.textContent) && /Eravos — organism canvas/.test(t.textContent) }; });
    P.case('the navigator nests Create and Build under the open repo, not at its top level', !tree.top.includes('Create') && !tree.top.includes('Build') && tree.nested, tree);
    await pg.evaluate(() => toggleTabTree(false));
    // §0.39.264 — "expand it completely … each reference a link to either open the nested or file"
    const toc = await pg.evaluate(() => ({ entries: document.querySelectorAll('#nx-atlas-doc .nx-toc [data-to]').length, nested: document.querySelectorAll('#nx-atlas-doc .nx-nested').length, words: document.getElementById('nx-atlas-doc').innerText.split(/\s+/).length }));
    P.case('the atlas is written out, with a contents list and a way into every system\'s nested atlas', toc.entries > 30 && toc.nested >= 14 && toc.words > 5000, toc);
    await pg.click('#nx-atlas-doc .nx-nested[data-doc="docs/atlases/core-atlas.md"]');
    await pg.waitForFunction(() => /core-atlas\.md/.test((document.querySelector('.nx-crumbs') || {}).innerText || '') && document.querySelectorAll('#repo-subtab-home .nx-doc .nx-link').length > 50, null, { timeout: 20000 });
    P.case('"open its atlas" opens that system\'s nested atlas in place, its references live', true, { crumbs: await pg.evaluate(() => document.querySelector('.nx-crumbs').innerText.split('\n')[0]) });
    await pg.evaluate(() => nexusAtlasHome());
    await pg.waitForSelector('#nx-atlas-doc .nx-link', { timeout: 30000 });

    await pg.click('#nx-atlas-doc code.nx-file:has-text("guardian/lib/node-registry.js")');
    await pg.waitForFunction(() => typeof ACTIVE_API_FILE !== 'undefined' && ACTIVE_API_FILE === 'guardian/lib/node-registry.js' && document.getElementById('ide-editor').value.length > 0, null, { timeout: 20000 });
    const file = await pg.evaluate(() => ({ repo: CURRENT_API_REPO.name, tab: CURRENT_REPO_SUBTAB, back: document.getElementById('repo-back-btn').textContent }));
    P.case('a file reference opens that file in its system repo', file.repo === 'nexus/guardian' && file.tab === 'files' && file.back === '← nexus', file);
    await shot('3-file.png');

    await pg.click('#repo-back-btn');
    await pg.waitForSelector('#nx-atlas-doc .nx-link', { timeout: 30000 });
    P.case('back from a system goes to nexus, not the library', (await pg.evaluate(() => CURRENT_API_REPO.name)) === 'nexus');

    await pg.click('#nx-atlas-doc .nx-link.nx-doc:has-text("loom-atlas.md")');
    await pg.waitForSelector('.nx-crumbs .nx-link', { timeout: 15000 });
    await pg.waitForSelector('#repo-subtab-home .nx-doc .nx-link', { timeout: 15000 });
    const doc = await pg.evaluate(() => ({ crumbs: document.querySelector('.nx-crumbs').innerText, h1: (document.querySelector('#repo-subtab-home .nx-doc h1') || {}).textContent }));
    P.case("an atlas doc opens rendered in place, its own references live", /loom-atlas\.md/.test(doc.crumbs) && /loom/i.test(doc.h1 || ''), doc);
    await shot('4-doc.png');

    await pg.evaluate(() => nexusAtlasHome());
    await pg.waitForSelector('.nx-sys', { timeout: 20000 });
    await pg.click('.nx-sys:has-text("guardian")');
    await pg.waitForSelector('#nx-sys-atlas-doc .nx-doc', { timeout: 20000 });
    const sys = await pg.evaluate(() => ({ repo: CURRENT_API_REPO.name, crumbs: document.querySelector('.nx-crumbs').innerText, list: [...document.querySelectorAll('.repo-card-name')].map(x => x.textContent) }));
    P.case("a system block opens that system; its Home starts with its own atlas; the list shows it under nexus", sys.repo === 'nexus/guardian' && /nexus › guardian/.test(sys.crumbs) && JSON.stringify(sys.list) === JSON.stringify(['nexus', 'nexus/guardian']), sys);
    await shot('5-system.png');

    // §0.39.263 — "should not be a compartments tab, repos are compartments"
    const shell = await pg.evaluate(() => ({ tab: !!document.querySelector('[data-view="compartment"]'), view: !!document.getElementById('view-compartment'), badge: document.getElementById('repo-count-badge').textContent }));
    P.case('no Compartment tab or view; the Repos badge counts nexus, not its systems', !shell.tab && !shell.view && shell.badge === '1', shell);
    const bs = await (await fetch(base + '/api/brainstorms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'a probe idea: repos are compartments' }) })).json();
    const bid = (bs.brainstorm || bs).uuid;
    const reposBefore = await pg.evaluate(() => API_REPOS.length);
    await pg.evaluate(async (id) => { await loadBrainstorms(); await promoteBrainstorm(id); }, bid);
    await pg.waitForSelector('#view-ideas .cmp-host .cmp-lane', { timeout: 20000 });
    const promoted = await pg.evaluate(async () => { await loadApiRepos(); return { view: document.querySelector('.view.active').id, lanes: document.querySelectorAll('#view-ideas .cmp-host .cmp-lane').length, repos: API_REPOS.length }; });
    P.case('a promoted brainstorm is an idea, worked in Create › Ideas — it gets no repo (only a spec does)', promoted.view === 'view-ideas' && promoted.lanes === 4 && promoted.repos === reposBefore, { ...promoted, reposBefore });
    await shot('6-promoted-idea.png');

    // 0.39.263 — "it says 15 ideas and 15 repos … ideas, once promoted to spec should move to the idea tab in the actual repo"
    const counts1 = await pg.evaluate(() => ({ ideas: document.getElementById('stat-ideas').textContent, specs: document.getElementById('stat-specs').textContent, listed: [...document.querySelectorAll('#idea-list .idea-card')].map(c => c.textContent.trim().split('\n')[0].trim()) }));
    P.case('the ideas and specs counts leave out Nexus\'s own system repos (their "Repo: nexus/…" ideas and snapshot specs)', counts1.ideas === '1' && counts1.specs === '0' && counts1.listed.length === 1 && !counts1.listed.some(t => /Repo: nexus/.test(t)), counts1);
    const ideaUuid = await pg.evaluate(() => IDEAS.find(i => /probe idea/.test(i.text)).uuid);
    const said = await pg.evaluate(async (u) => { const t = []; const orig = window.toast; window.toast = (m, k) => { t.push(`${k || ''}:${m}`); return orig(m, k); }; createSpecForIdea(u); await new Promise(r => setTimeout(r, 800)); const ft = document.getElementById('ns-file-tree'); if (ft) ft.checked = false; /* the file-tree plan needs an agent; none runs in this sandbox */ await submitNewSpec(false); window.toast = orig; return t; }, ideaUuid);
    if (said.some(x => /^err:/.test(x))) console.error('TOASTS', JSON.stringify(said));
    await pg.waitForSelector('#repo-subtab-idea .cmp-host .cmp-lane', { timeout: 30000 });
    const specced = await pg.evaluate((u) => ({ repo: CURRENT_API_REPO && CURRENT_API_REPO.ideaUuid === u, tab: CURRENT_REPO_SUBTAB, lanes: document.querySelectorAll('#repo-subtab-idea .cmp-lane').length,
      stillListed: getFilteredIdeas().some(i => i.uuid === u), ideas: document.getElementById('stat-ideas').textContent, specs: document.getElementById('stat-specs').textContent }), ideaUuid);
    P.case('an idea made into a spec moves to its repo\'s Idea tab (lanes there) and leaves the Ideas list', specced.repo && specced.tab === 'idea' && specced.lanes === 4 && !specced.stillListed && specced.ideas === '0' && specced.specs === '1', specced);
    await shot('7-specced-idea-in-repo.png');

    P.case('no page errors', errs.length === 0, { errors: errs });
  } finally {
    if (b) await b.close();
    id.kill();
    await new Promise(r => setTimeout(r, 300));
    try { fs.rmSync(SB, { recursive: true, force: true }); } catch (_) {}
  }
  P.done();
})().catch(e => { console.error(e.stack || e); process.exit(1); });
