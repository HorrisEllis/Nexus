/* ERAVOS runtime — themes.js → window.Themes (spec eravos.themes, addendum 3.91)
 * Asked: "the colors inside the tools … look at the buttons, looks bad. please make those themes. and hook into the reactive. make all
 * the buttons beautiful. make a themes section in the settings."
 * A THEME is the whole look in one choice — panels, buttons, title bars, how far the reactive colours may tint the surfaces — set on
 * <html data-theme="…"> (an inline line in index.html sets it before the first paint). Every rule of a theme is scoped to it in eravos.css,
 * so switching is instant and nothing of another theme leaks.
 *   studio    the device look (3.72): sharp, dark, each tool in its own colour
 *   dusk      sunset gradients, round pill buttons, the tool's painting in its title bar, soft rounded panels
 *   midnight  calm graphite: quiet panels, the accent only where it means something, gentle reactions
 *   field     (3.98) clear buttons on deep black; one gradient under the canvas, seen only through the accents (colour-field.js)
 * HOOKED INTO THE REACTIVE COLOURS: a theme gives the palette they light (they read it again on a switch, the 'eravos:theme' event) and
 * --react-surface, how far they may tint a surface (1 = as asked, below 1 = calmer).
 *   Themes.list() · get() · set(id) · onChange(fn) · panel() → the Options section (cards with a live picture of each theme) */
