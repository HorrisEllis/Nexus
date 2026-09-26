'use strict';
/**
 * renderer/library/sections/accounts.js — Library → Accounts  (styles: accounts.css)
 * Ported 0.39.241 from ui/library/library-app.js (TABS.accounts): NEXUS
 * identities — a label and the agent keys it links (GET/POST/DELETE
 * /cli/accounts). Not the same thing as Settings → Accounts & sign-in, which
 * manages each provider's signed-in sessions; the blurb says so and links there.
 */
(function () {
  const { cg, h, call, busy, modal, confirmDo, field, pane, row, btn, chip, empty, fail, section } = window.CGS;
  const { api, matches } = window.CGL;

  async function create(rerender) {
    const label = h('input', { type: 'text', placeholder: 'e.g. Work' });
    const keys = h('input', { type: 'text', class: 'mono', placeholder: 'claude, chatgpt' });
    const ok = await modal({
      title: 'New account',
      body: [field('Label', label), field('Agent keys', keys, 'Comma-separated agent ids this identity signs in as.')],
      actions: [{ label: 'Create', primary: true, run: async () => {
        if (!label.value.trim()) throw new Error('A label is required.');
        await api('/cli/accounts', { method: 'POST', body: { label: label.value.trim(), agentKeys: keys.value.split(',').map(s => s.trim()).filter(Boolean) } });
      } }],
    });
    if (ok) rerender();
  }

  section({
    id: 'accounts', group: 'Identity', icon: '◈', label: 'Accounts',
    blurb: 'NEXUS identities and the agents they link. Provider sign-ins (cookies, sessions) are in Settings → Accounts & sign-in.',
    async render({ tools, rerender, query }) {
      tools.append(btn('New account', () => create(rerender), 'primary sm'),
        btn('Open Settings', () => call(() => cg.window.openSettings(), 'open settings').catch(fail), 'sm ghost'));
      const r = await api('/cli/accounts');
      const all = r.accounts || [];
      const list = all.filter(a => matches(query, a.label, ...(a.agentKeys || [])));
      if (!all.length) return pane({ flush: true, body: empty('No accounts yet.', btn('New account', () => create(rerender), 'sm')) });
      return pane({
        title: query ? `${list.length} of ${all.length}` : `${all.length} account${all.length === 1 ? '' : 's'}`, flush: true,
        body: list.length ? list.map(a => row(a.label,
          a.providerAccounts ? `providers: ${Object.keys(a.providerAccounts).join(', ')}` : null,
          (a.agentKeys || []).length ? (a.agentKeys || []).map(k => chip(k, 'plain')) : chip('unlinked', 'warn'),
          btn('Delete', async (e) => {
            if (!await confirmDo(`Delete “${a.label}”?`, 'The identity is removed. Provider sessions are not touched.', 'Delete')) return;
            await busy(e.target, async () => { await api(`/cli/accounts/${encodeURIComponent(a.id)}`, { method: 'DELETE' }); rerender(); });
          }, 'sm danger'))) : empty(`Nothing matches “${query}”.`),
      });
    },
  });
})();
