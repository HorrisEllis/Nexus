'use strict';
/**
 * clear-glass/src/macros/recorder-script.js — the page-side recorder, as a script string (MR1, 0.60.57)
 * comp_id: cg.macros.recorder-script
 *
 * James, 2026-10-15: "this is wrong... needs to start recording a macro node file." The old recorder kept its events in window.__cgRecording, which
 * the page loses on every navigation, and gave them back only at Stop. This one keeps a queue that main drains every few hundred ms, and a page that
 * is about to go away writes what is left into sessionStorage, which the next page of the same site picks up. What it captures:
 *   click, input/change (value never read from a password field), Enter, scroll (throttled, per scroller, with its position), and the keys that move a
 *   page (arrows, Page Up/Down, Home, End, Space). Navigation is NOT captured here: the page cannot see it reliably, main sees it (live-recording.js).
 * Install is idempotent: a second run only resets the queue.
 */
const INSTALL = `(function () {
  var S = window.__cgRecState || (window.__cgRecState = { q: [], last: {} });
  try { var saved = sessionStorage.getItem('__cgRecQ'); if (saved) { sessionStorage.removeItem('__cgRecQ'); S.q = JSON.parse(saved).concat(S.q); } } catch (e) {}
  if (!window.__cgRecInstalled) {
    window.__cgRecInstalled = true;
    var esc = function (v) { return (window.CSS && CSS.escape) ? CSS.escape(v) : String(v).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&'); };
    var uniq = function (s) { try { return document.querySelectorAll(s).length === 1; } catch (e) { return false; } };
    var selOf = function (el) {
      if (!el || el.nodeType !== 1) return null;
      if (el.id && uniq('#' + esc(el.id))) return '#' + esc(el.id);
      var tag = el.tagName.toLowerCase(), attrs = ['name', 'data-testid', 'data-test', 'aria-label', 'placeholder'];
      for (var i = 0; i < attrs.length; i++) { var v = el.getAttribute(attrs[i]); if (v) { var s = tag + '[' + attrs[i] + '="' + v.replace(/"/g, '\\\\"') + '"]'; if (uniq(s)) return s; } }
      var parts = [], cur = el;
      while (cur && cur.nodeType === 1 && parts.length < 5) {
        if (cur.id && uniq('#' + esc(cur.id))) { parts.unshift('#' + esc(cur.id)); break; }
        var t = cur.tagName.toLowerCase(), p = cur.parentElement, same = p ? Array.prototype.filter.call(p.children, function (c) { return c.tagName === cur.tagName; }) : [];
        parts.unshift(same.length > 1 ? t + ':nth-of-type(' + (same.indexOf(cur) + 1) + ')' : t);
        var j = parts.join(' > '); if (uniq(j)) return j;
        cur = p;
      }
      return parts.join(' > ');
    };
    var push = function (e) { e.url = location.href; e.ts = Date.now(); S.q.push(e); };
    ['click', 'input', 'change', 'submit'].forEach(function (type) {
      document.addEventListener(type, function (e) { var el = e.target; push({ type: type, sel: selOf(el), value: el && el.value, inputType: el && el.type }); }, true);
    });
    var NAVKEYS = { ArrowDown: 1, ArrowUp: 1, PageDown: 1, PageUp: 1, Home: 1, End: 1, ' ': 1 };
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { push({ type: 'keydown', key: 'Enter', sel: selOf(e.target) }); return; }
      var tag = e.target && e.target.tagName; if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag || '') || (e.target && e.target.isContentEditable)) return;   // typing, not paging
      if (NAVKEYS[e.key]) push({ type: 'keydown', key: e.key === ' ' ? 'Space' : e.key, sel: selOf(e.target) });
    }, true);
    document.addEventListener('scroll', function (e) {
      var el = e.target === document ? (document.scrollingElement || document.documentElement) : e.target; var key = el === (document.scrollingElement || document.documentElement) ? '' : (selOf(el) || '?');
      var now = Date.now(); if (S.last[key] && now - S.last[key] < 250) return; S.last[key] = now;
      push({ type: 'scroll', sel: key || null, y: Math.round(el.scrollTop || 0), h: el.scrollHeight || 0 });
    }, true);
    window.addEventListener('pagehide', function () { try { sessionStorage.setItem('__cgRecQ', JSON.stringify(S.q)); S.q = []; } catch (e) {} });
  }
  window.__cgRecDrain = function () { var q = S.q; S.q = []; return q; };
  return location.href;
})()`;
const DRAIN = '(window.__cgRecDrain ? window.__cgRecDrain() : [])';

module.exports = { INSTALL, DRAIN };
