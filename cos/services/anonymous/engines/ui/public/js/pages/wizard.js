/* NexusPanel — pages/wizard.js */
import { $, html, apiSoft, esc, config } from '../core.js';
import { icon } from '../icons.js';

const mark = ok => ok
  ? '<span class="badge up">' + 'ready' + '</span>'
  : '<span class="badge pending">not yet</span>';

export async function init() {
  const dom = $('wiz-domain');
  if (dom) dom.textContent = config.domain;
  await Promise.all([checkEngines(), checkIp(), checkTls()]);
}

async function checkEngines() {
  const r = await apiSoft('/ui/status');
  const svcs = r?.services || [];
  const up = svcs.filter(s => s.up !== false).length;
  html('wiz-engines', svcs.length
    ? mark(up === svcs.length) + ' <span style="color:var(--dim)">' + up + ' of ' + svcs.length + ' engines reporting up</span>'
    : mark(false) + ' <span style="color:var(--dim)">No status sweep yet — the monitor engine reports every 30 seconds.</span>');
}

async function checkIp() {
  const r = await apiSoft('/ui/peer/identity');
  html('wiz-dns', r?.ip
    ? mark(true) + ' <span style="color:var(--dim)">Public IP ' + esc(r.ip) +
      ' — point an A record for ' + esc(config.domain) + ' here.</span>'
    : mark(false) + ' <span style="color:var(--dim)">No public IP detected yet. ' +
      'Check that the peer engine is running and the machine can reach the internet.</span>');
}

async function checkTls() {
  const r = await apiSoft('/ui/ssl/certs');
  const n = (r?.certs || []).length;
  html('wiz-tls', n
    ? mark(true) + ' <span style="color:var(--dim)">' + n + ' certificate' + (n === 1 ? '' : 's') + ' issued</span>'
    : mark(false) + ' <span style="color:var(--dim)">No certificate yet. This almost always means ' +
      'port 80 is not reachable from the internet — forward it on your router, or use the Tunnel page.</span>');
}

window.panel = window.panel || {};
window.panel.wizardRecheck = init;
