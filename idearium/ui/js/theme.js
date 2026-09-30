// ════════════════════════════════════════════════════════════════════════════
// §THEME — idearium/ui/js/theme.js (0.39.284 W5)
// UUID: nexus-idearium-ui-theme-js-v1-0000-2026-0930-jamesbrooks-001
// Map: docs/2026-09-30-idearium-coding-flow-phasemap.spec (W5_theme_and_css)
//
// Applies the chosen palette (css/nexus-theme.css) to <html>: data-theme · data-accent · data-motion. The choice is
// idearium config (ui.theme / ui.accent / ui.motion — GET/POST /api/config), so it is the same on every idearium page
// and every machine that talks to this idearium; the last one seen is also kept in this browser so a page paints in
// it before the config answers (no flash). Loaded first on idearium/ui/index.html and settings.html.
// ════════════════════════════════════════════════════════════════════════════
(function () {
  const KEY = 'idearium.theme';
  const THEMES = ['nexus', 'midnight', 'graphite'], ACCENTS = ['cycle', 'cyan', 'violet', 'emerald', 'amber'], MOTION = ['full', 'reduced'];
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  function apply(t) {
    const r = document.documentElement;
    const cur = { theme: pick(t && t.theme, THEMES, 'nexus'), accent: pick(t && t.accent, ACCENTS, 'cycle'), motion: pick(t && t.motion, MOTION, 'full') };
    r.dataset.theme = cur.theme; r.dataset.accent = cur.accent; r.dataset.motion = cur.motion;
    try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (_) {}
    try { window.dispatchEvent(new CustomEvent('idearium-theme', { detail: cur })); } catch (_) {}
    return cur;
  }
  let first = null;
  try { first = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) {}
  apply(first);
  async function load(base) {
    try {
      const r = await fetch(`${base || ''}/api/config`);
      const j = await r.json();
      const ui = (j && (j.data || j).config && (j.data || j).config.ui) || null;
      const val = (x) => (x && typeof x === 'object' && 'value' in x ? x.value : x);
      if (ui) return apply({ theme: val(ui.theme), accent: val(ui.accent), motion: val(ui.motion) });
    } catch (_) {}
    return null;
  }
  // the settings console is another window of the same origin: its choice reaches this one through storage
  window.addEventListener('storage', (e) => { if (e.key === KEY && e.newValue) { try { apply(JSON.parse(e.newValue)); } catch (_) {} } });
  window.IdeariumTheme = { apply, load, THEMES, ACCENTS, MOTION, current: () => ({ theme: document.documentElement.dataset.theme, accent: document.documentElement.dataset.accent, motion: document.documentElement.dataset.motion }) };
})();
