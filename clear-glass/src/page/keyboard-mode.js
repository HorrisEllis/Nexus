'use strict';
/**
 * clear-glass/src/page/keyboard-mode.js — the Tab switch: what a site turns on when Tab is pressed, undone on the sites he says (FG1, 0.60.273).
 * Spec: clear-glass/spec/gated-flows.spec MOD-FG-TAB · Map: docs/2026-10-28-gated-flows-phasemap.spec FG1 · stands on state-diff.js (FP4)
 *
 * James, 2026-10-28: "how do i turn this off, the accessabilit, i hit tab too many times." · then, with a screenshot of his Fiverr portfolio
 * in yellow-on-black links and wide letter spacing: "need the accessability settings, per site. look at picture 2."
 *
 *   offScript() → a page expression, run at each load of a site whose accessibility.tabMode is 'off'. On every Tab it snapshots the page
 *                 (html, body, sheets), and 60 ms, 300 ms and 1 s later undoes whatever changed since (state-diff's diffState): classes
 *                 off, attributes back, new sheets disabled. Tab itself still moves focus; nothing is blocked (FG_D4). What it undid is
 *                 kept on window.__cgTabOff ({ reverted, last }) so the probe can say it.
 * Nothing in Clear Glass changes a page on Tab (the census); the change is the site's, and only what the diff shows is undone.
 *
 * 0.60.283 — James, 2026-10-29, with a screenshot of his Fiverr dashboard still in yellow-on-black links and wide letter spacing: "The
 * accessability man. i can't fix it." Why Off could not: the site REMEMBERS its accessibility look (in its own storage), so the page loads
 * with it on and no Tab is ever pressed for the diff to see. Now:
 *   sweepScript({ storage, cookies }) → a page expression that finds what holds the look on: html/body classes and attributes, and the
 *                 site's localStorage / sessionStorage keys and (readable) cookies, whose names say accessibility (A11Y). With storage /
 *                 cookies it removes those entries and returns each one's value (the backup, so a reset can be put back). It also says
 *                 every storage key and cookie name it did NOT match, and how a link looks, so a look it missed can be traced.
 *   offScript()  → also sweeps at load (classes, attributes, storage; never cookies) and keeps the classes it removed off.
 */
const SD = require('./state-diff');

// what names an accessibility look: a11y, accessib…, high contrast, keyboard mode/user/nav, (user-)is-tabbing, dyslexic fonts, text/letter spacing
const A11Y = 'a11y|accessib|high.?contrast|contrast.?mode|keyboard.?(mode|user|nav|focus)|is.?tabbing|tab.?mode|dyslexi|letter.?spacing|text.?spacing|readable.?font';
const A11Y_RE = new RegExp(A11Y, 'i');

function sweepScript({ storage = false, cookies = false } = {}) {
  return `(function(){
  var re = new RegExp(${JSON.stringify(A11Y)}, 'i'), out = { classes: { html: [], body: [] }, attrs: { html: {}, body: {} }, storage: [], cookies: [], otherKeys: [], otherCookies: [], link: null };
  ['html', 'body'].forEach(function(k){ var el = k === 'html' ? document.documentElement : document.body; if (!el) return;
    Array.prototype.slice.call(el.classList).forEach(function(c){ if (re.test(c)) { out.classes[k].push(c); el.classList.remove(c); } });
    Array.prototype.slice.call(el.attributes).forEach(function(a){ if (a.name !== 'class' && a.name !== 'style' && (re.test(a.name) || (/^data-/.test(a.name) && re.test(a.value)))) { out.attrs[k][a.name] = a.value; el.removeAttribute(a.name); } }); });
  [['local', window.localStorage], ['session', window.sessionStorage]].forEach(function(p){ var st = p[1]; if (!st) return;
    try { for (var i = st.length - 1; i >= 0; i--) { var key = st.key(i); if (re.test(key)) { out.storage.push({ area: p[0], key: key, value: st.getItem(key) }); ${storage ? 'st.removeItem(key);' : ''} } else out.otherKeys.push(p[0] + ':' + key); } } catch (e) { out.storageError = String(e && e.message || e); } });
  String(document.cookie || '').split(/;\s*/).filter(Boolean).forEach(function(c){ var i = c.indexOf('='), n = i < 0 ? c : c.slice(0, i), v = i < 0 ? '' : c.slice(i + 1);
    if (re.test(n)) { out.cookies.push({ name: n, value: v }); ${cookies ? "document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'; document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.' + location.hostname.replace(/^www\\./, '');" : ''} } else out.otherCookies.push(n); });
  var a = document.querySelector('a[href]'); if (a) { var cs = getComputedStyle(a); out.link = { color: cs.color, background: cs.backgroundColor, letterSpacing: cs.letterSpacing, textDecoration: cs.textDecorationLine }; }
  out.found = out.storage.length + out.cookies.length + ['html', 'body'].reduce(function(n, k){ return n + out.classes[k].length + Object.keys(out.attrs[k]).length; }, 0);
  return out; })()`;
}


function offScript() {
  const snap = SD.snapshotScript();
  return `(function(){
  if (window.__cgTabOff) return 'already';
  var state = window.__cgTabOff = { reverted: 0, last: null, atLoad: null };
  // 0.60.283 — the look a site remembers is on before any Tab: swept at load (classes, attributes, storage), and kept off
  try { state.atLoad = ${sweepScript({ storage: true })}; } catch (e) { state.atLoadError = String(e && e.message || e); }
  var keepOff = state.atLoad ? state.atLoad.classes : { html: [], body: [] };
  try { new MutationObserver(function(){ ['html', 'body'].forEach(function(k){ var el = k === 'html' ? document.documentElement : document.body; if (!el) return;
    keepOff[k].forEach(function(c){ if (el.classList.contains(c)) { el.classList.remove(c); state.reverted++; } }); }); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['class'], subtree: false }); } catch (_) {}
  var _part = ${SD._part.toString()};
  var diffState = ${SD.diffState.toString()};
  function snap(){ return ${snap}; }
  function sheetId(s, i){ return s.id ? '#' + s.id : (s.href || ('style:' + i + ':' + (s.textContent || '').length)); }
  function revert(d, b){
    ['html', 'body'].forEach(function(k){ var el = k === 'html' ? document.documentElement : document.body; if (!el) return;
      d.classes[k].forEach(function(c){ el.classList.remove(c); }); d.removed[k].forEach(function(c){ el.classList.add(c); });
      var ba = _part(b, k).attrs; Object.keys(d.attrs[k]).forEach(function(n){ if (ba[n] === undefined) el.removeAttribute(n); else el.setAttribute(n, ba[n]); }); });
    if (d.sheets.length) Array.prototype.forEach.call(document.querySelectorAll('style,link[rel~="stylesheet"]'), function(s, i){ if (d.sheets.indexOf(sheetId(s, i)) >= 0) s.disabled = true; });
  }
  var before = null, timers = [];
  document.addEventListener('keydown', function(e){
    if (e.key !== 'Tab') return;
    if (!before) before = snap();
    timers.forEach(clearTimeout);
    timers = [60, 300, 1000].map(function(ms, i, all){ return setTimeout(function(){
      var d = diffState(before, snap());
      if (!d.empty) { revert(d, before); state.reverted++; state.last = d; }
      if (i === all.length - 1) before = null;
    }, ms); });
  }, true);
  return 'on';
})()`;
}

module.exports = { offScript, sweepScript, A11Y_RE };
