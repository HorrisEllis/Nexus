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
 */
const SD = require('./state-diff');

function offScript() {
  const snap = SD.snapshotScript();
  return `(function(){
  if (window.__cgTabOff) return 'already';
  var state = window.__cgTabOff = { reverted: 0, last: null };
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

module.exports = { offScript };
