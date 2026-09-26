'use strict';
/**
 * tests/probe/nexus-atlas-home.js — 0.39.262.
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

    P.case('no page errors', errs.length === 0, { errors: errs });
  } finally {
    if (b) await b.close();
    id.kill();
    await new Promise(r => setTimeout(r, 300));
    try { fs.rmSync(SB, { recursive: true, force: true }); } catch (_) {}
  }
  P.done();
})().catch(e => { console.error(e.stack || e); process.exit(1); });
