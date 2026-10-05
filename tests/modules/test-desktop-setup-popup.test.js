'use strict';
// tests/modules/test-desktop-setup-popup.test.js — 0.39.340 DK2 (docs/2026-10-01-idearium-agent-ready-master-phasemap.spec)
// James: "when clicking on setup desktop, i want to have a popup with the progress. like show me what its doing. like
// when you run setup in the run menu in idearium. like I want a setup screen, asking for the username and password.
// and i want options for the vm"
//
// Driven by Clear Glass (clear-glass/src/driver/glass.js) — never Playwright (AXIOMS §4.1). The REAL desktop-setup.js
// and its css against a stubbed api() answering like idearium's routes.
//   DS-01  the repo's setup route passes the desktop account (the defect: only the run menu did)
//   DS-02  step 1: the username prefilled; a bad name and two different passwords are refused, said
//   DS-03  step 2: what this repo needs is ticked and said; Start saves the account and the VM, then the repo's extras,
//          then starts — in that order
//   DS-04  step 3: the setup's own stages ticked from its log; the download bar at its percent; the line it is on
//   DS-05  done: every stage ticked, Open desktop opens this repo's desktop
//   DS-06  failed: the reason and the console's last lines; Try again goes back to the account
//   DS-07  open again while it runs: straight to the progress; closing never stops it
// No engine on the machine: the browser part is SKIPPED, said, never passed.
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..', '..');
const UI = path.join(ROOT, 'idearium', 'ui');
let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

function harness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsu-ui-'));
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${pathToFileURL(path.join(UI, 'css', 'desktop-setup.css')).href}"></head><body>
<script>
  const CALLS = [];
  let STATUS = { state: 'idle', log: [], vm: { ok: false, reason: 'no base image yet' }, host: { accel: 'whpx' } };
  const OPENED = [];
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function toast() {}
  function openRepoDesktop(u) { OPENED.push(u); }
  async function api(p, opts) {
    const method = (opts && opts.method) || 'GET';
    CALLS.push({ p, method, body: opts && opts.body ? JSON.parse(opts.body) : null });
    if (p === '/api/repos/r1/environment' && method === 'GET') return { options: { node: '20' }, check: { vm: { extras: ['go', 'desktop'] } } };
    if (p === '/api/config' && method === 'GET') return { desktop: { user: 'nexus', password: 'nexus', ram_mb: 4096, cpus: 2, network: 'nat' } };
    if (p === '/api/cos/testenv') return STATUS;
    if (p === '/api/repos/r1/environment/setup') { STATUS = { ...STATUS, state: 'running', startedAt: Date.now() - 65000, log: [] }; return { job: { state: 'running' }, extras: ['go', 'desktop'] }; }
    return { ok: true };
  }
