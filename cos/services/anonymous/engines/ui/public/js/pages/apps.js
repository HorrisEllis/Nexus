/* NexusPanel — pages/apps.js */
import { $, html, api, apiSoft, esc, empty, emptyRow, day, toast, config } from '../core.js';
import { appIcon } from '../icons.js';

let allApps = [];

export async function init() {
  const r = await apiSoft('/ui/catalog');
  allApps = r?.apps || [];
  render(allApps);
  await loadInstalls();
}

function render(apps) {
  html('apps-grid', apps.length
    ? apps.map(a =>
        '<div class="app-tile" onclick="panel.showInstall(\'' + esc(a.id) + '\')">' +
          '<div class="aicon">' + appIcon(a.category) + '</div>' +
          '<div class="aname">' + esc(a.name) + '</div>' +
          '<div class="adesc">' + esc(a.description || '') + '</div>' +
          '<div class="atag">' + esc(a.category || 'app') + '</div>' +
        '</div>'
      ).join('')
    : empty('Catalog unavailable', 'The catalog engine did not answer. Check that it is running.'));
}

async function loadInstalls() {
  const r = await apiSoft('/ui/installs');
  const rows = (r?.installs || []).slice().reverse();
  html('installs-table', rows.length
    ? rows.map(i =>
        '<tr><td>' + esc(i.app) + '</td>' +
        '<td><a href="https://' + esc(i.domain) + '" target="_blank" rel="noopener">' + esc(i.domain) + '</a></td>' +
        '<td><span class="badge up">running</span></td>' +
        '<td style="color:var(--dim);font-size:12px">' + esc(day(i.ts)) + '</td></tr>'
      ).join('')
    : emptyRow(4, 'Nothing installed yet', 'Pick an app above to install it on its own subdomain.'));
}

window.panel = window.panel || {};

window.panel.filterApps = q => {
  const s = String(q || '').toLowerCase();
  render(!s ? allApps : allApps.filter(a =>
    (a.name + ' ' + (a.description || '') + ' ' + (a.category || '')).toLowerCase().includes(s)));
};

window.panel.showInstall = id => {
  const app = allApps.find(a => a.id === id);
  if (!app) return;
  $('modal-title').textContent = 'Install ' + app.name;
  $('modal-app-id').value = id;
  $('modal-domain').value = id.replace(/_/g, '-') + '.' + config.domain;
  $('install-modal').classList.add('open');
};

$('modal-install')?.addEventListener('click', async () => {
  const app    = $('modal-app-id').value;
  const domain = ($('modal-domain').value || '').trim();
  if (!domain) { toast('Enter a domain for this app', 'err'); return; }
  try {
    await api('/ui/catalog/install', {
      method: 'POST',
      body: {
        app, domain,
        tenantId: ($('modal-tenant').value || 'default').trim(),
        gitUrl:   ($('modal-giturl').value || '').trim() || undefined,
      },
    });
    $('install-modal').classList.remove('open');
    toast('Installing ' + app + ' on ' + domain);
    setTimeout(loadInstalls, 4000);
  } catch (e) {
    toast('Install failed — ' + e.message, 'err');
  }
});
