/* ERAVOS script list — single source for index.html and tests/run.html (order = bottom-up, K-13)
 * The canvas is domain-free: kernel/ + runtime/ live here; the tools live next door in ../tools/ and are loaded last
 * through their own list (tools/index.js). data-base = where this canvas folder is, data-tools = where the tools are. */
(function () {
  var me = document.currentScript, base = (me && me.getAttribute('data-base')) || '';
  window.ERAVOS_BASE = base;
  window.ERAVOS_TOOLS = (me && me.getAttribute('data-tools')) || base + '../tools/';
  var S = window.ERAVOS_SCRIPTS = [
    'kernel/kernel.js', 'kernel/intake.js', 'runtime/plain-errors.js',
    'runtime/organism-sdk.js', 'runtime/ui-kit.js', 'runtime/organism-factory.js', 'runtime/content-packs.js', 'runtime/canvas-wm.js',
    'runtime/wire-system.js', 'runtime/tool-settings.js', 'runtime/pack-editor.js', 'runtime/workspace.js', 'runtime/recipes.js', 'runtime/preview.js', 'runtime/history.js', 'runtime/expansion.js', 'runtime/add-menu.js', 'runtime/desktop-bridge.js'
  ];
  for (var i = 0; i < S.length; i++) document.write('<script src="' + base + S[i] + '"><\/script>');
  document.write('<script src="' + window.ERAVOS_TOOLS + 'index.js"><\/script>');
})();
