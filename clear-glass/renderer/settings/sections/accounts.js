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
  const { cg, h, call, wire, toast, fail, busy, modal, confirmDo, field, pane, btn, chip, empty, ago, copy, section, onLeave, goto } = window.CGS;

  function statusChip(st) {
    if (!st) return chip('Status unavailable', 'bad');
    if (st.portalOpen) return chip('Sign-in window open', 'warn');
    const auth = st.session && st.session.authCookies;
    if (st.vault && st.vault.stored && auth > 0) return chip(`Signed in, saved ${ago(st.session.capturedAt || st.vault.updatedAt)}`, 'ok');
    if (st.vault && st.vault.stored) return chip('Saved, but no sign-in cookies', 'warn');
    if (st.liveCookies > 0) return chip('Session not saved yet', 'warn');
    // 0.60.7 — signed in where he actually signs in (a normal tab, the provider tab), not yet in this account
    const there = (st.elsewhere || []).filter(e => e.authCookies > 0);
    if (there.length) return chip(`Signed in in ${there.map(e => e.where).join(' and ')} — not saved to this account`, 'warn');
    return chip('Not signed in', 'plain');
  }


  // §0.60.12 — James: "the logins for the agent providers needs to be all the same." The provider tab runs as the provider's
  // dispatch account; main answers every save / star / sign-out with what it did to the tab (`tab`), and this says it.
  function tabToast(prov, labelOf, tab) {
    if (!tab) return;
    if (tab.ok === false) { toast(`${prov.name} provider tab not updated: ${tab.error || tab.why || 'unknown reason'}`, 'warn', 8000); return; }
    const who = tab.accountId ? `\u201C${labelOf(tab.accountId)}\u201D` : 'the default account';
    if (tab.action === 'restored') toast(`The ${prov.name} provider tab is now signed in as ${who}.`);
    else if (tab.action === 'saved') toast(`The ${prov.name} provider tab was already signed in \u2014 that sign-in is now saved to ${who}.`);
    else if (tab.action === 'signed-out') toast(`The ${prov.name} provider tab is signed out too.`);
    else if (tab.action === 'skipped' && tab.why) toast(`${prov.name} provider tab: ${tab.why}`, 'warn', 8000);
  }

  async function captureFlow(acc, prov, st, labelOf) {
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
    tabToast(prov, labelOf, r.tab);
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

  async function signOutFlow(acc, prov, labelOf) {
    const idC = h('input', { type: 'checkbox' }), pwC = h('input', { type: 'checkbox' });
    return modal({
      title: `Sign “${acc.label}” out of ${prov.name}?`,
      body: [
        h('p', { class: 'blurb', text: 'Clears this account\u2019s cookies and storage for this provider and deletes the vault copy. The mesh will open a signed-out tab until you sign in again.' }),
        h('label', { class: 'row', style: { padding: 0, borderTop: 0 } }, idC, h('span', { text: 'Also unlink the signed-in identity' })),
        h('label', { class: 'row', style: { padding: 0, borderTop: 0 } }, pwC, h('span', { text: 'Also delete the saved sign-in password' })),
      ],
      actions: [{ label: 'Sign out', danger: true, run: async () => { const r = await call(() => cg.accounts.portal.signOut(acc.id, prov.id, { forgetIdentity: idC.checked, forgetCredential: pwC.checked }), 'sign out'); tabToast(prov, labelOf, r && r.tab); return r; } }],
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
    // 0.60.7 — one press takes the sign-in from where it is into this account (its vault row and its own session)
    const there = ((st && st.elsewhere) || []).filter(e => e.authCookies > 0 && !(st.vault && st.vault.stored && st.session && st.session.authCookies > 0));
    const takeBtns = there.map(e => btn(`Save the sign-in from ${e.where}`, () => busy(null, async () => {
      const r = await call(() => cg.accounts.portal.capture(acc.id, prov.id, null, false, e.key), 'save sign-in');
      toast(r && r.likelySignedIn ? `“${acc.label}” is signed in to ${prov.name} (${r.cookieCount} cookies saved)` : `Saved ${r ? r.cookieCount : 0} cookies, but none look like a sign-in`);
      tabToast(prov, ctx.labelOf, r && r.tab);
      rerender();
    }), 'sm'));

    const nameIn = h('input', { type: 'text', value: acc.label, 'aria-label': 'Account name' });
    nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameIn.blur(); });
    nameIn.addEventListener('blur', async () => {
      const v = nameIn.value.trim();
      if (!v) { nameIn.value = acc.label; return; }
      if (v !== acc.label) { try { await call(() => cg.accounts.update(acc.id, { label: v }), 'rename'); acc.label = v; toast('Renamed'); } catch (e) { fail(e); nameIn.value = acc.label; } }
    });
    const star = h('button', { class: 'star', 'aria-pressed': String(isDefault), title: isDefault ? `Default ${prov.name} account` : `Make default for ${prov.name}`, text: isDefault ? '\u2605' : '\u2606' });
    star.addEventListener('click', () => busy(null, async () => {
      const r = await call(() => cg.accounts.setDefault(prov.id, isDefault ? null : acc.id), 'set default');
      toast(isDefault ? `No default ${prov.name} account — dispatch uses the oldest one` : `“${acc.label}” is now the default for ${prov.name}`);
      tabToast(prov, ctx.labelOf, r && r.tab);
      rerender();
    }));

    const identity = st && st.identity ? st.identity.accountId : null;
    const signIn = btn(st && st.portalOpen ? 'Show window' : 'Sign in', (e) => busy(e.currentTarget, async () => {
      const r = await call(() => cg.accounts.portal.open(acc.id, prov.id), 'open sign-in');
      toast(r.prefill ? 'Sign-in page opened with your saved details filled in.' : 'Sign-in page opened in this account\u2019s own session.');
      ctx.startPolling();
    }), 'sm primary');
    // §ER2 0.60.253 — James: "can you hook erosmanceros into … accounts manager". The pace ErosmancerOS moves at in this account's pages
    const pace = h('select', { class: 'eros-pace', 'aria-label': 'ErosmancerOS pace', title: 'How ErosmancerOS moves in this account\u2019s pages: its pointer and its keys' },
      ...['', 'precise', 'cautious', 'exploratory', 'turbo'].map(v => h('option', { value: v, text: v ? `Eros: ${v}` : 'Eros: default' })));
    pace.value = acc.erosProfile || '';
    pace.addEventListener('change', async () => {
      const v = pace.value || null;
      try { await call(() => cg.accounts.update(acc.id, { erosProfile: v }), 'eros pace'); acc.erosProfile = v; toast(`ErosmancerOS moves at ${v || 'its default'} pace in \u201C${acc.label}\u201D\u2019s pages`); }
      catch (e) { fail(e); pace.value = acc.erosProfile || ''; }
    });
    return h('div', { class: 'acct' },
      h('div', { class: 'name' }, star, nameIn, statusSlot, pace, ...takeBtns),
      h('div', { class: 'acts' },
        signIn,
        // §0.39.265 — straight into the agent mesh as this account (its own
        // persist:mesh-<provider>-<account> session, restored from the vault).
        btn('Open agent tab', (e) => busy(e.currentTarget, async () => {
          const r = await wire('/agent-mesh/spawn', { method: 'POST', body: { agentKey: prov.id, accountId: acc.id } });
          toast(`${prov.name} tab open as \u201C${acc.label}\u201D (${r.contextId})`);
        }), 'sm'),
        btn('Save session', async () => { if (await captureFlow(acc, prov, st, ctx.labelOf)) rerender(); }, 'sm'),
        btn('Saved sign-in', async () => { if (await credentialsFlow(acc, prov, st, vaultKey.passwords)) { toast('Sign-in saved'); rerender(); } }, 'sm'),
        btn('Sign out', async () => { const r = await signOutFlow(acc, prov, ctx.labelOf); if (r) { toast(`Signed out of ${prov.name}`); rerender(); } }, 'sm danger'),
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
    id: 'accounts', group: 'Accounts & agents', icon: '\u25C8', label: 'Providers & accounts',
    keywords: 'login portal app password cookie vault account id default provider session tab ncp userscript guardian autostart deploy mesh spawn route pipeline feedback queue health jobs nodes diagnose transform',
    blurb: 'One place for each provider: its accounts and sign-in, its Guardian tab, and below them the agent mesh \u2014 what is running, trial dispatches, routes between agents and jobs. Every account has its own id and its own isolated session; the provider tab always runs as the provider\u2019s default (starred) account.',
    async render({ tools, rerender }) {
      window.CGS.loadAreaCss('providers'); window.CGS.loadAreaCss('mesh');   // 0.60.54 CS2: the parts' own stylesheets
      const PT = await window.CGS.parts.providers.load().catch(() => null);
      const [providers, accounts, defaults, vaultKey, tabs] = await Promise.all([
        call(() => cg.accounts.portal.providers(), 'providers'),
        call(() => cg.accounts.list(), 'accounts'),
        cg.accounts.defaults().catch(() => ({})),
        cg.vault.status().catch(() => ({})),
        cg.providers.list().catch(() => []),
      ]);
      tools.append(btn('New account', () => newAccount(null, providers, rerender, accounts.length), 'primary'));

      const statusNodes = [];
      let poll = null;
      const ctx = {
        defaults, vaultKey, rerender, statusNodes,
        labelOf: (id) => { const a = accounts.find(x => x.id === id); return a ? a.label : String(id).slice(0, 8); },
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
          title: prov.name, prov: prov.color || undefined, tools: h('span', { class: 'pane-tools' }, PT ? window.CGS.parts.providers.controls(prov.id, PT, { rerender }) : null, plus), flush: true, anchor: prov.id,
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

      if (PT) out.push(window.CGS.parts.providers.startup(PT));
      out.push(h('h2', { class: 'half-title', 'data-anchor': 'mesh', text: 'Agent mesh' }));
      try { out.push(...await window.CGS.parts.mesh.panes({ rerender })); }
      catch (e) { out.push(pane({ title: 'Agent mesh', body: h('div', { class: 'err-box' }, h('span', { text: e.message })) })); }

      if ([...statuses.values()].some(s => s && s.portalOpen)) ctx.startPolling();
      return out;
    },
  });
})();
