'use strict';
/**
 * clear-glass/src/rewind/resume.js — a site's "resume state": on a revisit, put back where he was (SP2, 0.60.216).
 * Spec: clear-glass/spec/site-profile.spec MOD-SP-READERS · key resume.restore (off | scroll | scroll+forms)
 *
 * James, 2026-10-23: "I need site specific settings for the autofill, macros, workflows, passwords/accounts, snowflake, resume state."
 * Reading (to confirm): where he was on a page of that site — its scroll, and its form fields if he says — not every tab at start-up.
 *
 * Why not rewind's snapshots: they are taken on the driver's navigations (nav.loaded), so his own browsing has none, and they are taken at
 * load, when the scroll is 0. The place is kept by the page itself, as he leaves it: on scroll (after 0.5 s still), on pagehide and when the
 * tab is hidden, in that origin's own localStorage under `__cg_resume:<path+query>`. The form capture and restore are rewind's own
 * (FORM_FIELDS_CAPTURE_JS / FORM_FIELDS_RESTORE_JS — never a password field), reused, not copied.
 *
 * resumeScript(mode) → the JS main runs on did-finish-load of a page whose site has resume on: it restores the kept place once, then
 * keeps it. Run again on the same document it only updates the mode.
 */
const { FORM_FIELDS_CAPTURE_JS, FORM_FIELDS_RESTORE_JS } = require('./engine.js');

const MODES = Object.freeze(['scroll', 'scroll+forms']);

function resumeScript(mode) {
  if (!MODES.includes(mode)) return null;
  return `(function (mode) {
  if (window.__cgResume) { window.__cgResume.mode = mode; return 'kept'; }
  var K = '__cg_resume:' + location.pathname + location.search;
  var st = window.__cgResume = { mode: mode };
  var restored = 'none';
  try {
    var old = JSON.parse(localStorage.getItem(K) || 'null');
    if (old && (old.x || old.y)) {
      var go = function () { window.scrollTo(old.x || 0, old.y || 0); };
      go(); setTimeout(go, 800);   // a page that grows after load
      restored = 'scroll';
    }
    if (old && old.forms && old.forms.length && mode === 'scroll+forms') {
      (${FORM_FIELDS_RESTORE_JS('old.forms')});
      restored = restored === 'scroll' ? 'scroll+forms' : 'forms';
    }
  } catch (_) {}
  function save(withForms) {
    try {
      var o = { x: window.scrollX, y: window.scrollY, at: Date.now() };
      if (st.mode === 'scroll+forms') {
        if (withForms) o.forms = ${FORM_FIELDS_CAPTURE_JS};
        else { var prev = JSON.parse(localStorage.getItem(K) || 'null'); if (prev && prev.forms) o.forms = prev.forms; }
      }
      localStorage.setItem(K, JSON.stringify(o));
    } catch (_) {}
  }
  var t = null;
  window.addEventListener('scroll', function () { clearTimeout(t); t = setTimeout(function () { save(false); }, 500); }, { passive: true });
  window.addEventListener('pagehide', function () { save(true); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') save(true); });
  return restored;
})(${JSON.stringify(mode)})`;
}

module.exports = { resumeScript, MODES };
