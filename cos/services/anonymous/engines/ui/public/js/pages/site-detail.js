/* NexusPanel — pages/site-detail.js */
import { $, html, text, api, apiSoft, act, esc, empty, stats, bytes, toast } from '../core.js';
import { navigate } from '../router.js';

let currentSite = null;

export async function init(hostname) {
  if (hostname) currentSite = hostname;
  if (!currentSite) { navigate('sites'); return; }

  text('detail-title', currentSite);
  const visit = $('detail-visit');
  if (visit) visit.onclick = () => window.open('https://' + currentSite, '_blank', 'noopener');

  const r = await apiSoft('/ui/webserver/vhosts');
  const v = (r?.vhosts || []).find(x => x.hostname === currentSite);
  if (!v) {
    html('detail-body', empty('Site not found',
      'It may have been deleted. Return to Sites to see what is configured.'));
    return;
  }

  html('detail-stats', stats([
    { label: 'Stack',    val: v.stack || 'static', cls: '' },
    { label: 'PHP',      val: v.php ? 'Enabled' : 'Disabled', cls: v.php ? 'g' : '' },
    { label: 'Listing',  val: v.listing ? 'On' : 'Off', cls: '' },
    { label: 'Proxy',    val: v.proxyPort ? ':' + v.proxyPort : 'none', cls: v.proxyPort ? 'b' : '' },
  ]));

  if ($('detail-config')) $('detail-config').textContent = JSON.stringify(v, null, 2);
  if ($('detail-stack'))      $('detail-stack').value      = v.stack || 'static';
  if ($('detail-proxy-port')) $('detail-proxy-port').value = v.proxyPort || '';
  if ($('detail-index'))      $('detail-index').value      = (v.index || []).join(',');
  if ($('detail-listing'))    $('detail-listing').value    = v.listing ? 'true' : 'false';
  if ($('detail-fm-path'))    $('detail-fm-path').value    = v.root || '';
}

async function browseFiles() {
  const r = await apiSoft('/ui/webserver/vhosts');
  const v = (r?.vhosts || []).find(x => x.hostname === currentSite);
  if (!v) return;
  const sub = ($('detail-fm-path')?.value || v.root || '').trim();
  const fr = await apiSoft('/ui/files?path=' + encodeURIComponent(sub));
  const entries = fr?.entries || [];
  html('detail-fm', entries.length
    ? '<table><thead><tr><th>Name</th><th>Size</th></tr></thead><tbody>' +
      entries.map(e =>
        '<tr><td class="num">' + esc(e.name) + '</td>' +
        '<td style="color:var(--dim)">' + (e.type === 'file' ? esc(bytes(e.size)) : 'directory') + '</td></tr>'
      ).join('') + '</tbody></table>'
    : empty('Empty document root', 'Upload files or drop a project here to publish this site.'));
}

async function loadLogs() {
  const r = await apiSoft('/ui/logs/webserver?lines=150');
  const box = $('detail-log');
  if (!box) return;
  const rows = r?.lines || [];
  box.innerHTML = rows.length
    ? rows.map(l => {
        const lv = l.includes('[ERROR]') ? 'ERROR' : l.includes('[WARN]') ? 'WARN' : 'INFO';
        return '<div class="' + lv + '">' + esc(l) + '</div>';
      }).join('')
    : '<div class="INFO">No entries yet for this site.</div>';
  box.scrollTop = box.scrollHeight;
}

window.panel = window.panel || {};

window.panel.siteTab = (el, name) => {
  document.querySelectorAll('[id^="stab-"]').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#page-site-detail .tab').forEach(t => t.classList.remove('active'));
  document.getElementById('stab-' + name)?.classList.add('active');
  el?.classList.add('active');
  if (name === 'files') browseFiles();
  if (name === 'logs')  loadLogs();
};

window.panel.updateSiteConfig = async () => {
  if (!currentSite) return;
  const r = await apiSoft('/ui/webserver/vhosts');
  const v = (r?.vhosts || []).find(x => x.hostname === currentSite);
  if (!v) return;
  v.stack     = $('detail-stack').value;
  v.proxyPort = parseInt($('detail-proxy-port').value, 10) || null;
  v.index     = $('detail-index').value.split(',').map(s => s.trim()).filter(Boolean);
  v.listing   = $('detail-listing').value === 'true';
  v.php       = v.stack === 'php' || v.stack === 'wordpress';
  const ok = await act('Configuration saved', () =>
    api('/ui/webserver/vhost/update', { method: 'POST', body: { vhost: v } }));
  if (ok) init(currentSite);
};

window.panel.deleteSite = async () => {
  if (!currentSite) return;
  if (!confirm('Delete ' + currentSite + '? The vhost config is removed. Files on disk are kept.')) return;
  const ok = await act('Site deleted', () =>
    api('/ui/webserver/vhost/' + encodeURIComponent(currentSite), { method: 'DELETE' }));
  if (ok) { currentSite = null; navigate('sites'); }
};

window.panel.detailBrowse = browseFiles;
