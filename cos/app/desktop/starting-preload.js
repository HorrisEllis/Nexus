'use strict';
// cos/app/desktop/starting-preload.js — the main window's door (MG36): the starting page asks why it waits, opens Versions & manual update, and
// starts Nexus. Nothing else: the cockpit loaded in this window gets no other power over the machine.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cosStart', {
  why: () => ipcRenderer.invoke('cos:starting'),
  openVersions: () => ipcRenderer.invoke('cos:openVersions'),
  start: (project) => ipcRenderer.invoke('cos:start', String(project || 'nexus')),
  install: () => ipcRenderer.invoke('cos:install'),   // CA5: Install Nexus from GitHub
  restart: (project) => ipcRenderer.invoke('cos:restart', String(project || 'nexus')),   // MG35b: Nexus runs but does not answer
  onStarting: (fn) => ipcRenderer.on('cos:starting', (_e, t) => fn(t)),
});
// CE7 — "Also make it borderless.": the window has no frame unless he chose Windows' one, so the page is told, and its top bar becomes where the
// window is dragged (cos/ui/shell/page.css). In a browser the same page has no mark and is unchanged. The overlay's height rides on the mark.
const framed = process.argv.some(a => a === '--cos-frame=windows');
window.addEventListener('DOMContentLoaded', () => { if (!framed) { document.documentElement.dataset.cosFrame = 'none'; document.documentElement.style.setProperty('--cos-caption-h', '40px'); } });