(function (global) {
  'use strict';
  const doc = global.document, root = doc && doc.documentElement, KEY = 'eravos.theme';
  const LIST = [
    { id: 'dusk', label: 'Dusk', blurb: 'Sunset gradients, round pill buttons, each tool’s painting in its title bar.', swatch: ['#ff2266', '#ff6fa8', '#ffb36b', '#b06bff'] },
    { id: 'studio', label: 'Studio', blurb: 'The device look: sharp, dark, every tool in its own colour.', swatch: ['#00d4ff', '#0d1218', '#223044', '#7f93a8'] },
    { id: 'field', label: 'Field', blurb: 'Clear buttons on deep black. One gradient lies under the canvas and shows only through the accents — drag a tool and its colours change with where it sits.', swatch: ['#6f5cff', '#b04dff', '#ff3d8b', '#ffc24a'] },
    { id: 'midnight', label: 'Midnight', blurb: 'Calm graphite. The accent only where it means something; gentle reactions.', swatch: ['#8fa8ff', '#11141b', '#2a3142', '#c9d2e3'] },
  ];
  const DEFAULT = 'dusk';
  // S1 (spec eravos.settings-buttons-dag): button styles, a choice beside the theme (canvas/runtime/buttons.css). 'theme' = the theme's own.
  const BUTTONS = [
    { id: 'theme', label: 'The theme’s own', blurb: 'Each theme’s buttons, as designed.' },
    { id: 'a', label: 'Clear glass', blurb: 'A thin bright pane: blur behind, a highlight on top; on = filled with the accent.' },
    { id: 'b', label: 'Glowing edge', blurb: 'Dark smoked glass with a glowing gradient edge; text and icons in the accent.' },
    { id: 'c', label: 'Frosted pill', blurb: 'Round, deep frost, a soft inner glow and a sheen on hover.' },
    { id: 'd', label: 'RGB edge', blurb: 'A rainbow rim travelling like RGB lighting; the text and icons the same rainbow.' },
  ];
  // 3.107 MATERIAL (his words, 2026-11-05: "what about adding more texture to the tools? like how the retro poly" · "always show me or add
  // more themes before change"): a surface finish beside the theme — 'none' is the look as it is; the others add a texture to the black.
  const MATERIALS = [
    { id: 'none', label: 'None', blurb: 'The black as it is: no texture.' },
    { id: 'grain', label: 'Grain', blurb: 'A fine film grain over the black panels, like a printed or analog surface.' },
    { id: 'brushed', label: 'Brushed', blurb: 'Brushed metal: fine horizontal lines and a soft sheen, like a hardware face plate.' },
    { id: 'carbon', label: 'Carbon', blurb: 'A tight carbon-fibre weave in the panels, with a soft sheen.' },
  ];
  const MKEY = 'eravos.material';
  // the grain tile: neutral noise made once in code (white at a few percent, so it only lightens the black a touch)
  (function grainTile() {
    if (!doc || !doc.createElement || !root) return; try {
      const cv = doc.createElement('canvas'); cv.width = cv.height = 160; const g = cv.getContext('2d'), d = g.createImageData(160, 160); let x = 0x2545F491;
      for (let i = 0; i < d.data.length; i += 4) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; const v = (x >>> 0) / 4294967296; d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = Math.round(v * v * 34); }
      g.putImageData(d, 0, 0); root.style.setProperty('--mat-grain', 'url(' + cv.toDataURL() + ')');
    } catch (e) {} })();
  function getMaterial() { const v = root && root.dataset.material; return MATERIALS.some(m => m.id === v) ? v : 'none'; }
  function setMaterial(id) {
    if (!MATERIALS.some(m => m.id === id) || !root) return false;
    if (id === 'none') delete root.dataset.material; else root.dataset.material = id;
    try { global.localStorage.setItem(MKEY, id); } catch (e) {}
    listeners.forEach(fn => { try { fn(get()); } catch (e) {} }); return true;
  }
  if (root && !root.dataset.material) { let v = null; try { v = global.localStorage.getItem(MKEY); } catch (e) {} if (v && v !== 'none' && MATERIALS.some(m => m.id === v)) root.dataset.material = v; }
  const BKEY = 'eravos.buttons';
  function getButtons() { const v = root && root.dataset.buttons; return BUTTONS.some(b => b.id === v) ? v : 'theme'; }
  function setButtons(id) {
    if (!BUTTONS.some(b => b.id === id) || !root) return false;
    if (id === 'theme') delete root.dataset.buttons; else root.dataset.buttons = id;
    try { global.localStorage.setItem(BKEY, id); } catch (e) {}
    try { global.dispatchEvent(new CustomEvent('eravos:buttons', { detail: { id } })); } catch (e) {}
    listeners.forEach(fn => { try { fn(get()); } catch (e) {} }); return true;
  }
  const listeners = [];
  const valid = (id) => LIST.some(t => t.id === id);
  function get() { const v = root && root.dataset.theme; return valid(v) ? v : DEFAULT; }
  function set(id) {
    if (!valid(id) || !root) return false;
    root.dataset.theme = id; try { global.localStorage.setItem(KEY, id); } catch (e) {}
    try { global.dispatchEvent(new CustomEvent('eravos:theme', { detail: { id } })); } catch (e) {}
    listeners.forEach(fn => { try { fn(id); } catch (e) {} });
    return true;
  }
  if (root && !valid(root.dataset.theme)) { let v = null; try { v = global.localStorage.getItem(KEY); } catch (e) {} root.dataset.theme = valid(v) ? v : DEFAULT; }

  // ---- the Options section: one card per theme, each a small live picture of a window in that theme
  function mini(t) {
    const h = global.UIKit.h;
    return h('div', { class: 'thm-mini', 'data-theme-preview': t.id }, [
      h('div', { class: 'thm-mhead' }, [h('i'), h('b', { text: 'YOUR TOOL' })]),
      h('div', { class: 'thm-mbody' }, [
        h('div', { class: 'thm-mrow' }, [h('span', { class: 'thm-mbtn on', text: '1/8' }), h('span', { class: 'thm-mbtn', text: '1/4' }), h('span', { class: 'thm-mbtn', text: 'Sync' })]),
        h('div', { class: 'thm-mknobs' }, [0.7, 0.4, 0.85].map(v => h('span', { class: 'thm-mknob', style: { '--v': v } }))),
        h('span', { class: 'thm-mpri', text: '＋ Add' }),
      ])]);
  }
  function panel(onClose) {
    const h = global.UIKit.h, cards = h('div', { class: 'thm-cards' });
    const paint = () => { cards.innerHTML = ''; LIST.forEach(t => {
      const on = get() === t.id, c = h('button', { class: 'thm-card' + (on ? ' on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false', title: t.blurb }, [mini(t),
        h('div', { class: 'thm-tx' }, [h('b', { text: t.label + (on ? '  ✓' : '') }), h('small', { text: t.blurb })]),
        h('div', { class: 'thm-sw' }, t.swatch.map(c2 => h('i', { style: { background: c2 } })))]);
      c.onclick = () => { set(t.id); paint(); }; cards.appendChild(c); }); };
    paint();
    // the button styles: each card shows a real button drawn in that style (data-buttons on the card itself)
    const bcards = h('div', { class: 'thm-btns' });
    const paintB = () => { bcards.innerHTML = ''; BUTTONS.forEach(b => {
      const on = getButtons() === b.id, c = h('button', { class: 'thm-bcard' + (on ? ' on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false', title: b.blurb }, [
        h('span', { class: 'thm-bdemo', 'data-buttons-demo': b.id }, [h('span', { class: 'uk-btn', text: 'Button' }), h('span', { class: 'uk-toggle on', text: 'On' })]),
        h('b', { text: b.label + (on ? '  ✓' : '') }), h('small', { text: b.blurb })]);
      c.onclick = () => { setButtons(b.id); paintB(); }; bcards.appendChild(c); }); };
    paintB();
    // 3.107 materials: each card a small panel in that finish (data-material on the card itself)
    const mcards = h('div', { class: 'thm-btns thm-mats' });
    const paintM = () => { mcards.innerHTML = ''; MATERIALS.forEach(m => {
      const on = getMaterial() === m.id, c = h('button', { class: 'thm-bcard' + (on ? ' on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false', title: m.blurb }, [
        h('span', { class: 'thm-mat', 'data-material-demo': m.id }), h('b', { text: m.label + (on ? '  ✓' : '') }), h('small', { text: m.blurb })]);
      c.onclick = () => { setMaterial(m.id); paintM(); }; mcards.appendChild(c); }); };
    paintM();
    const react = h('button', { class: 'thm-link', type: 'button', text: 'Reactive colours — how every colour answers the sound →', onclick: () => { if (global.AppSettings && global.AppSettings.isOpen) { global.AppSettings.open('reactive'); return; } if (onClose) onClose(); const b = doc.getElementById('reactBtn'); if (b) b.click(); } });
    return h('div', { class: 'thm-panel', role: 'dialog', 'aria-label': 'Themes' }, [
      h('div', { class: 'thm-headr' }, [h('b', { text: 'THEMES' }), h('span', { text: 'the whole look in one choice — remembered on this computer' }), h('button', { class: 'thm-x', type: 'button', text: '×', 'aria-label': 'close', onclick: () => onClose && onClose() })]),
      cards, h('div', { class: 'thm-sub' }, [h('b', { text: 'BUTTONS' }), h('span', { text: 'with any theme' })]), bcards,
      h('div', { class: 'thm-sub' }, [h('b', { text: 'MATERIAL' }), h('span', { text: 'a texture on the black, with any theme' })]), mcards, react]);
  }
  // 3.110 the look is a section of ⚙ Settings (it was an entry in the ⋯ Options dropdown, opening a popover)
  function entry() {
    if (!global.AppSettings) return false;
    global.AppSettings.addSection({ id: 'look', label: 'Look', order: 10, sub: 'The whole look in one choice: a theme, a button style and a material, with any theme.', make: (close) => panel(close) });
    return true;
  }
  const h0 = (tag, cls) => { const e = doc.createElement(tag); e.className = cls; return e; };
  function boot() { if (!entry()) setTimeout(boot, 300); }
  if (doc) { if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot(); }
  global.Themes = { list: () => LIST.map(t => Object.assign({}, t)), get, set, onChange(fn) { listeners.push(fn); }, panel, DEFAULT,
    buttons: () => BUTTONS.map(b => Object.assign({}, b)), getButtons, setButtons,
    materials: () => MATERIALS.map(m => Object.assign({}, m)), getMaterial, setMaterial };
})(typeof window !== 'undefined' ? window : globalThis);
