'use strict';
/**
 * renderer/library/sections/passwords.js — Library → Passwords  (styles: passwords.css)
 * Ported 0.39.241 from ui/library/library-app.js (TABS.passwords). Read-only
 * apart from delete: origin + username, never the value — passwords/vault.js's
 * list() never decrypts, and this view does not ask it to. Entries are created by
 * the vault's own save prompt in the browser window.
 */
(function () {
  const { h, busy, confirmDo, pane, row, btn, empty, section } = window.CGS;
  const { api, matches } = window.CGL;

  section({
    id: 'passwords', group: 'Identity', icon: '⚿', label: 'Passwords',
    blurb: 'Saved sign-ins by site. Values are never shown here — origin and username only.',
    async render({ rerender, query }) {
      const r = await api('/cli/passwords');
      const all = r.passwords || [];
      const list = all.filter(p => matches(query, p.origin, p.username));
      if (!all.length) return pane({ flush: true, body: empty('No saved passwords. Clear Glass offers to save one when you sign in to a site.') });
      return pane({
        title: query ? `${list.length} of ${all.length}` : `${all.length} saved`, flush: true,
        body: list.length ? list.map(p => {
          const rw = row(p.origin, p.username || '(no username)',
            btn('Delete', async (e) => {
              if (!await confirmDo(`Delete the password for ${p.origin}?`, `Username ${p.username || '(none)'}. It cannot be recovered.`, 'Delete')) return;
              await busy(e.target, async () => { await api(`/cli/passwords/${encodeURIComponent(p.id)}`, { method: 'DELETE' }); rerender(); });
            }, 'sm danger'));
          rw.prepend(h('span', { class: 'pw-dots', 'aria-hidden': 'true', text: '••••' }));
          return rw;
        }) : empty(`Nothing matches “${query}”.`),
      });
    },
  });
})();
