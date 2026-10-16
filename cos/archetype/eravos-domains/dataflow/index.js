/* ERAVOS dataflow domain — file list. The shared language other domains meet in: typed values (text · json · number ·
 * trigger, + any type another domain adds, e.g. image) sent point-to-point along the wires you draw. No tools. */
(function () {
  var base = (window.ERAVOS_TOOLS || '') + 'dataflow/';
  var F = ['core/dataflow.js'];
  for (var i = 0; i < F.length; i++) document.write('<script src="' + base + F[i] + '"><\/script>');
})();
