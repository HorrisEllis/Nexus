/* NexusPanel — pages/vpn.js */
import { $, html, api, esc, toast, config } from '../core.js';

export async function init() { /* install-driven; nothing to preload */ }

window.panel = window.panel || {};
window.panel.installWireguard = async () => {
  const domain = ($('vpn-domain')?.value || '').trim() || 'vpn.' + config.domain;
  html('vpn-install-result', '<span style="color:var(--pending)">Installing WireGuard…</span>');
  try {
    await api('/ui/catalog/install', {
      method: 'POST', body: { app: 'wireguard', domain, tenantId: 'default' },
    });
    html('vpn-install-result', '<span class="badge up">Install queued for ' + esc(domain) + '</span>');
    toast('Installing WireGuard on ' + domain);
  } catch (e) {
    html('vpn-install-result', '<span style="color:var(--alert)">' + esc(e.message) + '</span>');
  }
};
