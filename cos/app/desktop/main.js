'use strict';
/**
 * cos/app/desktop/main.js — COS for Windows: the window, the tray, the inbox watcher (COSA6, 0.60.89)
 * comp_id: cos.app.desktop.main
 * UUID: cos-app-desktop-main-v1-0000-2026-1016-jamesbrooks-001
 *
 * James, 2026-10-16: "cos app for windows"  ("so i can just replace the zip each time ... like cos as a windows application for running my projects")
 *
 * Thin on purpose: everything it does is cos/app/controller.js, which is store.js + runtime.js + switch.js, the same functions the command line calls.
 * Closing the window hides it to the tray (the project keeps running); Quit stops the projects COS started, so nothing is left running with no window to show it.
 * A zip dropped in the inbox folder (or on the window) is installed on its own; what happens next is update.policy (cos/app/settings.js): off = nothing, ask = offered (the default, never started without a click),
 * auto = switched only when verified, newer and the project is idle. Minimize goes to the taskbar like VMware (0.60.90); the window's size and place are remembered.
 * Unverified until run on Windows: the tray, the single-instance lock, the file dialog, drag-and-drop paths.
 */
const { app, BrowserWindow, Tray, Menu, dialog, ipcMain, nativeImage, Notification, shell } = require('electron');
const path = require('path'), fs = require('fs');
const { Controller } = require('../controller.js'); const Store = require('../store.js'); const Settings = require('../settings.js'); const { Shell } = require('../shell.js');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
let win = null, vwin = null, tray = null, quitting = false, watcher = null, ctl = null, sh = null;
// MG36 — win is COS's window: the cockpit (cos/ui on :7797) once it answers, a starting page until then. vwin is the old page, kept as
// Versions & manual update (§0.3); the events it draws go to it.
const W = require('../window.js');
let target = null, lastStart = { started: null, error: null };
const send = (ev) => { for (const x of [vwin, win]) if (x && !x.isDestroyed()) x.webContents.send('cos:event', ev); };
function notify(title, body) { try { if (Notification.isSupported()) new Notification({ title, body }).show(); } catch (_) {} }

