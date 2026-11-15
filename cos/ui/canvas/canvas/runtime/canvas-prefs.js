/* ERAVOS runtime — canvas-prefs.js (3.114). Domain-free.
 * Asked: "full settings were supposed to be built … the settings menu is still gone. a lot missing" · "can you make a colored border
 * around each tool, including [a tool's own windows] … or [two of them] are getting merged".
 * More of ⚙ Settings, each remembered on this computer:
 *   Canvas   Coloured border on every tool (and on the windows a tool opens of its own) · Snap windows to each other
 *   Keys     the keyboard shortcuts, in one place (the canvas's own; a domain adds its tools' with CanvasPrefs.addKeys(group, rows)), with a search
 *   Library  (the app) where your work lives, and buttons to open each folder
 * The canvas names no tool here: a border takes the window's own colour (--acc). */
(function (global) {
  'use strict';
  const doc = global.document; if (!doc) return;
  const root = doc.documentElement;
  const PREFS = [
    { key: 'toolBorders', attr: 'toolBorders', def: 'on', label: 'Coloured border on every tool', hint: 'each window — and the windows a tool opens of its own — outlined in its colour, so they never run into each other' },
    { key: 'snap', attr: 'snap', def: 'on', label: 'Snap windows to each other', hint: 'a window you drag or size lines up with the windows near it (hold Alt to place it freely either way)' },
  ];
  const get = (p) => { let v = null; try { v = global.localStorage.getItem('eravos.' + p.key); } catch (e) {} return v === 'on' || v === 'off' ? v : p.def; };
  const set = (p, v) => { try { global.localStorage.setItem('eravos.' + p.key, v); } catch (e) {} root.dataset[p.attr] = v; };
  PREFS.forEach(p => { root.dataset[p.attr] = get(p); });
  // 3.121 GRAPHICS ("having major performance issues … maybe add a graphic settings for low end hardware"): how much drawing the page
  // does. High = as it is (the default). Balanced: displays at 30 frames a second, no blur behind panels. Low: displays at 15, drawn at
  // 1× resolution, no blur, shadows or transitions, the reactive colours' glow layer off and their colours written 4× less often, the
  // Field theme's gradient still. Read through root.dataset.gfx by ui-kit, glass-layer, colour-field and the reactive colours.
  const GFX = [['high', 'High', 'everything, as designed'], ['balanced', 'Balanced', 'displays at 30 fps, no blur behind panels'], ['low', 'Low (low-end hardware)', 'displays at 15 fps and 1× resolution, no blur / shadows / transitions, no glow layer']];
  const gfxGet = () => { let v = null; try { v = global.localStorage.getItem('eravos.gfx'); } catch (e) {} return GFX.some(g => g[0] === v) ? v : 'high'; };
  const gfxSet = (v) => { try { global.localStorage.setItem('eravos.gfx', v); } catch (e) {} root.dataset.gfx = v; try { global.dispatchEvent(new CustomEvent('eravos:gfx', { detail: { level: v } })); } catch (e) {} };
  root.dataset.gfx = gfxGet();

  const KEYS = [
    ['Canvas', [['Space', 'play / stop'], ['Ctrl + Z · Ctrl + Shift + Z', 'undo · redo'], ['Shift + Esc', 'stop everything'], ['Ctrl + ,', 'Settings'], ['Alt while dragging', 'place a window freely (no snapping)'], ['Wheel · Ctrl + wheel', 'scroll · zoom the canvas'], ['Right-click', 'a menu for what is under the pointer']]],
  ];
  const addKeys = (group, rows) => { if (!group || !Array.isArray(rows)) return; const g = KEYS.find(k => k[0] === group); if (g) g[1].push(...rows); else KEYS.push([group, rows.slice()]); };
  function graphics() {
    const h = global.UIKit.h, cur = gfxGet();
    const seg = global.UIKit.Segmented({ label: 'Graphics', options: GFX.map(g => ({ value: g[0], label: g[1] })), value: cur, onChange: (v) => { gfxSet(v); say.textContent = (GFX.find(g => g[0] === v) || [])[2] || ''; } });
    const say = h('span', { class: 'as-say', text: (GFX.find(g => g[0] === cur) || [])[2] });
    return h('div', { class: 'as-card' }, [h('div', { class: 'as-row' }, [seg.el, say]), h('p', { class: 'as-say', text: 'Slow or stuttering while tools play? Try Balanced, then Low. The sound is never touched — only how much the screen draws.' })]);
  }
  function make() {
    const h = global.UIKit.h;
    return h('div', {}, [graphics(), h('div', { class: 'as-card' }, PREFS.map(p => {
      const on = get(p) === 'on', b = h('button', { class: 'uk-toggle' + (on ? ' on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false', text: p.label, title: p.hint });
      b.onclick = () => { const v = get(p) === 'on' ? 'off' : 'on'; set(p, v); b.classList.toggle('on', v === 'on'); b.setAttribute('aria-pressed', v === 'on' ? 'true' : 'false'); };
      return h('div', { class: 'as-row' }, [b, h('span', { class: 'as-say', text: p.hint })]);
    }))]);
  }
  function keys() {
    const h = global.UIKit.h, q = h('input', { class: 'uk-text as-ksearch', type: 'search', placeholder: 'find a shortcut…', 'aria-label': 'find a shortcut' }), grid = h('div', { class: 'as-keys' });
    const paint = () => { const f = q.value.trim().toLowerCase(); grid.innerHTML = '';
      KEYS.forEach(([group, list]) => { const rows = list.filter(([k, w]) => !f || (k + ' ' + w + ' ' + group).toLowerCase().includes(f)); if (!rows.length) return;
        grid.appendChild(h('div', { class: 'as-card' }, [h('b', { class: 'as-kh', text: group })].concat(rows.map(([k, what]) => h('div', { class: 'as-krow' }, [h('kbd', { text: k }), h('span', { text: what })]))))); }); };
    q.addEventListener('input', paint); paint();
    return h('div', {}, [h('div', { class: 'as-row' }, [q]), grid]);
  }
  function library() {
    const h = global.UIKit.h, D = global.eravosDesktop, box = h('div', { class: 'as-card' }), where = h('div', { class: 'as-row' }, [h('span', { class: 'as-k', text: 'Library' }), h('b', { text: '…' })]);
    box.appendChild(where);
    if (D && D.info) D.info().then(i => { where.lastChild.textContent = (i && i.library) || '?'; }).catch(() => {});
    box.appendChild(h('div', { class: 'as-row' }, [['', 'the library'], ['projects', 'projects'], ['exports', 'exports'], ['packs', 'packs'], ['drop', 'drop'], ['tools', 'tools']].map(([sub, label]) =>
      h('button', { class: 'uk-btn', type: 'button', text: 'Open ' + label, onclick: () => D && D.openLibrary && D.openLibrary(sub) }))));
    box.appendChild(h('p', { class: 'as-say', text: 'Everything you make lives here, never in the app’s folder: installing, updating or uninstalling never touches it. Back up = copy this folder.' }));
    return box;
  }
  function boot() {
    const AS = global.AppSettings; if (!AS || !global.UIKit) { setTimeout(boot, 300); return; }
    AS.addSection({ id: 'canvas', label: 'Canvas & graphics', order: 15, sub: 'How much the screen draws, and how the windows sit on the canvas.', make });
    AS.addSection({ id: 'keys', label: 'Keys', order: 80, sub: 'Every keyboard shortcut in one place.', make: keys });
    if (global.eravosDesktop) AS.addSection({ id: 'library', label: 'Library', order: 85, sub: 'Where your work lives.', make: library });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
  global.CanvasPrefs = { gfx: gfxGet, setGfx: gfxSet, addKeys, get: (k) => { const p = PREFS.find(x => x.key === k); return p ? get(p) : null; }, set: (k, v) => { const p = PREFS.find(x => x.key === k); if (p) set(p, v); }, PREFS };
})(typeof window !== 'undefined' ? window : globalThis);
