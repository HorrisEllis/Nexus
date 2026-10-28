'use strict';
/**
 * clear-glass/src/page/option-match.js — which of a dropdown's options a wanted text means, and whether the dropdown shows it afterwards
 * (FP2, 0.60.221). Pure: the options and the wanted text in, one answer out; ambiguous and missing are answers too, never a guess.
 * Spec: clear-glass/spec/flow-cores.spec MOD-FC-OPTION · Map: docs/2026-10-28-first-principles-phasemap.spec FP2
 *
 * James, 2026-10-28: "it needs to do the drop down menus. one by one" · "the drop down doesn't work" · "only whats needed for a fact."
 * The fact (F2): the gig autofill skipped Fiverr's dropdowns (gig.js:244) and the driver's select took a native <select> only. Whatever opens
 * a dropdown, this decides which option was meant: the strongest rule that finds exactly one option wins.
 */

const RULE_ORDER = Object.freeze(['exact', 'case', 'normalized', 'prefix', 'contains', 'number']);

/** normalize(s) — lower case, accents folded, punctuation to spaces, spaces collapsed */
function normalize(s) {
  return String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

function _firstNumber(s) { const m = /(\d+(?:\.\d+)?)/.exec(String(s == null ? '' : s)); return m ? Number(m[1]) : null; }

/** matchOption(options, want) → { ok, index, option, by, candidates, why } */
function matchOption(options, want) {
  const opts = Array.isArray(options) ? options.map(o => String(o == null ? '' : (typeof o === 'object' ? (o.text ?? o.label ?? '') : o))) : [];
  if (!opts.length) return { ok: false, index: null, option: null, by: null, candidates: [], why: 'no options' };
  const w = String(want == null ? '' : want);
  if (!w.trim()) return { ok: false, index: null, option: null, by: null, candidates: opts, why: 'nothing wanted' };
  const wl = w.trim().toLowerCase(), wn = normalize(w), wnum = /^\s*\d+(?:\.\d+)?\s*$/.test(w) ? Number(w) : null;
  const tests = {
    exact: (o) => o === w,
    case: (o) => o.trim().toLowerCase() === wl,
    normalized: (o) => !!wn && normalize(o) === wn,
    prefix: (o) => !!wn && (normalize(o) + ' ').startsWith(wn + ' '),
    contains: (o) => !!wn && (' ' + normalize(o) + ' ').includes(' ' + wn + ' '),
    number: (o) => wnum !== null && _firstNumber(o) === wnum,
  };
  for (const by of RULE_ORDER) {
    const hits = [];
    opts.forEach((o, i) => { if (tests[by](o)) hits.push(i); });
    if (hits.length === 1) return { ok: true, index: hits[0], option: opts[hits[0]], by, candidates: [], why: null };
    if (hits.length > 1) return { ok: false, index: null, option: null, by, candidates: hits.map(i => opts[i]), why: `"${w}" matches ${hits.length} options by ${by}` };
  }
  return { ok: false, index: null, option: null, by: null, candidates: opts, why: `no option matches "${w}"` };
}

/** shows(shown, option) → the dropdown, read back after a choice, shows that option */
function shows(shown, option) {
  const s = normalize(shown), o = normalize(option);
  return !!o && (s === o || (' ' + s + ' ').includes(' ' + o + ' '));
}

module.exports = { normalize, matchOption, shows, RULE_ORDER };
