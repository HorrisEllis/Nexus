'use strict';
/**
 * renderer/settings/sections/about.js — About  (styles: about.css)
 *
 * 0.60.269 — James, 2026-10-28: "also need a about page in the settings, where it says the version, can check for updates to electron and
 * clearglass."
 * What is running (Nexus, Clear Glass, Electron and its Chrome and Node, the platform) and, on "Check for updates", whether a newer Electron,
 * Clear Glass or Nexus exists (src/about: the npm registry for Electron, the repository's main branch for Clear Glass and Nexus). Read-only:
 * each newer one says how to get it; nothing is installed from here. A source it cannot reach is said as such.
 */
(function () {
  const { cg, h, call, toast, busy, pane, row, btn, section } = window.CGS;

  const HOW = {
    electron: 'In the Nexus folder: npm install electron@latest, then restart Clear Glass.',
    clearGlass: 'Pull the branch (git pull), or drop the change pack on a Nexus repo\'s Versionium tab and apply it.',
    nexus: 'Pull the branch (git pull), or drop the change pack on a Nexus repo\'s Versionium tab and apply it.',
  };
  const NAME = { electron: 'Electron', clearGlass: 'Clear Glass', nexus: 'Nexus' };

  function statusOf(k, x) {
    if (!x) return h('span', { class: 'ab-dim' }, 'not checked');
    if (x.error) return h('span', { class: 'ab-bad', title: x.source }, `could not check — ${x.error}`);
    if (x.newer) return h('span', { class: 'ab-new', title: HOW[k] }, `${x.latest} is out — you have ${x.current}`);
    return h('span', { class: 'ab-ok', title: x.source }, `up to date (${x.latest})`);
  }

  section({
    id: 'about', group: 'System', icon: 'ⓘ', label: 'About',
    keywords: 'about version versions update updates check electron chrome node clear glass nexus release',
    blurb: 'Which Clear Glass, Nexus and Electron are running, and whether a newer one is out.',
    async render() {
      const i = await call(() => cg.about.info(), 'about');
      const out = h('div', { class: 'ab-checks' });
      const draw = (r) => {
        out.replaceChildren(...['clearGlass', 'nexus', 'electron'].map(k => row(NAME[k], r && r[k] && r[k].newer ? HOW[k] : (r && r[k] && r[k].source) || '', statusOf(k, r && r[k]))));
        if (r && r.checkedAt) out.append(h('div', { class: 'ab-dim ab-when' }, `checked ${new Date(r.checkedAt).toLocaleString()}`));
      };
      draw(null);
      const check = btn('Check for updates', (e) => busy(e.currentTarget, async () => {
        const r = await call(() => cg.about.check(), 'check');
        draw(r);
        const n = ['clearGlass', 'nexus', 'electron'].filter(k => r[k] && r[k].newer);
        toast(n.length ? `Newer: ${n.map(k => NAME[k]).join(', ')}` : 'Everything is up to date (or could not be checked — see each line)');
      }), 'sm');
      return [
        pane({ title: 'Clear Glass', flush: true, body: [
          row('Clear Glass', 'this browser', h('b', { class: 'ab-ver' }, i.clearGlass || '?')),
          row('Nexus', 'the system it is part of (lib/version.js)', h('b', { class: 'ab-ver' }, i.nexus || '?')),
          row('Electron', `Chrome ${i.chrome || '?'} · Node ${i.node || '?'} · V8 ${i.v8 || '?'}`, h('b', { class: 'ab-ver' }, i.electron || '?')),
          row('Platform', '', h('span', {}, i.platform || '?')),
        ] }),
        pane({ title: 'Updates', sub: 'Read-only: it says what is newer and how to get it; it installs nothing.', flush: true, body: [row('', '', check), out] }),
      ];
    },
  });
})();
