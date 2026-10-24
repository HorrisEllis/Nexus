/* ============================================================================
   NexusPanel — nav.js
   The sidebar is data, not markup. One array drives the rail, the router's
   valid-page set, and the document title.

   Every entry that used to carry an emoji now names a glyph from icons.js.
   ========================================================================= */

import { icon } from './icons.js';
import { $, esc, config } from './core.js';

const NAV = [
  { section: 'Start' },
  { id: 'wizard',    label: 'Setup Wizard',  glyph: 'rocket',   title: 'Setup Wizard',      sub: 'Get the server online, step by step' },
  { id: 'docs',      label: 'Documentation', glyph: 'book',     title: 'Documentation',     sub: 'Full platform reference' },

  { section: 'System' },
  { id: 'dashboard', label: 'Dashboard',     glyph: 'grid',     title: 'Dashboard',         sub: 'Platform status at a glance' },
  { id: 'engines',   label: 'Engines',       glyph: 'gear',     title: 'Engines',           sub: 'Every running component and its port' },
  { id: 'monitor',   label: 'Monitor',       glyph: 'pulse',    title: 'Uptime Monitor',    sub: 'Availability and response time' },
  { id: 'logs',      label: 'Log Viewer',    glyph: 'list',     title: 'Log Viewer',        sub: 'Tail any engine log' },

  { section: 'Hosting' },
  { id: 'sites',     label: 'Sites',         glyph: 'globe',    title: 'Sites',             sub: 'Every domain this server hosts' },
  { id: 'builder',   label: 'Builder',       glyph: 'upload',   title: 'Builder',           sub: 'Drop a project archive and deploy it' },
  { id: 'domains',   label: 'Domains',       glyph: 'route',    title: 'Domains',           sub: 'Search, register, and point domains here' },
  { id: 'dns',       label: 'DNS Zone',      glyph: 'share',    title: 'DNS Zone',          sub: 'Authoritative records for your zone' },
  { id: 'ssl',       label: 'SSL / TLS',     glyph: 'lock',     title: 'SSL / TLS',         sub: 'Certificates, issued automatically' },
  { id: 'apps',      label: 'App Catalog',   glyph: 'layers',   title: 'App Catalog',       sub: 'One-click installs' },
  { id: 'files',     label: 'File Manager',  glyph: 'folder',   title: 'File Manager',      sub: 'Browse and edit files on disk' },

  { section: 'Services' },
  { id: 'mail',      label: 'Mail',          glyph: 'mail',     title: 'Mail',              sub: 'Mailboxes, DKIM, disposable addresses' },
  { id: 'storage',   label: 'Storage',       glyph: 'box',      title: 'Object Storage',    sub: 'S3-compatible buckets' },
  { id: 'cron',      label: 'Scheduled Jobs',glyph: 'clock',    title: 'Scheduled Jobs',    sub: 'Recurring commands and webhooks' },
  { id: 'users',     label: 'Users',         glyph: 'users',    title: 'Users',             sub: 'Tenant accounts and provisioning' },

  { section: 'Security' },
  { id: 'firewall',  label: 'Firewall',      glyph: 'shield',   title: 'Firewall',          sub: 'Rate limits, bans, and OS rules' },
  { id: 'vpn',       label: 'VPN',           glyph: 'lock',     title: 'VPN',               sub: 'WireGuard, self-hosted' },
  { id: 'apikeys',   label: 'API Keys',      glyph: 'key',      title: 'API Keys',          sub: 'Programmatic access to the platform' },
  { id: 'sshkeys',   label: 'SSH Keys',      glyph: 'terminal', title: 'SSH / SFTP',        sub: 'Shell and encrypted file transfer access' },
  { id: 'sftp',      label: 'FTP Access',    glyph: 'upload',   title: 'FTP Access',        sub: 'Plain FTP users and connection details' },

  { section: 'Network' },
  { id: 'network',   label: 'Auto DNS',      glyph: 'radio',    title: 'Auto DNS',          sub: 'Keep records pointed at your current IP' },
  { id: 'tunnel',    label: 'Tunnel',        glyph: 'link',     title: 'Tunnel',            sub: 'Reach the server without port forwarding' },
  { id: 'peer',      label: 'Peer / P2P',    glyph: 'share',    title: 'Peer / P2P',        sub: 'Mesh identity and discovery' },

  { section: 'Account' },
  { id: 'billing',   label: 'Billing',       glyph: 'card',     title: 'Billing',           sub: 'Tenant plans and quotas' },
  { id: 'settings',  label: 'Settings',      glyph: 'sliders',  title: 'Settings',          sub: 'Panel and platform configuration' },
];

/** Pages reachable from the rail, plus those only reachable by drill-down. */
const PAGES = NAV.filter(n => n.id).map(n => n.id);
const HIDDEN_PAGES = ['site-detail'];
const ALL_PAGES = PAGES.concat(HIDDEN_PAGES);

const META = Object.fromEntries(
  NAV.filter(n => n.id).map(n => [n.id, { title: n.title, sub: n.sub }])
);
META['site-detail'] = { title: 'Site', sub: 'Manage this site' };

function renderNav() {
  const host = $('nav-links');
  if (!host) return;
  host.innerHTML = NAV.map(n => {
    if (n.section) return `<div class="section">${esc(n.section)}</div>`;
    return `<a class="navlink" data-p="${esc(n.id)}" role="link" tabindex="0">`
         + `<span class="icon">${icon(n.glyph, 16)}</span>${esc(n.label)}</a>`;
  }).join('');
}

function renderBrand() {
  const el = $('brand-domain');
  if (el) el.textContent = config.domain;
  const t = $('brand-name');
  if (t) t.innerHTML = icon('box', 17) + esc(config.siteTitle || 'NexusPanel');
}

export { NAV, PAGES, HIDDEN_PAGES, ALL_PAGES, META, renderNav, renderBrand };
