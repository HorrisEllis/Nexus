/* NexusPanel — pages/sites.js */
import { $, html, api, apiSoft, act, esc, empty, toast, config } from '../core.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';

export async function init() {
  const r = await apiSoft('/ui/webserver/vhosts');
  const vhosts = r?.vhosts || [];

  if (!vhosts.length) {
    html('sites-list', empty('No sites yet',
      'Add a site to point a domain at this server and have it served immediately.'));
  } else {
    html('sites-list', vhosts.map(v =>
      '<div class="card" style="margin-bottom:10px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">' +
          '<div style="min-width:0">' +
            '<div style="font-size:15px;font-weight:600">' + esc(v.hostname) + '</div>' +
            '<div style="font-size:12px;color:var(--dim);margin-top:4px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
              '<span class="badge info">' + esc(v.stack || 'static') + '</span>' +
              '<span class="mono">' + esc(v.root || 'auto') + '</span>' +
              (v.proxyPort ? '<span class="badge muted">proxies :' + esc(v.proxyPort) + '</span>' : '') +
              (v.php ? '<span class="badge muted">PHP</span>' : '') +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;flex-shrink:0">' +
            '<a href="https://' + esc(v.hostname) + '" target="_blank" rel="noopener">' +
              '<button class="sec sm">' + icon('external', 12) + 'Visit</button></a>' +
            '<button class="sec sm" onclick="panel.openSite(\'' + esc(v.hostname) + '\')">Manage</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    ).join(''));
  }

  const php = await apiSoft('/ui/webserver/php');
  html('php-status', php?.available
    ? '<span class="badge up">php-cgi found</span> <span class="mono" style="color:var(--dim)">' + esc(php.path) + '</span>'
    : '<span class="badge pending">php-cgi not found</span> <span style="color:var(--dim)">' +
      'PHP sites return 500 until PHP is installed on ' + esc(php?.platform || 'this platform') + '.</span>');
}

export function showAddSite() {
  const box = $('site-add');
  if (box) box.style.display = '';
  const h = $('site-hostname');
  if (h) { h.value = ''; h.focus(); }
}

export function hideAddSite() {
  const box = $('site-add');
  if (box) box.style.display = 'none';
  const p = $('site-add-progress');
  if (p) p.style.display = 'none';
}

async function addSite() {
  const hostname = ($('site-hostname')?.value || '').trim();
  if (!hostname) { toast('Enter a hostname first', 'err'); return; }

  const stack = $('site-stack').value;
  const vhost = {
    hostname,
    stack,
    root:      ($('site-root')?.value || '').trim() || null,
    proxyPort: parseInt($('site-proxy-port')?.value, 10) || null,
    index:     ($('site-index')?.value || 'index.html').split(',').map(s => s.trim()).filter(Boolean),
    listing:   $('site-listing')?.value === 'true',
    php:       stack === 'php' || stack === 'wordpress',
  };

  const prog = $('site-add-progress');
  if (prog) prog.style.display = '';
  const step = (msg, pct) => {
    html('site-add-steps', '<span style="color:var(--dim)">' + esc(msg) + '</span>');
    const bar = $('site-add-bar');
    if (bar) bar.style.width = pct + '%';
  };

  try {
    step('Creating vhost', 20);
    await api('/ui/webserver/vhost', { method: 'POST', body: { vhost } });

    step('Adding DNS record', 45);
    const label = hostname.endsWith('.' + config.domain)
      ? hostname.slice(0, -(config.domain.length + 1))
      : hostname;
    await api('/ui/dns', { method: 'POST', body: { name: label, type: 'A', value: '@', ttl: 300 } });

    step('Requesting certificate', 70);
    await api('/ui/ssl/issue', { method: 'POST', body: { domain: hostname } });

    if (stack === 'wordpress') {
      step('Installing WordPress', 88);
      await api('/ui/catalog/install', {
        method: 'POST', body: { app: 'wordpress', domain: hostname, tenantId: 'default' },
      });
    }

    const bar = $('site-add-bar');
    if (bar) { bar.style.width = '100%'; bar.classList.add('g'); }
    html('site-add-steps', '<span style="color:var(--healthy)">' + esc(hostname) + ' is live</span>');
    toast('Created ' + hostname);
    setTimeout(() => { hideAddSite(); init(); }, 1400);
  } catch (e) {
    html('site-add-steps', '<span style="color:var(--alert)">' + esc(e.message) + '</span>');
    toast('Could not create site — ' + e.message, 'err');
  }
}

window.panel = window.panel || {};
window.panel.showAddSite = showAddSite;
window.panel.hideAddSite = hideAddSite;
window.panel.addSite     = addSite;
window.panel.openSite    = host => navigate('site-detail', { arg: host });
