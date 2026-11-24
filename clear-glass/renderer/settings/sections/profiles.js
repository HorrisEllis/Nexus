'use strict';
/**
 * renderer/settings/sections/profiles.js — Profiles, accounts and logins  (styles: profiles.css)
 * AC10/AC11 — James, 2026-11-22: "i just clearglass to have one source of truth for cookies and accounts, hooked into the profiles" · "no coupline".
 * 2026-11-23: "it should be new profile. accounts are per cookie/login, which are per per site. like firefox." · "I like the old settings. just need the
 * accounts, logins, cookies, and repition consolidated." A part of Accounts, logins & cookies (sections/accounts.js), not a page of its own. Every change
 * goes to Clear Glass's own store (cg.profiles); the rules are src/profiles/profiles.eg. Tabs and agents move onto a profile's jar in slice c.
 */
(function () {
  const { cg, h, call, toast, fail, busy, modal, confirmDo, field, pane, btn, part, loadAreaCss } = window.CGS;
  let selected = null;

  const ask = async (fn, what) => { const r = await call(fn, what); if (r && r.ok === false) throw new Error(r.error || `${what} failed`); return r; };
  const act = (fn, what, done, rerender) => busy(null, async () => { try { await ask(fn, what); if (done) toast(done); rerender(); } catch (e) { fail(e); } });
  const hue = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 17);
  const avatar = (p) => { const el = h('span', { class: 'pf-av', text: (p.name[0] || '?').toUpperCase() }); el.style.setProperty('--h', hue(p.id)); return el; };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const line = (t, d, ...acts) => h('div', { class: 'row' }, h('div', { class: 'what' }, h('div', { class: 't', text: t }), d ? h('div', { class: 'd', text: d }) : null), h('div', { class: 'acts' }, ...acts));

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
    if (!free.length) { toast('Every provider account is already in this profile.'); return; }
    const pick = h('select', {}, free.map((a) => h('option', { value: a.id, text: `${a.label}${(a.agentKeys || []).length ? ` (${a.agentKeys.join(', ')})` : ''}` })));
    const r = await modal({ title: `Add a provider account to “${p.name}”`, body: [field('Account', pick, 'A profile holds one login for each site.')],
      actions: [{ label: 'Add account', primary: true, run: () => ask(() => cg.profiles.link(p.id, pick.value), 'add account') }] });
    if (r && r !== true) { toast('Account added'); rerender(); }
  }

  const deletePassword = (w, where, rerender) => btn('Delete password', async () => {
    if (await confirmDo('Delete saved password?', `${w.username} on ${where}.`, 'Delete')) act(async () => { await cg.passwords.delete(w.id); return { ok: true }; }, 'delete password', 'Password deleted', rerender);
  }, 'sm danger');

  function accountRow(p, a, rerender) {
    const names = [...new Set(a.passwords.map((w) => w.username))].join(', ');
    const facts = [a.sites.join(', '), a.signedIn ? 'signed in' : 'not signed in', names ? `password saved for ${names}` : 'no saved password', `ID ${a.id.slice(0, 8)}`].join(' · ');
    const signOut = a.signedIn ? btn('Sign out', async () => {
      if (await confirmDo(`Sign out of ${a.name}?`, `Removes the cookies for ${a.sites.join(' and ')} from this profile. A saved password stays. Any tab or agent using ${a.name} is signed out too.`, 'Sign out')) {
        act(async () => { for (const s of a.sites) { const r = await cg.profiles.signOut(p.id, s); if (r && r.ok === false && !/not signed in/.test(r.error || '')) return r; } return { ok: true }; }, 'sign out', `Signed out of ${a.name}`, rerender);
      }
    }, 'sm') : null;
    return line(a.name, facts, ...a.passwords.map((w) => deletePassword(w, w.site, rerender)), signOut);
  }

  function accountsPane(p, l, r, accounts, rerender) {
    const isDefault = p.id === l.defaultId, list = (r && r.accounts) || [], byId = new Map(accounts.map((a) => [a.id, a]));
    const provider = p.accounts.map((id) => { const a = byId.get(id) || { label: id, agentKeys: [] };
      return line(a.label, (a.agentKeys || []).join(', ') || 'no provider', btn('Remove', () => act(() => cg.profiles.unlink(p.id, id), 'remove account', 'Account removed from this profile', rerender), 'sm')); });
    return pane({ title: p.name, sub: `Profile ${p.id.slice(0, 8)} · ${plural(list.length, 'account')}, one per login`, flush: true,
      tools: h('span', { class: 'pane-tools' },
        btn('Rename', () => nameFlow(`Rename “${p.name}”`, p.name, 'Rename', (v) => cg.profiles.rename(p.id, v), rerender), 'sm'),
        isDefault ? null : btn('Make default', () => act(() => cg.profiles.setDefault(p.id), 'make default', `“${p.name}” is now the default`, rerender), 'sm'),
        isDefault ? null : btn('Delete', async () => { if (await confirmDo(`Delete “${p.name}”?`, 'The accounts stay in Clear Glass and no cookies are deleted.', 'Delete profile')) { selected = l.defaultId; act(() => cg.profiles.delete(p.id), 'delete profile', 'Profile deleted', rerender); } }, 'sm danger')),
      body: [...(list.length ? list.map((a) => accountRow(p, a, rerender)) : [line('No logins in this profile yet', 'Sign in to a site in this profile and it appears here.')]),
        h('details', { class: 'pf-providers' }, h('summary', { text: `Provider accounts in this profile (${p.accounts.length})` }), ...provider, line('Add a provider account', null, btn('Add…', () => addFlow(p, accounts, rerender), 'sm')))] });
  }

  part('profiles', {
    async panes({ rerender }) {
      loadAreaCss('profiles');
      const [l, accounts, saved] = await Promise.all([ask(() => cg.profiles.list(), 'profiles'), call(() => cg.accounts.list(), 'accounts'), cg.passwords.list().catch(() => [])]);
      if (!l.profiles.some((p) => p.id === selected)) selected = l.defaultId;
      const shown = l.profiles.find((p) => p.id === selected), logins = await ask(() => cg.profiles.logins(selected), 'logins');
      const placed = new Set(l.profiles.flatMap((p) => p.accounts)), lost = (Array.isArray(saved) ? saved : []).filter((w) => w.accountId && !placed.has(w.accountId));
      const list = l.profiles.map((p) => h('button', { class: `pf-item${p.id === selected ? ' on' : ''}`, 'aria-pressed': String(p.id === selected), onclick: () => { selected = p.id; rerender(); } }, avatar(p),
        h('span', { class: 'pf-name' }, h('b', { text: p.name }), h('small', { text: p.id === selected ? plural(((logins && logins.accounts) || []).length, 'account') : `Profile ${p.id.slice(0, 8)}` })), p.id === l.defaultId ? h('span', { class: 'pf-def', text: 'default' }) : h('span', {})));
      return [
        h('div', { class: 'banner warn' }, h('div', {}, h('div', { class: 't', text: 'Tabs and agents have not moved onto profiles yet' }), h('div', { class: 'd', text: 'They keep their current sign-ins until the cookie move, and your existing jars are kept.' }))),
        h('div', { class: 'pf-grid' },
          pane({ title: 'Profiles', sub: plural(l.profiles.length, 'profile'), flush: true, tools: btn('New profile', () => nameFlow('New profile', '', 'Create profile', (v) => cg.profiles.create(v), rerender), 'sm'), body: list }),
          h('div', { class: 'pf-main' }, accountsPane(shown, l, logins, accounts, rerender))),
        ...(lost.length ? [pane({ title: 'Passwords with no account', sub: 'Saved for an account that is no longer in any profile.', flush: true, body: lost.map((w) => line(w.origin, w.username, deletePassword(w, w.origin, rerender))) })] : []),
      ];
    },
  });
})();
