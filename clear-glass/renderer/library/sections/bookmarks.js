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
  const { cg, h, busy, pane, row, btn, empty, fail, toast, select, section } = window.CGS;
  const { api, host, matches } = window.CGL;

  // §0.39.265 — a bookmark with an account opens in that account's window
  // (acct-<accountId>); one with saved page state is restored by rewind.
  async function openIn(b) {
    try {
      if (b.accountId) {
        const target = `acct-${b.accountId}`;
        await cg.window.open({ agentId: target, url: b.url });
        if (b.snapshotId && b.agentId === target) await cg.bookmarks.openWithState({ id: b.id, agentId: target });
        return toast('Opened in the account\u2019s window');
      }
      if (b.snapshotId) {
        const r = await cg.bookmarks.openWithState({ id: b.id, agentId: b.agentId || 'default' });
        if (r && r.restored) return toast(`Restored in ${b.agentId || 'default'}`);
      }
      await cg.navigate(b.agentId || 'default', b.url);
      toast(`Opened in ${b.agentId || 'default'}`);
      await runBound(b);
    } catch (e) { fail(e); }
  }
  // BM1 (0.60.403) — James: "bookmarks with ability to bind macros." A bound bookmark runs its macro in its window once it opens (macros:run,
  // his act, with its toast); a macro that is gone or fails is said.
  async function runBound(b) {
    if (!b.macro) return;
    const r = await cg.macros.run(b.macro, { agentId: b.agentId || 'default' }).catch(e => ({ error: e.message }));
    if (!r || r.error || r.ok === false) toast(`Macro ${b.macro} did not run: ${(r && (r.error || r.reason)) || 'no answer'}`);
    else toast(`Ran ${b.macro}`);
  }

  section({
    id: 'bookmarks', group: 'Library', icon: '☆', label: 'Bookmarks',
    blurb: 'Pages saved with the ☆ in the address bar, from every agent window.',
    async render({ rerender, query }) {
      const [r, accounts, ml] = await Promise.all([api('/cli/bookmarks'), cg.accounts.list().catch(() => []), cg.macros.list().catch(() => ({ macros: [] }))]);
      const macroOpts = [{ value: '', label: 'No macro on open' }, ...(((ml && ml.macros) || []).map(m => ({ value: m.name, label: `⚡ ${m.name}` })))];
      const macroSelect = (b) => {   // BM1 — "Macro on open"
        const sel = select(macroOpts, b.macro || '', { 'aria-label': 'Macro on open', class: 'bm-macro' });
        sel.addEventListener('change', () => busy(null, async () => { const x = await cg.bookmarks.bindMacro({ id: b.id, macro: sel.value || null }); if (x && x.error) { sel.value = b.macro || ''; return toast(x.error); } b.macro = sel.value || null; toast(sel.value ? `Opening it runs ${sel.value}` : 'No macro on open'); }));
        return sel;
      };
      const all = r.bookmarks || [];
      const acctOpts = [{ value: '', label: 'No account' }, ...(accounts || []).map(a => ({ value: a.id, label: a.label }))];
      const acctSelect = (b) => {
        const sel = select(acctOpts, b.accountId || '', { 'aria-label': 'Account', class: 'bm-acct' });
        sel.addEventListener('change', () => busy(null, async () => { await cg.bookmarks.linkState({ id: b.id, accountId: sel.value || null }); b.accountId = sel.value || null; toast(sel.value ? 'Account attached' : 'Account removed'); }));
        return sel;
      };
      const list = all.filter(b => matches(query, b.title, b.url, b.agentId, ...(b.tags || [])));
      if (!all.length) return pane({ flush: true, body: empty('No bookmarks yet — click the ☆ in the address bar to add one.') });
      return pane({
        title: query ? `${list.length} of ${all.length}` : `${all.length} bookmark${all.length === 1 ? '' : 's'}`, flush: true,
        body: list.length ? list.map(b => {
          const rw = row(b.title || b.url, [host(b.url), (b.tags || []).join(', '), b.agentId, b.snapshotId ? 'page state saved' : null].filter(Boolean).join(' · '),
            acctSelect(b),
            macroSelect(b),
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
