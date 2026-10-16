'use strict';
/**
 * src/preload/google-signin.js — a session preload: on Google's sign-in pages, before Google's own scripts run, the page
 * reads as the Firefox its user agent says it is. Registered on every session by src/contexts/google-signin.js.
 * UUID: cg-google-signin-preload-v1-0000-2026-1016-jamesbrooks-001
 *
 * James, 2026-10-16: "for the google login, can you do everything you can to prevent that?"
 *
 * It replaces a DevTools-protocol script (0.60.106). A debugger attached to the sign-in page is itself a signal, and the
 * driver or ErosmancerOS could already hold it. Electron 42's contextBridge.executeInMainWorld runs a function in the
 * page's own world, synchronously, from the preload, with no debugger. webFrame.executeJavaScript is the fallback on an
 * older Electron.
 *
 * It acts only when the page is on a sign-in host AND its UA already says Firefox (the page side switched it). Otherwise
 * it does nothing, so a page is never half Firefox and half Chrome.
 */
const HOSTS = /^accounts\.google\.[a-z]{2,3}(?:\.[a-z]{2})?$|^accounts\.youtube\.com$|^gds\.google\.com$/i;

function asFirefox() {
  // Firefox has none of these; Chrome (and an embedded Chromium) has all of them
  try { delete Navigator.prototype.userAgentData; } catch (_) {}
  try { if ('userAgentData' in navigator) Object.defineProperty(navigator, 'userAgentData', { get: () => undefined, configurable: true }); } catch (_) {}
  try { delete window.chrome; } catch (_) {}
  try { Object.defineProperty(Navigator.prototype, 'vendor', { get: () => '', configurable: true }); } catch (_) {}
  try { Object.defineProperty(Navigator.prototype, 'productSub', { get: () => '20100101', configurable: true }); } catch (_) {}
  try { if (navigator.webdriver) Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true }); } catch (_) {}
}

try {
  if (HOSTS.test(location.hostname) && /\bFirefox\/\d+/.test(navigator.userAgent)) {
    const { contextBridge, webFrame } = require('electron');
    if (contextBridge && typeof contextBridge.executeInMainWorld === 'function') contextBridge.executeInMainWorld({ func: asFirefox });
    else if (webFrame) webFrame.executeJavaScript(`(${asFirefox.toString()})()`);
  }
} catch (_) { /* a preload must never break the page */ }

if (typeof module !== 'undefined' && module) module.exports = { HOSTS, asFirefox };   // for its test; a sandboxed preload may have no module
