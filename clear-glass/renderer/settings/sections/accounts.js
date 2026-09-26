'use strict';
/**
 * renderer/settings/sections/accounts.js — Save session  (styles: accounts.css)
 */
/**
 * renderer/settings/sections/accounts.js — Accounts & sign-in
 * §BUILT 2026-09-23 — James: "login portals like apppassword login to each
 * provider, with a plus to add multiple, which hook into the cookie vault,
 * and create a accountid per account." Clear Glass is the account authority.
 *
 * One pane per provider (its + adds another account for it). Each account row:
 * its real accountId (the options-store uuid — the same id agent-mesh uses in
 * persist:mesh-<provider>-<accountId> and the vault keys on), the provider
 * identity it's signed in as, session state read live from the partition and
 * the vault, and the portal actions. Replaces the 2026-08-28 Accounts panel
 * (same backend, now with sign-in, capture, defaults and identity).
 */
(function () {
  const { cg, h, call, toast, fail, busy, modal, confirmDo, field, pane, btn, chip, empty, ago, copy, section, onLeave } = window.CGS;

  function statusChip(st) {
    if (!st) return chip('Status unavailable', 'bad');
    if (st.portalOpen) return chip('Sign-in window open', 'warn');
    const auth = st.session && st.session.authCookies;
    if (st.vault && st.vault.stored && auth > 0) return chip(`Signed in, saved ${ago(st.session.capturedAt || st.vault.updatedAt)}`, 'ok');
    if (st.vault && st.vault.stored) return chip('Saved, but no sign-in cookies', 'warn');
    if (st.liveCookies > 0) return chip('Session not saved yet', 'warn');
    return chip('Not signed in', 'plain');
  }

  async function captureFlow(acc, prov, st) {
    const idIn = h('input', { type: 'email', placeholder: 'you@example.com', value: (st && st.identity && st.identity.accountId) || '' });
    const closeIn = h('input', { type: 'checkbox', checked: true });
    const r = await modal({
      title: `Save ${prov.name} session for “${acc.label}”`,
      body: [
        h('p', { class: 'blurb', text: 'Saves every cookie in this account\u2019s sign-in window to the encrypted vault. The agent mesh restores it whenever it opens a tab for this account.' }),
        field('Signed in as', idIn, 'The email or account id you used. Links this login to the account so the same login can never be claimed by two accounts.'),
        h('label', { class: 'row', style: { padding: '0', borderTop: '0' } }, closeIn, h('span', { text: 'Close the sign-in window after saving' })),
      ],
      actions: [{ label: 'Save session', primary: true, run: async () => {
        const v = idIn.value.trim();
        return call(() => cg.accounts.portal.capture(acc.id, prov.id, v ? { accountId: v, email: v.includes('@') ? v : null } : null, closeIn.checked), 'save session');
      } }],
    });
    if (!r || r === true) return false;
    if (r.authCookies > 0) toast(`Saved ${r.cookieCount} cookies — ${r.authCookies} look like sign-in tokens.`);
    else toast(`Saved ${r.cookieCount} cookies, but none look like sign-in tokens. Finish signing in, then save again.`, 'warn', 7000);
    if (r.identity && r.identity.linked === false) toast(`Session saved; identity not linked: ${r.identity.error}`, 'warn', 8000);
    return true;
  }

  async function credentialsFlow(acc, prov, st, vaultKey) {
    const user = h('input', { type: 'text', autocomplete: 'off', value: (st && st.credential && st.credential.username) || (st && st.identity && st.identity.email) || '' });
    const pass = h('input', { type: 'password', autocomplete: 'new-password' });
    const sealed = vaultKey && vaultKey.source === 'safeStorage';
    return modal({
      title: `Saved sign-in for ${prov.name}`,
      body: [
        h('p', { class: 'blurb', text: `${prov.name} doesn\u2019t issue app passwords, so this is the next best thing: the sign-in page opens with these filled in. You still press sign in yourself \u2014 2FA, captchas and Google sign-in stay in your hands.` }),
        field('Username or email', user), field('Password', pass),
        h('div', { class: `banner ${sealed ? 'ok' : 'warn'}` }, h('div', {},
          h('div', { class: 't', text: sealed ? 'Encrypted with your OS keychain' : 'Encrypted with the legacy key' }),
          h('div', { class: 'd', text: sealed ? 'The key lives in Windows DPAPI / the OS keychain, not in Clear Glass\u2019s source.' : `The OS keychain isn\u2019t available (${(vaultKey && vaultKey.reason) || 'unknown'}). Anyone with the source could decrypt this.` }))),
      ],
      actions: [{ label: 'Save sign-in', primary: true, run: () => call(() => cg.accounts.portal.credentials(acc.id, prov.id, user.value.trim(), pass.value), 'save sign-in') }],
    });
  }

  async function signOutFlow(acc, prov) {
    const idC = h('input', { type: 'checkbox' }), pwC = h('input', { type: 'checkbox' });
    return modal({
      title: `Sign “${acc.label}” out of ${prov.name}?`,
      body: [
        h('p', { class: 'blurb', text: 'Clears this account\u2019s cookies and storage for this provider and deletes the vault copy. The mesh will open a signed-out tab until you sign in again.' }),
        h('label', { class: 'row', style: { padding: 0, borderTop: 0 } }, idC, h('span', { text: 'Also unlink the signed-in identity' })),
        h('label', { class: 'row', style: { padding: 0, borderTop: 0 } }, pwC, h('span', { text: 'Also delete the saved sign-in password' })),
      ],
      actions: [{ label: 'Sign out', danger: true, run: () => call(() => cg.accounts.portal.signOut(acc.id, prov.id, { forgetIdentity: idC.checked, forgetCredential: pwC.checked }), 'sign out') }],
    });
  }

  async function newAccount(prov, providers, rerender, count) {
    const label = h('input', { type: 'text', value: prov ? `${prov.name} ${count + 1}` : '' , placeholder: 'Work, Personal, Research…' });
    const boxes = providers.map(p => ({ p, el: h('input', { type: 'checkbox', checked: prov && p.id === prov.id }) }));
    const r = await modal({
      title: prov ? `New ${prov.name} account` : 'New account',
      body: [
        field('Name', label, 'Only for you \u2014 the account id is generated.'),
        h('div', { class: 'field' }, h('span', { text: 'Use it for' }),
          h('div', { class: 'grid' }, boxes.map(b => h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, b.el, h('span', { text: b.p.name }))))),
      ],
      actions: [{ label: 'Create account', primary: true, run: () => {
        const keys = boxes.filter(b => b.el.checked).map(b => b.p.id);
        if (!label.value.trim()) throw new Error('Give the account a name.');
        return call(() => cg.accounts.create({ label: label.value.trim(), agentKeys: keys }), 'create account');
      } }],
    });
    if (r && r.id) {
      toast(`Created “${r.label}” — account id ${r.id.slice(0, 8)}…`);
      if (prov && await confirmDo(`Sign in to ${prov.name} now?`, 'Opens the sign-in page in this account\u2019s own isolated session.', 'Open sign-in', false)) {
        await busy(null, () => call(() => cg.accounts.portal.open(r.id, prov.id), 'open sign-in'));
      }
      rerender();
    }
  }

  function accountRow(acc, prov, st, ctx) {
    const { defaults, vaultKey, rerender, statusNodes } = ctx;
    const isDefault = defaults[prov.id] === acc.id;
    const statusSlot = h('span', {}, statusChip(st));
    statusNodes.push({ acc, prov, slot: statusSlot });

    const nameIn = h('input', { type: 'text', value: acc.label, 'aria-label': 'Account name' });
    nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameIn.blur(); });
    nameIn.addEventListener('blur', async () => {
      const v = nameIn.value.trim();
      if (!v) { nameIn.value = acc.label; return; }
      if (v !== acc.label) { try { await call(() => cg.accounts.update(acc.id, { label: v }), 'rename'); acc.label = v; toast('Renamed'); } catch (e) { fail(e); nameIn.value = acc.label; } }
    });
    const star = h('button', { class: 'star', 'aria-pressed': String(isDefault), title: isDefault ? `Default ${prov.name} account` : `Make default for ${prov.name}`, text: isDefault ? '\u2605' : '\u2606' });
    star.addEventListener('click', () => busy(null, async () => {
      await call(() => cg.accounts.setDefault(prov.id, isDefault ? null : acc.id), 'set default');
      toast(isDefault ? `No default ${prov.name} account — dispatch uses the oldest one` : `“${acc.label}” is now the default for ${prov.name}`);
      rerender();
    }));

    const identity = st && st.identity ? st.identity.accountId : null;
    const signIn = btn(st && st.portalOpen ? 'Show window' : 'Sign in', (e) => busy(e.currentTarget, async () => {
      const r = await call(() => cg.accounts.portal.open(acc.id, prov.id), 'open sign-in');
      toast(r.prefill ? 'Sign-in page opened with your saved details filled in.' : 'Sign-in page opened in this account\u2019s own session.');
      ctx.startPolling();
    }), 'sm primary');
    return h('div', { class: 'acct' },
      h('div', { class: 'name' }, star, nameIn, statusSlot),
      h('div', { class: 'acts' },
        signIn,
        btn('Save session', async () => { if (await captureFlow(acc, prov, st)) rerender(); }, 'sm'),
        btn('Saved sign-in', async () => { if (await credentialsFlow(acc, prov, st, vaultKey.passwords)) { toast('Sign-in saved'); rerender(); } }, 'sm'),
        btn('Sign out', async () => { const r = await signOutFlow(acc, prov); if (r) { toast(`Signed out of ${prov.name}`); rerender(); } }, 'sm danger'),
        btn('Remove', async () => {
          const others = acc.agentKeys.filter(k => k !== prov.id);
          if (others.length) {
            if (!await confirmDo(`Stop using “${acc.label}” for ${prov.name}?`, `The account stays for ${others.join(', ')}. Its ${prov.name} session is not deleted \u2014 use Sign out for that.`, 'Remove from provider')) return;
            await busy(null, () => call(() => cg.accounts.unlinkAgent(acc.id, prov.id), 'unlink'));
          } else {
            if (!await confirmDo(`Delete “${acc.label}”?`, `Deletes the account. Sign out first if you also want its saved ${prov.name} session removed from the vault.`, 'Delete account')) return;
            await busy(null, () => call(() => cg.accounts.delete(acc.id), 'delete'));
          }
          rerender();
        }, 'sm ghost')),
      h('div', { class: 'ids' },
        h('span', { class: 'uuid', title: 'Account id — click to copy', onclick: () => copy(acc.id), text: acc.id }),
        identity ? h('span', { text: `as ${identity}` }) : h('span', { text: 'identity not linked' }),
        st && st.credential ? h('span', { text: `saved sign-in: ${st.credential.username}` }) : null,
        st ? h('span', { text: `${st.liveCookies} live cookies` }) : null));
  }

  section({
    id: 'accounts', group: 'Identity', icon: '\u25C8', label: 'Accounts & sign-in',
    keywords: 'login portal app password cookie vault account id default provider session',
    blurb: 'Every account gets its own id and its own isolated session per provider. Sign in once here; the agent mesh reuses the saved session whenever it dispatches to that account.',
    async render({ tools, rerender }) {
      const [providers, accounts, defaults, vaultKey] = await Promise.all([
        call(() => cg.accounts.portal.providers(), 'providers'),
        call(() => cg.accounts.list(), 'accounts'),
        cg.accounts.defaults().catch(() => ({})),
        cg.vault.status().catch(() => ({})),
      ]);
      tools.append(btn('New account', () => newAccount(null, providers, rerender, accounts.length), 'primary'));

      const statusNodes = [];
      let poll = null;
      const ctx = {
        defaults, vaultKey, rerender, statusNodes,
        startPolling() {
          if (poll) return;
          poll = setInterval(async () => {
            let anyOpen = false;
            for (const n of statusNodes) {
              const st = await cg.accounts.portal.status(n.acc.id, n.prov.id).catch(() => null);
              if (st && st.ok !== false) { n.slot.replaceChildren(statusChip(st)); anyOpen = anyOpen || st.portalOpen; }
            }
            if (!anyOpen) { clearInterval(poll); poll = null; }
          }, 4000);
        },
      };
      onLeave(() => poll && clearInterval(poll));

      const out = [];
      const sealed = [vaultKey.cookies, vaultKey.passwords].every(k => k && k.source === 'safeStorage');
      out.push(h('div', { class: `banner ${sealed ? 'ok' : 'warn'}` }, h('div', {},
        h('div', { class: 't', text: sealed ? 'Sessions and saved sign-ins are sealed by your OS keychain' : 'Vault is using the legacy key' }),
        h('div', { class: 'd', text: sealed
          ? 'New saves use a random key protected by Windows DPAPI / the OS keychain. Older records are still readable and move to the new key the next time they\u2019re saved.'
          : `Cookie vault: ${(vaultKey.cookies && vaultKey.cookies.reason) || 'unknown'}. Password vault: ${(vaultKey.passwords && vaultKey.passwords.reason) || 'unknown'}.` }))));

      const statuses = new Map();
      await Promise.all(providers.flatMap(p => accounts.filter(a => a.agentKeys.includes(p.id)).map(async a => {
        const st = await cg.accounts.portal.status(a.id, p.id).catch(() => null);
        statuses.set(`${p.id}:${a.id}`, st && st.ok !== false ? st : null);
      })));

      for (const prov of providers) {
        const mine = accounts.filter(a => a.agentKeys.includes(prov.id));
        const def = mine.find(a => a.id === defaults[prov.id]);
        const plus = h('button', { class: 'plus', title: `Add a ${prov.name} account`, 'aria-label': `Add a ${prov.name} account`, text: '+', onclick: () => newAccount(prov, providers, rerender, mine.length) });
        out.push(pane({
          title: prov.name, prov: prov.color || undefined, tools: plus, flush: true,
          sub: mine.length ? `${mine.length} account${mine.length === 1 ? '' : 's'} \u00B7 dispatch uses ${def ? `\u201C${def.label}\u201D` : `\u201C${mine[0].label}\u201D (oldest \u2014 star one to choose)`}` : 'No accounts yet',
          body: mine.length ? mine.map(a => accountRow(a, prov, statuses.get(`${prov.id}:${a.id}`), ctx))
            : empty(`Add a ${prov.name} account, then sign in once.`, btn('Add account', () => newAccount(prov, providers, rerender, 0), 'sm')),
        }));
      }

      const loose = accounts.filter(a => !providers.some(p => a.agentKeys.includes(p.id)));
      if (loose.length) out.push(pane({ title: 'Not used by any provider', flush: true, body: loose.map(a => h('div', { class: 'row' },
        h('div', { class: 'what' }, h('div', { class: 't', text: a.label }), h('div', { class: 'd mono', text: a.id })),
        h('div', { class: 'acts' }, btn('Delete', async () => {
          if (await confirmDo(`Delete “${a.label}”?`, 'It isn\u2019t linked to any provider.', 'Delete account')) { await busy(null, () => call(() => cg.accounts.delete(a.id), 'delete')); rerender(); }
        }, 'sm danger')))) }));

      if ([...statuses.values()].some(s => s && s.portalOpen)) ctx.startPolling();
      return out;
    },
  });
})();
