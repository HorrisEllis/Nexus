'use strict';
/**
 * renderer/shell/extensions.js — plugins as little icons, like Firefox (BS4, 0.60.179). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-EXTENSIONS.
 * comp_id: cg.renderer.shell.extensions
 *
 * James, 2026-10-21: "addons or plugins built with little icons like firefox." Firefox's unified extensions button (🧩): every plugin
 * with its icon, name, description, an on/off switch and a pin. A pinned plugin sits on the toolbar as its icon; clicking it opens its
 * commands (its toolbar-command contributions), as an extension's popup would. Off stays off across restarts (plugins:disable keeps it in
 * options.disabledPlugins); pins live in options.pinnedPlugins. WebExtensions installed in Settings → Plugins are listed with their switch.
 */
(function () {
  const cg = () => window.ClearGlass;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  let pinned = new Set();
  const UI = () => window.CGShellUI;

  async function load() {
    let plugins = [], web = [];
    try { const r = await cg().plugins.list(); plugins = Array.isArray(r) ? r : []; } catch (_) {}
    try { const r = await cg().webext.list(); web = (r && r.extensions) || []; } catch (_) {}
    try { pinned = new Set(((await cg().options.get()) || {}).pinnedPlugins || []); } catch (_) {}
    return { plugins, web };
  }
  async function savePins() { try { await cg().options.set({ pinnedPlugins: [...pinned] }); } catch (e) { UI() && UI().toast(`Pins not saved: ${e.message}`); } }

  function drawPinned(plugins) {
    const box = $('sh-ext-pinned'); if (!box) return;
    box.replaceChildren(...plugins.filter(p => pinned.has(p.id)).map(p => {
      const b = document.createElement('button'); b.className = `nav-btn sh-icon${p.state === 'active' ? '' : ' off'}`; const ic = window.CGIcons && window.CGIcons.plugin(p); if (ic) b.innerHTML = ic; else b.textContent = p.icon || '🧩';
      b.title = `${p.displayName || p.name}${p.state === 'active' ? '' : ' (off)'}`; b.setAttribute('aria-label', b.title); b.dataset.plugin = p.id;
      b.addEventListener('click', (e) => { e.stopPropagation(); openPopup(b, p); });
      return b;
    }));
  }

  // a pinned icon's popup: its commands, and a link to the full panel
  function openPopup(anchor, p) {
    const pop = $('sh-extensions-panel');
    const cmds = (p.commands || []);
    pop.innerHTML = `<div class="sh-pop-head"><span class="sh-ext-ico">${(window.CGIcons && window.CGIcons.plugin(p, { size: 18 })) || esc(p.icon)}</span><span>${esc(p.displayName || p.name)}</span><span class="sh-grow"></span></div>
      ${p.state !== 'active' ? '<div class="sh-empty">This plugin is off.</div>' : cmds.length ? cmds.map((c, i) => `<button class="sh-link" data-cmd="${i}">${esc(c.icon || '•')}&nbsp;&nbsp;${esc(c.label)}</button>`).join('') : `<div class="sh-empty">${esc(p.description || 'It works in the background; nothing to press.')}</div>`}
      <div class="sh-pop-foot"><button class="sh-link" data-all>🧩&nbsp;&nbsp;All plugins and add-ons…</button></div>`;
    pop.querySelectorAll('[data-cmd]').forEach(el => el.addEventListener('click', async () => {
      const c = cmds[+el.dataset.cmd]; UI().close();
      try { await cg().plugins.invoke(c.signature, { agentId: window.CGShell && window.CGShell.agentId }); } catch (e) { UI().toast(`${c.label}: ${e.message}`); }
    }));
    pop.querySelector('[data-all]').addEventListener('click', (e) => { e.stopPropagation(); open(); });
    UI().show(pop, anchor);
  }

  async function open() {
    const pop = $('sh-extensions-panel'); const btn = $('btn-extensions');
    const { plugins, web } = await load();
    const rows = plugins.map(p => `
      <div class="sh-ext-row${p.state === 'active' ? '' : ' off'}" data-id="${esc(p.id)}">
        <span class="sh-ext-ico" aria-hidden="true">${(window.CGIcons && window.CGIcons.plugin(p, { size: 18 })) || esc(p.icon || '🧩')}</span>
        <div><div class="sh-ext-name">${esc(p.displayName || p.name)}</div><div class="sh-ext-desc" title="${esc(p.description)}">${esc(p.description || '')}</div>${p.error ? `<div class="sh-ext-err">${esc(p.error)}</div>` : ''}</div>
        <button class="sh-pin${pinned.has(p.id) ? ' on' : ''}" data-pin title="${pinned.has(p.id) ? 'Unpin from toolbar' : 'Pin to toolbar'}" aria-label="Pin">${window.CGIcons ? window.CGIcons.svg('pin', { size: 15 }) : '📌'}</button>
        <button class="tog" role="switch" aria-checked="${p.state === 'active'}" data-tog aria-label="${p.state === 'active' ? 'Turn off' : 'Turn on'} ${esc(p.displayName || p.name)}"></button>
      </div>`).join('');
    const webRows = web.map(w => `
      <div class="sh-ext-row${w.enabled ? '' : ' off'}" data-web="${esc(w.id)}">
        <span class="sh-ext-ico" aria-hidden="true">🌐</span>
        <div><div class="sh-ext-name">${esc(w.name || w.id)}</div><div class="sh-ext-desc">${esc(w.version ? 'WebExtension ' + w.version : 'WebExtension')}</div></div>
        <span></span>
        <button class="tog" role="switch" aria-checked="${!!w.enabled}" data-webtog aria-label="Turn ${w.enabled ? 'off' : 'on'} ${esc(w.name || w.id)}"></button>
      </div>`).join('');
    pop.innerHTML = `<div class="sh-pop-head">${window.CGIcons ? window.CGIcons.svg('plugins') : ''}<span>Plugins and add-ons</span><span class="sh-grow"></span></div>
      ${rows || '<div class="sh-empty">No plugins installed.</div>'}
      ${web.length ? `<div class="sh-group">WebExtensions</div>${webRows}` : ''}
      <div class="sh-pop-foot"><button class="sh-link" data-manage>⚙&nbsp;&nbsp;Manage plugins and WebExtensions…</button></div>`;
    pop.querySelectorAll('.sh-ext-row[data-id]').forEach(row => {
      const id = row.dataset.id; const p = plugins.find(x => x.id === id);
      row.querySelector('[data-tog]').addEventListener('click', async (e) => {
        e.stopPropagation(); const on = e.currentTarget.getAttribute('aria-checked') !== 'true';
        const r = await (on ? cg().plugins.enable(id) : cg().plugins.disable(id)).catch(err => ({ ok: false, error: err.message }));
        if (r && r.ok === false) UI().toast(`${p.displayName || p.name}: ${r.error}`);
        open();
      });
      row.querySelector('[data-pin]').addEventListener('click', async (e) => {
        e.stopPropagation(); pinned.has(id) ? pinned.delete(id) : pinned.add(id); await savePins(); drawPinned(plugins); open();
      });
    });
    pop.querySelectorAll('.sh-ext-row[data-web]').forEach(row => row.querySelector('[data-webtog]').addEventListener('click', async (e) => {
      e.stopPropagation(); const on = e.currentTarget.getAttribute('aria-checked') !== 'true';
      const r = await cg().webext.setEnabled(row.dataset.web, on).catch(err => ({ ok: false, error: err.message }));
      if (r && r.ok === false) UI().toast(r.error); open();
    }));
    pop.querySelector('[data-manage]').addEventListener('click', () => { UI().close(); cg().window.openSettings('plugins'); });
    drawPinned(plugins);
    if (pop.style.display === 'none' || UI().current() !== pop) UI().show(pop, btn);
  }

  async function mount() {
    const btn = $('btn-extensions'); if (!btn) return;
    btn.addEventListener('click', (e) => { e.stopPropagation(); const pop = $('sh-extensions-panel'); if (UI().current() === pop) return UI().close(); open(); });
    try { const { plugins } = await load(); drawPinned(plugins); } catch (_) {}
  }

  window.CGExtensions = { open, mount, drawPinned };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
