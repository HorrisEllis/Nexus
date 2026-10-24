/* NexusPanel — pages/tunnel.js */
import { html, apiSoft, esc, stats } from '../core.js';

export async function init() {
  const r = await apiSoft('/ui/tunnel/status');
  html('tunnel-stats', stats([
    { label: 'Tunnel',   val: r?.tunnel ? 'Active' : 'Not connected', cls: r?.tunnel ? 'g' : 'y' },
    { label: 'Provider', val: r?.provider || '—', cls: '' },
    { label: 'Public URL', val: r?.url ? 'assigned' : '—', cls: r?.url ? 'b' : '' },
  ]));
  html('tunnel-url', r?.url
    ? '<pre>' + esc(r.url) + '</pre>'
    : '<span style="color:var(--dim)">No tunnel URL yet. The tunnel engine falls back through ' +
      'Cloudflare, serveo and ngrok until one connects.</span>');
}
