'use strict';
/**
 * tests/probe/clearglass-menu-library.js — 0.39.262 (was clearglass-menu-library.py, v0.39.240/241).
 * James: "also needs to be clearglass library... added to the 3 lines menu."
 * Loads Clear Glass's REAL renderer/browser.html + browser.js in Clear Glass's own engine, with
 * window.ClearGlass stood in by an object built from the real preload's namespaces (every method
 * records its call) and the real toolbar command registry. Clicks the ☰ menu (#bookmark-mgr-btn),
 * then "📚 Library", then "⬇ Downloads". Pass = openLibrary() once, then openLibrary('downloads'),
 * the menu closed, no page errors.
 * Usage: node tests/probe/clearglass-menu-library.js   (exit 0 = all pass, 3 = no page engine)
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { start } = require('./_glass-probe.js');
const P = start();
const CG = path.join(P.ROOT, 'clear-glass');
const CMDS = JSON.stringify(require(path.join(CG, 'src/toolbar/commands.js')).TOOLBAR_COMMANDS);

function preloadShape() {
  const shape = {}; let cur = null;
  for (const line of fs.readFileSync(path.join(CG, 'src/preload/index.js'), 'utf8').split('\n')) {
    let m = /^  (\w+):\s*\{\s*$/.exec(line);
    if (m) { cur = m[1]; shape[cur] = []; continue; }
    if (cur) { if (/^  \},?\s*$/.test(line)) { cur = null; continue; } m = /^    (\w+)\s*:/.exec(line); if (m) shape[cur].push(m[1]); }
  }
  return shape;
}
const FAKE = `window.__calls=[];const __shape=${JSON.stringify(preloadShape())};window.ClearGlass={};
for (const ns of Object.keys(__shape)) { window.ClearGlass[ns]={}; for (const m of __shape[ns]) window.ClearGlass[ns][m]=(...args)=>{ window.__calls.push({path:'cg.'+ns+'.'+m,args}); return Promise.resolve(/list$/i.test(m)?[]:{}); }; }
window.ClearGlass.toolbar.commands = () => Promise.resolve(${CMDS});`;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  const f = path.join(CG, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(CG) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});

(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const b = await P.glass.chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(FAKE);
  await pg.goto(`http://127.0.0.1:${srv.address().port}/renderer/browser.html`); await pg.waitForTimeout(1500);
  await pg.click('#bookmark-mgr-btn'); await pg.waitForTimeout(500);
  const rows = await pg.$$eval('#bookmark-mgr-panel .menu-item', els => els.map(e => e.textContent.trim()));
  P.case('the ☰ menu opens with its rows', rows.length > 0, { rows });
  await pg.screenshot({ path: path.join(require('os').tmpdir(), 'clearglass-menu-library.png') });
  await pg.click('#bookmark-mgr-panel [data-action="library"]'); await pg.waitForTimeout(400);
  const lib = await pg.evaluate(() => window.__calls.filter(c => c.path === 'cg.window.openLibrary').map(c => c.args));
  await pg.click('#bookmark-mgr-btn'); await pg.waitForTimeout(400);
  await pg.click('#bookmark-mgr-panel [data-action="downloads"]'); await pg.waitForTimeout(400);
  const opens = await pg.evaluate(() => window.__calls.filter(c => c.path === 'cg.window.openLibrary').map(c => c.args));
  const norm = JSON.stringify(opens.map(a => a.filter(x => x !== null && x !== undefined)));
  P.case('📚 Library opens the Library window; ⬇ Downloads opens it on Downloads', lib.length === 1 && norm === JSON.stringify([[], ['downloads']]), { opens });
  const disp = await pg.$eval('#bookmark-mgr-panel', e => getComputedStyle(e).display);
  P.case('the menu closes after a click', disp === 'none', { display: disp });
  P.case('no page errors', errs.length === 0, { errors: errs.slice(0, 5) });
  await b.close(); srv.close();
  P.done();
})().catch(e => { console.error(e.stack || e); process.exit(1); });
