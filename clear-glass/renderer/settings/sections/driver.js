'use strict';
/**
 * renderer/settings/sections/driver.js — ClearDriver  (styles: driver.css)
 *
 * §0.60.218 SP4 — James, 2026-10-23: "Cleardriver, agentmesh and guardian setting." ClearDriver had no settings: its navigate and wait
 * timeouts were constants (30 s, 10 s) and every site could be driven. These are the global values (options driver.*); a site's own value
 * in Site settings wins over them, and each one is read where the driver decides (src/driver/index.js, through the site resolver). The
 * bounds come from the same key table that validates a site's value (src/site-settings/keys.js), so the two never disagree.
 */
(function () {
  const { cg, h, call, toast, field, pane, row, toggle, section, goto, btn } = window.CGS;
  const setOpt = (patch, msg) => call(() => cg.options.set(patch), 'save').then(() => msg && toast(msg));

  function msInput(cur, k, save) {
    const i = h('input', { type: 'number', value: String(cur), min: String(k.min), max: String(k.max), step: '500' });
    i.addEventListener('change', () => {
      const n = Number(i.value);
      if (!Number.isInteger(n) || n < k.min || n > k.max) { toast(`${k.does}: between ${k.min} and ${k.max} ms (got ${i.value})`, 'bad'); i.value = String(cur); return; }
      cur = n; save(n).catch(e => toast(e.message, 'bad'));
    });
    return i;
  }

  section({
    id: 'driver', group: 'Agents', icon: '⦿', label: 'ClearDriver',
    keywords: 'cleardriver driver automation agents drive navigate wait timeout sites allowed',
    blurb: 'How agents drive pages through ClearDriver. A site’s own choice in Site settings wins over these.',
    async render() {
      const [o, k] = await Promise.all([call(() => cg.options.get(), 'options'), call(() => cg.siteProfile.keys(), 'keys')]);
      const d = { navTimeoutMs: 30000, waitTimeoutMs: 10000, agentsMayDrive: true, ...(o.driver || {}) };
      const key = (name) => (k.keys || []).find(x => x.key === `driver.${name}`) || { min: 500, max: 300000, does: name };
      const nav = msInput(d.navTimeoutMs, key('navTimeoutMs'), (n) => setOpt({ driver: { navTimeoutMs: n } }, `Navigate timeout: ${n / 1000} s`));
      const wait = msInput(d.waitTimeoutMs, key('waitTimeoutMs'), (n) => setOpt({ driver: { waitTimeoutMs: n } }, `Wait timeout: ${n / 1000} s`));
      nav.dataset.opt = 'driver.navTimeoutMs'; wait.dataset.opt = 'driver.waitTimeoutMs';
      const drive = toggle(d.agentsMayDrive !== false, (on) => setOpt({ driver: { agentsMayDrive: on } }, on ? 'Agents may drive sites' : 'Agents may drive no site unless it allows them'), 'Agents may drive sites');
      drive.dataset.opt = 'driver.agentsMayDrive';
      return [
        pane({ title: 'Agents', flush: true, body: [
          row('Agents may drive sites', 'Off: an agent is refused every site, except one you allow in Site settings. Your own macros, scripts and rewind are never refused.', drive),
        ] }),
        pane({ title: 'Timeouts', sub: 'Defaults were 30 s and 10 s.', body: h('div', { class: 'grid' },
          field('Navigate (ms)', nav, 'How long a page may take to load'),
          field('Wait for an element (ms)', wait, 'How long a wait for a selector may take')) }),
        pane({ title: 'Per site', flush: true, body: row('Site settings', 'Allow or refuse agents, and set timeouts, for one site.', btn('Open', () => goto('sites'), 'sm')) }),
      ];
    },
  });
})();
