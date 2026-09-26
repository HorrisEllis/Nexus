'use strict';
/**
 * renderer/library/sections/history.js — Library → History  (styles: history.css)
 * Ported 0.39.241 from ui/library/library-app.js (TABS.history): same data
 * (GET/DELETE /cli/history, DELETE /cli/history for all), newest first, grouped
 * by day the way Firefox's Library groups it.
 */
(function () {
  const { cg, h, busy, confirmDo, pane, row, btn, empty, fail, toast, section } = window.CGS;
  const { api, host, matches } = window.CGL;

  function dayLabel(ts) {
    const d = new Date(ts), now = new Date();
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  }

  section({
    id: 'history', group: 'Library', icon: '↺', label: 'History',
    blurb: 'Pages visited in every agent window, newest first.',
    async render({ tools, rerender, query }) {
      const r = await api('/cli/history');
      const all = (r.entries || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
      const list = all.filter(e => matches(query, e.title, e.url, e.agentId));
      tools.append(btn('Clear all history', async (e) => {
        if (!all.length) return toast('History is already empty', 'warn');
        if (!await confirmDo('Clear all history?', 'This removes every entry, for every agent. It cannot be undone.', 'Clear all')) return;
        await busy(e.target, async () => { await api('/cli/history', { method: 'DELETE' }); rerender(); });
      }, 'sm danger'));
      if (!all.length) return pane({ flush: true, body: empty('No history yet.') });
      if (!list.length) return pane({ flush: true, body: empty(`Nothing matches “${query}”.`) });

      const days = new Map();
      for (const e of list) { const k = dayLabel(e.ts); if (!days.has(k)) days.set(k, []); days.get(k).push(e); }
      return [...days.entries()].map(([day, entries]) => pane({
        title: day, sub: `${entries.length} page${entries.length === 1 ? '' : 's'}`, flush: true,
        body: entries.map(e => {
          const rw = row(e.title || e.url, [host(e.url), e.agentId].filter(Boolean).join(' · '),
            btn('Open', () => cg.navigate(e.agentId || 'default', e.url).then(() => toast(`Opened in ${e.agentId || 'default'}`), fail), 'sm'),
            btn('Delete', (ev) => busy(ev.currentTarget, async () => { await api(`/cli/history/${encodeURIComponent(e.id)}`, { method: 'DELETE' }); rerender(); }), 'sm danger'));
          rw.classList.add('hi-row'); rw.title = e.url;
          rw.prepend(h('span', { class: 'hi-time', text: e.ts ? new Date(e.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '' }));
          return rw;
        }),
      }));
    },
  });
})();
