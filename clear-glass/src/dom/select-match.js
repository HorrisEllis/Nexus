'use strict';
/**
 * clear-glass/src/dom/select-match.js — resolve a desired value to the best <option> in a native <select> (DD1, 0.60.298).
 * comp_id: cg.dom.select-match · owner: Clear Glass (the DOM mesh, src/dom/archaeology.js, interacts with the page)
 *
 * James, 2026-10-30: "Make sure it works for all elements. Including drop downs."
 *
 * Why: autofill fills a field by setting its value, but a native <select> only changes when the value EQUALS an option's
 * value. A profile holds "United States"; the option's value is often "US" (its visible text is "United States"). So a
 * straight value-set on a dropdown did nothing. bestOption() picks the option a person would — by value, then visible text,
 * then a conservative prefix/contains — so "United States" selects the US option, "5" selects "5 years", "Oregon" selects OR.
 *
 * ONE source of truth: this function is required here for tests AND its SOURCE is interpolated into the in-page DOM mesh
 * script (archaeology.js DOM_OBSERVER_SCRIPT can only run strings in the page — it cannot require), so the page and the
 * tests run byte-for-byte the same matcher.
 *
 *   bestOption(options, want) -> the matching { value, text, label } option, or null (no silent wrong pick — §1.2)
 *     options: [{ value, text, label? }]  (from a <select>'s el.options: o.value, o.text, o.label)
 *     want:    the string the profile would fill
 */
function bestOption(options, want) {
  if (!Array.isArray(options) || !options.length) return null;
  var norm = function (s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); };
  var alnum = function (s) { return norm(s).replace(/[^a-z0-9]/g, ''); };
  var w = norm(want);
  if (!w) return null;
  var wa = alnum(want);
  var cand = options.filter(function (o) { return o && o.value !== undefined && o.value !== null; });
  var find = function (fn) { for (var i = 0; i < cand.length; i++) if (fn(cand[i])) return cand[i]; return null; };
  return find(function (o) { return String(o.value) === String(want); })                                   // exact value
      || find(function (o) { return norm(o.value) === w; })                                                // value, case-insensitive
      || find(function (o) { return norm(o.text) === w; })                                                 // visible text, ci
      || find(function (o) { return norm(o.label) === w; })                                                // label attr, ci
      || find(function (o) { var t = alnum(o.text); return t && t === wa; })                               // text ignoring punctuation
      || find(function (o) { var t = alnum(o.value); return t && t === wa; })                              // value ignoring punctuation
      || find(function (o) { var t = norm(o.text); return w.length >= 3 && t && (t.indexOf(w) === 0 || (t.length >= 3 && w.indexOf(t) === 0)); }) // prefix (>=3 chars, no short false hits)
      || find(function (o) { var t = norm(o.text); return w.length >= 4 && t.length >= 4 && (t.indexOf(w) !== -1 || w.indexOf(t) !== -1); })      // contains (>=4 chars)
      || null;
}

// §DD1 — booleans for a checkbox: a clear yes/no only, else leave it (never a silent flip). Returns true | false | null.
function boolOf(want) {
  var w = String(want == null ? '' : want).trim().toLowerCase();
  if (/^(yes|y|true|1|on|checked|authorized|authorised)$/.test(w)) return true;
  if (/^(no|n|false|0|off|unchecked)$/.test(w)) return false;
  return null;
}

module.exports = { bestOption, boolOf, SOURCE: bestOption.toString(), BOOL_SOURCE: boolOf.toString() };
