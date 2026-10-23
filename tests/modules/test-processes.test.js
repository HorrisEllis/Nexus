'use strict';
/**
 * tests/modules/test-processes.test.js — what is running in Clear Glass, and what just happened (SP5, 0.60.219)
 * Map: docs/2026-10-23-site-profile-processes-phasemap.spec SP5 · Spec: clear-glass/spec/site-profile.spec MOD-SP-PROCESSES
 * James, 2026-10-23: "Also need a processes screen for background tabs and activity."
 *
 *   PR-01  the activity ring: kept newest first, filtered by kind and site, the last 500 only; an event with no kind dropped and counted;
 *          the bus events it reads (driver, background tabs, downloads, workflow runs, errors) become one line each; a driver read is not
 *   PR-02  list(): one row per OS process with its pages; a background tab named as one with its memory; the window's own page as the window;
 *          the GPU and browser processes with no page; metrics unavailable → rows without numbers, said
 *   PR-03  end(): an agent is refused; his end of a background tab closes it (by person) and is a line in the activity; a page gone → 404;
 *          a Clear Glass window → 409; a site's tab → its renderer ended
 *   PR-04  the doors: processes:end and the person's site-profile writes are denied to agents by name; the command rows exist;
 *          a key that limits agents is refused to any caller but the person (site, command table, /cli)
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);
const { createProcesses, createActivity, KINDS } = require(CG('src/processes/index.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

// a fake Electron: windows with their own page (browser.html) and the sites inside them as <webview> guests
function world() {
  const all = [];
  const wc = (id, pid, url, { host = null, type = 'window', title = '' } = {}) => {
    const w = { id, pid, url, hostWebContents: host, crashedBy: null, destroyed: false, title,
      isDestroyed() { return this.destroyed; }, getOSProcessId() { return this.pid; }, getURL() { return this.url; }, getType() { return type; },
      getTitle() { return this.title; }, isCrashed() { return !!this.crashedBy; }, forcefullyCrashRenderer() { this.crashedBy = 'person'; } };
    all.push(w); return w;
  };
  const mainChrome = wc(1, 10, 'file:///app/clear-glass/renderer/browser.html?agentId=default', { title: 'Clear Glass — default' });
  const site = wc(2, 11, 'https://news.example/today', { host: mainChrome, type: 'webview', title: 'News' });
  const bgChrome = wc(3, 12, 'file:///app/clear-glass/renderer/browser.html?agentId=bg-1');
  const bgPage = wc(4, 13, 'https://bg.example/feed', { host: bgChrome, type: 'webview', title: 'Feed' });
  const provChrome = wc(5, 14, 'file:///app/clear-glass/renderer/browser.html?agentId=claude');
  const prov = wc(6, 15, 'https://claude.ai/new', { host: provChrome, type: 'webview', title: 'Claude' });
  const mb = (kb) => ({ workingSetSize: kb });
  const metrics = [
    { pid: 1, type: 'Browser', memory: mb(204800), cpu: { percentCPUUsage: 1.5 } }, { pid: 2, type: 'GPU', memory: mb(102400), cpu: { percentCPUUsage: 0.4 } },
    { pid: 10, type: 'Tab', memory: mb(51200), cpu: { percentCPUUsage: 0.1 } }, { pid: 11, type: 'Tab', memory: mb(307200), cpu: { percentCPUUsage: 12.25 } },
    { pid: 12, type: 'Tab', memory: mb(40960), cpu: { percentCPUUsage: 0 } }, { pid: 13, type: 'Tab', memory: mb(153600), cpu: { percentCPUUsage: 3 } },
    { pid: 14, type: 'Tab', memory: mb(40960), cpu: { percentCPUUsage: 0 } }, { pid: 15, type: 'Tab', memory: mb(409600), cpu: { percentCPUUsage: 5 } },
  ];
  let metricsFail = false;
  const electron = {
    app: { getAppMetrics: () => { if (metricsFail) throw new Error('not ready'); return metrics; } },
    webContents: { getAllWebContents: () => all.filter(w => !w.destroyed), fromId: (id) => all.find(w => w.id === id) || null },
  };
  const bgTabs = new Map([['bg-1', { webContents: bgChrome }]]);
  const windows = new Map([['default', { webContents: mainChrome }], ['claude', { webContents: provChrome }]]);
  const closed = [];
  const activity = createActivity();
  const P = createProcesses({ electron, bgTabs: () => bgTabs, windows: () => windows, providerIds: () => ['claude'],
    closeBackgroundTab: (id, o) => { closed.push([id, o]); bgTabs.delete(id); bgChrome.destroyed = true; bgPage.destroyed = true; }, activity });
  return { P, activity, closed, site, bgPage, mainChrome, prov, failMetrics: () => { metricsFail = true; } };
}

(async () => {
  console.log('\n⬡  processes and activity\n');

  await test('PR-01', 'the activity ring: newest first, filters, the last 500, kinds; the bus events it reads, one line each', () => {
    let t = 0; const A = createActivity({ max: 500, now: () => ++t });
    assert.strictEqual(A.push({ what: 'no kind' }), null); assert.strictEqual(A.dropped(), 1);
    for (let i = 0; i < 510; i++) A.push({ kind: 'nav', url: `https://s${i % 2}.example/p${i}`, what: `p${i}` });
    assert.strictEqual(A.size(), 500, 'the last 500');
    assert.strictEqual(A.recent({ limit: 1 })[0].what, 'p509', 'newest first');
    assert.ok(A.recent({ origin: 'https://s1.example', limit: 500 }).every(e => e.origin === 'https://s1.example'));
    const B = createActivity();
    assert.strictEqual(B.fromEvent('driver.result', { action: 'getUrl', agentId: 'mesh-claude' }), null, 'a read is not a line');
    const nav = B.fromEvent('driver.result', { action: 'navigate', agentId: 'mesh-claude', result: { url: 'https://x.example/a' }, execId: 'e1' });
    assert.deepStrictEqual([nav.kind, nav.by, nav.origin, nav.ref], ['driver', 'agent:mesh-claude', 'https://x.example', 'e1']);
    assert.strictEqual(B.fromEvent('driver.error', { action: 'click', agentId: 'default', error: 'Element not found' }).level, 'error');
    assert.strictEqual(B.fromEvent('bgtab.closed', { agentId: 'bg-1', by: 'person' }).by, 'person');
    assert.strictEqual(B.fromEvent('downloads.completed', { filename: 'a.zip', state: 'interrupted', id: 'd1' }).level, 'warn');
    assert.match(B.fromEvent('automation.run.error', { id: 'wf1', step: 'agent', error: 'no reply' }).what, /workflow wf1 failed at agent: no reply/);
    assert.match(B.fromEvent('error.captured', { type: 'uncaughtException', message: 'boom\n at x', id: 'r1' }).what, /^uncaughtException: boom$/);
    assert.strictEqual(B.fromEvent('dom.mutations', {}), null);
    assert.deepStrictEqual(B.recent().map(e => e.kind), ['error', 'workflow', 'download', 'bgtab.close', 'driver', 'driver']);
    for (const k of ['nav', 'bgtab.open', 'bgtab.close', 'driver', 'macro', 'workflow', 'download', 'error', 'process.end']) assert.ok(KINDS.has(k), k);
  });

  await test('PR-02', 'list(): one row per process with its pages; background tab with its memory; the window as the window; GPU and browser', () => {
    const { P, failMetrics } = world();
    const l = P.list();
    const by = (pid) => l.rows.find(r => r.pid === pid);
    assert.deepStrictEqual([by(11).kind, by(11).origin, by(11).memoryMB, by(11).cpu], ['tab', 'https://news.example', 300, 12.3]);
    assert.deepStrictEqual([by(13).kind, by(13).tabs[0].agentId, by(13).memoryMB, by(13).title], ['background-tab', 'bg-1', 150, 'Feed']);
    assert.strictEqual(by(15).kind, 'provider');
    assert.strictEqual(by(10).kind, 'window', 'browser.html is the window, not a page');
    assert.deepStrictEqual([by(1).kind, by(2).kind, by(2).tabs.length], ['browser', 'gpu', 0]);
    assert.strictEqual(l.rows[0].pid, 15, 'heaviest first');
    assert.deepStrictEqual([l.totals.processes, l.totals.backgroundTabs], [8, 1]);
    failMetrics();
    const l2 = P.list();
    assert.match(l2.why, /process metrics unavailable \(not ready\); rows have no memory or CPU/);
    assert.strictEqual(l2.rows.find(r => r.pid === 13).memoryMB, null);
  });

  await test('PR-03', 'end(): an agent refused; his end of a background tab closes it and is said; gone → 404; window → 409; a tab → its renderer', () => {
    const { P, activity, closed, site, mainChrome } = world();
    assert.deepStrictEqual(P.end(4, { by: 'agent:mesh-claude' }).status, 403);
    assert.strictEqual(closed.length, 0, 'nothing closed for the agent');
    const r = P.end(4, { by: 'person' });
    assert.deepStrictEqual([r.ok, r.did, r.agentId], [true, 'closed', 'bg-1']);
    assert.deepStrictEqual(closed, [['bg-1', { by: 'person' }]]);
    const line = activity.recent({ kind: 'process' })[0];
    assert.deepStrictEqual([line.kind, line.by, line.origin], ['process.end', 'person', 'https://bg.example']);
    assert.strictEqual(P.end(4, { by: 'person' }).status, 404, 'gone since the list');
    assert.strictEqual(P.end(mainChrome.id, { by: 'person' }).status, 409);
    const t = P.end(site.id, { by: 'person' });
    assert.deepStrictEqual([t.ok, t.did, site.crashedBy], [true, 'ended', 'person']);
  });

  await test('PR-04', 'the doors: denied to agents by name; the command rows; a key that limits agents is the person\'s alone', async () => {
    const reg = require(CG('src/ipc/handler-registry.js'));
    const src = require('fs').readFileSync(CG('src/ipc/handler-registry.js'), 'utf8');
    for (const ch of ['processes:end', 'site-profile:set', 'site-profile:clear']) assert.ok(new RegExp(`'${ch}':`).test(src), `${ch} denied by name`);
    if (typeof reg.invoke === 'function') { const r = await reg.invoke('processes:end', [{ wcId: 1 }], {}).catch(e => ({ error: e.message })); assert.ok(r && (r.error || r.ok === false), JSON.stringify(r)); }
    const bridge = require('fs').readFileSync(CG('src/ipc/bridge.js'), 'utf8');
    assert.match(bridge, /app\.post\('\/cli\/processes\/end', \(req, res\) => res\.status\(403\)/);
    const { SPEC } = await import(path.join(ROOT, 'idearium/cli/route-commands.js'));
    for (const k of ['site', 'glass.processes', 'glass.activity']) assert.ok(SPEC.find(x => x.key === k), `command ${k}`);
    const site = SPEC.find(x => x.key === 'site');
    assert.match(site.personOnly({ args: ['shop.example', 'set', 'driver.allowed', 'true'] }), /limits what agents may do/);
    assert.strictEqual(site.personOnly({ args: ['shop.example', 'set', 'mesh.agent', 'claude'] }), null);
    const { createSiteProfile } = require(CG('src/site-settings/profile.js'));
    const { SiteSettingsStore } = require(CG('src/site-settings/store.js')); const st = new SiteSettingsStore(); st._persist = () => {};
    const SP = createSiteProfile({ store: st });
    assert.match(SP.setSite('https://shop.example/', 'driver.allowed', true, { by: 'cli' }).why, /limits what agents may do on a site — he changes it/);
    assert.match(SP.clearSite('https://shop.example/', 'guardian.capture', { by: 'agent:x' }).why, /limits what agents/);
    assert.strictEqual(SP.setSite('https://shop.example/', 'mesh.agent', 'claude', { by: 'cli' }).ok, true, 'a key that does not limit agents');
    assert.strictEqual(SP.setSite('https://shop.example/', 'driver.allowed', false, { by: 'person' }).ok, true, 'the person');
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
