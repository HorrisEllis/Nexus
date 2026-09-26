'use strict';
/**
 * bridge-electron/main.js — phase 7 (host_application_shell), taken early
 * out of spec order at explicit request. Wraps host.html + signal.js;
 * doesn't rewrite either. host.html is loaded as-is (see preload.js note
 * on the one thing it gains from running inside this shell).
 *
 * Close-to-tray: closing the window hides it, doesn't quit. Real quit is
 * only ever the tray menu's "Quit" item (or the OS killing the process).
 *
 * Background hosting: the signaling server + session authority start at
 * app launch regardless of window visibility, and keep running with the
 * window hidden — "background service" here means "hosting survives the
 * window closing," not a separate OS-level service. A genuine OS service
 * (Windows Service / launchd daemon) is a packaging concern for later,
 * noted in the README rather than half-built here.
 */

const { app, BrowserWindow, Tray, Menu, session, desktopCapturer, nativeImage, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

const { start: startSignaling } = require('../signal.js');
const { createInputInjector } = require('../input-injector.js');
const { verifyFrame, createReplayGuard } = require('../input-auth.js');

const CONFIG_PATH = path.join(app.getPath('userData'), 'host-config.json');

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; }
}
function saveConfig(cfg) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  } catch (e) { console.error('config save failed:', e.message); }
}

function lanAddresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const iface of Object.values(nets)) {
    for (const addr of iface || []) {
      if (addr.family === 'IPv4' && !addr.internal) out.push(addr.address);
    }
  }
  return out;
}

let mainWindow = null;
let tray = null;
let signalingServer = null;
let isQuitting = false;
let hostingActive = false;

const inputInjector = createInputInjector();
const replayGuard = createReplayGuard({ windowMs: 10_000 });
let currentSessionToken = null; // set by host.html once it has a real token — see ipcMain 'set-session-token'

inputInjector.on('input:rejected', (e) => console.log(`  [input] rejected: ${e.reason}${e.kind ? ` (${e.kind})` : ''}`));
inputInjector.on('input:rate_limited', (e) => console.log(`  [input] rate-limited: ${e.kind}`));


async function ensureSignalingServer() {
  if (signalingServer) return signalingServer;
  const cfg = loadConfig();
  signalingServer = await startSignaling({
    port: cfg.signalPort || 8080,
    dataDir: path.join(app.getPath('userData'), 'bridge-data'),
  });
  saveConfig({ ...cfg, signalPort: signalingServer.port });
  return signalingServer;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 440,
    height: 560,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const cfg = loadConfig();
  mainWindow.loadFile(path.join(__dirname, '..', 'host.html'), {
    search: `signal=ws://localhost:${cfg.signalPort || 8080}`,
  });

  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow.hide(); // close-to-tray — hosting keeps running underneath
  });
}

function refreshTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    {
      label: mainWindow?.isVisible() ? 'Hide Window' : 'Show Window',
      click: () => mainWindow[mainWindow.isVisible() ? 'hide' : 'show'](),
    },
    { type: 'separator' },
    {
      label: hostingActive ? 'Stop Background Hosting' : 'Start Background Hosting',
      click: toggleBackgroundHosting,
    },
    {
      label: inputInjector.isLocked() ? 'Unlock Input (view-only OFF)' : 'Lock Input (view-only ON)',
      click: () => { inputInjector.setLocked(!inputInjector.isLocked()); refreshTrayMenu(); },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(`Bridge Remote Desktop — ${hostingActive ? 'hosting' : 'idle'}`);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-icon.png'));
  tray = new Tray(icon);
  tray.on('click', () => mainWindow.show());
  refreshTrayMenu();
}

async function toggleBackgroundHosting() {
  hostingActive = !hostingActive;
  if (hostingActive) await ensureSignalingServer();
  // Note: "stop" only means "idle" here — it doesn't tear down
  // signalingServer.stop(), because a viewer may hold a live session. A
  // real stop-vs-idle distinction with in-progress-session awareness is a
  // sngate-gated follow-up (see remote-desktop.spec phase 6), not this pass.
  refreshTrayMenu();
}

app.whenReady().then(async () => {
  // Lets host.html's existing getDisplayMedia() call work unmodified in
  // Electron — auto-picks the primary display instead of showing OS's
  // generic picker, since this app IS the thing being shared.
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback({ video: sources[0], audio: 'loopback' });
    });
  });

  ipcMain.handle('get-network-info', () => ({
    addresses: lanAddresses(),
    port: signalingServer?.port ?? null,
  }));

  ipcMain.handle('set-session-token', (event, token) => {
    if (typeof token !== 'string' || token.length < 16) return { ok: false };
    currentSessionToken = token;
    return { ok: true };
  });

  // Verification happens here, in the trusted main process — never in the
  // renderer. host.html just relays whatever the datachannel handed it;
  // this handler is the only place that decides a frame is real before
  // input-injector.js ever sees it.
  ipcMain.handle('inject-input', async (event, signedFrame) => {
    if (!currentSessionToken) return { ok: false, reason: 'no_active_session' };
    const validSig = await verifyFrame(signedFrame, currentSessionToken);
    if (!validSig) return { ok: false, reason: 'bad_signature' };
    if (!replayGuard.check(signedFrame)) return { ok: false, reason: 'replay_or_stale' };
    return inputInjector.inject(signedFrame);
  });


  await ensureSignalingServer();
  hostingActive = true;
  createWindow();
  createTray();
  mainWindow.on('show', refreshTrayMenu);
  mainWindow.on('hide', refreshTrayMenu);
});

app.on('window-all-closed', (e) => {
  // Background service option: the window closing is not the app quitting.
  // Hosting + tray keep running. Real quit is the tray's "Quit" only.
  e?.preventDefault?.();
});

app.on('before-quit', () => { isQuitting = true; });
