/* NexusPanel — pages/sshkeys.js */
import { $, html, api, apiSoft, act, esc, empty, toast } from '../core.js';

export async function init() { await refresh(); }

async function refresh() {
  const r = await apiSoft('/ui/ssh/status');
  if (!r || r.error) {
    html('ssh-status', '<span class="badge down">Unavailable</span> ' +
      '<span style="color:var(--dim)">' + esc(r?.error || 'the ssh engine did not answer') + '</span>');
    return;
  }
  const bits = [];
  bits.push(r.installed
    ? '<span class="badge up">OpenSSH installed</span>'
    : '<span class="badge pending">OpenSSH not installed</span>');
  bits.push(r.running
    ? '<span class="badge up">running</span>'
    : '<span class="badge down">stopped</span>');
  if (r.port) bits.push('<span class="badge info">port ' + esc(r.port) + '</span>');
  if (r.hostKeys) bits.push('<span class="badge muted">' + esc(r.hostKeys) + ' host key(s)</span>');
  html('ssh-status', bits.join(' '));

  if (!r.installed) {
    html('ssh-action-result',
      '<span style="color:var(--dim)">' +
      esc(r.installHint || 'Install the OpenSSH Server optional feature, then check again.') +
      '</span>');
  }

  const keys = r.authorizedKeys || [];
  html('ssh-keys', keys.length
    ? '<table><thead><tr><th>Key</th><th>Comment</th></tr></thead><tbody>' +
      keys.map(k => {
        const parts = String(k).trim().split(/\s+/);
        const short = parts[1] ? parts[1].slice(0, 24) + '…' : '—';
        return '<tr><td class="num">' + esc(parts[0] + ' ' + short) + '</td>' +
               '<td style="color:var(--dim)">' + esc(parts[2] || '—') + '</td></tr>';
      }).join('') + '</tbody></table>'
    : empty('No keys authorised yet', 'Paste a public key below to allow it to log in.'));
}

window.panel = window.panel || {};
window.panel.sshRefresh = refresh;

const action = async (url, label, ms) => {
  html('ssh-action-result', '<span style="color:var(--pending)">' + label + '…</span>');
  try {
    const r = await api(url, { method: 'POST' });
    html('ssh-action-result', r?.output
      ? '<pre>' + esc(r.output) + '</pre>'
      : '<span class="badge up">' + esc(label) + ' completed</span>');
    refresh();
  } catch (e) {
    html('ssh-action-result', '<span style="color:var(--alert)">' + esc(e.message) + '</span>');
  }
};

window.panel.sshInstall = () => action('/ui/ssh/install', 'Installing OpenSSH Server');
window.panel.sshStart   = () => action('/ui/ssh/start',   'Starting sshd');
window.panel.sshStop    = () => action('/ui/ssh/stop',    'Stopping sshd');

window.panel.sshAddKey = async () => {
  const pubkey = ($('ssh-pubkey')?.value || '').trim();
  if (!pubkey) { toast('Paste a public key first', 'err'); return; }
  if (/PRIVATE KEY/i.test(pubkey)) {
    toast('That is a private key — paste the .pub file instead, and rotate that key', 'err');
    return;
  }
  const ok = await act('Key authorised', () =>
    api('/ui/ssh/key', { method: 'POST', body: { pubkey } }));
  if (ok) { $('ssh-pubkey').value = ''; refresh(); }
};
