'use strict';
/**
 * renderer/settings/sections/plugins.js — Plugins  (styles: plugins.css)
 *
 * §BUILT 2026-09-25 — James: "Yes build all the ui" (Firefox-reference gap
 * pass: Firefox's "Extensions and themes"). Real backend found, not built
 * here: src/plugins/host.js's list()/disable() have existed since
 * 2026-08-24 — checked directly — but nothing past plugins:invoke ever
 * exposed them to a renderer. This section is the missing UI for that
 * already-real capability (plugins:list / plugins:disable, added to
 * ipc/bridge.js + preload/index.js in this same pass).
 *
 * Named "Plugins", not "Extensions and themes" — themes have no backend
 * anywhere in this codebase (grepped clear-glass/src and
 * clear-glass/renderer directly: zero real theme/dark-mode config, only
 * incidental comment matches). Building a theme toggle with nothing behind
 * it would be exactly the fabrication James's non-negotiables forbid, so
 * this section covers only what's real: the 6 installed plugins
 * (adblocker, captcha-pause, guardian-listeners, passwords, permissions,
 * zoom), each with its real manifest description and a real disable
 * control. There is no enable/install flow here because host.js has no
 * install-from-UI path (install() is a boot-time call from main/index.js
 * with a manifest + module already in hand) — re-enabling a disabled
 * plugin currently requires a restart, same as the real behavior; this
 * page doesn't imply otherwise.
 */
(function () {
  const { cg, h, call, toast, busy, confirmDo, pane, row, chip, btn, empty, section } = window.CGS;

  section({
    id: 'plugins', group: 'System', icon: '⧉', label: 'Plugins',
    keywords: 'extensions plugins adblocker captcha guardian listeners passwords permissions zoom disable',
    blurb: 'Installed plugins and what they contribute. Themes are not a real feature yet — this page won’t pretend otherwise.',
    async render({ rerender }) {
      const list = await cg.plugins.list().catch(() => []);
      const items = Array.isArray(list) ? list : [];
      return [
        pane({
          title: 'Installed plugins', sub: `${items.length} plugin${items.length === 1 ? '' : 's'}`, flush: true,
          body: items.length ? items.map(p => row(
            `${p.displayName || p.name} · v${p.version}`,
            p.description || null,
            chip(p.state, p.state === 'active' ? 'ok' : p.state === 'disabled' ? '' : 'bad'),
            chip(`${(p.contributions || []).length} contribution${(p.contributions || []).length === 1 ? '' : 's'}`),
            p.state === 'active'
              ? btn('Disable', async () => { if (await confirmDo(`Disable ${p.displayName || p.name}?`, 'Its userscripts and commands stop immediately. Re-enabling needs a restart.', 'Disable')) await busy(null, async () => { await cg.plugins.disable(p.id); toast(`${p.displayName || p.name} disabled`); rerender(); }); }, 'sm danger')
              : null,
          )) : empty('No plugins installed.'),
        }),
      ];
    },
  });
})();
