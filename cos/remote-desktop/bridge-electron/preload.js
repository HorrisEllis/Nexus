'use strict';
/**
 * preload.js — the entire Electron-to-renderer surface.
 *
 * host.html degrades gracefully without any of this (checks
 * `if (window.bridgeHost)` before using it) — a plain browser tab still
 * works for same-machine testing, just without native input injection or
 * the LAN-address hint.
 *
 * Three functions, each doing exactly one thing:
 *   - getNetworkInfo   — LAN address(es) to give a viewer on another device
 *   - setSessionToken  — hands the current session's token to the TRUSTED
 *                        main process once host.html learns it, so
 *                        signature verification happens in main (see
 *                        main.js's ipcMain handler), not in the renderer
 *   - injectInput      — forwards an already-signed input frame to main for
 *                        verify → replay-check → input-injector.js. The
 *                        renderer never decides whether an input frame is
 *                        real; it just relays what came off the wire.
 *
 * contextIsolation stays on, nodeIntegration stays off — host.html never
 * gets direct Node/Electron access, only these three async functions.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridgeHost', {
  getNetworkInfo: () => ipcRenderer.invoke('get-network-info'),
  setSessionToken: (token) => ipcRenderer.invoke('set-session-token', token),
  injectInput: (signedFrame) => ipcRenderer.invoke('inject-input', signedFrame),
});
