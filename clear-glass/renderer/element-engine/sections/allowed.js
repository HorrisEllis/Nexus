'use strict';
/**
 * renderer/element-engine/sections/allowed.js — Element Engine → Allowed sites  (styles: allowed.css). EE3a, 0.60.416.
 * Sites where nothing is blocked or hidden (Site settings keeps the same list): add, remove. POST /cli/adblock/allow {site, on}.
 */
(function () {
  const { h, busy, pane, row, btn, empty, toast, section } = window.CGS;
  const { api, matches } = window.CGL;

  section({
    id: 'allowed', group: 'Ad blocking', icon: '✓', label: 'Allowed sites',
    keywords: 'whitelist exception site allow',
    blurb: 'On these sites nothing is blocked or hidden. Settings → Site settings keeps the same list.',
    async render({ rerender, query }) {
      const o = await api('/cli/element-engine/overview');
      const all = (o.blocker && o.blocker.allowed) || []; const L = all.filter(s => matches(query, s));
      const site = h('input', { type: 'text', placeholder: 'example.com', class: 'ee-wide', 'aria-label': 'Site to allow' });
      const add = btn('Allow', (e) => busy(e.currentTarget, async () => {
        const s = site.value.trim(); if (!s) throw new Error('a site is needed');
        const r = await api('/cli/adblock/allow', { method: 'POST', body: { site: s, on: true } }); toast(`${r.origin || s} allowed`); rerender();
      }), 'primary');
      site.addEventListener('keydown', (e) => { if (e.key === 'Enter') add.click(); });
      return [pane({ title: 'Allow a site', body: h('div', { class: 'ee-bar' }, site, add) }),
        pane({ title: query ? `${L.length} of ${all.length}` : `${all.length} allowed`, flush: true, body: L.length ? L.map(s => row(s, null,
          btn('Block here again', (e) => busy(e.currentTarget, async () => { await api('/cli/adblock/allow', { method: 'POST', body: { site: s, on: false } }); toast(`${s}: blocking again`); rerender(); }), 'sm'))) : empty('No site is allowed.') })];
    },
  });
})();
