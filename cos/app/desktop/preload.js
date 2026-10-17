'use strict';
// cos/app/desktop/preload.js — the only door between the COS window and the machine: named calls, nothing else. (COSA6, 0.60.89)
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const call = (name) => (...a) => ipcRenderer.invoke('cos:' + name, ...a);
contextBridge.exposeInMainWorld('cos', {
  state: call('state'), appUpdate: call('appUpdate'), openRelease: call('openRelease'), pickZip: call('pickZip'), importPath: call('importPath'), switchTo: call('switchTo'), rollback: call('rollback'),
  start: call('start'), stop: call('stop'), remove: call('remove'), logs: call('logs'), getSettings: call('getSettings'), shRun: call('shRun'), shCancel: call('shCancel'), setSetting: call('setSetting'),
  pathFor: (file) => { try { return webUtils.getPathForFile(file); } catch (_) { return ''; } },
  onEvent: (fn) => ipcRenderer.on('cos:event', (_e, ev) => fn(ev)),
});
