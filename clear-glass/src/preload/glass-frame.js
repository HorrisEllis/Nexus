'use strict';
// clear-glass/src/preload/glass-frame.js — the frame's title bar asks main for its window's controls (GF1, 0.60.258)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('glassFrame', {
  control: (action) => ipcRenderer.invoke('glass-frame:control', String(action)),
  onState: (fn) => { ipcRenderer.on('glass-frame:state', (_e, s) => { try { fn(s); } catch (_) {} }); },
});
