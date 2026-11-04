'use strict';
// run-all: timeout 120000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-app-window.test.js — MG36 + MG37, 0.60.365 (COS 0.3.0). Maps: docs/2026-10-24-cos-manager-phasemap.spec MG36, MG37;
 * docs/2026-11-02-cos-the-application-phasemap.spec CA_D0, CA_D1. Spec: cos/spec/cos-manager.spec MOD-COSA-COCKPIT-WINDOW, MOD-COSA-AT-LOGON.
 * James, 2026-11-02: "no i mean cos ui as the app. like a full orchastration application. since it's like vmware. not the old one. but maybe add
 * the old one as an manual update feature." · "cos starts up with windows, minimizes to tray unless disabled. admin access and a service if applicable."
 *   CW-01 windowTarget: the cockpit when it answers; else the starting page saying why (no folder linked, not started, failed, starting)
 *   CW-02 cockpitUp against a real stand-in cockpit, up and down; allowedUrl: the cockpit and the app's own files only
 *   CW-03 logon: the task command (ONLOGON, HIGHEST, --hidden) and its removal; elevation declined → the login item, said not elevated;
 *         off removes both; outside Windows the login item; the portable exe's real path used
 *   CW-04 settings: startWithWindows, startElevated, startHidden on by default, booleans only
 *   CW-05 main.js: the main window is the cockpit/starting page with the starting bridge only; the old page opens as Versions & manual update;
 *         the tray has the startup switches; --hidden starts in the tray; logon applied at launch
 *   CW-07 (CE1, 0.60.376) close and minimize are his: onClose tray|quit (tray by default), onMinimize taskbar|tray (taskbar by default); main.js
 *         follows both; the tray menu offers both
 *   CW-08 (CE7, 0.60.378) borderless: frameOptions hides the frame with Windows' own buttons over it (frame: windows is the way back); the
 *         setting; main.js and the preload follow; in Clear Glass the marked cockpit drags by its top bar, its buttons stay clickable, room is
 *         left for Windows' buttons, and the unmarked page (a browser) is unchanged
 *   CW-06 the starting page in Clear Glass: says why it waits; Start shown when not started; Versions & manual update calls the bridge
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const W = require(path.join(ROOT, 'cos/app/window.js')), L = require(path.join(ROOT, 'cos/app/logon.js')), Settings = require(path.join(ROOT, 'cos/app/settings.js'));
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron'))) process.env.GLASS_CHROMIUM = c; }
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }

