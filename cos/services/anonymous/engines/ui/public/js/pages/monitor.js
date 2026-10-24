/* NexusPanel — pages/monitor.js */
import { $, html, api, apiSoft, act, esc, emptyRow, toast } from '../core.js';

export async function init() {
  const r = await apiSoft('/ui/monitor');
  const checks = r?.checks || r?.services || [];
  html('monitor-table', checks.length
    ? checks.map(c =>
        '<tr><td>' + esc(c.name || c.id) + '</td>' +
        '<td class="num" style="color:var(--dim)">' + esc(c.url || '—') + '</td>' +
        '<td><span class="badge ' + (c.up !== false ? 'up' : 'down') + '">' +
          (c.up !== false ? 'up' : 'down') + '</span></td>' +
        '<td class="num">' + (c.latency != null ? esc(c.latency) + 'ms' : '—') + '</td></tr>'
      ).join('')
    : emptyRow(4, 'No checks configured',
        'Add a URL below and the monitor engine will poll it every 30 seconds.'));
}

window.panel = window.panel || {};
window.panel.addMonitor = async () => {
  const name = ($('mon-name')?.value || '').trim();
  const url  = ($('mon-url')?.value || '').trim();
  if (!name || !url) { toast('Name and URL are both required', 'err'); return; }
  const ok = await act('Monitor added', () => api('/ui/monitor/add', {
    method: 'POST',
    body: { name, url, webhookUrl: ($('mon-hook')?.value || '').trim() || undefined },
  }));
  if (ok) init();
};
