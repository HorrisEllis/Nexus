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
 *
 * §BUILT 2026-09-26 — James: "add new button to the plugins section with
 * webextension support." "Add WebExtension" installs a Chrome extension
 * from a folder, .zip or .crx (src/plugins/webextensions.js) and loads it
 * into every browsing session; each one can be turned off or removed.
 * Electron runs a subset of chrome.* APIs — a load error or warning is
 * shown on the extension's own row rather than hidden.
 */
(function () {
  const { cg, h, call, toast, busy, modal, confirmDo, field, pane, row, chip, btn, empty, toggle, section } = window.CGS;

  async function addFlow(rerender) {
    if (!cg.webext) throw new Error('WebExtension support needs the webext IPC (update Clear Glass).');
    const src = h('input', { type: 'text', class: 'mono', placeholder: 'C:\\path\\to\\extension  or  …/ublock.zip  or  …/ext.crx' });
    const fileAccess = h('input', { type: 'checkbox' });
    const pick = (kind) => async (e) => busy(e.currentTarget, async () => { const r = await call(() => cg.webext.pick(kind), 'choose'); if (!r.canceled) src.value = r.path; });
    const r = await modal({ title: 'Add WebExtension', wide: true, body: [
      h('p', { class: 'blurb', text: 'Chrome extensions (Manifest V2 or V3) run in every tab. Choose an unpacked folder — the one containing manifest.json — or a packed .zip / .crx, which Clear Glass unpacks into its own extensions folder.' }),
      h('div', { class: 'wx-pick' }, btn('Choose folder…', pick('folder')), btn('Choose .zip / .crx…', pick('file'))),
      field('Or paste a path', src),
      h('label', { class: 'check' }, fileAccess, h('span', { text: ' Allow access to file:// URLs' })),
      h('p', { class: 'blurb', text: 'Electron supports part of the chrome.* API. Blockers, password managers and dev tools usually work; extensions that need sync, identity or native messaging may not.' }),
    ], actions: [{ label: 'Install', primary: true, run: async () => {
      if (!src.value.trim()) throw new Error('Choose a folder or a file first.');
      return call(() => cg.webext.install(src.value.trim(), fileAccess.checked), 'install');
    } }] });
    if (!r) return;
    if (r.loadError) toast(`${r.extension.name} installed, but Electron refused to load it: ${r.loadError}`, 'bad', 9000);
    else toast(`${r.extension.name} ${r.extension.version} ${r.reinstalled ? 'updated' : 'installed'}`);
    rerender();
  }

  function wxRow(x, rerender) {
    const perms = (x.permissions || []);
    return row(`${x.name} \u00B7 v${x.version}`,
      [x.description, `MV${x.manifestVersion}`, perms.length ? `${perms.length} permission${perms.length === 1 ? '' : 's'}: ${perms.slice(0, 6).join(', ')}${perms.length > 6 ? '…' : ''}` : 'no permissions', x.owned ? 'unpacked by Clear Glass' : x.dir].filter(Boolean).join(' \u00B7 '),
      x.lastError ? chip('load error', 'bad') : x.enabled ? chip(x.loadedIn ? `in ${x.loadedIn} session${x.loadedIn === 1 ? '' : 's'}` : 'enabled', 'ok') : chip('off'),
      x.lastError ? btn('Why?', () => modal({ title: `${x.name} didn\u2019t load`, body: [h('pre', { class: 'out', text: x.lastError })] }), 'sm') : null,
      toggle(x.enabled, async (on) => { await call(() => cg.webext.setEnabled(x.id, on), on ? 'enable' : 'disable'); toast(`${x.name} ${on ? 'on' : 'off'}`); rerender(); }, `Enable ${x.name}`),
      btn('Reinstall', (e) => busy(e.currentTarget, async () => { const r = await call(() => cg.webext.install(x.source, x.allowFileAccess), 'reinstall'); toast(r.loadError ? `Reinstalled, load failed: ${r.loadError}` : `${x.name} reloaded`, r.loadError ? 'bad' : 'ok'); rerender(); }), 'sm'),
      btn('Remove', async () => { if (await confirmDo(`Remove ${x.name}?`, x.owned ? 'It is unloaded from every tab and its unpacked copy is deleted.' : 'It is unloaded from every tab. Your folder is left alone.', 'Remove')) await busy(null, async () => { await call(() => cg.webext.remove(x.id), 'remove'); toast(`${x.name} removed`); rerender(); }); }, 'sm danger'));
  }

  section({
    id: 'plugins', group: 'System', icon: '⧉', label: 'Plugins',
    keywords: 'extensions plugins webextension chrome crx zip unpacked adblocker ublock captcha guardian listeners passwords permissions zoom disable',
    blurb: 'Chrome WebExtensions and the built-in Clear Glass plugins. Themes are not a real feature yet — this page won’t pretend otherwise.',
    async render({ rerender, tools }) {
      const list = await cg.plugins.list().catch(() => []);
      const items = Array.isArray(list) ? list : [];
      const wx = cg.webext ? await cg.webext.list().catch(e => ({ ok: false, error: e.message })) : null;
      tools.append(btn('Add WebExtension', () => addFlow(rerender).catch(e => toast(e.message, 'bad')), 'primary'));
      const exts = (wx && wx.extensions) || [];
      return [
        pane({
          title: 'WebExtensions', sub: wx ? `${exts.length} Chrome extension${exts.length === 1 ? '' : 's'}${wx.folder ? ` \u00B7 packed ones unpack to ${wx.folder}` : ''}` : 'Not available in this build', flush: true,
          tools: btn('Add', () => addFlow(rerender).catch(e => toast(e.message, 'bad')), 'sm'),
          body: !wx ? empty('This window has no WebExtension bridge.') : wx.ok === false ? h('div', { class: 'err-box', text: wx.error }) :
            exts.length ? exts.map(x => wxRow(x, rerender)) : empty('No WebExtensions yet.', btn('Add WebExtension', () => addFlow(rerender).catch(e => toast(e.message, 'bad')), 'sm primary')),
        }),
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
