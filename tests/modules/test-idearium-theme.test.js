'use strict';
/**
 * tests/modules/test-idearium-theme.test.js — 0.39.284 W5 (docs/2026-09-30-idearium-coding-flow-phasemap.spec)
 *
 * James: "can you make all the css in idearium consistent with the main ui" · "rebuild the themes for the settings tab".
 *   TH-0x  css/nexus-theme.css: the default palette IS the main UI's (ui/themes/nexus-dark.css) — the two can never
 *          drift; 'midnight' keeps idearium's look before 0.39.284 (§0.3); every palette defines every token
 *   TH-1x  idearium's page and the settings console take their tokens from it (no palette of their own)
 *   TH-2x  config ui.theme / ui.accent / ui.motion through idearium's real router: set, read, bad values refused
 *   TH-3x  js/theme.js: applies, remembers, falls back to the defaults on nonsense
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }
const block = (css, sel) => { const i = css.indexOf(sel); if (i === -1) return ''; return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i)); };
const vars = (body) => Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim().toLowerCase()]));

(async () => {
  console.log('\ntest-idearium-theme\n');
  try {
    const theme = read('idearium/ui/css/nexus-theme.css');
    const main = vars(block(read('ui/themes/nexus-dark.css'), ':root'));
    const nx = vars(block(theme, ':root, :root[data-theme="nexus"]'));
    const pairs = ['void', 'ink', 'plate', 'panel', 'edge', 'rim', 'muted', 'dim', 'text', 'bright', 'ok', 'err', 'warn'];
    const diff = pairs.filter(k => main[k] !== nx[`nx-${k}`]);
    check('TH-01 the default palette is the main UI\'s, token for token (ui/themes/nexus-dark.css)', diff.length === 0 && pairs.every(k => main[k]), JSON.stringify(diff.map(k => [k, main[k], nx[`nx-${k}`]])));
    const mid = vars(block(theme, ':root[data-theme="midnight"]'));
    check('TH-02 "midnight" keeps idearium\'s look before 0.39.284 (§0.3)', mid['nx-ink'] === '#07090e' && mid['nx-text'] === '#c4d4ee' && mid['nx-dim'] === '#607898' && mid['nx-card'] === '#0d1219');
    const keys = Object.keys(nx).sort().join();
    check('TH-03 every palette defines every token (a missing one would fall back to another palette\'s)', ['midnight', 'graphite'].every(t => Object.keys(vars(block(theme, `:root[data-theme="${t}"]`))).sort().join() === keys));
    check('TH-04 the accent is the main UI\'s cyan (hue 192) and can cycle 192→240 as the main UI does; reduced motion stops it', /--ac-h: 192/.test(theme) && /@keyframes nx-accent-cycle \{ 0% \{ --ac-h: 192; \}.*50% \{ --ac-h: 240; \}/.test(theme)
      && /:root\[data-accent="cycle"\] \{ animation: nx-accent-cycle/.test(theme) && /:root\[data-motion="reduced"\] \{ animation: none !important; \}/.test(theme));

    const idx = read('idearium/ui/index.html');
    const idv = vars(block(idx, ':root {\n  --bg:'));
    check('TH-11 idearium\'s tokens are taken from the theme — none of its own values left', ['bg', 'bg1', 'bg2', 'bg3', 'panel', 'b0', 'b1', 'b2', 'sky', 'sky2', 'mint', 'amber', 'coral', 'violet', 'text', 'text2', 'text3'].every(k => /^var\(--(nx-|ac)/.test(idv[k] || '')), JSON.stringify(idv));
    check('TH-12 the theme loads before idearium\'s own styles (no flash of the old palette)', idx.indexOf('css/nexus-theme.css') < idx.indexOf('<style>') && idx.indexOf('js/theme.js') < idx.indexOf('<style>'));
    check('TH-13 the Plan panel and the work surface use the theme, not fixed greys', !/#141518|#1c1d21/.test(idx) && !/#0d1117|#161b22/.test(read('idearium/ui/css/work-surface.css')));
    const st = read('idearium/ui/settings.html');
    check('TH-14 the settings console takes its tokens from the theme (its own #7c9cff palette is gone) and has Appearance', /--accent:var\(--ac\)/.test(st) && !/--accent:#7c9cff/.test(st)
      && /function renderAppearance\(\)/.test(st) && /data-appearance="1"/.test(st) && /css\/nexus-theme\.css/.test(st));
    check('TH-15 the top-bar settings button is no longer a white browser button', /\.tb-conn\{background:none;/.test(idx));

    // ── TH-2x the config ──
    const api = await import(path.join(ROOT, 'idearium', 'api', 'index.js'));
    const g = await api._route('GET', '/api/config');
    const ui = (g.json.data || g.json).config.ui;
    check('TH-21 GET /api/config has ui: nexus · cycle · full by default', ui && ui.theme === 'nexus' && ui.accent === 'cycle' && ui.motion === 'full', JSON.stringify(ui));
    const s1 = await api._route('POST', '/api/config', { key: 'ui.theme', value: 'graphite', actor: 'test' });
    const g2 = await api._route('GET', '/api/config');
    check('TH-22 POST /api/config ui.theme=graphite is kept and read back (the CLI and the console use the same key)', s1.status === 200 && (g2.json.data || g2.json).config.ui.theme === 'graphite', JSON.stringify(s1.json).slice(0, 200));
    const bad = await api._route('POST', '/api/config', { key: 'ui.theme', value: 'hotpink', actor: 'test' });
    check('TH-23 a palette that does not exist is refused with the ones that do', bad.status >= 400 && /nexus, midnight, graphite/.test(JSON.stringify(bad.json)), JSON.stringify(bad.json).slice(0, 200));
    await api._route('POST', '/api/config/reset', { key: 'ui.theme', actor: 'test' });

    // ── TH-3x theme.js ──
    const store = {}; const html = { dataset: {} };
    const ctx = { window: {}, document: { documentElement: html }, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } }, CustomEvent: function () {}, fetch: async () => ({ json: async () => ({ ok: true, config: { ui: { theme: 'midnight', accent: 'amber', motion: 'reduced' } } }) }) };
    ctx.window.addEventListener = () => {}; ctx.window.dispatchEvent = () => {};
    vm.runInNewContext(read('idearium/ui/js/theme.js'), ctx);
    check('TH-31 on load: the defaults (nexus · cycle · full) until the config answers', html.dataset.theme === 'nexus' && html.dataset.accent === 'cycle' && html.dataset.motion === 'full');
    await ctx.window.IdeariumTheme.load('');
    check('TH-32 the config\'s choice is applied and remembered for the next page (no flash)', html.dataset.theme === 'midnight' && html.dataset.accent === 'amber' && html.dataset.motion === 'reduced' && /midnight/.test(store['idearium.theme']));
    ctx.window.IdeariumTheme.apply({ theme: 'nope', accent: 7, motion: null });
    check('TH-33 nonsense falls back to the defaults, never an unstyled page', html.dataset.theme === 'nexus' && html.dataset.accent === 'cycle' && html.dataset.motion === 'full');
  } catch (e) { fail++; console.log(`  ✗ crashed: ${e.stack}`); }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 200);
})();