function createWindow() {
  const w = ctl ? ctl.settings().settings.window : Settings.DEFAULTS.window;
  win = new BrowserWindow({ width: w.width, height: w.height, ...(w.x !== null && w.y !== null ? { x: w.x, y: w.y } : {}), minWidth: 640, minHeight: 420, backgroundColor: '#0d0e14', title: 'COS', autoHideMenuBar: true, icon: path.join(__dirname, 'icon.png'),
    ...W.frameOptions(ctl ? ctl.settings().settings.frame : 'none'),   // CE7 — borderless: Windows' own buttons over the top right, the page drags by its top bar
    skipTaskbar: false, show: !hiddenStart(), webPreferences: { preload: path.join(__dirname, 'starting-preload.js'), additionalArguments: [`--cos-frame=${(ctl && ctl.settings().settings.frame) || 'none'}`], contextIsolation: true, nodeIntegration: false, sandbox: true } });
  if (w.maximized && !hiddenStart()) win.maximize();
  target = null; retarget();
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); else if (W.allowedUrl(url)) win.loadURL(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!W.allowedUrl(url)) e.preventDefault(); });   // the cockpit's own pages only (MG36)
  // VMware-style: minimize goes to the taskbar (the Electron default, left alone on purpose); CLOSE hides to the tray and the project keeps running.
  // CE1 (2026-11-02) — his choice: closing hides to the tray (the default: every system keeps running) or quits COS (which stops what COS
  // started, as the tray's Quit does); minimizing goes to the taskbar (the default) or to the tray
  win.on('close', (e) => { if (quitting) return; saveBounds(); e.preventDefault(); if (ctl && ctl.settings().settings.onClose === 'quit') quit(); else win.hide(); });
  win.on('minimize', (e) => { if (ctl && ctl.settings().settings.onMinimize === 'tray') { e.preventDefault(); win.hide(); } });
  let t = null; const later = () => { clearTimeout(t); t = setTimeout(saveBounds, 800); }; win.on('resize', later); win.on('move', later);
}
function saveBounds() {
  try { if (!win || win.isDestroyed() || win.isMinimized()) return; const max = win.isMaximized(); const b = max ? win.getNormalBounds() : win.getBounds();
    Settings.saveWindow(ctl.root, { width: b.width, height: b.height, x: b.x, y: b.y, maximized: max }); } catch (_) {}
}
const show = () => { if (!win || win.isDestroyed()) createWindow(); if (win.isMinimized()) win.restore(); win.show(); win.focus(); };
// MG37 — started at logon with --hidden: straight to the tray (his startHidden, on by default)
function hiddenStart() { return process.argv.includes('--hidden') && !!(ctl && ctl.settings().settings.startHidden); }
// MG36 — what the window shows, re-checked every 2 s: the cockpit when it answers, else the starting page saying why
async function retarget() {
  if (!win || win.isDestroyed()) return;
  const st = await ctl.state().catch(() => null); const name = (ctl.settings().settings.startOnLaunch) || 'nexus';
  const p = st && st.projects.find(x => x.project === name);
  const t = W.windowTarget({ cockpitUp: await W.cockpitUp(), linked: p && p.linked, started: p && p.run ? p.run.running : lastStart.started, error: lastStart.error });
  if (!target || target.kind !== t.kind) { if (t.kind === 'cockpit') win.loadURL(t.url); else win.loadFile(path.join(__dirname, 'starting.html')); }
  target = t; if (t.kind === 'starting') win.webContents.send('cos:starting', t);
}
// MG36 — the old page, kept: Versions & manual update (link a folder, import a zip, switch, roll back)
function openVersions() {
  if (vwin && !vwin.isDestroyed()) { vwin.show(); vwin.focus(); return { ok: true }; }
  vwin = new BrowserWindow({ width: 1000, height: 720, minWidth: 640, minHeight: 420, backgroundColor: '#0d0e14', title: 'COS — Versions & manual update', autoHideMenuBar: true, icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  vwin.loadFile(path.join(__dirname, 'ui', 'index.html'));
  vwin.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  vwin.webContents.on('will-navigate', (e) => e.preventDefault());
  return { ok: true };
}
// MG37 — COS starts with Windows (his startWithWindows, startElevated): applied when the wanted state differs from the one last applied
async function applyLogon(force = false) {
  const S = ctl.settings().settings, L = require('../logon.js');
  const want = { enable: !!S.startWithWindows, elevated: !!S.startElevated, exe: L.exePath() };
  const was = S.logonApplied || {};
  if (!force && was.enable === want.enable && was.elevated === want.elevated && was.exe === want.exe) return was;
  const r = await L.apply({ ...want, setLoginItem: (o) => app.setLoginItemSettings(o) });
  const rec = { ...want, via: r.via, elevatedNow: !!r.elevated, at: new Date().toISOString(), ...(r.note ? { note: r.note } : {}), ...(r.error ? { error: r.error } : {}) };
  ctl.setSetting('logonApplied', rec); if (r.note) notify('COS at startup', r.note); return rec;
}

function buildTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon); tray.setToolTip('COS');
  const menu = async () => { const s = await ctl.state(); const items = [{ label: 'Open COS', click: show }, { type: 'separator' }];
    for (const p of s.projects) items.push({ label: `${p.project}: ${p.run && p.run.running ? `running ${p.run.version}${p.run.healthy ? '' : ' (not answering)'}` : 'stopped'}`, enabled: false });
    const S = ctl.settings().settings, flip = (k) => async () => { ctl.setSetting(k, !S[k]); if (k !== 'startHidden') await applyLogon(true); };
    items.push({ type: 'separator' }, { label: 'Versions & manual update', click: () => openVersions() },
      { type: 'separator' }, { label: 'Start COS with Windows', type: 'checkbox', checked: !!S.startWithWindows, click: flip('startWithWindows') },
      { label: 'Start in the tray', type: 'checkbox', checked: !!S.startHidden, click: flip('startHidden') },
      { label: 'Admin rights at startup (one approval)', type: 'checkbox', checked: !!S.startElevated, enabled: !!S.startWithWindows, click: flip('startElevated') },
      { type: 'separator' },   // CE1 — what the window's buttons do
      { label: 'Closing the window', submenu: [
        { label: 'Hides COS to the tray (systems keep running)', type: 'radio', checked: S.onClose !== 'quit', click: () => ctl.setSetting('onClose', 'tray') },
        { label: 'Quits COS (stops what COS started)', type: 'radio', checked: S.onClose === 'quit', click: () => ctl.setSetting('onClose', 'quit') }] },
      { label: 'The window (from its next opening)', submenu: [   // CE7 — "Also make it borderless."; Windows' frame is the way back
        { label: 'Borderless', type: 'radio', checked: S.frame !== 'windows', click: () => ctl.setSetting('frame', 'none') },
        { label: "With Windows' frame", type: 'radio', checked: S.frame === 'windows', click: () => ctl.setSetting('frame', 'windows') }] },
      { label: 'Minimizing the window', submenu: [
        { label: 'Goes to the taskbar', type: 'radio', checked: S.onMinimize !== 'tray', click: () => ctl.setSetting('onMinimize', 'taskbar') },
        { label: 'Goes to the tray', type: 'radio', checked: S.onMinimize === 'tray', click: () => ctl.setSetting('onMinimize', 'tray') }] },
      { type: 'separator' }, { label: 'Open the inbox folder', click: () => shell.openPath(s.inbox.path) }, { label: 'Quit (stops what COS started)', click: () => quit() }); return Menu.buildFromTemplate(items); };
  tray.on('click', show); tray.on('right-click', async () => tray.popUpContextMenu(await menu()));
}
// CE4 (2026-11-02) — James: "i want toasts in cos ui for gibhub updates with a update tool". While COS's window is hidden, the update the
// cockpit's card would show comes as a Windows notification, once per version and kind; clicking it opens COS on the card (the tool is there).
function watchUpdates() {
  const seen = new Set();
  const tick = () => {
    if (win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()) return;   // the cockpit's card shows it
    require('http').get({ hostname: '127.0.0.1', port: Number(process.env.COS_MANAGER_PORT) || 7799, path: '/api/cos/update/notice', timeout: 4000 }, (r) => {
      let b = ''; r.on('data', c => { b += c; }); r.on('end', () => {
        let n; try { n = JSON.parse(b); } catch (_) { return; }
        if (!n || !n.show || !['available', 'blocked', 'updated'].includes(n.kind)) return;
        const k = `${n.kind}:${n.latest || n.at}`; if (seen.has(k)) return; seen.add(k);
        try { if (!Notification.isSupported()) return; const x = new Notification({ title: n.title || 'Nexus update', body: n.kind === 'blocked' ? `${n.text} — open COS: Keep mine and update` : (n.text || '') }); x.on('click', show); x.show(); } catch (_) {}
      });
    }).on('error', () => {}).on('timeout', function () { this.destroy(); });
  };
  setTimeout(tick, 60000); setInterval(tick, 10 * 60000);
}
async function quit() { quitting = true; try { if (sh) sh.cancel(); } catch (_) {} try { await ctl.stopAll(); } catch (_) {} app.quit(); }

