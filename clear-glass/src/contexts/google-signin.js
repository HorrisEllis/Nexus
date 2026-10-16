'use strict';
/**
 * src/contexts/google-signin.js — Google's sign-in works inside Clear Glass.
 * UUID: cg-google-signin-v1-0000-2026-1016-jamesbrooks-001
 * Map: docs/2026-10-16-google-signin-phasemap.spec
 *
 * James, 2026-10-16 (a screenshot of a Clear Glass popup: Google, "Couldn't sign you in — This browser or app may not
 * be secure"): "need this fixed. completely"
 *
 * Why Google refused. Scrubbing "Electron/x" from the user agent (main/index.js, providers/host.js) was not enough:
 * the UA said Chrome, but the request still carried Chromium's client hints (Sec-CH-UA: "Chromium", no "Google
 * Chrome" brand), and the page could read the same from navigator.userAgentData. Google's sign-in reads an embedded
 * Chromium from that and stops.
 *
 * The fix is the one Electron apps that host Google sign-in use (Ferdium, Rambox). While a page is on Google's
 * sign-in hosts, Clear Glass presents as Firefox, and does so consistently:
 *   - the request: User-Agent is Firefox, every Sec-CH-UA* header is removed (Firefox sends none);
 *   - the page: the webContents' user agent is Firefox (navigator.userAgent agrees with the header), and
 *     navigator.userAgentData is removed (Firefox has none), through the DevTools protocol where it can attach.
 * When the page leaves the sign-in hosts, its own user agent comes back. Nothing else is touched: no cookie, no
 * response, no other site.
 *
 *   isSignin(url)                 a Google sign-in host (accounts.google.<tld>, accounts.youtube.com)
 *   firefoxUA(platform)           a current Firefox ESR UA for this OS (CG_GOOGLE_SIGNIN_UA overrides it)
 *   rewriteHeaders(details, headers, { inSignin })  -> headers to send, or null (unchanged)   pure
 *   applySession(ses)             the request side, on one session (idempotent; composes with other header hooks)
 *   attach(contents)              the page side, on one webContents (idempotent)
 */
const { requestHook } = require('./session-headers');

const SIGNIN_HOST_RE = /^accounts\.google\.[a-z]{2,3}(?:\.[a-z]{2})?$|^accounts\.youtube\.com$/i;
// The page Google sends a refused browser to; seeing it means the page side did not hold (logged, never silent).
const REFUSED_RE = /\/(?:v3\/)?signin\/rejected|\/signin\/v2\/deniedsigninrejected|CookieMismatch/i;

function _host(url) { try { return new URL(url).hostname; } catch (_) { return ''; } }
function isSignin(url) { return SIGNIN_HOST_RE.test(_host(url)); }

// Firefox 140 is the ESR line current through 2026; a UA Google lists as supported. One per OS, as Firefox writes it.
function firefoxUA(platform = process.platform) {
  if (process.env.CG_GOOGLE_SIGNIN_UA) return process.env.CG_GOOGLE_SIGNIN_UA;
  if (platform === 'darwin') return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0';
  if (platform === 'win32') return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0';
  return 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';
}

/**
 * rewriteHeaders(details, headers, { inSignin, ua }) -> new headers, or null when this request is not part of a sign-in.
 * A request is part of one when it goes to a sign-in host, or comes from a page that is on one (its webContents is in
 * sign-in mode: the page's scripts, images and XHRs to gstatic and the like say the same as the page).
 */
function rewriteHeaders(details = {}, headers = {}, { inSignin = () => false, ua = firefoxUA() } = {}) {
  if (!isSignin(details.url) && !inSignin(details.webContentsId)) return null;
  const out = {};
  for (const [k, v] of Object.entries(headers)) if (!/^sec-ch-ua/i.test(k) && !/^user-agent$/i.test(k)) out[k] = v;
  out['User-Agent'] = ua;
  return out;
}

const _signin = new Set();   // webContents ids on a sign-in page now
function inSignin(id) { return id != null && _signin.has(id); }

/** applySession(ses) — the request side, once per session */
function applySession(ses) {
  if (!ses || ses.__cgGoogleSignin) return;
  ses.__cgGoogleSignin = true;
  requestHook(ses, 'google-signin', (details, headers) => rewriteHeaders(details, headers, { inSignin }), { order: 100 });   // last: its UA wins
}

