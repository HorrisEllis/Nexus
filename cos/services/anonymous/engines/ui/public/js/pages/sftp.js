/* NexusPanel — pages/sftp.js */
import { $, html, api, apiSoft, act, esc, emptyRow, toast } from '../core.js';

export async function init() {
  const info = await apiSoft('/ui/ftp/info');
  html('ftp-info', info && !info.error
    ? '<div class="grid3">' +
      '<div class="stat"><div class="slabel">Host</div><div class="sval b" style="font-size:15px">' + esc(info.pasvHost || '127.0.0.1') + '</div></div>' +
      '<div class="stat"><div class="slabel">Port</div><div class="sval">' + esc(info.port || '2121') + '</div></div>' +
      '<div class="stat"><div class="slabel">Root</div><div class="sval" style="font-size:14px">' + esc(info.root || 'sites') + '</div></div>' +
      '</div>'
    : '<span style="color:var(--dim)">' + esc(info?.error || 'the ftp engine did not answer') + '</span>');

  await loadUsers();
}

async function loadUsers() {
  const r = await apiSoft('/ui/ftp/users');
  const users = r?.users || [];
  html('ftp-users', users.length
    ? users.map(u =>
        '<tr><td class="num">' + esc(u.username) + '</td>' +
        '<td style="color:var(--dim)" class="num">' + esc(u.root || 'sites') + '</td>' +
        '<td><button class="sec sm" onclick="panel.ftpDelUser(\'' + esc(u.username) + '\')">Delete</button></td></tr>'
      ).join('')
    : emptyRow(3, 'No FTP users', 'A default user is generated on first boot — check the ftp engine log for its password.'));
}

window.panel = window.panel || {};

window.panel.ftpAddUser = async () => {
  const username = ($('ftp-user')?.value || '').trim();
  const password = $('ftp-pass')?.value || '';
  if (!username || !password) { toast('Username and password are both required', 'err'); return; }
  try {
    await api('/ui/ftp/users', { method: 'POST', body: { username, password } });
    html('ftp-result', '<span class="badge up">Created ' + esc(username) + '</span>');
    $('ftp-user').value = ''; $('ftp-pass').value = '';
    loadUsers();
  } catch (e) {
    html('ftp-result', '<span style="color:var(--alert)">' + esc(e.message) + '</span>');
  }
};

window.panel.ftpDelUser = async username => {
  if (!confirm('Delete FTP user ' + username + '?')) return;
  const ok = await act('User deleted', () =>
    api('/ui/ftp/users', { method: 'DELETE', body: { username } }));
  if (ok) loadUsers();
};
