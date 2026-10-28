/* NexusPanel — pages/cron.js */
import { $, html, api, apiSoft, act, esc, emptyRow, when, iconBtn, toast } from '../core.js';

export async function init() {
  const r = await apiSoft('/ui/cron');
  const jobs = r?.jobs || [];

  html('cron-table', jobs.length
    ? jobs.map(j =>
        '<tr><td>' + esc(j.name) + '</td>' +
        '<td class="num">' + esc(j.cron) + '</td>' +
        '<td style="color:var(--dim)" class="num">' + esc(j.action?.webhook || j.action?.command || '—') + '</td>' +
        '<td style="color:var(--dim);font-size:12px">' + esc(when(j.lastRun)) + '</td>' +
        '<td>' + iconBtn('trash', "panel.deleteCron('" + esc(j.name) + "')", 'Delete job') + '</td></tr>'
      ).join('')
    : emptyRow(5, 'Nothing scheduled',
        'Add a job to run a command or call a webhook on a schedule.'));
}

window.panel = window.panel || {};

window.panel.addCron = async () => {
  const name   = ($('cron-name')?.value || '').trim();
  const cron   = ($('cron-expr')?.value || '').trim();
  const target = ($('cron-target')?.value || '').trim();
  if (!name || !cron || !target) { toast('Name, schedule and target are all required', 'err'); return; }
  const type = $('cron-type')?.value || 'command';
  const ok = await act('Scheduled ' + name, () =>
    api('/ui/cron', { method: 'POST', body: { name, cron, action: { [type]: target } } }));
  if (ok) init();
};

window.panel.deleteCron = async name => {
  if (!confirm('Delete scheduled job ' + name + '?')) return;
  const ok = await act('Job deleted', () =>
    api('/ui/cron', { method: 'DELETE', body: { name } }));
  if (ok) init();
};
