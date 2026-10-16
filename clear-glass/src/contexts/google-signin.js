'use strict';
/**
 * src/contexts/google-signin.js — Google's sign-in works inside Clear Glass.
 * UUID: cg-google-signin-v1-0000-2026-1016-jamesbrooks-001
 * Map: docs/2026-10-16-google-signin-phasemap.spec
 *
 * James, 2026-10-16 (a Clear Glass popup, Google: "Couldn't sign you in — This browser or app may not be secure"):
 * "need this fixed. completely" · then: "for the google login, can you do everything you can to prevent that? like
 * across domains, contexts, erosmanceros, proxy,"
 *
 * Why Google refused. Scrubbing "Electron/x" from the UA was not enough: requests still carried Chromium's client hints
 * (Sec-CH-UA, with no "Google Chrome" brand) and pages could read the same from navigator.userAgentData.
 *
 * While a page is on Google's sign-in hosts, Clear Glass presents as a current Firefox, and does so consistently. This
 * is the approach of the Electron apps that host Google sign-in (Ferdium, Rambox).
 *   - Request (applySession): the User-Agent is Firefox and every Sec-CH-UA* header is removed. This applies to the
 *     page's own navigation and to every request a page in sign-in mode makes. A sign-in iframe on another site is
 *     left as that site's page is, so it is never Firefox in its headers and Chrome in its JS.
 *   - Page (attach): the webContents' UA is Firefox. A session preload (src/preload/google-signin.js) removes
 *     navigator.userAgentData, window.chrome and Chrome's vendor before Google's scripts run, with no debugger attached
 *     (0.60.106 used the DevTools protocol, and an attached debugger is itself a signal).
 *   - Version: computed from Mozilla's calendar (src/fingerprint/firefox-version.js), so it is never outdated. A page
 *     whose own UA already says Firefox (an agent context's profile) keeps it, so the profile, the header and the page
 *     agree.
 * When the page leaves the sign-in hosts, its own UA comes back.
 *
 *   isSignin(url)              accounts.google.<tld>, accounts.youtube.com, gds.google.com
 *   firefoxUA(platform)        a current Firefox UA for this OS (CG_GOOGLE_SIGNIN_UA overrides)
 *   rewriteHeaders(details, headers, { inSignin })  -> headers to send, or null (unchanged)   pure
 *   applySession(ses)          the request side and the preload, on one session (idempotent)
 *   attach(contents)           the page side, on one webContents (idempotent)
 */
const path = require('path');
const { requestHook } = require('./session-headers');
const FFV = require('../fingerprint/firefox-version');

const SIGNIN_HOST_RE = /^accounts\.google\.[a-z]{2,3}(?:\.[a-z]{2})?$|^accounts\.youtube\.com$|^gds\.google\.com$/i;
// The page Google sends a refused browser to; seeing it means something still gave Clear Glass away (logged, never silent).
const REFUSED_RE = /\/(?:v3\/)?signin\/rejected|\/signin\/v2\/deniedsigninrejected|CookieMismatch/i;
const PRELOAD = path.join(__dirname, '..', 'preload', 'google-signin.js');

function _host(url) { try { return new URL(url).hostname; } catch (_) { return ''; } }
function isSignin(url) { return SIGNIN_HOST_RE.test(_host(url)); }

function firefoxUA(platform = process.platform) {
  if (process.env.CG_GOOGLE_SIGNIN_UA) return process.env.CG_GOOGLE_SIGNIN_UA;
  return FFV.ua(platform);
}

/**
 * rewriteHeaders(details, headers, { inSignin, ua }) -> new headers, or null when this request is not part of a sign-in.
 * Part of one: a page in sign-in mode made it (its sub-requests to gstatic and the like say the same as the page), or it
 * is the main-frame navigation to a sign-in host (the first request, before the page side switched). A request that
 * already says Firefox keeps its own version, so a Firefox-persona context stays one Firefox.
 */
