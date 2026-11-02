'use strict';
// cos/app/desktop/starting-preload.js — the main window's door (MG36): the starting page asks why it waits, opens Versions & manual update, and
// starts Nexus. Nothing else: the cockpit loaded in this window gets no other power over the machine.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cosStart', {
  why: () => ipcRenderer.invoke('cos:starting'),
  openVersions: () => ipcRenderer.invoke('cos:openVersions'),
  start: (project) => ipcRenderer.invoke('cos:start', String(project || 'nexus')),
  onStarting: (fn) => ipcRenderer.on('cos:starting', (_e, t) => fn(t)),
});
