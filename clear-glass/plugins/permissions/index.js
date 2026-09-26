'use strict';
/**
 * plugins/permissions/index.js — real permission-filter contribution.
 *
 * §UPDATED 2026-08-24 — now consults the real per-origin settings store
 * (src/site-settings/store.js) before falling back to the default
 * policy below. Composed via ctx.emit/ctx.on against the real
 * site-settings.get gate, same request/response pattern every other
 * plugin composition in this codebase already uses — not a new one.
 * A stored 'allow'/'deny' for this origin+permission wins outright; only
 * an origin with NO stored preference falls through to HIGH_RISK.
 *
 * §REAL POLICY, STATED NOT HIDDEN — for an origin with no stored
 * preference:
 *   - HIGH_RISK ('media' — camera/mic, 'geolocation') -> always DENIED,
 *     with a real, visible toast so the user knows a request happened
 *     and was blocked, instead of it silently vanishing into whatever
 *     Electron's unconfigured default was doing before this existed.
 *   - everything else (notifications, fullscreen, pointerLock,
 *     clipboard-sanitized-write, openExternal, midiSysex, etc.) -> ALLOWED
 *     by default, matching typical browser defaults for these genuinely
 *     lower-risk permission types.
 */

const HIGH_RISK = new Set(['media', 'geolocation']);

function _checkSiteSettings(requestingUrl, permission, ctx) {
  return new Promise((resolve) => {
    if (!requestingUrl) { resolve(undefined); return; }
    const timer = setTimeout(() => { unsub(); resolve(undefined); }, 1000);
    const unsub = ctx.on('site-settings.result', (e) => {
      if (e.data.url !== requestingUrl) return;
      clearTimeout(timer);
      unsub();
      resolve(e.data.value); // 'allow' | 'deny' | undefined
    });
    ctx.emit('site-settings.get', { url: requestingUrl, key: `permission:${permission}` });
  });
}

async function filterPermission(data, ctx) {
  const { requestId, permission, requestingUrl, agentId } = data;

  const stored = await _checkSiteSettings(requestingUrl, permission, ctx);
  if (stored === 'allow') return { type: 'permission:decision', data: { requestId, allow: true } };
  if (stored === 'deny')  return { type: 'permission:decision', data: { requestId, allow: false } };

  if (HIGH_RISK.has(permission)) {
    const what = permission === 'media'
      ? `camera/mic (${(data.mediaTypes || []).join(', ') || 'unspecified'})`
      : 'your location';
    ctx.emit('driver.exec', {
      action: 'toast',
      agentId,
      msg: `Blocked a request for ${what} from ${requestingUrl || 'this page'}`,
      type: 'warn',
      durationMs: 6000,
    });
    return { type: 'permission:decision', data: { requestId, allow: false } };
  }

  return { type: 'permission:decision', data: { requestId, allow: true } };
}

module.exports = { filterPermission, HIGH_RISK };
