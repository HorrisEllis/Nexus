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

// 2026-10-30 AC2 — James, with fiverr.com still in yellow-on-black links and the reset finding nothing named accessibility: "look at the
// accessability. needs to actually hook into the back end settings. looks lazy also." The look is traced to its cause whatever it is named:
//   traceScript() → { link, inline, rules: [{ selector, sheet, props, triggers }], triggers: [{ kind: 'class'|'attr', name, value?, on }],
//                     unreadable: [sheet], forced: { colors, contrast }, controls: [{ n, label, kind }], widgets: [name] }
//     rules: stylesheet rules that match a link and paint what the link shows (its colour, its background, its underline, its spacing);
//     triggers: in those rules' selectors, the classes and attributes an ancestor has now (what switches the rule on);
//     controls: the site's own accessibility control (a widget's button, anything named accessibility), marked data-cg-a11yctl=<n> to open.
//   keepOffScript(list) → applied at every load of the site (main _siteOnLoad, setting accessibility.keepOff): 'class:<name>' removed from every
//     element and kept off, 'attr:<name>' the same, 'rule:<selector>' deleted from every sheet that can be read (and from sheets added later).
function traceScript() {
  return `(function(){
  function vis(e){ var r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }
  var probe = document.createElement('span'); document.body.appendChild(probe);
  function norm(v){ probe.style.color = ''; probe.style.color = v; return probe.style.color ? getComputedStyle(probe).color : null; }
  var links = Array.prototype.filter.call(document.querySelectorAll('a[href]'), vis).slice(0, 30);
  var a = links[0], out = { link: null, inline: null, rules: [], triggers: [], unreadable: [], forced: { colors: matchMedia('(forced-colors: active)').matches, contrast: matchMedia('(prefers-contrast: more)').matches }, controls: [], widgets: [] };
  if (a) { var cs = getComputedStyle(a); out.link = { color: cs.color, background: cs.backgroundColor, decoration: cs.textDecorationLine, spacing: cs.letterSpacing, outline: cs.outlineStyle !== 'none' ? cs.outlineColor : null };
    if (/color|background|outline/i.test(a.getAttribute('style') || '')) out.inline = a.getAttribute('style'); }
  var seen = {};
  function addTrigger(kind, name, value, el){ var k = kind + ':' + name; if (seen[k]) return; seen[k] = 1; out.triggers.push({ kind: kind, name: name, value: value == null ? null : value, on: el === document.documentElement ? 'html' : el === document.body ? 'body' : (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')) }); }
  function triggersOf(sel){ var found = [];
    sel.split(',').forEach(function(one){ var parts = one.trim().split(/\\s*[ >+~]\\s*/); parts.slice(0, -1).concat([parts[parts.length - 1]]).forEach(function(part, i, all){
      var last = i === all.length - 1;
      (part.match(/\\.[\\w-]+/g) || []).forEach(function(c){ c = c.slice(1); links.forEach(function(l){ for (var e = last ? null : l.parentElement; e; e = e.parentElement) if (e.classList && e.classList.contains(c)) { addTrigger('class', c, null, e); found.push('class:' + c); break; } }); });
      (part.match(/\\[[^\\]]+\\]/g) || []).forEach(function(at){ var m = /^\\[\\s*([\\w:-]+)\\s*(?:[~|^$*]?=\\s*["']?([^"'\\]]*)["']?)?\\s*\\]$/.exec(at); if (!m) return;
        links.forEach(function(l){ for (var e = last ? null : l.parentElement; e; e = e.parentElement) if (e.hasAttribute && e.hasAttribute(m[1]) && m[1] !== 'href') { addTrigger('attr', m[1], e.getAttribute(m[1]), e); found.push('attr:' + m[1]); break; } }); });
    }); });
    return found.filter(function(x, i, arr){ return arr.indexOf(x) === i; }); }
  function paints(st){ if (!out.link) return null; var p = {};
    var c = st.getPropertyValue('color'), b = st.getPropertyValue('background-color') || st.getPropertyValue('background'), d = st.getPropertyValue('text-decoration') || st.getPropertyValue('text-decoration-line'), sp = st.getPropertyValue('letter-spacing');
    if (c && norm(c) === out.link.color) p.color = c;
    if (b && b !== 'none' && norm(b.split(' ')[0]) === out.link.background && out.link.background !== 'rgba(0, 0, 0, 0)') p.background = b;
    if (d && /underline/.test(d) && /underline/.test(out.link.decoration)) p.underline = d;
    if (sp && sp !== 'normal' && sp === out.link.spacing) p.spacing = sp;
    return Object.keys(p).length ? p : null; }
  function walk(list, sheet){ for (var i = 0; i < list.length; i++) { var r = list[i];
    if (r.cssRules && !r.selectorText) { var cond = r.conditionText || (r.media && r.media.mediaText); if (!cond || matchMedia(cond).matches) walk(r.cssRules, sheet); continue; }
    if (!r.selectorText || !r.style) continue;
    var hit = false; try { hit = links.some(function(l){ return l.matches(r.selectorText); }); } catch (_) {}
    if (!hit) continue;
    var p = paints(r.style); if (!p) continue;
    out.rules.push({ selector: r.selectorText.length > 395 ? r.selectorText.slice(0, 300) + '…' : r.selectorText, keepable: r.selectorText.length <= 395, sheet: sheet, props: p, triggers: triggersOf(r.selectorText) }); } }
  Array.prototype.forEach.call(document.styleSheets, function(sh){ var name = sh.href || (sh.ownerNode && sh.ownerNode.id ? '#' + sh.ownerNode.id : 'a <style> in the page');
    try { walk(sh.cssRules, name); } catch (_) { out.unreadable.push(name); } });
  probe.remove();
  var named = /accessib|a11y|disabilit|userway|acsb|equalweb|audioeye|recite|uwy/i, n = 0;
  document.querySelectorAll('[data-cg-a11yctl]').forEach(function(e){ e.removeAttribute('data-cg-a11yctl'); });
  Array.prototype.forEach.call(document.querySelectorAll('button,a,[role=button],[tabindex],div[id],span[id]'), function(e){
    if (!vis(e) || out.controls.length >= 6) return;
    var label = [e.getAttribute('aria-label'), e.getAttribute('title'), e.id, typeof e.className === 'string' ? e.className : '', e.tagName === 'A' || e.tagName === 'BUTTON' ? e.textContent : ''].filter(Boolean).join(' ').replace(/\\s+/g, ' ').slice(0, 160);
    if (!named.test(label)) return; if (e.closest('[data-cg-a11yctl]')) return;
    e.setAttribute('data-cg-a11yctl', String(++n)); out.controls.push({ n: n, label: (e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent || e.id || '').replace(/\\s+/g, ' ').trim().slice(0, 80), kind: e.tagName.toLowerCase() }); });
  [['UserWay', 'UserWay'], ['acsbJS', 'accessiBe'], ['INDmenu', 'EqualWeb'], ['AudioEye', 'AudioEye'], ['Recite', 'Recite Me']].forEach(function(w){ if (window[w[0]]) out.widgets.push(w[1]); });
  return out;
})()`;
}

