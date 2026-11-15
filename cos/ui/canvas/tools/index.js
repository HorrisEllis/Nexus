/* Nexus's canvas — which domains of tools it loads. The canvas (../canvas/) is ERAVOS's, imported whole and unchanged (cos/ui/canvas/README.md);
 * it knows no tool and finds this file through ERAVOS_TOOLS. It starts blank: only the two tool-free shared folders the wires need (core,
 * dataflow), then Nexus's own tools (nexus). Nothing is offered that is not here, so everything here is installed (ERAVOS_CATALOG_ALL).
 * James, 2026-11-14: "importing eravos' canvas. isolated from the repo and start blank and make the tools for nexus." */
(function () {
  var base = window.ERAVOS_TOOLS || '';
  window.ERAVOS_CATALOG_ALL = true;
  var D = window.ERAVOS_DOMAINS = ['core', 'dataflow', 'nexus'];
  if (window.Catalog) { window.Catalog.boot(D); return; }
  for (var i = 0; i < D.length; i++) document.write('<script src="' + base + D[i] + '/index.js"><\/script>');
})();
