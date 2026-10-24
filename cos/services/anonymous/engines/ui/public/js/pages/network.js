/* NexusPanel — pages/network.js */
import { $, html, api, apiSoft, act, esc, stats } from '../core.js';

export async function init() {
  const r = await apiSoft('/ui/autodns/status');
  html('adns-stats', stats([
    { label: 'Last known IP', val: r?.ip || 'unknown', cls: r?.ip ? 'b' : 'y' },
    { label: 'Provider',      val: r?.provider || 'built-in DNS', cls: '' },
    { label: 'Last push',     val: r?.lastPush ? new Date(r.lastPush).toLocaleTimeString() : 'never', cls: '' },
  ]));
}

window.panel = window.panel || {};
window.panel.forceDnsPush = async () => {
  const ok = await act('DNS records pushed', () => api('/ui/autodns/push', { method: 'POST' }));
  if (ok) init();
};
window.panel.upnpOpen = async () => {
  html('upnp-result', '<span style="color:var(--pending)">Asking the router to forward ports…</span>');
  try {
    const r = await api('/ui/upnp/open', { method: 'POST' });
    html('upnp-result', r?.skipped
      ? '<span class="badge pending">No UPnP gateway found — forward ports manually</span>'
      : '<pre>' + esc(JSON.stringify(r, null, 2)) + '</pre>');
  } catch (e) {
    html('upnp-result', '<span style="color:var(--alert)">' + esc(e.message) + '</span>');
  }
};
