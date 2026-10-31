/**
 * cos/ui/core/section.js — a section in its own shadow root (MOD-MG-UI-CORE, MG_D7/MG_D12). MG18, 0.60.336.
 * A page's tab is a folder: section.html, section.css, section.js. mount() loads all three into a shadow root on the element, so no style or
 * DOM crosses between sections; the section's script runs as a function of (root, COS, ctx) and returns an optional { refresh, stop }.
 *   await COS.mount(el, base, ctx) → { refresh, stop }
 */
(function () {
  'use strict';
  async function mount(el, base, ctx = {}) {
    const get = async (f) => { const r = await fetch(`${base}/${f}`, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${base}/${f}: ${r.status}`); return r.text(); };
    const [html, css, js] = await Promise.all([get('section.html'), get('section.css'), get('section.js')]);
    const root = el.shadowRoot || el.attachShadow({ mode: 'open' });
    // the palette's custom properties inherit through the shadow boundary from the page, so only core's primitives are loaded here
    const shared = await fetch('../core/core.css').then(r => r.text());
    root.innerHTML = `<style>${shared.replace(/:root/g, ':host')}\n${css}</style>${html}`;
    const run = new Function('root', 'COS', 'ctx', `'use strict';\n${js}\n//# sourceURL=${base}/section.js`);
    return (await run(root, window.COS, ctx)) || {};
  }
  window.COS = Object.assign(window.COS || {}, { mount });
})();
