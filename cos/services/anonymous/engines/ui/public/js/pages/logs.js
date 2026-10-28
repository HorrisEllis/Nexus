/* NexusPanel — pages/logs.js */
import { $, html, apiSoft, esc, empty } from '../core.js';
import { ENGINE_PORTS } from '../engine-map.js';

export async function init(preselect) {
  const sel = $('log-engine');
  if (sel && !sel.options.length) {
    sel.innerHTML = ['KERNEL'].concat(Object.keys(ENGINE_PORTS))
      .map(n => '<option value="' + esc(n.toLowerCase()) + '">' + esc(n) + '</option>').join('');
  }
  if (sel && preselect) sel.value = String(preselect).toLowerCase();
  await load();
}

async function load() {
  const engine = $('log-engine')?.value || 'kernel';
  const lines  = parseInt($('log-lines')?.value, 10) || 200;
  const r = await apiSoft('/ui/logs/' + encodeURIComponent(engine) + '?lines=' + lines);
  const rows = r?.lines || [];
  const box = $('logbox');
  if (!box) return;
  if (!rows.length) {
    box.innerHTML = empty('No log entries', 'This engine has not written to its log file yet.');
    return;
  }
  box.innerHTML = rows.map(l => {
    const lv = l.includes('[ERROR]') ? 'ERROR' : l.includes('[WARN]') ? 'WARN' : 'INFO';
    return '<div class="' + lv + '">' + esc(l) + '</div>';
  }).join('');
  box.scrollTop = box.scrollHeight;
}

window.panel = window.panel || {};
window.panel.loadLogs = load;
