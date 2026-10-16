'use strict';
/**
 * cos/app/desktop/main.js — COS for Windows: the window, the tray, the inbox watcher (COSA6, 0.60.68)
 * comp_id: cos.app.desktop.main
 * UUID: cos-app-desktop-main-v1-0000-2026-1016-jamesbrooks-001
 *
 * James, 2026-10-16: "cos app for windows"  ("so i can just replace the zip each time ... like cos as a windows application for running my projects")
 *
 * Thin on purpose: everything it does is cos/app/controller.js, which is store.js + runtime.js + switch.js, the same functions the command line calls.
 * Closing the window hides it to the tray (the project keeps running); Quit stops the projects COS started, so nothing is left running with no window to show it.
 * A zip dropped in the inbox folder is installed on its own and OFFERED for switching: it is never started without a click.
 * Unverified until run on Windows: the tray, the single-instance lock, the file dialog, drag-and-drop paths.
 */
const { app, BrowserWindow, Tray, Menu, dialog, ipcMain, nativeImage, Notification, shell } = require('electron');
const path = require('path'), fs = require('fs');
const { Controller } = require('../controller.js'); const Store = require('../store.js');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
let win = null, tray = null, quitting = false, watcher = null, ctl = null;

const send = (ev) => { if (win && !win.isDestroyed()) win.webContents.send('cos:event', ev); };
function notify(title, body) { try { if (Notification.isSupported()) new Notification({ title, body }).show(); } catch (_) {} }

function createWindow() {
  win = new BrowserWindow({ width: 1000, height: 720, minWidth: 640, minHeight: 420, backgroundColor: '#0d0e14', title: 'COS', autoHideMenuBar: true, icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
}
const show = () => { if (!win || win.isDestroyed()) createWindow(); win.show(); win.focus(); };

function buildTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon); tray.setToolTip('COS');
  const menu = async () => { const s = await ctl.state(); const items = [{ label: 'Open COS', click: show }, { type: 'separator' }];
    for (const p of s.projects) items.push({ label: `${p.project}: ${p.run && p.run.running ? `running ${p.run.version}${p.run.healthy ? '' : ' (not answering)'}` : 'stopped'}`, enabled: false });
    items.push({ type: 'separator' }, { label: 'Open the inbox folder', click: () => shell.openPath(s.inbox.path) }, { label: 'Quit (stops what COS started)', click: () => quit() }); return Menu.buildFromTemplate(items); };
  tray.on('click', show); tray.on('right-click', async () => tray.popUpContextMenu(await menu()));
}
async function quit() { quitting = true; try { await ctl.stopAll(); } catch (_) {} app.quit(); }

function watchInbox() {
  const inbox = path.join(ctl.root, 'inbox'); fs.mkdirSync(inbox, { recursive: true }); let t = null;
  const scan = () => { clearTimeout(t); t = setTimeout(() => { const r = ctl.scanInbox({}); for (const x of r.results) { if (x.ok && !x.already) notify('COS', `${x.project} ${x.version} is installed. Open COS to switch to it.`); else if (!x.ok) notify('COS: a zip was refused', `${x.file}: ${x.error}`); } }, 1500); };   // a zip being copied in is still growing: wait for it to settle
  try { watcher = fs.watch(inbox, () => scan()); } catch (_) {} scan();
}

function ipc() {
  const h = (name, fn) => ipcMain.handle('cos:' + name, async (_e, ...a) => { try { return await fn(...a); } catch (e) { return { ok: false, error: e.message }; } });
  h('state', () => ctl.state());
  h('pickZip', async () => { const r = await dialog.showOpenDialog(win, { title: 'Pick a release zip', properties: ['openFile'], filters: [{ name: 'Release zip', extensions: ['zip'] }] }); return r.canceled ? {} : { path: r.filePaths[0] }; });
  h('importPath', (p) => { if (typeof p !== 'string' || !/\.zip$/i.test(p)) return { ok: false, error: 'that is not a .zip file' }; return ctl.importZip(p); });
  h('switchTo', (project, v) => ctl.switchTo(String(project), String(v))); h('rollback', (project, o) => ctl.rollback(String(project), o || {}));
  h('start', (project) => ctl.start(String(project))); h('stop', (project) => ctl.stop(String(project))); h('remove', (project, v) => ctl.remove(String(project), String(v))); h('logs', (project) => ctl.logs(String(project)));
}

app.on('second-instance', show);
app.whenReady().then(() => {
  ctl = new Controller({ root: process.env.COS_APP_ROOT || Store.defaultRoot(), onEvent: send }); fs.mkdirSync(ctl.root, { recursive: true });
  ipc(); createWindow(); buildTray(); watchInbox();
});
app.on('window-all-closed', () => { /* stays in the tray */ });
app.on('before-quit', () => { quitting = true; });
