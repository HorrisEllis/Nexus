/* ============================================================================
   NexusPanel — app.js
   Entry point. Loads panel config, paints the rail, starts the router.
   ========================================================================= */

import { $, apiSoft, loadConfig, config, toast } from './core.js';
import { renderNav, renderBrand } from './nav.js';
import { startRouter, currentPage, refresh } from './router.js';
import { icon } from './icons.js';

async function boot() {
  await loadConfig();
  renderBrand();
  renderNav();

  // Mobile rail toggle
  const toggle = $('navtoggle');
  const rail   = $('sidebar');
  if (toggle && rail) {
    toggle.innerHTML = icon('menu', 18);
    toggle.addEventListener('click', () => {
      const open = rail.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }

  // Modal dismissal
  const modal = $('install-modal');
  if (modal) {
    $('modal-cancel')?.addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', e => {
      if (e.target === modal) modal.classList.remove('open');
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') modal.classList.remove('open');
    });
  }

  await startRouter('wizard');

  // Public IP in the rail
  const peer = await apiSoft('/ui/peer/identity');
  const ipEl = $('sb-ip');
  if (ipEl) ipEl.textContent = peer?.ip || 'no public IP yet';

  // Background refresh for the pages where staleness actually matters.
  setInterval(() => {
    const p = currentPage();
    if (p === 'dashboard' || p === 'monitor' || p === 'engines') refresh();
  }, 30000);
}

boot().catch(e => {
  console.error('[panel] boot failed', e);
  const host = document.getElementById('page-host');
  if (host) {
    host.innerHTML =
      '<div class="card"><div class="card-title">Panel failed to start</div>' +
      '<p style="color:var(--dim);font-size:13px">' + String(e.message) + '</p>' +
      '<p class="hint">The engines keep running independently. ' +
      'Use <code>node nexus.js status</code> from the CLI.</p></div>';
  }
});
