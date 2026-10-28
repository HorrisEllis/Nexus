/* NexusPanel — pages/ssl.js */
import { $, html, api, apiSoft, act, esc, empty, toast } from '../core.js';

export async function init() {
  const r = await apiSoft('/ui/ssl/certs');
  const certs = r?.certs || [];
  html('ssl-certs', certs.length
    ? '<table><thead><tr><th>Domain</th><th>Status</th><th>Type</th><th>Expires</th></tr></thead><tbody>' +
      certs.map(c =>
        '<tr><td class="num">' + esc(c.domain) + '</td>' +
        '<td><span class="badge ' + (c.valid ? 'up' : 'down') + '">' + (c.valid ? 'valid' : 'invalid') + '</span></td>' +
        '<td style="color:var(--dim)">' + esc(c.type || '—') + '</td>' +
        '<td style="color:var(--dim)">' + esc(c.expires || '—') + '</td></tr>'
      ).join('') + '</tbody></table>'
    : empty('No certificates yet',
        'Certificates issue automatically once port 80 is reachable from the internet.'));
}

window.panel = window.panel || {};
window.panel.issueCert = async () => {
  const domain = ($('ssl-domain')?.value || '').trim();
  if (!domain) { toast('Enter a domain', 'err'); return; }
  html('ssl-result', '<span style="color:var(--pending)">Requesting certificate…</span>');
  try {
    await api('/ui/ssl/issue', { method: 'POST', body: { domain } });
    html('ssl-result', '<span class="badge up">Queued for ' + esc(domain) + '</span>');
    toast('Certificate queued for ' + domain);
    setTimeout(init, 3000);
  } catch (e) {
    html('ssl-result', '<span style="color:var(--alert)">' + esc(e.message) + '</span>');
  }
};
