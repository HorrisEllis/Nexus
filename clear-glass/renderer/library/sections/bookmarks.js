'use strict';
/**
 * renderer/library/sections/bookmarks.js — Library → Bookmarks  (styles: bookmarks.css)
 * Ported 0.39.241 from ui/library/library-app.js (TABS.bookmarks, 2026-09-19/21):
 * same data (GET/DELETE /cli/bookmarks), now on the Settings runtime. Opening a
 * bookmark navigates the agent window it was saved from (cg.navigate), instead of
 * the old page's target=_blank — which in an Electron window meant a bare,
 * chromeless popup with none of Clear Glass around it.
 */
(function () {
  const { cg, h, busy, pane, row, btn, empty, fail, toast, section } = window.CGS;
  const { api, host, matches } = window.CGL;

  const openIn = (b) => cg.navigate(b.agentId || 'default', b.url).then(() => toast(`Opened in ${b.agentId || 'default'}`), fail);

  section({
    id: 'bookmarks', group: 'Library', icon: '☆', label: 'Bookmarks',
    blurb: 'Pages saved with the ☆ in the address bar, from every agent window.',
    async render({ rerender, query }) {
      const r = await api('/cli/bookmarks');
      const all = r.bookmarks || [];
      const list = all.filter(b => matches(query, b.title, b.url, b.agentId, ...(b.tags || [])));
      if (!all.length) return pane({ flush: true, body: empty('No bookmarks yet — click the ☆ in the address bar to add one.') });
      return pane({
        title: query ? `${list.length} of ${all.length}` : `${all.length} bookmark${all.length === 1 ? '' : 's'}`, flush: true,
        body: list.length ? list.map(b => {
          const rw = row(b.title || b.url, [host(b.url), (b.tags || []).join(', '), b.agentId].filter(Boolean).join(' · '),
            btn('Open', () => openIn(b), 'sm'),
            btn('Delete', (e) => busy(e.currentTarget, async () => { await api(`/cli/bookmarks/${encodeURIComponent(b.id)}`, { method: 'DELETE' }); rerender(); }), 'sm danger'));
          rw.classList.add('bm-row'); rw.title = b.url;
          rw.prepend(h('span', { class: 'bm-star', 'aria-hidden': 'true', text: '★' }));
          return rw;
        }) : empty(`Nothing matches “${query}”.`),
      });
    },
  });
})();
