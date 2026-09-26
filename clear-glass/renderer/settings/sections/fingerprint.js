'use strict';
/**
 * renderer/settings/sections/fingerprint.js — Browser fingerprint  (styles: fingerprint.css)
 *
 * v0.39.227 — split out of sections/providers.js (James: "each UI area its own file, including its own CSS file"). Notes below are that file's, kept for provenance.
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
    id: 'fingerprint', group: 'Identity', icon: '\u2317', label: 'Browser fingerprint',
    keywords: 'fingerprint user agent firefox chrome safari identity spoof',
    blurb: 'Switch the browser identity a tab presents. Applies to the tab\u2019s context immediately.',
    async render() {
      const agents = await agentOptions();
      if (!agents.length) return pane({ title: 'No tabs open', body: h('p', { class: 'blurb', text: 'Open an agent window or background tab, then come back to switch its fingerprint.' }) });
      const agentSel = select(agents);
      const modeSel = select([{ value: 'firefox', label: 'Firefox' }, { value: 'chrome', label: 'Chrome' }, { value: 'safari', label: 'Safari' }, { value: 'edge', label: 'Edge' }], 'firefox');
      const out = h('dl', { class: 'kv' });
      return pane({ title: 'Switch fingerprint', body: [
        h('div', { class: 'grid' }, field('Tab', agentSel), field('Present as', modeSel)),
        h('div', { style: { marginTop: '12px', display: 'flex', gap: '8px' } }, btn('Apply to tab', (e) => busy(e.currentTarget, async () => {
          const r = await call(() => cg.context.switchFingerprint({ agentId: agentSel.value, mode: modeSel.value }), 'switch fingerprint');
          out.replaceChildren(h('dt', { text: 'Tab' }), h('dd', { text: r.agentId }), h('dt', { text: 'Mode' }), h('dd', { text: r.mode }), h('dt', { text: 'User agent' }), h('dd', { class: 'mono', text: r.ua }));
          toast(`${r.agentId} now presents as ${r.mode}`);
        }), 'primary')),
        h('div', { style: { marginTop: '12px' } }, out),
      ] });
    },
  });
})();
