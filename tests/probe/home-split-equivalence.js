'use strict';
/**
 * tests/probe/home-split-equivalence.js — 0.39.263 (was home-split-equivalence.py, v0.39.228).
 * Proves the ui/home split (one JS + one CSS per area) changed nothing but the stored-mode boot
 * bug. A real page in Clear Glass's own engine, the repo served over HTTP, every non-local
 * request aborted identically on both sides.
 *   REFERENCE = ui/home/index.html + home.css at REF_COMMIT (the pre-split monolith), with ONE
 *   change: its failure/event-logging block moved to the top of the inline script. Without that
 *   change the monolith throws on _uiLog's temporal dead zone whenever localStorage holds a mode.
 * Compares, with and without a stored mode: page errors, typeof of every top-level name the
 * monolith declared, and 40 computed style properties of every element across every channel
 * (tune(0..n)) and overlay state. CSS animation time is frozen (Animation.setPlaybackRate 0).
 * Usage: node tests/probe/home-split-equivalence.js [REF_COMMIT]   (exit 0 = EQUIVALENT, 3 = no page engine)
 * REF_COMMIT must be in this checkout's history (the default 30a0c24 predates the 0.39.258 import).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const { start } = require('./_glass-probe.js');
const P = start();
const ROOT = P.ROOT;
const REF = process.argv[2] || '30a0c24';
let git;
try { git = (p) => execFileSync('git', ['-C', ROOT, 'show', `${REF}:${p}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); git('ui/home/home.css'); }
catch (e) { console.log(JSON.stringify({ skip: `REF_COMMIT ${REF} is not in this checkout's history — pass one that is` })); process.exit(3); }

const src = git('ui/home/index.html').split('\n');
const a = src.findIndex(l => l.startsWith('// ── Failure / event logging'));
const bIdx = src.findIndex((l, i) => i > a && l.startsWith('// ── Forge Shell tile'));
const top = src.indexOf("'use strict';") + 1;
const orig = [...src.slice(0, top), ...src.slice(a, bIdx), ...src.slice(top, a), ...src.slice(bIdx)].join('\n');
const ORIG_CSS = git('ui/home/home.css');
const body = orig.slice(orig.indexOf("<script>\n'use strict';"));
const names = [...new Set([...body.matchAll(/^(?:async\s+)?(?:function\s+([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*))/gm)].map(m => m[1] || m[2] || m[3]))].sort();
const SNAP = () => { const out = {}; const props = ['display', 'visibility', 'opacity', 'position', 'z-index', 'color', 'background-color', 'font-size', 'font-family', 'width', 'height', 'top', 'left', 'right', 'bottom', 'transform', 'pointer-events', 'border-top-color', 'border-radius', 'padding-top', 'margin-top', 'overflow', 'flex-direction', 'grid-template-columns', 'animation-name', 'filter', 'box-shadow', 'transition-property', 'transition-duration', 'animation-duration', 'cursor', 'user-select', 'text-decoration-line', 'border-left-color', 'letter-spacing', 'line-height', 'font-weight', 'gap', 'justify-content', 'align-items'];
  const pth = e => { const a = []; while (e && e !== document.body) { if (e.id) { a.unshift('#' + e.id); break; } const i = [...e.parentNode.children].indexOf(e); a.unshift(e.tagName + ':' + i); e = e.parentNode; } return a.join('>'); };
  for (const e of document.querySelectorAll('body *')) { if (e.closest('svg') || e.tagName === 'SCRIPT') continue; const cs = getComputedStyle(e); out[pth(e)] = props.map(p => cs.getPropertyValue(p)).join('|'); } return out; };
const ACTIONS = [['menu', 'toggleMenu()', 'toggleMenu()'], ['inspect', 'openInspect()', 'closeInspect()'], ['rewind', 'openRewind()', 'closeRewind()'],
  ['mode', 'openModeSelector()', 'closeModeSelector()'], ['wizard', 'openSpecWizard()', 'closeSpecWizard()'], ['console', 'toggleConsoleFullscreen()', 'toggleConsoleFullscreen()'], ['rail-add', 'toggleRailAddMenu()', 'toggleRailAddMenu()']];

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});

async function run(browser, url, stored, port) {
  const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await pg.route(() => true, (r) => r.request().url().startsWith(`http://127.0.0.1:${port}/`) ? r.continue() : r.abort());
  if (stored) await pg.addInitScript(`localStorage.setItem('nexus_mode', ${JSON.stringify(stored)})`);
  await pg.cdp('Animation.enable'); await pg.cdp('Animation.setPlaybackRate', { playbackRate: 0 });
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load resource/.test(m.text())) errs.push(`console.error: ${m.text()}`); });
  await pg.goto(url); await pg.waitForTimeout(600);
  const types = await pg.evaluate((ns) => Object.fromEntries(ns.map(n => { try { return [n, eval('typeof ' + n)]; } catch (e) { return [n, 'THROWS ' + e.name]; } })), names);
  const snaps = {};
  const n = await pg.evaluate(() => CH_META.length);
  for (let i = 0; i < n; i++) { await pg.evaluate(`tune(${i})`); await pg.waitForTimeout(120); snaps[`ch${i}`] = await pg.evaluate(SNAP); }
  await pg.evaluate('tune(0)');
  for (const [a, js, close] of ACTIONS) {
    try { await pg.evaluate(js); } catch (e) { errs.push(`action ${a}: ${e.message}`); }
    await pg.waitForTimeout(200); snaps[a] = await pg.evaluate(SNAP);
    try { await pg.evaluate(close); } catch (e) { errs.push(`close ${a}: ${e.message}`); }
    await pg.waitForTimeout(150);
  }
  await pg.close();
  return [errs, types, snaps];
}

(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const origHtml = path.join(ROOT, 'ui/home/__orig.html'), origCss = path.join(ROOT, 'ui/home/__orig-home.css');
  fs.writeFileSync(origHtml, orig.replace('/ui/home/home.css', '/ui/home/__orig-home.css')); fs.writeFileSync(origCss, ORIG_CSS);
  const b = await P.glass.chromium.launch();
  const mode = /const MODE_CONFIG = \{\s*\n\s*'?([\w-]+)'?\s*:/.exec(orig)[1];
  try {
    for (const stored of [null, mode]) {
      const o = await run(b, `http://127.0.0.1:${port}/ui/home/__orig.html`, stored, port);
      const n = await run(b, `http://127.0.0.1:${port}/ui/home/index.html`, stored, port);
      const tag = `stored_mode=${stored}`;
      P.case(`${tag}: the same page errors`, JSON.stringify(o[0]) === JSON.stringify(n[0]), { orig: o[0], split: n[0] });
      const td = names.filter(k => o[1][k] !== n[1][k]).map(k => [k, o[1][k], n[1][k]]);
      P.case(`${tag}: every top-level name has the same type (${names.length})`, td.length === 0, { differs: td.slice(0, 10) });
      const diffs = [];
      for (const s of Object.keys(o[2])) {
        const A = o[2][s], B = n[2][s] || {};
        const ka = Object.keys(A), kb = Object.keys(B);
        if (ka.length !== kb.length || ka.some(k => !(k in B))) { diffs.push(`${s}: element set differs (${ka.length} vs ${kb.length})`); continue; }
        const d = ka.filter(k => A[k] !== B[k]);
        if (d.length) diffs.push(`${s}: ${d.length} elements differ, e.g. ${d.slice(0, 3).join(', ')}`);
      }
      P.case(`${tag}: every element's computed style is the same in every state (${Object.keys(o[2]).length})`, diffs.length === 0, { diffs: diffs.slice(0, 10) });
    }
  } finally {
    await b.close(); srv.close();
    try { fs.unlinkSync(origHtml); fs.unlinkSync(origCss); } catch (_) {}
  }
  P.done();
})().catch(e => { console.error(e.stack || e); process.exit(1); });
