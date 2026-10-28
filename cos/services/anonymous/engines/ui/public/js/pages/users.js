/* NexusPanel — pages/users.js */
import { $, html, api, apiSoft, act, esc, emptyRow, day, toast } from '../core.js';

export async function init() {
  const r = await apiSoft('/ui/users');
  const users = r?.users || [];
  html('users-table', users.length
    ? users.map(u =>
        '<tr><td class="num">' + esc(u.handle) + '</td>' +
        '<td style="color:var(--dim)">' + esc(u.email || '—') + '</td>' +
        '<td><span class="badge info">' + esc(u.plan || 'free') + '</span></td>' +
        '<td style="color:var(--dim);font-size:12px">' + esc(day(u.createdAt || u._ts)) + '</td></tr>'
      ).join('')
    : emptyRow(4, 'No users yet', 'Provision one below to give someone their own space on this server.'));
}

window.panel = window.panel || {};
window.panel.createUser = async () => {
  const handle = ($('user-handle')?.value || '').trim();
  const email  = ($('user-email')?.value || '').trim();
  if (!handle) { toast('Enter a handle', 'err'); return; }
  const ok = await act('Provisioned ' + handle, () => api('/ui/users', {
    method: 'POST', body: { handle, email, plan: $('user-plan')?.value || 'free' },
  }));
  if (ok) init();
};