async function afterArrival(x) {
  const pol = await ctl.applyPolicy(x);
  if (pol.action === 'switched') notify('COS', pol.ok ? `${x.project} switched to ${x.version}.` : `${x.project}: switching to ${x.version} failed and was rolled back. Open COS for the reason.`);
  else if (pol.action === 'waiting') notify('COS', `${x.project} ${x.version} is installed and waiting: ${pol.reason}.`);
  else if (pol.action === 'offer') notify('COS', `${x.project} ${x.version} is installed. Open COS to switch to it.${pol.reason ? ' (' + pol.reason + ')' : ''}`);
  send({ type: 'policy', project: x.project, version: x.version, ...pol, result: undefined });
  return pol;
}
function watchInbox() {
  const inbox = path.join(ctl.root, 'inbox'); fs.mkdirSync(inbox, { recursive: true }); let t = null;
  // update.policy "off": nothing in the inbox is touched by itself (a person can still press Import).
  const scan = () => { clearTimeout(t); t = setTimeout(async () => { if (ctl.settings().settings.update.policy === 'off') return; const r = ctl.scanInbox({}); for (const x of r.results) if (x.ok && !x.already) await afterArrival(x); }, 1500); };
  try { watcher = fs.watch(inbox, () => scan()); } catch (_) {} scan();
  setInterval(() => { ctl.retryWaiting().catch(() => {}); }, 30000);
}

