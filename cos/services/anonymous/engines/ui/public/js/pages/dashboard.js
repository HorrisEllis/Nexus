/* NexusPanel — pages/dashboard.js */
import { html, text, apiSoft, stats, esc } from '../core.js';
import { ENGINE_PORTS, ENGINE_DESC } from '../engine-map.js';

export async function init() {
  text('dash-ts', new Date().toLocaleString());

  const [status, tunnel, peer] = await Promise.all([
    apiSoft('/ui/status'),
    apiSoft('/ui/tunnel/status'),
    apiSoft('/ui/peer/identity'),
  ]);

  const svcs  = status?.services || [];
  const total = Object.keys(ENGINE_PORTS).length;
  const up    = svcs.filter(s => s.up !== false).length;

  html('dash-stats', stats([
    { label: 'Engines up', val: up + '/' + total, cls: up === total ? 'g' : up === 0 ? 'r' : 'y' },
    { label: 'Public IP',  val: peer?.ip || 'not detected', cls: peer?.ip ? 'b' : '' },
    { label: 'Tunnel',     val: tunnel?.tunnel ? 'Active' : 'Probing', cls: tunnel?.tunnel ? 'g' : 'y' },
    { label: 'Reports',    val: svcs.length ? 'Live' : 'None', cls: svcs.length ? 'g' : 'y' },
  ]));

  if (!svcs.length) {
    html('dash-engines',
      '<div class="empty"><strong>No engine reports yet</strong>' +
      'The monitor engine publishes a status sweep every 30 seconds. ' +
      'If this stays empty, check that monitor is running.</div>');
    return;
  }

  const map = Object.fromEntries(svcs.map(s => [s.id, s]));
  html('dash-engines',
    '<div class="gridAuto">' +
    Object.keys(ENGINE_PORTS).map(name => {
      const s   = map[name];
      const on  = s ? s.up !== false : null;
      const cls = on === null ? 'unknown' : on ? 'up' : 'down';
      const bcl = on === null ? 'pending' : on ? 'up' : 'down';
      const lbl = on === null ? 'no report' : on ? 'up' : 'down';
      return '<div class="eng-card ' + cls + '">' +
        '<div class="ename">' + esc(name) + '</div>' +
        '<div class="eport">' + (ENGINE_PORTS[name] ? ':' + ENGINE_PORTS[name] : 'IPC only') + '</div>' +
        '<div class="edesc">' + esc(ENGINE_DESC[name] || '') + '</div>' +
        '<div class="estatus"><span class="badge ' + bcl + '">' + lbl + '</span>' +
        (s?.latency ? ' <span class="badge muted">' + s.latency + 'ms</span>' : '') +
        '</div></div>';
    }).join('') + '</div>');
}
