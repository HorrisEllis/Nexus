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
  const { cg, h, call, toast, busy, pane, row, btn, chip, toggle, field, select, agentOptions, section } = window.CGS;

  section({
    id: 'providers', group: 'Identity', icon: '\u27F3', label: 'Provider tabs',
    keywords: 'ncp userscript guardian claude chatgpt gemini perplexity autostart deploy',
    blurb: 'The shared provider tabs Guardian drives through its userscripts. Accounts for the agent mesh are separate \u2014 see Accounts & sign-in.',
    async render({ rerender }) {
      const [list, opts] = await Promise.all([call(() => cg.providers.list(), 'providers'), call(() => cg.options.get(), 'options')]);
      const auto = opts.autoStartOnBoot || {};
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
