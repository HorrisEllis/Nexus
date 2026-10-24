/* NexusPanel — pages/domains.js */
import { $, html, api, apiSoft, act, esc, emptyRow, day, iconBtn, toast } from '../core.js';

export async function init() { await loadList(); }

async function loadList() {
  const r = await apiSoft('/registrar/domains');
  const domains = r?.domains || [];
  html('domain-table', domains.length
    ? domains.map(d =>
        '<tr><td class="num">' + esc(d.domain) + '</td>' +
        '<td style="color:var(--dim)">' + esc(d.tenantId || 'default') + '</td>' +
        '<td class="num" style="font-size:12px;color:var(--dim)">' + esc((d.nameservers || []).join(', ') || '—') + '</td>' +
        '<td style="color:var(--dim);font-size:12px">' + esc(day(d.addedAt)) + '</td>' +
        '<td>' + iconBtn('trash', "panel.removeDomain('" + esc(d.domain) + "')", 'Remove domain') + '</td></tr>'
      ).join('')
    : emptyRow(5, 'No domains configured', 'Add a domain to point it at this server.'));
}

window.panel = window.panel || {};

window.panel.domTab = (el, name) => {
  document.querySelectorAll('[id^="dtab-"]').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#page-domains .tab').forEach(t => t.classList.remove('active'));
  document.getElementById('dtab-' + name)?.classList.add('active');
  el?.classList.add('active');
  if (name === 'list') loadList();
};

window.panel.searchDomains = async () => {
  const name = ($('dom-name')?.value || '').trim();
  if (!name) { toast('Enter a name to check', 'err'); return; }
  html('dom-results', '<span style="color:var(--dim)">Checking availability…</span>');
  try {
    const r = await api('/registrar/search?name=' + encodeURIComponent(name) +
      '&tlds=' + encodeURIComponent($('dom-tlds')?.value || 'com,net,org'));
    html('dom-results', (r?.results || []).length
      ? '<table><thead><tr><th>Domain</th><th>Availability</th></tr></thead><tbody>' +
        r.results.map(d =>
          '<tr><td class="num">' + esc(d.domain) + '</td><td><span class="badge ' +
          (d.available ? 'up' : d.available === false ? 'down' : 'pending') + '">' +
          (d.available ? 'available' : d.available === false ? 'taken' : 'unknown') +
          '</span></td></tr>').join('') + '</tbody></table>'
      : '<span style="color:var(--dim)">No results returned.</span>');
  } catch (e) {
    html('dom-results', '<span style="color:var(--alert)">' + esc(e.message) + '</span>');
  }
};

window.panel.addDomain = async () => {
  const domain = ($('add-domain')?.value || '').trim();
  if (!domain) { toast('Enter a domain', 'err'); return; }
  html('add-domain-result', '<span style="color:var(--pending)">Configuring…</span>');
  try {
    await api('/registrar/domains', {
      method: 'POST', body: { domain, tenantId: ($('add-tenant')?.value || 'default').trim() },
    });
    html('add-domain-result', '<span class="badge up">' + esc(domain) + ' configured</span>');
    toast('Added ' + domain);
    loadList();
  } catch (e) {
    html('add-domain-result', '<span style="color:var(--alert)">' + esc(e.message) + '</span>');
  }
};

window.panel.removeDomain = async domain => {
  if (!confirm('Remove ' + domain + ' from this server?')) return;
  const ok = await act(domain + ' removed', () =>
    api('/registrar/domains', { method: 'DELETE', body: { domain } }));
  if (ok) loadList();
};

window.panel.getNsInstructions = async () => {
  const domain = ($('ns-domain')?.value || '').trim();
  if (!domain) { toast('Enter a domain', 'err'); return; }
  try {
    const r = await api('/registrar/ns?domain=' + encodeURIComponent(domain) +
      '&registrar=' + encodeURIComponent($('ns-registrar')?.value || 'generic'));
    html('ns-instructions', r?.instructions ? '<pre>' + esc(r.instructions) + '</pre>' : '');
  } catch (e) { toast('Could not load instructions — ' + e.message, 'err'); }
};

window.panel.applyNsGlue = async () => {
  await act('Nameserver and SOA records applied', () =>
    api('/ui/glue/apply', { method: 'POST' }));
};
