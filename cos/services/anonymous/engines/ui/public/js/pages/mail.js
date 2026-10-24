/* NexusPanel — pages/mail.js */
import { $, html, api, apiSoft, act, esc, emptyRow, toast, config } from '../core.js';

export async function init() {
  const r = await apiSoft('/ui/mail/mailboxes');
  const boxes = r?.mailboxes || [];
  html('mailbox-table', boxes.length
    ? boxes.map(m =>
        '<tr><td class="num">' + esc(m.address) + '</td>' +
        '<td style="color:var(--dim)">' + esc(m.quota || 'unlimited') + '</td>' +
        '<td style="color:var(--dim)">' + esc(m.forwardTo || '—') + '</td></tr>'
      ).join('')
    : emptyRow(3, 'No mailboxes yet',
        'Mailbox management arrives with the mailbox engine in Phase 2.'));

  const dkim = await apiSoft('/ui/mail/dkim');
  html('dkim-record', dkim?.record
    ? '<pre>' + esc(dkim.record) + '</pre>'
    : '<span style="color:var(--dim)">DKIM key not generated yet — start the smtp engine.</span>');
}

window.panel = window.panel || {};
window.panel.createDisposable = async () => {
  const fwd = ($('disp-fwd')?.value || '').trim();
  if (!fwd) { toast('Enter a forwarding address', 'err'); return; }
  try {
    const r = await api('/ui/mail/disposable', {
      method: 'POST',
      body: { forwardTo: fwd, ttlMs: (parseInt($('disp-ttl')?.value, 10) || 24) * 3600000 },
    });
    if (r?.address) {
      $('disp-result').textContent = r.address;
      toast('Created ' + r.address);
    } else {
      toast('The smtp engine did not return an address', 'err');
    }
  } catch (e) { toast('Could not create address — ' + e.message, 'err'); }
};