function ipc() {
  const h = (name, fn) => ipcMain.handle('cos:' + name, async (_e, ...a) => { try { return await fn(...a); } catch (e) { return { ok: false, error: e.message }; } });
  h('state', () => ctl.state());
  h('openVersions', () => openVersions()); h('starting', () => target || W.windowTarget({}));   // MG36
  // 0.1.2 — a newer COS: the check, and the release page opened in the browser (only a github.com release page of this repo)
  h('appUpdate', () => ctl.appUpdate());
  h('openRelease', (url) => { if (typeof url !== 'string' || !/^https:\/\/github\.com\/HorrisEllis\/[Nn]exus\/releases\/tag\/cos-v\d+\.\d+\.\d+$/.test(url)) return { ok: false, error: 'not a COS release page' }; shell.openExternal(url); return { ok: true }; });
  h('pickZip', async () => { const r = await dialog.showOpenDialog(win, { title: 'Pick a release zip', properties: ['openFile'], filters: [{ name: 'Release zip', extensions: ['zip'] }] }); return r.canceled ? {} : { path: r.filePaths[0] }; });
  h('importPath', async (p) => { if (typeof p !== 'string' || !/\.zip$/i.test(p)) return { ok: false, error: 'that is not a .zip file' }; const r = ctl.importZip(p); if (r.ok && !r.already) r.policy = await ctl.applyPolicy(r); return r; });
  // the command line: one console, one command at a time; it returns at once and streams output as events (sh.data), then sh.exit with the code
  h('shRun', (line) => { if (typeof line !== 'string' || line.length > 2000) return { ok: false, error: 'not a command line' }; if (sh.running) return { ok: false, error: 'a command is still running: press Stop first' }; sh.run(line).then((code) => send({ type: 'sh.exit', code }), (e) => { send({ type: 'sh.data', text: `✗ ${e.message}\n` }); send({ type: 'sh.exit', code: 1 }); }); return { ok: true }; });
  h('shCancel', () => ({ ok: true, cancelled: sh.cancel() }));
  h('getSettings', () => ctl.settings()); h('setSetting', (k, v) => ctl.setSetting(String(k), v));
  h('switchTo', (project, v) => ctl.switchTo(String(project), String(v))); h('rollback', (project, o) => ctl.rollback(String(project), o || {}));
  // MG35 — "need the exe for cos. its how were going to start nexus from now on": his own Nexus folder linked, and started when COS opens
  h('pickFolder', async () => { const r = await dialog.showOpenDialog(win, { title: 'Pick your Nexus folder (the one with VERSION and lib/nexus/autopilot.js)', properties: ['openDirectory'] }); return r.canceled ? {} : { path: r.filePaths[0] }; });
  h('link', (project, folder) => { const r = ctl.link(String(project || 'nexus'), String(folder || '')); if (r.ok && !ctl.settings().settings.startOnLaunch) ctl.setSetting('startOnLaunch', r.project); return r; });
  h('unlink', (project) => ctl.unlink(String(project)));
    h('start', (project) => ctl.start(String(project))); h('stop', (project) => ctl.stop(String(project))); h('remove', (project, v) => ctl.remove(String(project), String(v))); h('logs', (project) => ctl.logs(String(project)));
}

app.on('second-instance', show);
app.whenReady().then(() => {
  ctl = new Controller({ root: process.env.COS_APP_ROOT || Store.defaultRoot(), onEvent: send }); fs.mkdirSync(ctl.root, { recursive: true });
  sh = new Shell({ root: ctl.root, project: 'nexus', stdio: 'pipe', out: (t) => send({ type: 'sh.data', text: t }) }); ipc(); createWindow(); buildTray(); watchInbox();
  startOnLaunch();
  setInterval(() => { retarget().catch(() => {}); }, 2000); applyLogon().catch(() => {});
  watchUpdates();   // CE4: the update as a Windows notification while COS is in the tray
});
// MG35 (MOD-COSA-START-ON-LAUNCH) — the exe is how Nexus starts: the project he chose starts when COS opens; a failure is said, never silent
async function startOnLaunch() {
  const p = ctl.settings().settings.startOnLaunch; if (!p) return;
  send({ type: 'op.start', project: p, what: 'starting when COS opened' });
  const r = await ctl.start(p); lastStart = { started: !!(r && r.ok), error: r && !r.ok ? r.error : null }; retarget();
  if (r && r.ok) notify('Nexus is running', `${p} started (${r.version || 'linked folder'}) — COS supervises it; closing this window keeps it running`);
  else notify('Nexus did not start', String((r && r.error) || 'no answer').split('\n')[0].slice(0, 200));
  send({ type: 'launch.start', project: p, ok: !!(r && r.ok), error: r && r.error });
}
app.on('window-all-closed', () => { /* stays in the tray */ });
app.on('before-quit', () => { quitting = true; });
