'use strict';
/**
 * tests/probe/selector-assign-ui-chromium.js — 0.39.262 (was selector-assign-ui-chromium.py, 0.39.251).
 * The Clear Glass selector-assign area's whole flow in a real page — Clear Glass's own engine:
 * a pick is offered → the live check result is shown (selector, matches) → Assign → guardian's
 * answer is shown (recorded, verified, tabs pushed). Then an older answer → the refusal and the
 * candidates tried are shown, and there is no Assign button.
 * Everything is served under https://chatgpt.com/ by request routing: the fixture at the chat
 * URL (so the check's evidence URL is a real provider page, which Clear Glass requires), the repo
 * under /__cg/. Same origin, so the host evaluates in the frame the way Electron evaluates in its
 * webview guest. guardian's real selector map sits behind the real Clear Glass assign module in
 * a node child (tests/probe/selector-assign-guardian.js).
 * Usage: node tests/probe/selector-assign-ui-chromium.js   (exit 0 = all pass, 3 = no page engine)
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { start } = require('./_glass-probe.js');
const P = start();

const BASE = 'https://chatgpt.com/__cg';
const CHAT = 'https://chatgpt.com/c/WEB:probe';
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const HOST = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${BASE}/clear-glass/renderer/browser.css">
<link rel="stylesheet" href="${BASE}/clear-glass/renderer/selector-assign/selector-assign.css">
</head><body style="position:relative;width:1200px;height:800px">
<iframe id="wv" src="${CHAT}" style="width:800px;height:700px"></iframe>
<script src="${BASE}/clear-glass/renderer/selector-assign/selector-assign.js"></script>
</body></html>`;

function serve(route) {
  const url = route.request().url();
  let f;
  if (url.startsWith(CHAT)) f = path.join(P.ROOT, 'tests/fixtures/chatgpt-like.html');
  else if (url.startsWith(BASE + '/')) f = path.join(P.ROOT, url.slice(BASE.length + 1).split('?')[0]);
  else return route.abort();
  if (path.basename(f) === '.probe-host.html') return route.fulfill({ status: 200, contentType: 'text/html', body: HOST });
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return route.fulfill({ status: 404, body: '' });
  return route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
}

const node = spawn(process.execPath, [path.join(P.ROOT, 'tests/probe/selector-assign-guardian.js')], { stdio: ['pipe', 'pipe', 'inherit'] });
let nbuf = ''; const nwait = [];
node.stdout.setEncoding('utf8');
node.stdout.on('data', (c) => { nbuf += c; let i; while ((i = nbuf.indexOf('\n')) >= 0) { const l = nbuf.slice(0, i); nbuf = nbuf.slice(i + 1); const w = nwait.shift(); if (w) w(JSON.parse(l)); } });
const nodeCall = (op, arg) => new Promise((resolve) => { nwait.push(resolve); node.stdin.write(JSON.stringify({ op, arg }) + '\n'); });

(async () => {
  const b = await P.glass.chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = []; pg.on('pageerror', e => errors.push(e.message));
  const notes = [];
  try {
    await pg.exposeFunction('__probeProviderFor', (url) => nodeCall('providerFor', url));
    await pg.exposeFunction('__probeAssign', (payload) => nodeCall('assign', payload));
    await pg.exposeFunction('__probeNotify', (m) => { notes.push(m); return true; });
    await pg.route('**/*', serve);
    // the host page sits in the renderer folder so fetch('./selector-check.js') resolves as in Clear Glass
    await pg.goto(`${BASE}/clear-glass/renderer/.probe-host.html`); await pg.waitForLoadState('load');
    await pg.waitForFunction(() => { const f = document.getElementById('wv'); return f && f.contentDocument && f.contentDocument.readyState === 'complete' && f.contentDocument.getElementById('thread'); }, null, { timeout: 10000 });
    await pg.evaluate(() => {
      const f = document.getElementById('wv');
      const wv = { executeJavaScript: (code) => Promise.resolve(f.contentWindow.eval(code)), getURL: () => f.contentWindow.location.href };
      const cg = { selectors: { providerFor: (u) => window.__probeProviderFor(u), assign: (x) => window.__probeAssign(x) } };
      window.CGSelectorAssign.mount({ cg, wv, notify: (m) => window.__probeNotify(m) });
      // guardian-picker's own xpath shape
      window.__xp = (n) => { if (n.id) return '//*[@id="' + n.id + '"]'; const parts = []; while (n && n.nodeType === 1) { let i = 1, s = n.previousSibling; while (s) { if (s.nodeType === 1 && s.tagName === n.tagName) i++; s = s.previousSibling; } parts.unshift(n.tagName.toLowerCase() + (i > 1 ? '[' + i + ']' : '')); n = n.parentNode; } return '/' + parts.join('/'); };
    });
    const bar = '#cg-selector-assign';
    const pick = async (elid) => {
      await pg.evaluate((id) => { const d = document.getElementById('wv').contentDocument; const e = d.getElementById(id); e.removeAttribute('id'); window.CGSelectorAssign.offer({ xpath: window.__xp(e), url: 'https://chatgpt.com/c/WEB:probe' }); }, elid);
      await pg.waitForSelector(`${bar} .sa-key`, { timeout: 10000 });
    };

    await pick('new-strong');
    const title = await pg.innerText(`${bar} .sa-title`);
    P.case('offer names the provider and the three roles', title.trim() === '◎ ChatGPT' && await pg.locator(`${bar} .sa-key`).count() === 3, { title });
    await pg.click(`${bar} .sa-key >> text=reply`); await pg.waitForSelector(`${bar} .sa-ok`, { timeout: 10000 });
    const shown = await pg.innerText(bar);
    P.case('the live check result is shown before anything is recorded', shown.includes('div.markdown.prose.w-full') && shown.includes('last of 2 match') && await pg.locator(`${bar} .sa-primary`).count() === 1,
      { shown: shown.replace(/\n/g, ' | ').slice(0, 200) });
    if (process.env.PROBE_SHOT) await pg.screenshot({ path: process.env.PROBE_SHOT });
    const outlined = await pg.evaluate(() => document.getElementById('wv').contentDocument.querySelectorAll('div.markdown.prose.w-full')[1].style.outline);
    P.case('what it reads is outlined on the page', outlined.includes('solid') && outlined.includes('2px'), { outline: outlined });
    await pg.click(`${bar} .sa-primary`); await pg.waitForSelector(`${bar} .sa-ok >> text=guardian`, { timeout: 10000 });
    const done = await pg.innerText(bar);
    P.case("guardian's own answer is shown: recorded, verified, pushed", done.includes('guardian recorded') && done.includes('verified') && done.includes('pushed to 2'), { shown: done.replace(/\n/g, ' | ').slice(0, 200) });
    P.case('the copilot panel gets a line', notes.some(n => String(n).includes('recorded')), { notes });
    const m = await nodeCall('map', 'chatgpt');
    P.case("guardian's map now holds it, verified, sourced picker", m.selectors.resp === 'div.markdown.prose.w-full' && !!m.verified.resp && m.source.resp === 'picker', { map: m });

    await pick('old-p');
    await pg.click(`${bar} .sa-key >> text=reply`); await pg.waitForSelector(`${bar} .sa-bad`, { timeout: 10000 });
    const why = await pg.innerText(`${bar} .sa-bad`);
    P.case('an older answer: refusal and tried candidates shown, no Assign', why.includes('latest') && await pg.locator(`${bar} .sa-tried`).count() === 1 && await pg.locator(`${bar} .sa-primary`).count() === 0, { why });

    await pg.evaluate(() => window.CGSelectorAssign.offer({ xpath: '/html/body', url: 'https://example.com/' }));
    await pg.waitForTimeout(300);
    const txt = await pg.locator(bar).count() ? await pg.innerText(bar) : '';
    P.case('a non-provider page gets no offer', !txt.includes('example'));
    P.case('no page errors', errors.length === 0, { errors });
  } finally {
    await b.close(); node.kill();
  }
  P.done();
})().catch(e => { console.error(e.stack || e); node.kill(); process.exit(1); });
