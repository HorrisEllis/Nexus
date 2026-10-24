/* NexusPanel — pages/firewall.js */
import { $, html, api, apiSoft, act, esc, stats, emptyRow, when, toast } from '../core.js';

export async function init() {
  const r = await apiSoft('/ui/firewall');
  const bans = r?.banned || [];

  html('fw-stats', stats([
    { label: 'Active bans',   val: bans.length, cls: bans.length ? 'r' : 'g' },
    { label: 'Rate limit',    val: (r?.config?.maxRequests || '—') + '/min', cls: '' },
    { label: 'Blocked total', val: r?.totalBlocked ?? 0, cls: '' },
  ]));

  html('fw-bans', bans.length
    ? bans.map(b =>
        '<tr><td class="num">' + esc(b.ip) + '</td>' +
        '<td style="color:var(--dim)">' + esc(b.reason || '—') + '</td>' +
        '<td class="num">' + esc(b.hits || 1) + '</td>' +
        '<td style="color:var(--dim);font-size:12px">' + esc(when(b.bannedAt)) + '</td>' +
        '<td><button class="sec sm" onclick="panel.unban(\'' + esc(b.ip) + '\')">Unban</button></td></tr>'
      ).join('')
    : emptyRow(5, 'No active bans', 'Addresses are banned automatically when they trip the rate limit.'));
}

window.panel = window.panel || {};

window.panel.addFwRule = async () => {
  const ip = ($('fw-ip')?.value || '').trim();
  if (!ip) { toast('Enter an IP address', 'err'); return; }
  const action = $('fw-action')?.value || 'ban';
  const ok = await act(ip + ' ' + (action === 'ban' ? 'banned' : 'whitelisted'), () =>
    api('/ui/firewall/' + action, {
      method: 'POST', body: { ip, reason: ($('fw-reason')?.value || '').trim() },
    }));
  if (ok) init();
};

window.panel.unban = async ip => {
  const ok = await act(ip + ' unbanned', () =>
    api('/ui/firewall/unban', { method: 'POST', body: { ip } }));
  if (ok) init();
};

const sysfw = async (op, label) => {
  html('sysfw-result', '<span style="color:var(--pending)">' + label + '…</span>');
  try {
    const r = await api('/ui/sysfw/' + op, { method: 'POST' });
    if (r?.skipped) {
      html('sysfw-result', '<span class="badge pending">Not available on this platform</span>');
      return;
    }
    html('sysfw-result', r?.output
      ? '<pre>' + esc(r.output) + '</pre>'
      : '<pre>' + esc(JSON.stringify(r, null, 2)) + '</pre>');
  } catch (e) {
    html('sysfw-result', '<span style="color:var(--alert)">' + esc(e.message) + '</span>');
  }
};

window.panel.sysfwDetect = () => sysfw('detect', 'Detecting firewall');
window.panel.sysfwApply  = () => sysfw('apply',  'Applying OS rules');
window.panel.sysfwList   = () => sysfw('list',   'Reading rules');
