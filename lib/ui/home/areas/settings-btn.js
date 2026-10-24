'use strict';
// ui/home/areas/settings-btn.js — real Settings access from the home menu.
// §ADDED 2026-09-25 — James: "the three lines menu... its not here. at
// all... fix it." Real gap found, not assumed: this page's own menu
// (#sys-bar, same pattern as ui/tv-shell/index.html) had INSPECT and
// REWIND but no way to reach Clear Glass's real Settings window — every
// settings.html section built this session (Downloads, Plugins, and
// everything before them) was reachable only through Clear Glass's OWN
// browser.html chrome, invisible from here.
//
// window.__cg (webview-bridge.js's contextBridge global) only exists
// when this page is running inside Clear Glass's own <webview> — checked
// directly, not assumed, since this same index.html is also served as a
// plain page by the orchestrator and can be opened in an ordinary
// browser tab with no Electron behind it at all. The message channel
// itself ('nexus:open-settings') is allowlisted in webview-bridge.js and
// handled by browser.js's host-side ipc-message listener, which calls
// the real cg.window.openSettings() — same function the tray menu item
// already uses.
function openNexusSettings(){
  if(window.__cg&&typeof window.__cg.send==='function'){window.__cg.send('nexus:open-settings',{});}
  else{console.warn('openNexusSettings: window.__cg not present — this page is not running inside Clear Glass\'s Electron webview, so there is no Settings window to open.');}
}
