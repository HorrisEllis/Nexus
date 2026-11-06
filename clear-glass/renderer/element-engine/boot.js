'use strict';
// renderer/element-engine/boot.js — last script on element-engine.html (EE3a, 0.60.416): every area has registered.
// What the Element Engine changes about the shared Settings runtime (settings/core.js boot()):
window.CGS.boot({
  groups: ['Ad blocking', 'Elements', 'ErosmancerOS'],
  defaultId: 'overview',
  cssBase: 'element-engine/sections/',
  close: () => window.CGS.cg.window.closeElementEngine(),
  search: 'list',                               // the rail's search box filters the list on screen (lists, rules, sites, files)
  searchPlaceholder: 'Search this list',
});
