/* ERAVOS script list — single source for index.html and tests/run.html (order = bottom-up, K-13)
 * The canvas is domain-free: kernel/ + runtime/ live here; the tools live next door in ../tools/ and are loaded last
 * through their own list (tools/index.js). data-base = where this canvas folder is, data-tools = where the tools are. */
(function () {
  var me = document.currentScript, base = (me && me.getAttribute('data-base')) || '';
  window.ERAVOS_BASE = base;
  window.ERAVOS_TOOLS = (me && me.getAttribute('data-tools')) || base + '../tools/';
  var S = window.ERAVOS_SCRIPTS = [
    'kernel/kernel.js', 'kernel/intake.js', 'runtime/catalog.js', 'runtime/plain-errors.js',
    'runtime/organism-sdk.js', 'runtime/icons.js', 'runtime/icons.gen.js', 'runtime/black-surfaces.js', 'runtime/ui-kit.js', 'runtime/app-settings.js', 'runtime/canvas-prefs.js', 'runtime/themes.js', 'runtime/colour-field.js', 'runtime/glass-layer.js', 'runtime/organism-factory.js', 'runtime/content-packs.js', 'runtime/canvas-wm.js',
    'runtime/wire-system.js', 'runtime/links.js', 'runtime/mods.js', 'runtime/mods-rack.js', 'runtime/tool-page.js', 'runtime/suites.js', 'runtime/glass-link.js', 'runtime/tool-settings.js', 'runtime/pack-editor.js', 'runtime/workspace.js', 'runtime/vendor/js-yaml.min.js', 'runtime/erv.js', 'runtime/recipes.js', 'runtime/preview.js', 'runtime/history.js', 'runtime/expansion.js', 'runtime/dep-graph.js', 'runtime/updates.js', 'runtime/add-menu.js', 'runtime/context-menu.js', 'runtime/desktop-bridge.js'
  ];
  for (var i = 0; i < S.length; i++) document.write('<script src="' + base + S[i] + '"><\/script>');
  document.write('<script src="' + window.ERAVOS_TOOLS + 'index.js"><\/script>');
})();
