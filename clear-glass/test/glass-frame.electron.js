'use strict';
// GF1/GF2 (0.60.258) — run INSIDE Electron (test/glass-frame.test.js starts it under xvfb). Prints one JSON line of results.
// James, 2026-10-26: "alsO I CANT OPEN dev console in a popup window. also the popup windows need to match the rest of the ui."
const { app, BrowserWindow, ipcMain, webContents } = require('electron');
const path = require('path');
const GF = require(path.join(__dirname, '..', 'src/main/glass-frame.js'));
const CW = require(path.join(__dirname, '..', 'src/main/compartment-window.js'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  const out = {};
  try {
    GF.registerIpc(ipcMain);
    // a provider-style window: the frame, its bar, the page below the bar
    const w = GF.frame({ width: 800, height: 600, title: 'NEXUS NCP — Test', show: true, webPreferences: { contextIsolation: true } });
    await w.loadURL('data:text/html,<title>Log in or sign up</title><body style="margin:0">page</body>');
    await sleep(700);
    out.pageHeight = await w.webContents.executeJavaScript('innerHeight');
    out.barHeight = w.bar.getBounds().height;
    out.barTitle = await w.bar.webContents.executeJavaScript("document.getElementById('t').textContent");
    out.barButtons = await w.bar.webContents.executeJavaScript("[...document.querySelectorAll('button')].map(b => b.id).join(',')");
    out.inAll = GF.all().includes(w);
    // the bar's maximize, then the devtools key on the page
    // the bar's buttons reach the window through glass-frame:control (maximizing itself needs a window manager, which xvfb has none of)
    out.barIpc = await w.bar.webContents.executeJavaScript("window.glassFrame.control('state').then(r => r.ok && r.title)");
    w.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F12' }); await sleep(800);
    out.devtoolsByF12 = w.webContents.isDevToolsOpened();
    w.webContents.closeDevTools();
    out.keys = [GF.isDevToolsKey({ type: 'keyDown', key: 'F12' }), GF.isDevToolsKey({ type: 'keyDown', key: 'I', control: true, shift: true }), GF.isDevToolsKey({ type: 'keyDown', key: 'a' })];
    // a site's window.open popup: framed, opener kept, closes with window.close()
    const opener = new BrowserWindow({ show: true, width: 400, height: 300 });
    CW.attach(opener.webContents);
    await opener.loadURL('data:text/html,<body>opener</body>');
    const before = GF.all().length;
    await opener.webContents.executeJavaScript("window.p = window.open('about:blank', '_blank', 'width=520,height=420'); 1"); await sleep(900);
    out.popupFramed = GF.all().length === before + 1;
    out.popupPage = await opener.webContents.executeJavaScript("window.p.innerHeight + ' ' + (window.p.opener === window)");
    await opener.webContents.executeJavaScript('window.p.close(); 1'); await sleep(700);
    out.popupClosedFrame = GF.all().length === before;
    w.close(); await sleep(300);
    out.closed = w.isDestroyed() && !GF.all().includes(w);
  } catch (e) { out.error = e.stack; }
  console.log('GFRESULT ' + JSON.stringify(out));
  app.quit();
});
