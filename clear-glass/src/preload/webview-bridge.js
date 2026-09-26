'use strict';
/**
 * src/preload/webview-bridge.js
 *
 * §BUILD 2026-07-09 — the injected PICKER_SCRIPT in renderer/browser.html
 * called `require('electron').ipcRenderer.sendToHost(...)` directly from
 * inside the <webview> guest page. The webview is declared with
 * `contextIsolation=yes` and no `nodeIntegration` attribute (default off),
 * so the guest page has no Node access at all — that call almost
 * certainly throws, and the surrounding try/catch in the picker swallows
 * it silently. Every pick that made it this far was still being dropped
 * on the floor.
 *
 * This is the standard, supported way to give an isolated guest page a
 * narrow channel back to its host: a preload script on the <webview> tag
 * itself, exposed via contextBridge. No Node in the page, no `require`,
 * just one function.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__cg', {
  send: (channel, data) => {
    // Allowlist — this is a bridge out of an arbitrary, untrusted guest
    // page (could be any site an agent navigates to). Don't let injected
    // page code send anything but the channels we actually handle.
    // §ADDED 2026-09-02 — James: "check clear-glass for an ipc." This
    // one already existed (this whole file, built 2026-07-09) — the
    // real gap was a real channel for cookie-vault requests, not the
    // bridge mechanism itself. 'nexus:cookie-request' added to the
    // allowlist for exactly that — see browser.js's own real receiver
    // and main/index.js's own real cookie-vault relay for the full
    // round-trip (request in via this channel, response delivered back
    // into the page via the same executeJavaScript pattern injectAnswer()
    // already uses for wake-word answers).
    // §ADDED 2026-09-25 — James: "the three lines menu... its not here.
    // at all... fix it." Real gap: ui/tv-shell/index.html (the real
    // default homepage since 0.39.229) and ui/home/index.html both have
    // a real menu overlay (#sys-bar/#menu-overlay), but neither one has
    // any way to reach Settings — every settings.html section built this
    // session (Downloads, Plugins, and everything before them) was
    // reachable only through Clear Glass's OWN browser.html chrome
    // (☰ → options panel → "API Settings…"), invisible from the page
    // James actually considers the app. This channel is the missing
    // link: the guest page (tv-shell/home, running inside Clear Glass's
    // <webview>) asks its host to open the real Settings window, same
    // relay pattern as dom:event/nexus:cookie-request above.
    if (channel !== 'dom:pick-result' && channel !== 'dom:event' && channel !== 'nexus:cookie-request' && channel !== 'nexus:open-settings') return;
    ipcRenderer.sendToHost(channel, data);
  },
});
