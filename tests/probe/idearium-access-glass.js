// Clear Glass probe of Idearium's door — §0.58.0 IA3 (docs/2026-10-10-idearium-access-phasemap.spec).
// James: "what about a app password style login in idearium from clearglass panel, then we could accounts per hat/repo?"
// Idearium's REAL pages and API (startAPI) on a sandboxed store: Settings → Access makes a password for one repo and a hat;
// in password mode the app sends you to the sign-in page, you sign in with it, you are back and held to its scope;
// revoked, you are sent to sign in again. Driven by Clear Glass's engine (clear-glass/src/driver/glass.js), never Playwright.
require(require('path').join(__dirname, '../../lib/test-sandbox.js')).ensure();
const os = require('os'), fs = require('fs'), path = require('path'), net = require('net');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '../..');
const SHOT = process.env.PROBE_SHOT_DIR || os.tmpdir();
process.env.IDEARIUM_ACCESS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-access-'));
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

(async () => {
  process.env.IDEARIUM_PORT = String(await freePort());
  const api = await quiet(() => import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href));
  const R = (m, p, b) => quiet(() => api._route(m, p, b));
  const w0 = (await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: 'Orchard Ledger' })).json.workshop;
  await R('POST', `/api/workshop/${w0.uuid}`, { sections: [{ id: 'purpose', body: 'Track every tree in an orchard.' }] });
  const U = (await R('POST', `/api/workshop/${w0.uuid}/save`, {})).json.repoUuid;
  await quiet(() => api.startAPI());
  await new Promise(r => setTimeout(r, 600));
  const BASE = `http://127.0.0.1:${process.env.IDEARIUM_PORT}`;

  let pass = 0, fail = 0; const check = (n, c, x = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + ' ' + x); } };
  const until = async (pg, fn, arg, n = 40) => { for (let i = 0; i < n; i++) { try { if (await pg.evaluate(fn, arg)) return true; } catch (_) { /* navigating */ } await pg.waitForTimeout(250); } return false; };
  const { chromium } = require(ROOT + '/clear-glass/src/driver/glass.js');
  const br = await chromium.launch();
  try {
    const sp = await br.newPage({ viewport: { width: 1280, height: 900 } }); const errs = []; sp.on('pageerror', e => errs.push(e.message));
    await sp.goto(`${BASE}/settings.html?view=access`);
    await until(sp, () => /Who must sign in/.test(document.getElementById('body').innerText));
    const t0 = await sp.evaluate(() => document.getElementById('body').innerText);
    check('Settings → Access: the mode (origin, said in words) and no passwords yet', /origin/.test(t0) && /websites and other devices sign in/.test(t0) && /No app passwords yet/.test(t0), t0.slice(0, 300));
    await sp.fill('#ax-label', 'reviewer tablet'); await sp.fill('#ax-hat', 'reviewer');
    await sp.evaluate((u) => { document.querySelector(`[data-ax-repo="${u}"]`).checked = true; }, U);
    await sp.click('#ax-make');
    await until(sp, () => !!document.getElementById('ax-pw'));
    const pw = await sp.evaluate(() => (document.getElementById('ax-pw') || {}).textContent || '');
    check('Make password: shown once, with Copy', /^nxa_[0-9a-f]{8}_/.test(pw) && await sp.evaluate(() => !!document.getElementById('ax-copy')), pw.slice(0, 20));
    const t1 = await sp.evaluate(() => document.getElementById('body').innerText);
    check('… listed with its hat, its repo by name and what it may do — never the password itself again', /reviewer tablet/.test(t1) && /hat reviewer/.test(t1) && /Orchard Ledger/.test(t1) && /read_ideas, write_ideas/.test(t1) && t1.split(pw).length === 2, t1.slice(0, 500));
    if (process.env.PROBE_SHOT !== '0') await sp.screenshot({ path: path.join(SHOT, 'settings-access.png') });

    await R('POST', '/api/config', { key: 'access.mode', value: 'password', actor: 'user' });
    const pg = await br.newPage({ viewport: { width: 1280, height: 900 } }); pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(`${BASE}/`);
    const toLogin = await until(pg, () => /\/login\.html$/.test(location.pathname));
    check('password mode: the app sends you to the sign-in page, remembering where you were', toLogin && /next=%2F/.test(await pg.evaluate(() => location.search)));
    await until(pg, () => !!document.getElementById('pw'));
    await pg.fill('#pw', 'nxa_00000000_wrongwrongwrongwrongwrong');
    await pg.click('#go'); await until(pg, () => /wrong app password/.test(document.getElementById('msg').textContent));
    check('a wrong password is refused, said in words', /wrong app password/.test(await pg.evaluate(() => document.getElementById('msg').textContent)));
    if (process.env.PROBE_SHOT !== '0') await pg.screenshot({ path: path.join(SHOT, 'idearium-login.png') });
    await pg.fill('#pw', pw); await pg.click('#go');
    const back = await until(pg, (u) => location.pathname === '/' && typeof API_REPOS !== 'undefined' && API_REPOS.some(r => r.uuid === u), U, 60);
    check('signed in: back in Idearium, the repos load', back);
    const me = await pg.evaluate(() => fetch('/api/access/me').then(r => r.json()));
    check('… as the password\'s label and hat', me.signedIn && me.who.label === 'reviewer tablet' && me.who.hat === 'reviewer', JSON.stringify(me));
    const other = await pg.evaluate(() => fetch('/api/repos/some-other-repo/phases').then(r => r.status));
    check('… held to its repo: another repo is 403', other === 403, String(other));
    await sp.goto(`${BASE}/settings.html?view=access`);
    await until(sp, () => /App passwords/.test(document.getElementById('body').innerText));
    const t2 = await sp.evaluate(() => document.getElementById('body').innerText);
    check('Settings → Access says who you are; making passwords needs admin, and says so', /signed in/.test(t2) && /reviewer tablet/.test(t2) && /does not hold admin/.test(t2), t2.slice(0, 400));
    const id = pw.split('_')[1];
    await R('POST', `/api/access/keys/${id}/revoke`, {});
    await pg.goto(`${BASE}/`);
    check('revoked: the next page is sent to sign in again', await until(pg, () => /\/login\.html$/.test(location.pathname)));
    await R('POST', '/api/config', { key: 'access.mode', value: 'origin', actor: 'user' });
    check('no page errors', errs.length === 0, errs.slice(0, 3).join('; '));
  } finally { await br.close(); try { await R('POST', '/api/config', { key: 'access.mode', value: 'origin', actor: 'user' }); } catch (_) {} }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
