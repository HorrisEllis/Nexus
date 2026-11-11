'use strict';
/**
 * tests/modules/test-cos-desktop-driver.test.js — the desktop driver (cos/remote-desktop/desktop-driver.js), phase PC9 slice a.
 * Map: docs/2026-11-08-pipeline-canvas-phasemap.spec PC9, his PC_D14.
 * James, 2026-11-11: "I'm saying for you. Like look at clearglass. Nexus nerve, cleardriver injecting coordinates into the dom."
 *
 *   DD-01  off until armed: every verb refused (409), said why; the state says not armed
 *   DD-02  only a person arms; an agent's arm is a 403
 *   DD-03  armed view-only: the screen is taken, a click refused
 *   DD-04  armed to act: screen, move, click (left, right, double), type, key, scroll reach the backend with their coordinates
 *   DD-05  every act logged and streamed (cos.desktop.act); typed text logged as its length, never its content
 *   DD-06  disarm is the kill switch: the next act refused; an arm past its time expires by itself
 *   DD-07  no backend on this machine: arming refused, naming what is missing
 *   DD-08  SendKeys text and combos escaped for Windows; the command row builds each verb
 *   DD-09  the Desktop tab in Clear Glass through the real cockpit: off; armed by his click; an agent's act appears live (heard, not polled); disarmed
 *
 * The backend is a stand-in that records each call; the real Windows backend (PowerShell, user32) is proved on his PC.
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron'))) process.env.GLASS_CHROMIUM = c; }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-desktop-'));
process.env.COS_MANAGER_DATA = path.join(tmp, 'data');
const D = require(path.join(ROOT, 'cos/remote-desktop/desktop-driver.js'));

let passed = 0, failed = 0;
async function T(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }
const req = (port, method, p, body) => new Promise((res, rej) => { const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
  const q = http.request({ host: '127.0.0.1', port, path: p, method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {} }, (r) => { let t = ''; r.on('data', c => t += c); r.on('end', () => { try { res({ status: r.statusCode, body: JSON.parse(t || '{}') }); } catch (e) { rej(new Error(t)); } }); });
  q.on('error', rej); if (data) q.write(data); q.end(); });
const wait = async (fn, ms = 5000) => { const until = Date.now() + ms; while (Date.now() < until) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 50)); } throw new Error(`timed out: ${String(fn).slice(0, 140)}`); };

const calls = [];
const standIn = {
  name: 'stand-in',
  async mousemove(x, y) { calls.push(['move', x, y]); },
  async click(x, y, button = 'left', double = false) { calls.push(['click', x, y, button, double]); },
  async keydown(k) { calls.push(['key', k]); },
  async type(t) { calls.push(['type', t]); },
  async scroll(x, y, dy) { calls.push(['scroll', x, y, dy]); },
  async screen(file) { fs.writeFileSync(file, 'png'); calls.push(['screen']); return { width: 1920, height: 1080 }; },
};

(async () => {
  console.log('\n⬢  COS: the desktop driver (PC9)\n');
  const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
  const sup = createSupervisor({ root: tmp, ledgerFile: path.join(tmp, 'ledger.jsonl'), log: () => {}, declarations: [] });
  const mgr = await require(path.join(ROOT, 'cos/manager/server.js')).listen(sup, 0, { root: ROOT, desktopBackend: standIn, noPipelineSync: true }); const M = mgr.address().port;
  const events = []; const es = http.get({ host: '127.0.0.1', port: M, path: '/api/cos/events' }, (r) => { let buf = ''; r.on('data', (c) => { buf += c; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const blk = buf.slice(0, i); buf = buf.slice(i + 2);
    const ev = /^event: (.+)$/m.exec(blk), da = /^data: (.+)$/m.exec(blk); if (ev && da) { try { events.push({ event: ev[1], data: JSON.parse(da[1]) }); } catch (_) {} } } }); });
  const P = (v, b) => req(M, 'POST', `/api/cos/desktop/${v}`, b);

  await T('DD-01', 'off until armed: every verb refused (409), said why; the state says not armed', async () => {
    const s = await req(M, 'GET', '/api/cos/desktop/state');
    assert.strictEqual(s.status, 200); assert.strictEqual(s.body.armed, false); assert.strictEqual(s.body.backend, 'stand-in');
    for (const [v, b] of [['screen', {}], ['click', { x: 1, y: 2 }], ['type', { text: 'x' }], ['key', { keys: 'enter' }], ['move', { x: 1, y: 1 }], ['scroll', { dy: 120 }]]) {
      const r = await P(v, { ...b, by: 'agent:claude' });
      assert.strictEqual(r.status, 409, v); assert.match(r.body.error, /not armed: he arms it in COS/, v);
    }
    assert.strictEqual(calls.length, 0, 'nothing reached the backend');
  });

  await T('DD-02', 'only a person arms; an agent\'s arm is a 403', async () => {
    const r = await P('arm', { minutes: 5, by: 'agent:claude' });
    assert.strictEqual(r.status, 403); assert.match(r.body.error, /only he arms the desktop/);
    assert.strictEqual((await req(M, 'GET', '/api/cos/desktop/state')).body.armed, false);
  });

  await T('DD-03', 'armed view-only: the screen is taken, a click refused', async () => {
    const a = await P('arm', { minutes: 5, mode: 'view', by: 'person' });
    assert.strictEqual(a.status, 200); assert.strictEqual(a.body.armed, true); assert.strictEqual(a.body.mode, 'view'); assert.ok(a.body.leftMs > 4 * 60000);
    const s = await P('screen', { by: 'agent:claude', why: 'look' });
    assert.strictEqual(s.status, 200); assert.strictEqual(s.body.width, 1920); assert.ok(fs.existsSync(s.body.file), 'the PNG is kept');
    const c = await P('click', { x: 5, y: 5, by: 'agent:claude' });
    assert.strictEqual(c.status, 409); assert.match(c.body.error, /view-only/);
    assert.deepStrictEqual(calls, [['screen']]);
  });

  await T('DD-04', 'armed to act: screen, move, click (left, right, double), type, key, scroll reach the backend with their coordinates', async () => {
    calls.length = 0;
    assert.strictEqual((await P('arm', { minutes: 5, mode: 'act', by: 'person' })).body.mode, 'act');
    for (const [v, b] of [['move', { x: 10, y: 20 }], ['click', { x: 30, y: 40 }], ['click', { x: 50, y: 60, button: 'right' }], ['click', { x: 70, y: 80, double: true }],
      ['type', { text: 'hello (world)' }], ['key', { keys: 'ctrl+s' }], ['scroll', { x: 1, y: 2, dy: -240 }]]) {
      const r = await P(v, { ...b, by: 'agent:claude', why: 'try' }); assert.strictEqual(r.status, 200, `${v} ${JSON.stringify(r.body)}`);
    }
    assert.deepStrictEqual(calls, [['move', 10, 20], ['click', 30, 40, 'left', false], ['click', 50, 60, 'right', false], ['click', 70, 80, 'left', true],
      ['type', 'hello (world)'], ['key', 'ctrl+s'], ['scroll', 1, 2, -240]]);
  });

  await T('DD-05', 'every act logged and streamed (cos.desktop.act); typed text logged as its length, never its content', async () => {
    const log = fs.readFileSync(path.join(tmp, 'data', 'desktop', 'log.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(log.some(e => e.verb === 'arm' && e.by === 'person' && e.ok));
    assert.ok(log.some(e => e.verb === 'click' && e.args.x === 30 && e.by === 'agent:claude' && e.why === 'try' && e.ok));
    assert.ok(log.some(e => e.verb === 'click' && e.ok === false && /view-only/.test(e.reason)), 'a refusal is logged too');
    const typed = log.find(e => e.verb === 'type' && e.ok);
    assert.strictEqual(typed.args.chars, 13); assert.ok(!JSON.stringify(log).includes('hello'), 'the text itself is never written');
    await wait(() => events.some(e => e.event === 'cos.desktop.act' && e.data.verb === 'scroll'));
    const leak = events.filter(e => e.event === 'cos.desktop.act' && JSON.stringify(e).includes('hello')); assert.ok(!leak.length, JSON.stringify(leak).slice(0, 600));
  });

  await T('DD-06', 'disarm is the kill switch: the next act refused; an arm past its time expires by itself', async () => {
    const d = await P('disarm', { by: 'person' }); assert.strictEqual(d.body.armed, false);
    assert.strictEqual((await P('click', { x: 1, y: 1, by: 'agent:claude' })).status, 409);
    let t = 0; const drv = D.createDesktopDriver({ backend: standIn, dataDir: path.join(tmp, 'clock'), now: () => t });
    drv.arm({ minutes: 1, by: 'person' }); t = 59000;
    assert.strictEqual((await drv.click({ x: 1, y: 1, by: 'x' })).ok, true);
    t = 61000; const r = await drv.click({ x: 1, y: 1, by: 'x' });
    assert.strictEqual(r.ok, false); assert.match(r.error, /expired/); assert.strictEqual(drv.state().armed, false);
    assert.strictEqual(drv.arm({ minutes: 999, by: 'person' }).leftMs, 60 * 60000, 'at most an hour');
  });

  await T('DD-07', 'no backend on this machine: arming refused, naming what is missing', async () => {
    const drv = D.createDesktopDriver({ backend: null, dataDir: path.join(tmp, 'none') });
    const a = drv.arm({ by: 'person' }); assert.strictEqual(a.ok, false); assert.match(a.error, /cannot be driven here/);
    assert.match(D.pickBackend('darwin').why, /no desktop backend for darwin/);
    assert.ok(D.pickBackend('win32').backend.name.startsWith('windows'));
  });

  await T('DD-08', 'SendKeys text and combos escaped for Windows; the command row builds each verb', async () => {
    assert.strictEqual(D.sendKeysText("a+b (c) {d} ~ it's"), "a{+}b {(}c{)} {{}d{}} {~} it''s");
    assert.strictEqual(D.sendKeysCombo('ctrl+shift+s'), '^+s'); assert.strictEqual(D.sendKeysCombo('alt+f4'), '%{F4}'); assert.strictEqual(D.sendKeysCombo('enter'), '{ENTER}');
    const R = require(path.join(ROOT, 'idearium/cli/route-commands.js')); const rows = R.SPEC;
    const row = rows.find(x => x && x.key === 'cos.desktop'); assert.ok(row, 'the row cos.desktop');
    assert.deepStrictEqual(row.req({ args: [], flags: {} }), { system: 'cos', method: 'GET', path: '/api/cos/desktop/state' });
    assert.deepStrictEqual(row.req({ args: ['arm', '15'], flags: { view: true } }).body, { by: 'person', why: '', minutes: 15, mode: 'view' });
    assert.deepStrictEqual(row.req({ args: ['type', 'hi', 'there'], flags: { by: 'agent:x' } }).body, { by: 'agent:x', why: '', text: 'hi there' });
  });

  await T('DD-09', 'the Desktop tab in Clear Glass through the real cockpit: off; armed by his click; an agent\'s act appears live (heard, not polled); disarmed', async () => {
    const cp = await new Promise(r => { const s = require('net').createServer(); s.listen(0, '127.0.0.1', () => { const q = s.address().port; s.close(() => r(q)); }); });
    const cockpit = require(path.join(ROOT, 'cos/ui/serve.js')).createServer({ port: cp, manager: `http://127.0.0.1:${M}` }); await new Promise(r => cockpit.listen(cp, '127.0.0.1', r));
    const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
    let browser; try { browser = await glass.chromium.launch(); } catch (e) { cockpit.close(); console.log(`  - DD-09 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); return; }
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
      await page.goto(`http://127.0.0.1:${cp}/automation/index.html`);
      const until = async (fn, ms = 10000) => { const t = Date.now() + ms; while (Date.now() < t) { const v = await page.evaluate(fn); if (v) return v; await new Promise(r => setTimeout(r, 150)); } return null; };
      await until(() => !!document.querySelector('[data-tab="desktop"]'));
      await page.evaluate(() => document.querySelector('[data-tab="desktop"]').click());
      assert.ok(await until(() => /^Off\./.test(document.getElementById('dd-state').textContent)), 'off: ' + await page.evaluate(() => document.getElementById('dd-state').textContent));
      assert.ok(await until(() => document.querySelectorAll('#dd-log .dd-act').length > 0), 'the earlier acts listed from the log');
      await page.evaluate(() => { document.getElementById('dd-min').value = '5'; document.getElementById('dd-arm').click(); });
      assert.ok(await until(() => /^Armed \(act\) by person, 4:5\d left/.test(document.getElementById('dd-state').textContent)), 'armed: ' + await page.evaluate(() => document.getElementById('dd-state').textContent));
      const c = await P('click', { x: 321, y: 654, by: 'agent:claude', why: 'seen live' }); assert.strictEqual(c.status, 200);
      assert.ok(await until(() => { const f = document.querySelector('#dd-log .dd-act'); return f && f.dataset.verb === 'click' && /321,654/.test(f.textContent) && /seen live/.test(f.textContent); }), 'the act, live, on top');
      if (process.env.HB_SHOTS) await page.screenshot({ path: path.join(process.env.HB_SHOTS, 'cos-desktop-driver.png'), fullPage: true });
      await page.evaluate(() => document.getElementById('dd-disarm').click());
      assert.ok(await until(() => /^Off\./.test(document.getElementById('dd-state').textContent)), 'disarmed');
      assert.strictEqual((await P('click', { x: 1, y: 1, by: 'agent:claude' })).status, 409);
    } finally { await browser.close(); cockpit.close(); }
  });

  es.destroy(); mgr.close(); sup.shutdown({ by: 'test' });
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
