/* NexusPanel — pages/billing.js */
import { html, apiSoft, esc, emptyRow } from '../core.js';

export async function init() {
  const r = await apiSoft('/ui/billing/tenants');
  const tenants = r?.tenants || [];
  html('billing-table', tenants.length
    ? tenants.map(t =>
        '<tr><td class="num">' + esc(t.tenantId || t.id) + '</td>' +
        '<td><span class="badge info">' + esc(t.plan || 'free') + '</span></td>' +
        '<td class="num">' + esc(t.bandwidth ?? '—') + '</td>' +
        '<td class="num">' + esc(t.storage ?? '—') + '</td></tr>'
      ).join('')
    : emptyRow(4, 'No tenants yet', 'Tenants appear here once users are provisioned.'));
}
