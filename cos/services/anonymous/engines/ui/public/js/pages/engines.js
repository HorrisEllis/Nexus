/* NexusPanel — pages/engines.js */
import { html, apiSoft, act, api, esc, iconBtn } from '../core.js';
import { ENGINE_PORTS, ENGINE_DESC, ENGINE_CID } from '../engine-map.js';
import { navigate } from '../router.js';

export async function init() {
  const status = await apiSoft('/ui/status');
  const map = Object.fromEntries((status?.services || []).map(s => [s.id, s]));

  html('engines-grid', Object.keys(ENGINE_PORTS).map(name => {
    const s   = map[name];
    const on  = s ? s.up !== false : null;
    const cls = on === null ? 'unknown' : on ? 'up' : 'down';
    const bcl = on === null ? 'pending' : on ? 'up' : 'down';
    const lbl = on === null ? 'no report' : on ? 'up' : 'down';
    return '<div class="eng-card ' + cls + '">' +
      '<div class="ename">' + esc(name) + '</div>' +
      '<div class="eport">' + (ENGINE_PORTS[name] ? ':' + ENGINE_PORTS[name] : 'IPC only') + '</div>' +
      '<div class="edesc">' + esc(ENGINE_DESC[name] || '') + '</div>' +
      '<div class="ecid">cid ' + esc(ENGINE_CID[name] || '—') + '</div>' +
      '<div class="estatus"><span class="badge ' + bcl + '">' + lbl + '</span>' +
        (s?.latency ? ' <span class="badge muted">' + s.latency + 'ms</span>' : '') +
      '</div>' +
      '<div class="eactions">' +
        iconBtn('refresh', "panel.restartEngine('" + name + "')", 'Restart ' + name) +
        iconBtn('list', "panel.viewLogs('" + name + "')", 'View ' + name + ' log') +
      '</div></div>';
  }).join(''));

  html('port-map', Object.entries(ENGINE_PORTS).filter(([, p]) => p).map(([n, p]) =>
    '<tr><td>' + esc(n) + '</td><td class="num">:' + p + '</td>' +
    '<td class="num" style="color:var(--faint)">' + esc(ENGINE_CID[n] || '—') + '</td>' +
    '<td style="color:var(--dim)">' + esc(ENGINE_DESC[n] || '') + '</td></tr>'
  ).join(''));
}

window.panel = window.panel || {};
window.panel.restartEngine = async name => {
  const ok = await act('Restarted ' + name, () =>
    api('/ui/engine/restart', { method: 'POST', body: { engine: name } }));
  if (ok) setTimeout(init, 2000);
};
window.panel.viewLogs = name => navigate('logs', { arg: name });