</script>
<script src="${pathToFileURL(path.join(UI, 'js', 'desktop-setup.js')).href}"></script>
</body></html>`);
  return path.join(dir, 'index.html');
}

async function main() {
  await test('DS-01', 'the repo\'s setup route passes the desktop account to the setup job', async () => {
    const BS = await import(pathToFileURL(path.join(ROOT, 'idearium', 'api', 'build-surface.js')).href);
    let got = null;
    const deps = {
      getRepoLayer: () => ({ get: () => ({ uuid: 'r1', files: [], environment: { options: { desktop: true } } }) }),
      repoDir: () => os.tmpdir(), emit: () => {},
      config: (k) => ({ 'desktop.user': 'james', 'desktop.password': 's3cret' })[k],
      require: (m) => /setup-job/.test(m) ? { start: (o) => { got = o; return { state: 'running', startedAt: 1 }; } } : require(path.join(ROOT, 'idearium', 'api', m)),
    };
    const r = await BS.environmentSetup(deps, 'r1');
    assert.ok(got, JSON.stringify(r));
    assert.deepStrictEqual(got.login, { user: 'james', password: 's3cret' });
    assert.ok(got.extras.includes('desktop'));
  });

  await test('DS-08', 'the real config: the popup\'s writes (actor user) are accepted; any other actor is refused the login', async () => {
    const C = await import(pathToFileURL(path.join(ROOT, 'idearium', 'lib', 'config.js')).href);
    C.setConfig('desktop.password', 'p4ss', { actor: 'user' });
    C.setConfig('desktop.ram_mb', 6144, { actor: 'user' });
    assert.strictEqual(C.getValue('desktop.password'), 'p4ss');
    assert.strictEqual(C.getValue('desktop.ram_mb'), 6144);
    assert.throws(() => C.setConfig('desktop.password', 'x', { actor: 'desktop-setup' }), /human write required/);
  });

  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!eng) { console.log('  - DS-02…DS-07 SKIPPED: Clear Glass has no engine here (no Electron binary, no Chromium) — the browser checks did not run'); skipped += 6; return; }
  let browser;
  try { browser = await glass.chromium.launch(); }
  catch (e) { console.log(`  - DS-02…DS-07 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped += 6; return; }
  console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${eng.kind}`);
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(harness()).href);
    await page.evaluate(() => openDesktopSetup({ uuid: 'r1', name: 'nexus/core' }));
    await page.waitForSelector('#dsu-user');

    await test('DS-02', 'step 1: the username prefilled; a bad name and different passwords refused', async () => {
      assert.strictEqual(await page.evaluate(() => document.getElementById('dsu-user').value), 'nexus');
      assert.match(await page.textContent('.dsu-step.on'), /1 · Account/);
      await page.fill('#dsu-user', 'James Brooks');
      await page.click('#dsu-next');
      assert.match(await page.textContent('.dsu-err'), /username must start with a letter/);
      await page.fill('#dsu-user', 'james');
      await page.fill('#dsu-pass', 's3cret');
      await page.fill('#dsu-confirm', 'other');
      await page.click('#dsu-next');
      assert.match(await page.textContent('.dsu-err'), /not the same/);
      await page.fill('#dsu-pass', 's3cret');
      await page.fill('#dsu-confirm', 's3cret');
      await page.click('#dsu-next');
      await page.waitForSelector('#dsu-ram');
    });

    await test('DS-03', 'step 2: what the repo needs ticked; Start saves account + VM, then extras, then starts', async () => {
      assert.strictEqual(await page.evaluate(() => document.querySelector('.dsu-lang[value="go"]').checked), true);
      assert.match(await page.textContent('.dsu-langs'), /go this repo needs it/);
      assert.match(await page.textContent('.dsu-engine'), /QEMU · accelerator whpx · no base image yet/);
      assert.strictEqual(await page.evaluate(() => document.getElementById('dsu-desktop').checked), true);
      await page.fill('#dsu-ram', '8192');
      await page.evaluate(() => { CALLS.length = 0; });
      await page.click('#dsu-start');
      await page.waitForSelector('.dsu-stages');
      const actors = await page.evaluate(() => CALLS.filter(c => c.p === '/api/config' && c.method === 'POST').map(c => c.body.actor));
      assert.ok(actors.length && actors.every(a => a === 'user'), `a person's click is actor user (desktop.user/password refuse any other): ${actors}`);
      const calls = await page.evaluate(() => CALLS.filter(c => c.method === 'POST').map(c => [c.p, c.body && (c.body.key || (c.body.options ? JSON.stringify(c.body.options) : null)), (c.body && c.body.value !== undefined) ? c.body.value : null]));
      assert.deepStrictEqual(calls, [
        ['/api/config', 'desktop.user', 'james'],
        ['/api/config', 'desktop.password', 's3cret'],
        ['/api/config', 'desktop.ram_mb', 8192],
        ['/api/repos/r1/environment', JSON.stringify({ node: '20', desktop: true, extras: ['go'] }), null],
        ['/api/repos/r1/environment/setup', null, null],
      ]);
    });

    await test('DS-04', 'step 3: stages ticked from the log, the download bar at its percent, the current line', async () => {
      await page.evaluate(() => {
        STATUS.log = [{ msg: 'QEMU: C:\\Program Files\\qemu\\qemu-system-x86_64.exe' }, { msg: 'downloading https://cloud.debian.org/…/debian-12.qcow2' },
          { msg: 'download 42% (140 of 333 MB)', phase: 'download', pct: 42 }];
        return _dsuPoll();
      });
      const marks = await page.$$eval('.dsu-stage', els => els.map(e => e.className.replace('dsu-stage ', '')));
      assert.deepStrictEqual(marks, ['done', 'now', 'todo', 'todo', 'todo', 'todo']);
      assert.strictEqual(await page.getAttribute('.dsu-bar span', 'style'), 'width:42%');
      assert.match(await page.textContent('.dsu-pct'), /42%/);
      assert.match(await page.textContent('.dsu-line'), /download 42%/);
      assert.match(await page.textContent('.dsu-state'), /setting up · 1:0\d/);
      assert.match(await page.textContent('.dsu-foot'), /Close — it keeps running/);
      await page.click('.dsu-logbtn');
      assert.match(await page.textContent('.dsu-log'), /downloading https/);
    });

    // §0.39.343 — James: "the log keeps pulling to the top, can you pull it down to the current outputs of the log"
    await test('DS-09', 'the log follows the newest line; scrolled up, it stays put; back at the bottom, it follows again', async () => {
      const at = () => page.evaluate(() => { const l = document.querySelector('.dsu-log'); return { top: l.scrollTop, max: l.scrollHeight - l.clientHeight }; });
      const more = (n) => page.evaluate((n) => { for (let i = 0; i < n; i++) STATUS.log.push({ msg: `console: line ${STATUS.log.length}` }); return _dsuPoll(); }, n);
      await more(60);
      let p = await at(); assert.ok(p.max > 0, 'the log overflows'); assert.ok(p.max - p.top < 2, `follows the newest line: ${JSON.stringify(p)}`);
      await page.evaluate(() => { document.querySelector('.dsu-log').scrollTop = 0; });
      await more(10);
      p = await at(); assert.strictEqual(p.top, 0, 'scrolled up to read: it stays put');
      await page.evaluate(() => { const l = document.querySelector('.dsu-log'); l.scrollTop = l.scrollHeight; });
      await more(10);
      p = await at(); assert.ok(p.max - p.top < 2, 'back at the bottom: it follows again');
    });

    await test('DS-07', 'open again while it runs: straight to the progress; closing never stops it', async () => {
      await page.click('.dsu-foot button');
      assert.strictEqual(await page.$$eval('#dsu-modal', e => e.length), 0);
      await page.evaluate(() => { CALLS.length = 0; return openDesktopSetup({ uuid: 'r1' }); });
      await page.waitForSelector('.dsu-stages');
      const posts = await page.evaluate(() => CALLS.filter(c => c.method !== 'GET').length);
      assert.strictEqual(posts, 0, 'nothing started, nothing stopped');
    });

    await test('DS-05', 'done: every stage ticked; Open desktop opens this repo\'s desktop', async () => {
      await page.evaluate(() => { STATUS = { ...STATUS, state: 'done', endedAt: Date.now(), log: [...STATUS.log, { msg: 'ready: C:/nexus/base.qcow2' }] }; return _dsuPoll(); });
      const marks = await page.$$eval('.dsu-stage', els => els.map(e => e.className.replace('dsu-stage ', '')));
      assert.ok(marks.every(m => m === 'done'), marks.join());
      assert.match(await page.textContent('.dsu-ok'), /ready/);
      await page.click('button:has-text("Open desktop")');
      assert.deepStrictEqual(await page.evaluate(() => OPENED), ['r1']);
    });

    await test('DS-06', 'failed: the reason and the console lines; Try again goes back to the account', async () => {
      await page.evaluate(() => { STATUS = { state: 'failed', startedAt: Date.now() - 1000, endedAt: Date.now(), log: [{ msg: 'first boot (accelerator whpx: …)' }],
        result: { ok: false, error: 'the guest did not report in 20 minutes', consoleTail: 'cloud-init: apt failed' } }; return openDesktopSetup({ uuid: 'r1' }); });
      await page.evaluate(() => { _dsu.step = 3; return _dsuPoll(); });
      assert.match(await page.textContent('.dsu-err'), /Setup failed: the guest did not report in 20 minutes/);
      assert.match(await page.textContent('.dsu-err'), /cloud-init: apt failed/);
      assert.ok((await page.$$eval('.dsu-stage.failed', e => e.length)) === 1);
      await page.click('button:has-text("Try again")');
      await page.waitForSelector('#dsu-user');
      assert.deepStrictEqual(errors, []);
    });
  } finally { await browser.close(); }
}

main().then(() => {
  console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped (reasons above)` : ''}`);
  process.exit(failed ? 1 : 0);
}).catch(e => { console.error(e); process.exit(1); });
