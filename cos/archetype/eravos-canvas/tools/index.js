/* {{name}} tool list — which domains of drag-and-drop tools this canvas loads. Each domain is a folder with an index.js
 * that loads its own files. The canvas (../canvas/) knows none of them; it finds this file through ERAVOS_TOOLS.
 * Written by Nexus (lib/canvas-compartments.js) from the canvas's tool compartments; empty until a tool is added. */
(function () {
  var base = window.ERAVOS_TOOLS || '';
  var D = window.ERAVOS_DOMAINS = [];
  for (var i = 0; i < D.length; i++) document.write('<script src="' + base + D[i] + '/index.js"><\/script>');
})();
