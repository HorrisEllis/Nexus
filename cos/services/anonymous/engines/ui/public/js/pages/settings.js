/* NexusPanel — pages/settings.js */
import { $, html, api, apiSoft, act, esc, config } from '../core.js';

export async function init() {
  const r = await apiSoft('/ui/settings');
  if ($('set-domain')) $('set-domain').value = r?.domain || config.domain || '';
  if ($('set-title'))  $('set-title').value  = r?.siteTitle || config.siteTitle || 'NexusPanel';
  html('set-paths', '<pre>' + esc(JSON.stringify(r?.paths || {}, null, 2)) + '</pre>');
}

window.panel = window.panel || {};
window.panel.saveSettings = async () => {
  await act('Settings saved', () => api('/ui/settings', {
    method: 'POST',
    body: { domain: $('set-domain')?.value.trim(), siteTitle: $('set-title')?.value.trim() },
  }));
};
