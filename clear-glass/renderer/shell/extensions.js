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
      b.addEventListener('click', (e) => { e.stopPropagation(); const pop = $('sh-extensions-panel'); if (UI().current() === pop && pop.dataset.plugin === p.id) return UI().close(); openPlugin(p.id, b); });   // BS13: its page, as Firefox opens an extension's popup
      return b;
    }));
  }

  // a pinned icon's popup: its commands, and a link to the full panel. Superseded in 0.60.183 by openPlugin (BS13), which shows the same
  // commands on the plugin's page; kept (§0.3), not called.
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
    pop.dataset.plugin = '';
    pop.querySelectorAll('.sh-ext-row[data-id]').forEach(row => {
      const id = row.dataset.id; const p = plugins.find(x => x.id === id);
      // BS13 (0.60.183) — James: "make it so i can click on them t ochange their settings." The row opens the plugin's page
      row.tabIndex = 0; row.setAttribute('role', 'button'); row.title = `${p.displayName || p.name} — settings`;
      row.addEventListener('click', (e) => { if (e.target.closest('[data-tog],[data-pin]')) return; e.stopPropagation(); openPlugin(id); });
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === row) { e.preventDefault(); openPlugin(id); } });
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

  // ── BS13 (0.60.183): a plugin's page ───────────────────────────────────────────────────────────────────────────────────────────────
  // About, permissions and commands for every plugin; its own fields when it contributes `settings` (src/plugins/contribution-types.js);
  // "Open in Settings" when part of it lives in a Settings section. Fields are drawn from data with textContent (a label is never HTML).
  const PERM = { network: 'Network', webRequest: 'Sees requests', domStorage: 'Page storage', hostFs: 'Files', process: 'Runs programs' };
  const SECTION = { sites: 'Site settings', network: 'Network', privacy: 'Privacy', plugins: 'Plugins' };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const pageOf = () => { const sh = window.CGShell; let url = '', tabId = null; try { url = sh.wv.getURL(); } catch (_) {} try { tabId = sh.wv.getWebContentsId(); } catch (_) {} return { url, tabId }; };
  const tog = (on, label) => { const b = el('button', 'tog'); b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', String(!!on)); b.setAttribute('aria-label', label); return b; };

  async function openPlugin(id, anchor) {
    const pop = $('sh-extensions-panel');
    const { plugins } = await load(); const p = plugins.find(x => x.id === id); if (!p) return open();
    pop.dataset.plugin = id;
    const name = p.displayName || p.name;
    const head = el('div', 'sh-pop-head ps-head');
    const back = el('button', 'sh-icon ps-back'); back.title = 'All plugins'; back.setAttribute('aria-label', 'All plugins'); back.innerHTML = (window.CGIcons && window.CGIcons.svg('back', { size: 16 })) || '‹';
    back.addEventListener('click', (e) => { e.stopPropagation(); open(); });
    const ico = el('span', 'sh-ext-ico'); ico.innerHTML = (window.CGIcons && window.CGIcons.plugin(p, { size: 18 })) || ''; if (!ico.innerHTML) ico.textContent = p.icon || '🧩';
    const title = el('div', 'ps-title'); title.append(el('div', 'ps-name', name), el('div', 'ps-ver', `version ${p.version}`));
    const sw = tog(p.state === 'active', `${p.state === 'active' ? 'Turn off' : 'Turn on'} ${name}`);
    sw.addEventListener('click', async (e) => {
      e.stopPropagation(); const on = sw.getAttribute('aria-checked') !== 'true';
      const r = await (on ? cg().plugins.enable(id) : cg().plugins.disable(id)).catch(err => ({ ok: false, error: err.message }));
      if (r && r.ok === false) UI().toast(`${name}: ${r.error}`);
      openPlugin(id); refreshBadges();
    });
    head.append(back, ico, title, sw);
    const body = el('div', 'ps-body');
    pop.replaceChildren(head, body);
    if (UI().current() !== pop) UI().show(pop, anchor || $('btn-extensions'));

    const note = el('div', 'ps-note'); note.hidden = true;
    const say = (t) => { note.textContent = t || ''; note.hidden = !t; };
    const draw = (view) => {
      body.replaceChildren();
      if (p.state !== 'active') body.append(el('div', 'sh-empty', `${name} is off. Turn it on with the switch above.`));
      if (view && view.summary) { const sm = el('div', 'ps-summary'); sm.append(el('span', 'ps-big', view.summary.value), el('span', 'ps-small', view.summary.label)); body.append(sm); }
      body.append(note);
      for (const f of (view && view.fields) || []) body.append(field(f));
      if ((p.commands || []).length && p.state === 'active') {
        const g = el('div', 'ps-sec'); g.append(el('div', 'sh-group', 'Commands'));
        for (const c of p.commands) { const b = el('button', 'sh-link', c.label); b.addEventListener('click', async (e) => { e.stopPropagation(); try { await cg().plugins.invoke(c.signature, { agentId: window.CGShell && window.CGShell.agentId }); say(`${c.label}: sent`); } catch (err) { say(`${c.label}: ${err.message}`); } }); g.append(b); }
        body.append(g);
      }
      const about = el('div', 'ps-sec ps-about'); about.append(el('div', 'sh-group', 'About'), el('div', 'ps-desc', p.description || ''));
      const meta = el('div', 'ps-meta'); if (p.author) meta.append(el('span', '', `by ${p.author}`));
      const perms = Object.entries(p.permissions || {}).filter(([, v]) => v === true).map(([k]) => PERM[k] || k);
      const chips = el('div', 'ps-chips'); for (const t of perms.length ? perms : ['No special permissions']) chips.append(el('span', 'ps-chip', t));
      about.append(meta, chips); body.append(about);
      if (p.error) body.append(el('div', 'sh-ext-err', p.error));
      const foot = el('div', 'sh-pop-foot');
      if (p.settingsSection) { const b = el('button', 'sh-link', `Open ${SECTION[p.settingsSection] || p.settingsSection} in Settings…`); b.addEventListener('click', () => { UI().close(); cg().window.openSettings(p.settingsSection); }); foot.append(b); }
      const all = el('button', 'sh-link', 'Manage plugins and WebExtensions…'); all.addEventListener('click', () => { UI().close(); cg().window.openSettings('plugins'); }); foot.append(all);
      body.append(foot);
    };
    const ask = async (op, key, value) => {
      const r = await cg().plugins.settings(id, op, key, value, pageOf()).catch(err => ({ ok: false, error: err.message }));
      if (!r || r.ok === false) { say(r && r.error ? `${name}: ${r.error}` : `${name} did not answer`); return null; }
      if (r.view) draw(r.view); if (r.note) say(r.note);
      refreshBadges(); return r;
    };
    function field(f) {
      const row = el('div', `ps-field ps-${f.type}`);
      const lab = () => { const l = el('div', 'ps-label', f.label); if (f.help) l.append(el('div', 'ps-help', f.help)); return l; };
      if (f.type === 'toggle') { const t = tog(f.value, f.label); t.addEventListener('click', (e) => { e.stopPropagation(); t.setAttribute('aria-checked', String(t.getAttribute('aria-checked') !== 'true')); ask('set', f.key, t.getAttribute('aria-checked') === 'true'); }); row.append(lab(), t); }
      else if (f.type === 'info') { row.append(el('div', 'ps-label', f.label), el('div', 'ps-value', f.value)); }
      else if (f.type === 'action') { const b = el('button', `ps-btn${f.kind === 'primary' ? ' primary' : ''}`, f.label); b.addEventListener('click', async (e) => { e.stopPropagation(); b.disabled = true; b.textContent = 'Working…'; await ask('action', f.key); b.disabled = false; b.textContent = f.label; }); row.append(b); }
      else if (f.type === 'select') { const sel = el('select', 'ps-select'); for (const o of f.options || []) { const op = el('option', '', o.label); op.value = o.value; if (o.value === f.value) op.selected = true; sel.append(op); } sel.addEventListener('change', () => ask('set', f.key, sel.value)); row.append(lab(), sel); }
      else if (f.type === 'text' || f.type === 'textarea') {
        const inp = el(f.type === 'text' ? 'input' : 'textarea', 'ps-input'); inp.value = f.value || ''; if (f.placeholder) inp.placeholder = f.placeholder; inp.spellcheck = false;
        let was = inp.value; inp.addEventListener('blur', () => { if (inp.value !== was) { was = inp.value; ask('set', f.key, inp.value); } });
        inp.addEventListener('click', (e) => e.stopPropagation()); row.append(lab(), inp);
      } else if (f.type === 'list') {
        row.append(lab()); const ul = el('div', 'ps-list');
        if (!(f.items || []).length) ul.append(el('div', 'ps-help', f.empty || 'Nothing here.'));
        for (const it of f.items || []) {
          const li = el('div', 'ps-item'); const txt = el('div', 'ps-itxt'); txt.append(el('div', 'ps-ilabel', it.label)); if (it.sub) txt.append(el('div', 'ps-isub', it.sub)); li.append(txt);
          if (typeof it.on === 'boolean') { const t = tog(it.on, `${it.on ? 'Turn off' : 'Turn on'} ${it.label}`); t.addEventListener('click', async (e) => { e.stopPropagation(); t.setAttribute('aria-checked', String(!it.on)); say(`${it.on ? 'Turning off' : 'Turning on'} ${it.label}…`); await ask('set', f.key, { id: it.id, on: !it.on }); }); li.append(t); }
          if (it.remove) { const x = el('button', 'sh-icon ps-rm'); x.title = `Remove ${it.label}`; x.setAttribute('aria-label', x.title); x.innerHTML = (window.CGIcons && window.CGIcons.svg('close', { size: 14 })) || '×'; x.addEventListener('click', (e) => { e.stopPropagation(); ask('set', f.key, { id: it.id, remove: true }); }); li.append(x); }
          ul.append(li);
        }
        row.append(ul);
      }
      return row;
    }
    draw(null);
    if (p.state === 'active' && p.settings) { body.prepend(el('div', 'sh-empty', 'Loading…')); await ask('get'); }
  }

  // the count on a pinned plugin's icon (the adblocker's "blocked on this page"), asked with op 'summary' after each page load
  async function refreshBadges() {
    const box = $('sh-ext-pinned'); if (!box) return;
    for (const b of box.querySelectorAll('[data-plugin]')) {
      let n = '';
      try { const r = await cg().plugins.settings(b.dataset.plugin, 'summary', null, null, pageOf()); n = r && r.ok !== false && r.view && r.view.summary ? r.view.summary.value : ''; } catch (_) {}
      let badge = b.querySelector('.sh-badge'); if (!badge) { badge = el('span', 'sh-badge'); b.append(badge); }
      badge.textContent = n && n !== '0' ? (Number(n) > 999 ? '999+' : n) : ''; badge.hidden = !badge.textContent;
    }
  }

  async function mount() {
    const btn = $('btn-extensions'); if (!btn) return;
    btn.addEventListener('click', (e) => { e.stopPropagation(); const pop = $('sh-extensions-panel'); if (UI().current() === pop) return UI().close(); open(); });
    try { const { plugins } = await load(); drawPinned(plugins); refreshBadges(); } catch (_) {}
    const wv = $('wv'); if (wv) for (const ev of ['did-stop-loading', 'did-navigate']) wv.addEventListener(ev, () => setTimeout(refreshBadges, 300));
  }

  window.CGExtensions = { open, mount, drawPinned, openPlugin, refreshBadges };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