function rewriteHeaders(details = {}, headers = {}, { inSignin = () => false, ua = firefoxUA() } = {}) {
  const nav = !details.resourceType || details.resourceType === 'mainFrame';
  if (!inSignin(details.webContentsId) && !(nav && isSignin(details.url))) return null;
  let own = null;
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (/^user-agent$/i.test(k)) { own = v; continue; }
    if (!/^sec-ch-ua/i.test(k)) out[k] = v;
  }
  out['User-Agent'] = FFV.isFirefox(own) && !FFV.stale(own) ? own : ua;
  return out;
}

const _signin = new Set();   // webContents ids on a sign-in page now
function inSignin(id) { return id != null && _signin.has(id); }

/** applySession(ses) — the request side and the preload, once per session */
function applySession(ses) {
  if (!ses || ses.__cgGoogleSignin) return;
  ses.__cgGoogleSignin = true;
  requestHook(ses, 'google-signin', (details, headers) => rewriteHeaders(details, headers, { inSignin }), { order: 100 });   // last: its UA wins
  try {
    if (typeof ses.registerPreloadScript === 'function') ses.registerPreloadScript({ type: 'frame', id: 'cg-google-signin', filePath: PRELOAD });
    else if (typeof ses.setPreloads === 'function') ses.setPreloads([...(ses.getPreloads ? ses.getPreloads() : []).filter(p => p !== PRELOAD), PRELOAD]);
  } catch (e) { console.warn(`[google-signin] preload not registered on a session (${e.message}) — headers and UA still Firefox`); }
}

/** attach(contents, { log }) — the page side: Firefox while on a sign-in host, its own UA back when it leaves */
function attach(contents, { log = (m) => console.log(m) } = {}) {
  if (!contents || contents.__cgGoogleSignin || typeof contents.on !== 'function') return false;
  contents.__cgGoogleSignin = true;
  try { applySession(contents.session); } catch (_) {}
  const st = { own: null, reloaded: null, want: null };
  const id = () => { try { return contents.id; } catch (_) { return null; } };

  const enter = () => {
    if (_signin.has(id())) return;
    _signin.add(id());
    try {
      st.own = contents.getUserAgent();
      st.want = FFV.isFirefox(st.own) && !FFV.stale(st.own) ? st.own : firefoxUA();
      if (st.want !== st.own) contents.setUserAgent(st.want);
    } catch (_) {}
  };
  const leave = () => {
    if (!_signin.has(id())) return;
    _signin.delete(id());
    try { if (st.own && st.own !== st.want) contents.setUserAgent(st.own); } catch (_) {}
  };

  const onStart = (url, isMainFrame, isSameDocument) => {
    if (isMainFrame === false || isSameDocument) return;
    if (isSignin(url)) enter(); else if (url && !/^about:|^devtools:|^chrome:/.test(url)) leave();
  };
  // Electron 42 passes a details object as the first argument; the positional arguments are kept for older builds
  const from = (e, url, inPlace, main) => (e && e.url ? onStart(e.url, e.isMainFrame, e.isSameDocument) : onStart(url, main, inPlace));
  contents.on('did-start-navigation', from);
  contents.on('will-redirect', from);
  // After the page is in: if it still reads otherwise (the UA change came too late for this document), load it once more.
  contents.on('did-navigate', async (_e, url) => {
    if (REFUSED_RE.test(url)) log(`[google-signin] Google refused the sign-in page anyway (${url.split('?')[0]}) — report it: Google changed what it checks`);
    if (!isSignin(url) || !_signin.has(id())) return;
    let seen = null; try { seen = await contents.executeJavaScript('navigator.userAgent', false); } catch (_) { return; }
    if (seen === st.want || st.reloaded === url) return;
    st.reloaded = url;
    log(`[google-signin] page ${id()}: the sign-in page loaded before the Firefox UA applied — loading it once more`);
    try { contents.reload(); } catch (_) {}
  });
  contents.on('destroyed', () => { _signin.delete(id()); });
  return true;
}

module.exports = { isSignin, firefoxUA, rewriteHeaders, applySession, attach, inSignin, SIGNIN_HOST_RE, REFUSED_RE, PRELOAD, _signin };
