'use strict';
/**
 * plugins/zoom/index.js — real toolbar-command contributions.
 *
 * Composes the real driver.exec 'zoom' action (src/driver/index.js's
 * _zoom, added alongside this plugin — uses Electron's actual native
 * webContents.setZoomFactor()/getZoomFactor(), not a CSS hack) via
 * ctx.emit/ctx.on, correlated by a real requestId — same request/response
 * pattern captcha-pause already established for composing with dom.query,
 * not a new one invented here.
 */

function _zoomAction(mode) {
  return function (data, ctx) {
    const agentId = data?.agentId || 'default';
    const requestId = `zoom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        unsubResult(); unsubError();
        resolve({ type: 'plugin:zoom:error', data: { agentId, mode, error: 'timeout waiting for driver.exec response' } });
      }, 3000);
      const unsubResult = ctx.on('driver.result', (e) => {
        if (e.data.requestId !== requestId || settled) return;
        settled = true;
        clearTimeout(timer);
        unsubResult(); unsubError();
        resolve({ type: 'plugin:zoom:changed', data: { agentId, mode, factor: e.data.result?.factor } });
      });
      const unsubError = ctx.on('driver.error', (e) => {
        if (e.data.requestId !== requestId || settled) return;
        settled = true;
        clearTimeout(timer);
        unsubResult(); unsubError();
        resolve({ type: 'plugin:zoom:error', data: { agentId, mode, error: e.data.error } });
      });
      ctx.emit('driver.exec', { action: 'zoom', agentId, requestId, mode });
    });
  };
}

const zoomIn    = _zoomAction('in');
const zoomOut   = _zoomAction('out');
const zoomReset = _zoomAction('reset');

module.exports = { zoomIn, zoomOut, zoomReset };