function keepOffScript(list = []) {
  const items = (Array.isArray(list) ? list : []).filter(x => /^(class|attr|rule):./.test(String(x)));
  return `(function(items){
  var st = window.__cgKeepOff = window.__cgKeepOff || { removed: 0, rules: 0, items: [] }; st.items = items;
  function apply(){
    items.forEach(function(it){ var i = it.indexOf(':'), kind = it.slice(0, i), name = it.slice(i + 1);
      if (kind === 'class') document.querySelectorAll('.' + CSS.escape(name)).forEach(function(e){ e.classList.remove(name); st.removed++; });
      else if (kind === 'attr') { try { document.querySelectorAll('[' + CSS.escape(name) + ']').forEach(function(e){ e.removeAttribute(name); st.removed++; }); } catch (_) {} }
      else if (kind === 'rule') Array.prototype.forEach.call(document.styleSheets, function(sh){ var rs; try { rs = sh.cssRules; } catch (_) { return; }
        (function del(list, owner){ for (var j = list.length - 1; j >= 0; j--) { var r = list[j]; if (r.cssRules && !r.selectorText) del(r.cssRules, r); else if (r.selectorText === name) { try { owner.deleteRule(j); st.rules++; } catch (_) {} } } })(rs, sh); });
    }); }
  apply();
  if (!st.observing) { st.observing = true; var t = 0; try { new MutationObserver(function(){ clearTimeout(t); t = setTimeout(apply, 30); }).observe(document.documentElement, { attributes: true, childList: true, subtree: true }); } catch (_) {} }
  return { applied: items.length, removed: st.removed, rules: st.rules };
})(${JSON.stringify(items)})`;
}

module.exports = { offScript, sweepScript, traceScript, keepOffScript, A11Y_RE };
