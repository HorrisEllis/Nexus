/* ============================================================================
   NexusPanel — router.js

   Pages are fetched on demand: markup from /pages/<id>.html, behaviour from
   /js/pages/<id>.js. Both are cached after first load.

   This is the structural fix for the bug that killed the old panel. Every
   page used to be a string inside a server-side template literal, which meant
   two layers of escaping, no syntax checking, and one malformed escape taking
   the entire client script down with it. These are real files now: the server
   sends them as-is, `node --check` can read them, and a broken page fails
   alone instead of taking the panel with it.
   ========================================================================= */

import { $, $$, toast, esc } from './core.js';
import { ALL_PAGES, META } from './nav.js';
import { icon } from './icons.js';

const markupCache = new Map();  // id -> html string
const moduleCache = new Map();  // id -> module namespace
const mounted     = new Set();  // ids whose markup is in the DOM

let current = null;

async function fetchMarkup(id) {
  if (markupCache.has(id)) return markupCache.get(id);
  const res = await fetch(`/pages/${id}.html`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`page markup ${id}.html — ${res.status}`);
  const html = await res.text();
  markupCache.set(id, html);
  return html;
}

async function fetchModule(id) {
  if (moduleCache.has(id)) return moduleCache.get(id);
  let mod = null;
  try {
    mod = await import(`./pages/${id}.js`);
  } catch (e) {
    // A page with no controller is legitimate — static markup only.
    if (!/Failed to fetch|Cannot find|404/i.test(String(e.message))) throw e;
    mod = {};
  }
  moduleCache.set(id, mod);
  return mod;
}

function failPane(id, message) {
  return `<div class="card"><div class="card-title">${icon('alert', 15)}`
       + `This page did not load</div>`
       + `<p style="color:var(--dim);font-size:13px">`
       + `<code>${esc(id)}</code> could not be loaded: ${esc(message)}</p>`
       + `<p class="hint">The rest of the panel is unaffected. `
       + `Check the ui engine log for the matching request.</p></div>`;
}

async function mount(id) {
  if (mounted.has(id)) return;
  const host = document.createElement('section');
  host.className = 'page';
  host.id = 'page-' + id;
  try {
    host.innerHTML = await fetchMarkup(id);
  } catch (e) {
    host.innerHTML = failPane(id, e.message);
  }
  $('page-host').appendChild(host);
  mounted.add(id);
}

/** Navigate to a page: mount markup, run its init, update chrome and hash. */
async function navigate(id, opts = {}) {
  if (!ALL_PAGES.includes(id)) id = 'dashboard';

  await mount(id);

  $$('.page').forEach(p => p.classList.remove('active'));
  const pane = $('page-' + id);
  if (pane) pane.classList.add('active');

  $$('.navlink').forEach(a => {
    const on = a.dataset.p === id;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  const meta = META[id] || { title: id, sub: '' };
  const t = $('page-title'); if (t) t.textContent = meta.title;
  const s = $('page-sub');   if (s) s.textContent = meta.sub;
  document.title = `${meta.title} — NexusPanel`;

  current = id;
  if (!opts.silent && location.hash.slice(1) !== id) location.hash = id;

  // Close the mobile rail after a jump.
  const sb = $('sidebar');
  if (sb) sb.classList.remove('open');

  try {
    const mod = await fetchModule(id);
    if (typeof mod.init === 'function') await mod.init(opts.arg);
  } catch (e) {
    console.error('[panel] page init failed:', id, e);
    toast(`${meta.title} did not load — ${e.message}`, 'err');
  }
}

/** Re-run the current page's init, if it has one. */
async function refresh() {
  if (!current) return;
  const mod = moduleCache.get(current);
  if (mod && typeof mod.init === 'function') {
    try { await mod.init(); } catch (e) { console.warn('[panel] refresh failed', e); }
  }
}

function currentPage() { return current; }

function startRouter(defaultPage = 'wizard') {
  document.addEventListener('click', e => {
    const link = e.target.closest('.navlink');
    if (!link) return;
    e.preventDefault();
    navigate(link.dataset.p);
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const link = e.target.closest('.navlink');
    if (!link) return;
    e.preventDefault();
    navigate(link.dataset.p);
  });

  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (id && id !== current) navigate(id, { silent: true });
  });

  const initial = location.hash.slice(1) || defaultPage;
  return navigate(initial, { silent: true });
}

export { navigate, refresh, currentPage, startRouter };