(async () => {
  console.log('\n⬢  COS the application: the cockpit is the window; it starts with Windows (MG36, MG37)\n');
  const linked = { dir: 'D:\\nexus', version: '0.60.365' };
  await test('CW-01', 'windowTarget: the cockpit when it answers; the starting page says why otherwise', () => {
    assert.deepStrictEqual(W.windowTarget({ cockpitUp: true, linked }), { kind: 'cockpit', url: 'http://127.0.0.1:7797/', why: 'the cockpit answers' });
    assert.match(W.windowTarget({}).why, /Nexus is not installed yet: press Install Nexus \(from GitHub\), or link your own folder in Versions & manual update/);   // CA5 (0.6.0): was "no Nexus folder is linked yet"
    assert.match(W.windowTarget({ linked, started: false }).why, /linked but not started: press Start/);
    assert.match(W.windowTarget({ linked, error: 'port 9000 in use\nmore' }).why, /^Nexus did not start: port 9000 in use$/);
    assert.match(W.windowTarget({ linked, started: true }).why, /^starting Nexus 0\.60\.365 from D:\\nexus — the cockpit opens here/);
  });
  await test('CW-02', 'cockpitUp on a real stand-in, up then down; allowedUrl only the cockpit and the app\'s files', async () => {
    const srv = http.createServer((q, r) => { r.end('<html>cockpit</html>'); }); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
    assert.strictEqual(await W.cockpitUp({ port }), true); srv.close(); await new Promise(r => setTimeout(r, 100)); assert.strictEqual(await W.cockpitUp({ port }), false);
    assert.ok(W.allowedUrl('http://127.0.0.1:7797/ledger') && W.allowedUrl('file:///C:/cos/starting.html'));
    assert.ok(!W.allowedUrl('http://127.0.0.1:9000/') && !W.allowedUrl('https://evil.example/') && !W.allowedUrl('http://localhost:7797/'));
  });
  await test('CW-03', 'logon: the elevated task, its removal; declined → login item, said; off; not Windows; the portable path', async () => {
    assert.deepStrictEqual(L.taskCommand({ exe: 'C:\\COS\\COS.exe' }), { cmd: 'schtasks', args: ['/Create', '/TN', 'COS', '/SC', 'ONLOGON', '/RL', 'HIGHEST', '/TR', '"C:\\COS\\COS.exe" --hidden', '/F'] });
    assert.deepStrictEqual(L.taskCommand({ enable: false }), { cmd: 'schtasks', args: ['/Delete', '/TN', 'COS', '/F'] });
    const calls = [], items = [];
    const ok = await L.apply({ exe: 'C:\\COS.exe', platform: 'win32', runElevated: async (c, a) => { calls.push([c, a[0]]); return { ok: true }; }, setLoginItem: (o) => items.push(o) });
    assert.deepStrictEqual([ok.via, ok.elevated], ['logon-task', true]); assert.deepStrictEqual(calls, [['schtasks', '/Create']]); assert.strictEqual(items.pop().openAtLogin, false, 'no second start through the login item');
    const no = await L.apply({ exe: 'C:\\COS.exe', platform: 'win32', runElevated: async () => ({ ok: false, error: 'the admin approval was declined' }), setLoginItem: (o) => items.push(o) });
    assert.deepStrictEqual([no.via, no.elevated], ['login-item', false]); assert.match(no.note, /not elevated: the admin approval was declined/); assert.deepStrictEqual(items.pop(), { openAtLogin: true, path: 'C:\\COS.exe', args: ['--hidden'] });
    const off = await L.apply({ enable: false, platform: 'win32', runElevated: async (c, a) => { calls.push([c, a[0]]); return { ok: true }; }, setLoginItem: (o) => items.push(o) });
    assert.strictEqual(off.via, 'removed'); assert.deepStrictEqual(calls.pop(), ['schtasks', '/Delete']); assert.strictEqual(items.pop().openAtLogin, false);
    const mac = await L.apply({ exe: '/Applications/COS', platform: 'darwin', setLoginItem: (o) => items.push(o) }); assert.strictEqual(mac.via, 'login-item'); assert.match(mac.note, /no elevation/);
    assert.strictEqual(L.exePath({ PORTABLE_EXECUTABLE_FILE: 'D:\\dl\\COS-0.3.0-portable.exe' }, 'C:\\Temp\\x\\COS.exe'), 'D:\\dl\\COS-0.3.0-portable.exe');
  });
  await test('CW-04', 'settings: start with Windows, elevated, in the tray — on by default, booleans only', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-w-'));
    const d = Settings.load(root).settings; assert.deepStrictEqual([d.startWithWindows, d.startElevated, d.startHidden], [true, true, true]);
    assert.strictEqual(Settings.set(root, 'startHidden', false).settings.startHidden, false);
    assert.strictEqual(Settings.set(root, 'startWithWindows', 'maybe').ok, false);
    fs.rmSync(root, { recursive: true, force: true });
  });
  await test('CW-07', 'close and minimize are his: tray|quit, taskbar|tray; main.js follows; the tray offers both', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-close-'));
    assert.deepStrictEqual([Settings.load(d).settings.onClose, Settings.load(d).settings.onMinimize], ['tray', 'taskbar'], 'the defaults: hide to tray, minimize to taskbar');
    assert.strictEqual(Settings.set(d, 'onClose', 'quit').settings.onClose, 'quit'); assert.strictEqual(Settings.set(d, 'onMinimize', 'tray').settings.onMinimize, 'tray');
    assert.match(Settings.set(d, 'onClose', 'minimize').error, /onClose is tray or quit/); assert.deepStrictEqual(Settings.normalize({ onMinimize: 'x' }).dropped, ['onMinimize "x"']);
    const src = fs.readFileSync(path.join(ROOT, 'cos/app/desktop/main.js'), 'utf8');
    assert.ok(/settings\.onClose === 'quit'\) quit\(\); else win\.hide\(\)/.test(src), 'close follows onClose');
    assert.ok(/win\.on\('minimize', \(e\) => \{ if \(ctl && ctl\.settings\(\)\.settings\.onMinimize === 'tray'\) \{ e\.preventDefault\(\); win\.hide\(\);/.test(src), 'minimize follows onMinimize');
    assert.ok(/label: 'Closing the window'/.test(src) && /label: 'Minimizing the window'/.test(src), 'the tray offers both');
    fs.rmSync(d, { recursive: true, force: true });
  });

  await test('CW-08', "borderless: no frame, Windows' own buttons over it; frame: windows the way back; main.js and the preload follow", () => {
    assert.deepStrictEqual(W.frameOptions(), { titleBarStyle: 'hidden', titleBarOverlay: { color: '#00000000', symbolColor: '#e6e8ef', height: W.OVERLAY_HEIGHT } });
    assert.deepStrictEqual(W.frameOptions('windows'), {}, "Windows' frame: nothing changed");
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-frame-'));
    assert.strictEqual(Settings.load(d).settings.frame, 'none', 'borderless by default');
    assert.strictEqual(Settings.set(d, 'frame', 'windows').settings.frame, 'windows'); assert.match(Settings.set(d, 'frame', 'thin').error, /frame is none or windows/);
    fs.rmSync(d, { recursive: true, force: true });
    const src = fs.readFileSync(path.join(ROOT, 'cos/app/desktop/main.js'), 'utf8'), pre = fs.readFileSync(path.join(ROOT, 'cos/app/desktop/starting-preload.js'), 'utf8');
    assert.ok(/\.\.\.W\.frameOptions\(ctl \? ctl\.settings\(\)\.settings\.frame : 'none'\)/.test(src) && /--cos-frame=\$\{/.test(src), 'the window is made from the setting, and the preload is told');
    assert.ok(/label: 'Borderless'/.test(src) && /With Windows' frame/.test(src), 'the tray offers both');
    assert.ok(/dataset\.cosFrame = 'none'/.test(pre), 'the preload marks the page');
  });

  await test('CW-05', 'main.js: cockpit window with the starting bridge only; Versions & manual update; the tray switches; --hidden; logon at launch', () => {
    const m = fs.readFileSync(path.join(ROOT, 'cos/app/desktop/main.js'), 'utf8');
    assert.ok(/preload: path\.join\(__dirname, 'starting-preload\.js'\)/.test(m) && /show: !hiddenStart\(\)/.test(m));
    assert.ok(/if \(t\.kind === 'cockpit'\) win\.loadURL\(t\.url\); else win\.loadFile\(path\.join\(__dirname, 'starting\.html'\)\)/.test(m));
    assert.ok(/function openVersions\(\)[\s\S]{0,400}preload: path\.join\(__dirname, 'preload\.js'\)[\s\S]{0,200}ui', 'index\.html'/.test(m), 'the old page, with its full bridge, in its own window');
    assert.ok(/Versions & manual update/.test(m) && /Start COS with Windows/.test(m) && /Start in the tray/.test(m) && /Admin rights at startup/.test(m));
    assert.ok(/applyLogon\(\)\.catch/.test(m) && /process\.argv\.includes\('--hidden'\)/.test(m));
    const sp = fs.readFileSync(path.join(ROOT, 'cos/app/desktop/starting-preload.js'), 'utf8');
    assert.deepStrictEqual([...sp.matchAll(/ipcRenderer\.invoke\('cos:(\w+)'/g)].map(x => x[1]), ['starting', 'openVersions', 'start', 'install'], 'the cockpit\'s window gets four calls, nothing else (CA5 added install)');
    const B = require(path.join(ROOT, 'scripts/build-cos-app.js'));
    for (const f of ['cos/app/window.js', 'cos/app/logon.js', 'cos/app/desktop/starting.html', 'cos/app/desktop/starting-preload.js']) assert.ok(B.FILES.includes(f), `${f} staged into the exe`);
  });
  const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - CW-06 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  if (browser) {
    await test('CW-06', 'the starting page in Clear Glass: why it waits; Start when not started; Versions & manual update', async () => {
      const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
      await page.addInitScript(() => { window.__calls = []; window.cosStart = { why: async () => ({ kind: 'starting', why: '0.60.365 is linked but not started: press Start' }), openVersions: async () => { window.__calls.push('versions'); return { ok: true }; }, start: async () => { window.__calls.push('start'); return { ok: true }; }, onStarting: () => {} }; });
      await page.goto('file://' + path.join(ROOT, 'cos/app/desktop/starting.html'));
      await page.waitForFunction(() => /not started/.test(document.getElementById('why').textContent));
      assert.strictEqual(await page.evaluate(() => document.getElementById('start').hidden), false);
      if (process.env.CW_SHOTS) await page.screenshot({ path: path.join(process.env.CW_SHOTS, 'cos-starting.png') });
      await page.evaluate(() => { document.getElementById('versions').click(); document.getElementById('start').click(); });
      await page.waitForFunction(() => window.__calls.length === 2);
      assert.deepStrictEqual(await page.evaluate(() => window.__calls), ['versions', 'start']);
    });
    await test('CW-08b', 'borderless in Clear Glass: the marked cockpit drags by its top bar, its buttons stay clickable, room for Windows\' buttons; a browser unchanged', async () => {
      const url = 'file://' + path.join(ROOT, 'cos/ui/shell/index.html');
      const read = (p) => p.evaluate(() => { const top = document.querySelector('.top'), b = document.getElementById('theme'), cs = (e) => getComputedStyle(e);
        const g = document.getElementById('goto-open').getBoundingClientRect(), t = top.getBoundingClientRect(), h1 = document.getElementById('crumb-title').getBoundingClientRect();
        return { top: cs(top).webkitAppRegion || cs(top).appRegion, btn: cs(b).webkitAppRegion || cs(b).appRegion, room: innerWidth - t.right, inside: g.right <= t.right && g.left >= t.left, title: h1.width }; });
      const app = await browser.newPage({ viewport: { width: 1200, height: 760 } });
      await app.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.cosFrame = 'none'; }); });
      await app.goto(url); await app.waitForSelector('.top');
      const a = await read(app);
      assert.strictEqual(a.top, 'drag', 'the top bar drags the window'); assert.strictEqual(a.btn, 'no-drag', 'its buttons stay clickable'); assert.ok(a.room >= 138, `room for Windows' buttons (${a.room}px)`);
      assert.ok(a.inside, 'Go to stays inside the top bar'); assert.ok(a.title >= 80, `the title is not squeezed away (${a.title}px)`);
      if (process.env.CW_SHOTS) await app.screenshot({ path: path.join(process.env.CW_SHOTS, 'cos-borderless.png') });
      const web = await browser.newPage({ viewport: { width: 1200, height: 760 } }); await web.goto(url); await web.waitForSelector('.top');
      const b = await read(web);
      assert.notStrictEqual(b.top, 'drag', 'in a browser nothing drags'); assert.ok(b.room < 40, 'and the top bar reaches the edge as before');
    });
    await browser.close();
  }
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