// Run in the page before its own scripts while it is on a sign-in host: Firefox has no navigator.userAgentData.
const PAGE_SCRIPT = `(() => { try { delete Navigator.prototype.userAgentData; } catch (_) {} try { if ('userAgentData' in navigator) Object.defineProperty(navigator, 'userAgentData', { get: () => undefined, configurable: true }); } catch (_) {} })();`;

/** attach(contents, { log }) — the page side: Firefox while on a sign-in host, its own UA back when it leaves */
function attach(contents, { log = (m) => console.log(m) } = {}) {
  if (!contents || contents.__cgGoogleSignin || typeof contents.on !== 'function') return false;
  contents.__cgGoogleSignin = true;
  try { applySession(contents.session); } catch (_) {}
  const st = { own: null, cdp: null, reloaded: null };
  const id = () => { try { return contents.id; } catch (_) { return null; } };

  const enter = async () => {
    if (_signin.has(id())) return;
    _signin.add(id());
    try { st.own = contents.getUserAgent(); contents.setUserAgent(firefoxUA()); } catch (_) {}
    // navigator.userAgentData: through the DevTools protocol, when no one else holds this page's debugger
    try {
      const dbg = contents.debugger;
      if (dbg && !dbg.isAttached()) {
        dbg.attach('1.3');
        const r = await dbg.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_SCRIPT });
        st.cdp = r && r.identifier ? r.identifier : null;
      } else if (dbg) log(`[google-signin] page ${id()}: its debugger is held elsewhere — navigator.userAgentData is left as it is (headers and UA still Firefox)`);
    } catch (e) { log(`[google-signin] page ${id()}: navigator.userAgentData not hidden (${e.message}) — headers and UA still Firefox`); }
  };
  const leave = async () => {
    if (!_signin.has(id())) return;
    _signin.delete(id());
    try { if (st.own) contents.setUserAgent(st.own); } catch (_) {}
    try { const dbg = contents.debugger; if (st.cdp && dbg && dbg.isAttached()) { await dbg.sendCommand('Page.removeScriptToEvaluateOnNewDocument', { identifier: st.cdp }).catch(() => {}); dbg.detach(); } } catch (_) {}
    st.cdp = null;
  };

  const onStart = (url, isMainFrame, isSameDocument) => {
    if (isMainFrame === false || isSameDocument) return;
    if (isSignin(url)) enter(); else if (url && !/^about:|^devtools:|^chrome:/.test(url)) leave();
  };
  contents.on('did-start-navigation', (e, url, isInPlace, isMainFrame) => {
    // Electron 42 passes a details object as the first argument as well; the positional ones are kept for older builds
    const d = e && e.url ? e : null;
    onStart(d ? d.url : url, d ? d.isMainFrame : isMainFrame, d ? d.isSameDocument : isInPlace);
  });
  contents.on('will-redirect', (e, url, isInPlace, isMainFrame) => {
    const d = e && e.url ? e : null;
    onStart(d ? d.url : url, d ? d.isMainFrame : isMainFrame, d ? d.isSameDocument : isInPlace);
  });
  // After the page is in: if it still reads as Chrome (the UA change came too late for this document), load it once more.
  contents.on('did-navigate', async (_e, url) => {
    if (REFUSED_RE.test(url)) log(`[google-signin] Google refused the sign-in page anyway (${url.split('?')[0]}) — report it: Google changed what it checks`);
    if (!isSignin(url) || !_signin.has(id())) return;
    let seen = null; try { seen = await contents.executeJavaScript('navigator.userAgent', false); } catch (_) { return; }
    if (seen === firefoxUA() || st.reloaded === url) return;
    st.reloaded = url;
    log(`[google-signin] page ${id()}: the sign-in page loaded before the Firefox UA applied — loading it once more`);
    try { contents.reload(); } catch (_) {}
  });
  contents.on('destroyed', () => { _signin.delete(id()); });
  return true;
}

module.exports = { isSignin, firefoxUA, rewriteHeaders, applySession, attach, inSignin, PAGE_SCRIPT, SIGNIN_HOST_RE, REFUSED_RE, _signin };
