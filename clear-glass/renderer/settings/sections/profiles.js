'use strict';
/**
 * renderer/settings/sections/profiles.js — Profiles  (styles: profiles.css)
 * AC10 slice b, 2026-11-22 — James: "i just clearglass to have one source of truth for cookies and accounts, hooked into the profiles"
 * · "okay profiles are in clearglass. no coupline". Every change goes to Clear Glass's own store (cg.profiles); the rules are src/profiles/profiles.eg.
 * Tabs and agents move onto a profile's cookie jar in slice c, so this screen has no Open button yet.
 */
(function () {
  const { cg, h, call, toast, fail, busy, modal, confirmDo, field, pane, btn, section } = window.CGS;
  let selected = null;

  const ask = async (fn, what) => { const r = await call(fn, what); if (r && r.ok === false) throw new Error(r.error || `${what} failed`); return r; };
  const act = (fn, what, done, rerender) => busy(null, async () => { try { await ask(fn, what); if (done) toast(done); rerender(); } catch (e) { fail(e); } });
  const hue = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 17);
  const avatar = (p) => { const el = h('span', { class: 'pf-av', text: (p.name[0] || '?').toUpperCase() }); el.style.setProperty('--h', hue(p.id)); return el; };
  const count = (n) => `${n} account${n === 1 ? '' : 's'}`;

  async function nameFlow(title, value, label, run, rerender) {
    const input = h('input', { type: 'text', value, placeholder: 'Work, Personal, Research…' });
    const r = await modal({ title, body: [field('Name', input)], actions: [{ label, primary: true, run: () => {
      const v = input.value.trim(); if (!v) throw new Error('Give the profile a name.'); return ask(() => run(v), label);
    } }] });
    if (r && r !== true) rerender();
    return r;
  }

  async function addFlow(p, accounts, rerender) {
    const free = accounts.filter((a) => !p.accounts.includes(a.id));
    if (!free.length) { toast('Every account is already in this profile.'); return; }
    const pick = h('select', {}, free.map((a) => h('option', { value: a.id, text: `${a.label}${(a.agentKeys || []).length ? ` (${a.agentKeys.join(', ')})` : ''}` })));
    const r = await modal({ title: `Add an account to “${p.name}”`, body: [field('Account', pick, 'A profile holds one account for each provider.')],
      actions: [{ label: 'Add account', primary: true, run: () => ask(() => cg.profiles.link(p.id, pick.value), 'add account') }] });
    if (r && r !== true) { toast('Account added'); rerender(); }
  }

  function detail(p, l, accounts, rerender) {
    const isDefault = p.id === l.defaultId, byId = new Map(accounts.map((a) => [a.id, a]));
    const rows = p.accounts.map((id) => { const a = byId.get(id) || { label: id, agentKeys: [] };
      return h('div', { class: 'row' }, h('div', { class: 'what' }, h('div', { class: 't', text: a.label }), h('div', { class: 'd', text: (a.agentKeys || []).join(', ') || 'no provider' })),
        h('div', { class: 'acts' }, btn('Remove', () => act(() => cg.profiles.unlink(p.id, id), 'remove account', 'Account removed from this profile', rerender), 'sm'))); });
    return pane({ title: p.name, sub: isDefault ? 'Your normal browsing profile' : 'A separate set of cookies and logins', flush: true,
      tools: h('span', { class: 'pane-tools' },
        btn('Rename', () => nameFlow(`Rename “${p.name}”`, p.name, 'Rename', (v) => cg.profiles.rename(p.id, v), rerender), 'sm'),
        isDefault ? null : btn('Make default', () => act(() => cg.profiles.setDefault(p.id), 'make default', `“${p.name}” is now the default`, rerender), 'sm'),
        isDefault ? null : btn('Delete', async () => { if (await confirmDo(`Delete “${p.name}”?`, 'The accounts stay in Clear Glass and no cookies are deleted.', 'Delete profile')) { selected = l.defaultId; act(() => cg.profiles.delete(p.id), 'delete profile', 'Profile deleted', rerender); } }, 'sm danger')),
      body: [...(rows.length ? rows : [h('div', { class: 'row' }, h('div', { class: 'what' }, h('div', { class: 'd', text: 'No accounts yet' })))]),
        h('div', { class: 'row' }, h('div', { class: 'what' }, h('div', { class: 'd', text: 'Add an account to this profile' })), h('div', { class: 'acts' }, btn('Add…', () => addFlow(p, accounts, rerender), 'sm')))] });
  }

  // James, 2026-11-22: "Now all of the rest of them. You know... like an actual browser." · "I didn't say account providers. I said logins."
  function loginsPane(p, r, rerender) {
    const list = (r && r.logins) || [];
    const rows = list.map((x) => { const names = x.passwords.map((w) => w.username).join(', ');
      return h('div', { class: 'row' }, h('div', { class: 'what' }, h('div', { class: 't', text: x.site }), h('div', { class: 'd', text: `${x.signedIn ? 'Signed in' : 'Not signed in'} · ${names ? `password saved for ${names}` : 'no saved password'}` })),
        h('div', { class: 'acts' }, x.signedIn ? btn('Sign out', async () => { if (await confirmDo(`Sign out of ${x.site}?`, `Removes ${x.site}’s cookies from this profile. A saved password stays. Any tab or agent using ${x.site} is signed out too.`, 'Sign out')) act(() => cg.profiles.signOut(p.id, x.site), 'sign out', `Signed out of ${x.site}`, rerender); }, 'sm') : null)); });
    return pane({ title: 'Logins', sub: `${list.length} site${list.length === 1 ? '' : 's'} in this profile`, flush: true, body: rows.length ? rows : [h('div', { class: 'row' }, h('div', { class: 'what' }, h('div', { class: 'd', text: 'No logins in this profile yet' })))] });
  }

  section({
    id: 'profiles', group: 'Accounts & agents', icon: '◎', label: 'Profiles',
    keywords: 'profile profiles cookies logins accounts jar firefox source of truth',
    blurb: 'Each profile is one set of cookies, logins and accounts. Tabs, Copilot and agents will share their profile, so you sign in once.',
    async render({ tools, rerender }) {
      const [l, accounts] = await Promise.all([ask(() => cg.profiles.list(), 'profiles'), call(() => cg.accounts.list(), 'accounts')]);
      tools.append(btn('New profile', () => nameFlow('New profile', '', 'Create profile', (v) => cg.profiles.create(v), rerender), 'primary'));
      if (!l.profiles.some((p) => p.id === selected)) selected = l.defaultId;
      const shown = l.profiles.find((p) => p.id === selected), logins = await ask(() => cg.profiles.logins(selected), 'logins');
      const list = l.profiles.map((p) => h('button', { class: `pf-item${p.id === selected ? ' on' : ''}`, onclick: () => { selected = p.id; rerender(); } }, avatar(p),
        h('span', { class: 'pf-name' }, h('b', { text: p.name }), h('small', { text: count(p.accounts.length) })), p.id === l.defaultId ? h('span', { class: 'pf-def', text: 'default' }) : h('span', {})));
      return [h('div', { class: 'banner warn' }, h('div', {}, h('div', { class: 't', text: 'Tabs and agents have not moved onto profiles yet' }), h('div', { class: 'd', text: 'They keep their current sign-ins until the cookie move, and your existing jars are kept.' }))),
        h('div', { class: 'pf-grid' }, pane({ title: 'Your profiles', sub: `${l.profiles.length} profiles · ${count(accounts.length)}`, flush: true, body: list }), h('div', { class: 'pf-main' }, loginsPane(shown, logins, rerender), detail(shown, l, accounts, rerender)))];
    },
  });
})();
