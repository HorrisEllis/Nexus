'use strict';
// renderer/library/boot.js — last script on library.html: every area has registered.
// What the Library changes about the shared Settings runtime (settings/core.js boot()):
window.CGS.boot({
  groups: ['Library', 'Identity', 'Agents'],
  defaultId: 'downloads',                       // Ctrl+J lands here, like Firefox's Library
  cssBase: 'library/sections/',
  close: () => window.CGS.cg.window.closeLibrary(),
  search: 'list',                               // the rail's search box filters the list on screen
  searchPlaceholder: 'Search this list',
});
