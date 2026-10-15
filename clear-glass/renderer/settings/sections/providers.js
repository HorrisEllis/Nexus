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

  // 0.60.54 CS2 — James: "consolidate the provider and accounts settings sections". This is no longer a page. It is the provider-tab half of
  // Providers & accounts (sections/accounts.js): load() reads the tab state once, controls(id) is one provider's tab controls (status, start
  // with Clear Glass, Show / Push userscript / Start / Stop, and the one-press sign-in sync), startup() is the startup pane.
  window.CGS.part('providers', {
    async load() {
      const [list, opts, accounts, defaults] = await Promise.all([call(() => cg.providers.list(), 'providers'), call(() => cg.options.get(), 'options'),
        cg.accounts.list().catch(() => []), cg.accounts.defaults().catch(() => ({}))]);
      // §0.60.12 — what each tab really runs as (the account-switch record), beside the account the dispatch uses.
      // 0.60.13 merge: an older preload has no providers.account — the section still renders
      const tabAcct = {};
      await Promise.all(list.map(async p => { tabAcct[p.id] = await (typeof cg.providers.account === 'function' ? cg.providers.account(p.id) : Promise.resolve(null)).catch(() => null); }));
      return { list, opts, accounts, defaults, tabAcct };
    },
    controls(id, d, { rerender }) {
      const p = d.list.find(x => x.id === id);
      if (!p) return h('span', { class: 'blurb', text: 'no provider tab' });
      const auto = d.opts.autoStartOnBoot || {};
      const labelOf = (aid) => { const a = d.accounts.find(x => x.id === aid); return a ? a.label : (aid ? String(aid).slice(0, 8) : null); };
      const mine = d.accounts.filter(a => (a.agentKeys || []).includes(p.id));
      const def = mine.find(a => a.id === d.defaults[p.id]) || mine[0];
      const ta = d.tabAcct[p.id];
      const runsAs = ta && ta.current ? labelOf(ta.current) : null;
      const inSync = def && ta && ta.current === def.id;
      const status = p.running ? chip(p.status || 'running', p.status === 'crashed' ? 'bad' : 'ok') : chip('stopped', 'plain');
      const box = h('div', { class: 'tabctl' },
        status,
        h('span', { class: 'blurb', text: 'Start with Clear Glass' }),
        toggle(auto[p.id] !== false, async (on) => { await call(() => cg.options.set({ autoStartOnBoot: { [p.id]: on } }), 'save'); toast(`${p.name} ${on ? 'starts' : 'no longer starts'} with Clear Glass`); }, `Start ${p.name} with Clear Glass`),
        p.running ? btn('Show', (e) => busy(e.currentTarget, () => call(() => cg.providers.show(p.id), 'show')), 'sm') : null,
        p.running ? btn('Push userscript', (e) => busy(e.currentTarget, async () => { await call(() => cg.providers.deploy(p.id), 'deploy'); toast(`Userscript pushed into ${p.name}`); }), 'sm') : null,
        btn(p.running ? 'Stop' : 'Start', (e) => busy(e.currentTarget, async () => { await call(() => p.running ? cg.providers.stop(p.id) : cg.providers.start(p.id), p.running ? 'stop' : 'start'); rerender(); }), p.running ? 'sm danger' : 'sm primary'));
      // the tab is signed in as something other than the dispatch account (or as nothing Nexus knows): say so, one press fixes it
      if (def && !inSync) {
        box.append(h('span', { class: 'blurb', text: runsAs ? `tab signed in as “${runsAs}”` : 'tab sign-in not applied yet' }),
          btn('Use “' + def.label + '” sign-in', (e) => busy(e.currentTarget, async () => {
            const r = await call(() => cg.providers.syncAccount(p.id), 'sync sign-in');
            if (r && r.ok === false) toast(`${p.name}: ${r.error || r.why}`, 'warn', 8000);
            else if (r && r.action === 'skipped') toast(`${p.name}: ${r.why}`, 'warn', 8000);
            else toast(r && r.action === 'saved' ? `${p.name} tab’s sign-in saved to “${def.label}”` : `${p.name} tab now runs as “${def.label}”`);
            rerender();
          }), 'sm'));
      }
      return box;
    },
    startup(d) {
      return pane({ title: 'Startup', flush: true, body: [
        row('Skip userscript injection for tabs opened at startup', 'Pre-warmed background tabs load without Guardian’s userscripts until you use them.',
          toggle(!!d.opts.disableUserscriptAutoInjectOnStartup, (on) => call(() => cg.options.set({ disableUserscriptAutoInjectOnStartup: on }), 'save'))),
      ] });
    },
  });
})();
