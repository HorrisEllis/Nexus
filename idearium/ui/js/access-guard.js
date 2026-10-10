/**
 * idearium/ui/js/access-guard.js — §0.58.0 IA3 (docs/2026-10-10-idearium-access-phasemap.spec).
 * James: "app password style login in idearium from clearglass panel". When Idearium asks this page to sign in (a 401
 * that names the sign-in page — access.mode password, or a sign-in that ended), go to /login.html and come back here
 * after. One wrapper on fetch for every page, loaded first, so no page needs its own.
 */
(function () {
  'use strict';
  if (window.__nxAccessGuard || /\/login\.html$/.test(location.pathname)) return;
  window.__nxAccessGuard = true;
  const f = window.fetch.bind(window);
  let going = false;
  window.fetch = async function (...a) {
    const r = await f(...a);
    if (r.status === 401 && !going) {
      try {
        const j = await r.clone().json();
        if (j && j.detail && j.detail.signIn) { going = true; location.href = `${j.detail.signIn}?next=${encodeURIComponent(location.pathname + location.search)}`; }
      } catch (_) { /* not Idearium's refusal */ }
    }
    return r;
  };
})();
