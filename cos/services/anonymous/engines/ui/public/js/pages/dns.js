/* NexusPanel — pages/dns.js */
import { $, html, api, apiSoft, act, esc, emptyRow, iconBtn, toast } from '../core.js';

export async function init() {
  const r = await apiSoft('/ui/dns');
  const records = r?.records || [];

  html('zone-table', records.length
    ? records.map(rec =>
        '<tr><td class="num">' + esc(rec.name || '@') + '</td>' +
        '<td><span class="badge info">' + esc(rec.type) + '</span></td>' +
        '<td class="num" style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(rec.value) + '">' + esc(rec.value) + '</td>' +
        '<td class="num" style="color:var(--dim)">' + esc(rec.ttl || 300) + '</td>' +
        '<td>' + iconBtn('trash', "panel.delDns('" + esc(rec.name) + "','" + esc(rec.type) + "')", 'Delete record') + '</td></tr>'
      ).join('')
    : emptyRow(5, 'No records in this zone',
        'Add an A record pointing @ at this server to get started.'));

  const origin = $('zone-origin');
  if (origin) origin.textContent = r?.origin || '—';
}

window.panel = window.panel || {};

window.panel.addDnsRecord = async () => {
  const name = ($('dns-name')?.value || '').trim();
  const type = $('dns-type')?.value;
  const value = ($('dns-val')?.value || '').trim();
  if (!value) { toast('Enter a record value', 'err'); return; }
  const ok = await act('Record added', () => api('/ui/dns', {
    method: 'POST',
    body: { name, type, value, ttl: parseInt($('dns-ttl')?.value, 10) || 300 },
  }));
  if (ok) init();
};

window.panel.delDns = async (name, type) => {
  if (!confirm('Delete the ' + type + ' record for ' + (name || '@') + '?')) return;
  const ok = await act('Record deleted', () =>
    api('/ui/dns', { method: 'DELETE', body: { name, type } }));
  if (ok) init();
};

window.panel.applyDnsTemplate = async tpl => {
  const ok = await act('Applied ' + tpl + ' records', () =>
    api('/ui/dns/template', { method: 'POST', body: { template: tpl } }));
  if (ok) init();
};
