'use strict';
/**
 * renderer/settings/sections/providers.js — Provider tabs  (styles: providers.css)
 */
/**
 * renderer/settings/sections/providers.js — Provider tabs (NCP) + Fingerprint
 * §BUILT 2026-09-23. Providers: src/providers/host.js's real start/stop/show/
 * deploy plus NexusOptions.autoStartOnBoot. Fingerprint: the REAL path,
 * context:switchFingerprint (ContextManager.switchFingerprint) — the old
 * settings page's "Apply to Current Agent" wrote a fingerprintOverride key
 * that nothing anywhere reads (grepped: zero readers), so it silently did
 * nothing (§1.2). That dead write is gone, not kept alongside.
 */
(function () {
  const { cg, h, call, toast, busy, pane, row, btn, chip, toggle, field, select, agentOptions, section, goto } = window.CGS;

  section({
    id: 'providers', group: 'Accounts & agents', icon: '\u27F3', label: 'Provider tabs',
    keywords: 'ncp userscript guardian claude chatgpt gemini perplexity autostart deploy',
    blurb: 'The shared provider tabs Guardian drives through its userscripts. Each provider\u2019s accounts and its agent-mesh tabs are one click away on its row.',
    related: ['accounts', 'mesh'],
    async render({ rerender }) {
      const [list, opts, accounts, defaults] = await Promise.all([call(() => cg.providers.list(), 'providers'), call(() => cg.options.get(), 'options'),
        cg.accounts.list().catch(() => []), cg.accounts.defaults().catch(() => ({}))]);
      const auto = opts.autoStartOnBoot || {};
      // §0.60.12 — James: "the logins for the agent providers needs to be all the same." What each tab really runs as (the
      // account-switch record), beside the account Accounts & sign-in says it should (the dispatch account).
      const tabAcct = {};
      // 0.60.13 merge: an older preload has no providers.account — the section still renders
      await Promise.all(list.map(async p => { tabAcct[p.id] = await (typeof cg.providers.account === 'function' ? cg.providers.account(p.id) : Promise.resolve(null)).catch(() => null); }));
      const labelOf = (id) => { const a = accounts.find(x => x.id === id); return a ? a.label : (id ? String(id).slice(0, 8) : null); };
      // §0.39.265 — linked to Accounts & sign-in and Agent mesh: which account
      // the mesh signs in with for this provider, and a jump to each.
      const acctLine = (p) => {
        const mine = accounts.filter(a => (a.agentKeys || []).includes(p.id));
        const def = mine.find(a => a.id === defaults[p.id]) || mine[0];
        const ta = tabAcct[p.id];
        const runsAs = ta && ta.current ? labelOf(ta.current) : null;
        const inSync = def && ta && ta.current === def.id;
        const links = h('div', { class: 'links' },
          h('button', { class: 'link-btn', onclick: () => goto('accounts', p.id),
            text: mine.length ? `${mine.length} account${mine.length === 1 ? '' : 's'} \u00B7 ${p.running ? 'tab runs as' : 'tab will run as'} \u201C${def.label}\u201D` : 'No accounts \u2014 add one' }),
          h('span', { text: ' \u00B7 ' }),
          h('button', { class: 'link-btn', onclick: () => goto('mesh', p.id), text: 'Agent mesh' }));
        // the tab is signed in as something other than the dispatch account (or as nothing Nexus knows): say so, one press fixes it
        if (def && !inSync) {
          links.append(h('span', { text: ' \u00B7 ' }),
            h('span', { class: 'blurb', text: runsAs ? `signed in as \u201C${runsAs}\u201D now` : 'sign-in not applied yet' }),
            h('span', { text: ' ' }),
            btn('Use \u201C' + def.label + '\u201D sign-in', (e) => busy(e.currentTarget, async () => {
              const r = await call(() => cg.providers.syncAccount(p.id), 'sync sign-in');
              if (r && r.ok === false) toast(`${p.name}: ${r.error || r.why}`, 'warn', 8000);
              else if (r && r.action === 'skipped') toast(`${p.name}: ${r.why}`, 'warn', 8000);
              else toast(r && r.action === 'saved' ? `${p.name} tab\u2019s sign-in saved to \u201C${def.label}\u201D` : `${p.name} tab now runs as \u201C${def.label}\u201D`);
              rerender();
            }), 'sm'));
        }
        return links;
      };
      const rows = list.map(p => {
        const status = p.running ? chip(p.status || 'running', p.status === 'crashed' ? 'bad' : 'ok') : chip('stopped', 'plain');
        const r = row(p.name, p.url, status,
          h('span', { class: 'blurb', text: 'Start with Clear Glass' }),
          toggle(auto[p.id] !== false, async (on) => { await call(() => cg.options.set({ autoStartOnBoot: { [p.id]: on } }), 'save'); toast(`${p.name} ${on ? 'starts' : 'no longer starts'} with Clear Glass`); }, `Start ${p.name} with Clear Glass`),
          p.running ? btn('Show', (e) => busy(e.currentTarget, () => call(() => cg.providers.show(p.id), 'show')), 'sm') : null,
          p.running ? btn('Push userscript', (e) => busy(e.currentTarget, async () => { await call(() => cg.providers.deploy(p.id), 'deploy'); toast(`Userscript pushed into ${p.name}`); }), 'sm') : null,
          btn(p.running ? 'Stop' : 'Start', (e) => busy(e.currentTarget, async () => { await call(() => p.running ? cg.providers.stop(p.id) : cg.providers.start(p.id), p.running ? 'stop' : 'start'); rerender(); }), p.running ? 'sm danger' : 'sm primary'));
        r.style.setProperty('--prov', p.color || 'var(--cyan)');
        r.prepend(h('span', { class: 'dot' }));
        r.dataset.anchor = p.id;
        (r.querySelector('.what') || r).append(acctLine(p));
        return r;
      });
      return [
        pane({ title: 'Provider tabs', flush: true, body: rows }),
        pane({ title: 'Startup', flush: true, body: [
          row('Skip userscript injection for tabs opened at startup', 'Pre-warmed background tabs load without Guardian\u2019s userscripts until you use them.',
            toggle(!!opts.disableUserscriptAutoInjectOnStartup, (on) => call(() => cg.options.set({ disableUserscriptAutoInjectOnStartup: on }), 'save'))),
        ] }),
      ];
    },
  });
})();
