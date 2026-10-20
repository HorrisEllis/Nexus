'use strict';
/**
 * plugins/snowflake/index.js — "Open link with Snowflake" (context-menu-item), NP11/NP12.
 * Composes with core the way every plugin here does: ctx.emit / ctx.on only. It asks core to open the link ('net.open', answered by src/ipc/bridge.js, which
 * starts the transport if it is configured but off, waits for it, and opens a window whose session is forced through it). The plugin decides nothing about
 * routing and holds no proxy settings, so it cannot weaken the fail-closed rule; a disabled or crashed plugin just means no menu row.
 */
function openLink(data, ctx) {
  const url = String((data && data.url) || '');
  let u; try { u = new URL(url); } catch (_) { u = null; }
  if (!u || !/^https?:$/.test(u.protocol)) {
    ctx.emit('driver.exec', { action: 'toast', agentId: (data && data.agentId) || 'default', msg: 'Snowflake can open http and https links only.', type: 'warn', durationMs: 4000 });
    return { type: 'plugin:snowflake:refused', data: { url } };
  }
  ctx.emit('net.open', { url: u.href, agentId: (data && data.agentId) || 'default' });
  return { type: 'plugin:snowflake:requested', data: { url: u.href } };
}
module.exports = { openLink };
