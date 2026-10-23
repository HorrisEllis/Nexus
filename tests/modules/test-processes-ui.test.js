'use strict';
/**
 * tests/modules/test-processes-ui.test.js — the Processes window, in Clear Glass (SP6, 0.60.220)
 * Map: docs/2026-10-23-site-profile-processes-phasemap.spec SP6 · Spec: clear-glass/spec/site-profile.spec MOD-SP-PROCESSES-UI
 * James, 2026-10-23: "Also need a processes screen for background tabs and activity."
 *
 * The page's ClearGlass.processes calls reach the REAL backend (src/processes: createProcesses + the activity ring) over a fake Electron
 * process table, through the engine's exposeFunction.
 *   PU-01  rows render with memory and kind; a background tab closes from its row, confirmed; the feed shows the close, by person
 *   PU-02  the sort survives the 2 s refresh; the selected row stays selected; Pages only hides the GPU and browser rows
 *   PU-03  Clear Glass not answering → the banner says so
 *   PU-04  the way in: Shift+Esc is a default shortcut (and passes the typing guard); ☰ and Tools have Processes; the action opens the window
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);
const { createProcesses, createActivity } = require(CG('src/processes/index.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

function world() {
  const all = [];
  const wc = (id, pid, url, { host = null, type = 'window', title = '' } = {}) => {
    const w = { id, pid, url, hostWebContents: host, crashed: false, destroyed: false, title,
      isDestroyed() { return this.destroyed; }, getOSProcessId() { return this.pid; }, getURL() { return this.url; }, getType() { return type; },
      getTitle() { return this.title; }, isCrashed() { return this.crashed; }, forcefullyCrashRenderer() { this.crashed = true; } };
    all.push(w); return w;
  };
  const mainChrome = wc(1, 10, 'file:///app/clear-glass/renderer/browser.html?agentId=default');
  wc(2, 11, 'https://news.example/today', { host: mainChrome, type: 'webview', title: 'News today' });
  const bgChrome = wc(3, 12, 'file:///app/clear-glass/renderer/browser.html?agentId=bg-1');
  const bgPage = wc(4, 13, 'https://bg.example/feed', { host: bgChrome, type: 'webview', title: 'Feed' });
  const mb = (kb) => ({ workingSetSize: kb });
  const metrics = [
    { pid: 1, type: 'Browser', memory: mb(204800), cpu: { percentCPUUsage: 1.5 } }, { pid: 2, type: 'GPU', memory: mb(102400), cpu: { percentCPUUsage: 0.4 } },
    { pid: 10, type: 'Tab', memory: mb(51200), cpu: { percentCPUUsage: 0.1 } }, { pid: 11, type: 'Tab', memory: mb(307200), cpu: { percentCPUUsage: 12.25 } },
    { pid: 12, type: 'Tab', memory: mb(40960), cpu: { percentCPUUsage: 0 } }, { pid: 13, type: 'Tab', memory: mb(153600), cpu: { percentCPUUsage: 3 } },
  ];
  const electron = { app: { getAppMetrics: () => metrics.filter(m => all.some(w => !w.destroyed && w.pid === m.pid) || m.pid < 10) },
    webContents: { getAllWebContents: () => all.filter(w => !w.destroyed), fromId: (id) => all.find(w => w.id === id) || null } };
  const bgTabs = new Map([['bg-1', { webContents: bgChrome }]]);
  const windows = new Map([['default', { webContents: mainChrome }]]);
  const activity = createActivity();
  activity.push({ kind: 'nav', what: 'News today', url: 'https://news.example/today', by: 'page' });
  const P = createProcesses({ electron, bgTabs: () => bgTabs, windows: () => windows,
    closeBackgroundTab: (id, o) => { bgTabs.delete(id); bgChrome.destroyed = true; bgPage.destroyed = true; activity.fromEvent('bgtab.closed', { agentId: id, by: o && o.by }); }, activity });
  return { P, activity, metrics };
}

(async () => {
  console.log('\n⬡  the Processes window\n');
  const glass = require(CG('src/driver/glass.js'));
  const { initScript } = require(CG('src/driver/cg-stub.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - PU SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); return done(); }
  console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${glass.engine().kind}`);
  const BRIDGE = `(() => { const c = (op) => (...a) => window.__pr(op, a); window.ClearGlass.processes = { list: c('list'), end: c('end'), activity: c('activity') }; })();`;
  async function open({ down = false } = {}) {
    const w = world();
    const page = await browser.newPage({ viewport: { width: 1280, height: 760 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.exposeFunction('__pr', (op, a) => {
      if (down) throw new Error('connect ECONNREFUSED');
      if (op === 'list') return w.P.list();
      if (op === 'end') return w.P.end(a[0], { by: 'person' });
      return { events: w.activity.recent(a[0] || {}) };
    });
    await page.addInitScript(initScript({})); await page.addInitScript(BRIDGE);
    await page.goto(pathToFileURL(CG('renderer/processes.html')).href);
    return { page, errors, w };
  }
  try {
    await test('PU-01', 'rows with memory and kind; a background tab closes from its row, confirmed; the feed shows it, by person', async () => {
      const { page, errors, w } = await open();
      await page.waitForSelector('#pr-rows tr.pr-row[data-kind="background-tab"]');
      const rows = await page.$$eval('#pr-rows tr.pr-row', trs => trs.map(t => [t.dataset.kind, t.querySelector('.pr-name').textContent, t.children[2].textContent]));
      assert.deepStrictEqual(rows[0], ['tab', 'News today', '300 MB'], 'heaviest first');
      assert.ok(rows.some(r => r[0] === 'background-tab' && r[1] === 'Feed' && r[2] === '150 MB'), JSON.stringify(rows));
      assert.ok(rows.some(r => r[0] === 'gpu') && rows.some(r => r[0] === 'browser'));
      assert.match(await page.innerText('#pr-totals'), /processes/);
      await page.click('#pr-rows tr.pr-row[data-kind="background-tab"] [data-act="close"]');
      await page.waitForSelector('#pr-confirm:not([hidden])');
      assert.match(await page.innerText('#pr-confirm-title'), /Close this background tab\?/);
      await page.click('#pr-ok');
      await page.waitForFunction(() => !document.querySelector('#pr-rows tr.pr-row[data-kind="background-tab"]'), null, { timeout: 5000 });
      await page.waitForFunction(() => [...document.querySelectorAll('#pr-feed .pr-ev')].some(li => li.dataset.kind === 'process.end'), null, { timeout: 5000 });
      const ev = await page.$eval('#pr-feed .pr-ev[data-kind="process.end"]', li => li.innerText);
      assert.match(ev, /closed background tab bg-1/); assert.match(ev, /person/);
      assert.strictEqual(w.activity.recent({ kind: 'bgtab' })[0].by, 'person');
      await page.screenshot({ path: path.join(require('os').tmpdir(), 'pu-01-processes.png') }).catch(() => {});
      assert.deepStrictEqual(errors, []); await page.close();
    });

    await test('PU-02', 'the sort survives the refresh; the selection stays; Pages only hides GPU and browser', async () => {
      const { page, errors } = await open();
      await page.waitForSelector('#pr-rows tr.pr-row');
      await page.click('#pr-table th[data-sort="pid"]');
      const pids = () => page.$$eval('#pr-rows tr.pr-row', trs => trs.map(t => +t.dataset.pid));
      const first = await pids();
      assert.deepStrictEqual(first, [...first].sort((a, b) => b - a), 'PID descending');
      await page.click('#pr-rows tr.pr-row[data-pid="11"]');
      await page.waitForTimeout(2300);   // one refresh
      assert.deepStrictEqual(await pids(), first, 'still by PID after a refresh');
      assert.strictEqual(await page.$eval('#pr-rows tr.pr-row.sel', t => t.dataset.pid), '11', 'still selected');
      await page.click('#pr-pages-only');
      const kinds = await page.$$eval('#pr-rows tr.pr-row', trs => trs.map(t => t.dataset.kind));
      assert.ok(kinds.length && kinds.every(k => ['tab', 'background-tab', 'provider'].includes(k)), kinds.join(','));
      assert.deepStrictEqual(errors, []); await page.close();
    });

    await test('PU-03', 'Clear Glass not answering → the banner says so', async () => {
      const { page } = await open({ down: true });
      await page.waitForSelector('#pr-banner:not([hidden])');
      assert.match(await page.innerText('#pr-banner'), /Clear Glass did not answer: .*ECONNREFUSED/);
      await page.close();
    });
  } finally { await browser.close().catch(() => {}); }

  await test('PU-04', 'the way in: Shift+Esc by default; ☰ and Tools rows; the action opens the window', () => {
    const SC = require(CG('src/shortcuts/registry.js'));
    assert.strictEqual(SC.DEFAULT_BINDINGS['Shift+Esc'], 'cg.processes');
    assert.strictEqual(SC.accelFromInput({ type: 'keyDown', key: 'Escape', shift: true }), 'Shift+Esc', 'the key press reads as Shift+Esc');
    assert.strictEqual(SC.isSafe('Shift+Esc'), true); assert.strictEqual(SC.isSafe('Shift+K'), false, 'Shift+letter is still typing');
    const fs = require('fs');
    const menus = fs.readFileSync(CG('renderer/shell/menus.js'), 'utf8');
    assert.match(menus, /label: 'Processes', kbd: 'Shift\+Esc', icon: 'pulse', run: 'processes'/);
    assert.match(menus, /label: 'Processes', kbd: 'Shift\+Esc', ico: '≋', run: 'processes'/);
    assert.match(fs.readFileSync(CG('renderer/browser.js'), 'utf8'), /processes: \(\) => cg\.window\.openProcesses\(\)/);
    assert.match(fs.readFileSync(CG('src/main/index.js'), 'utf8'), /if \(action === 'cg\.processes'\) return openProcessesWindow\(\);/);
  });

  done();
  function done() { console.log(`\n  ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); }
})();
