'use strict';
// clear-glass/src/preload/compartment-window.js — §0.39.280. The only thing idearium's compartment windows
// (/desktop.html, /settings.html; main/compartment-window.js) get from Electron: their own window controls.
const { contextBridge, ipcRenderer } = require('electron');
const control = (action) => ipcRenderer.invoke('compartment-window:control', action);
contextBridge.exposeInMainWorld('nexusWindow', {
  framed: false,
  minimize: () => control('minimize'),
  maximize: () => control('maximize'),
  close: () => control('close'),
  pin: () => control('pin'),
});
