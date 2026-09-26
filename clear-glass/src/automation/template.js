'use strict';
/**
 * clear-glass/src/automation/template.js — {{placeholders}} for workflows and macros.
 * component_id: cg.automation.template
 *
 * §0.39.265 — James: "expand the workflow, and macros, as much as you can …
 * full enterprise grade." Every text field of every step can use values from
 * the run: what an earlier step returned, workflow variables, what triggered
 * the run, the loop item, the time. Data, never code: no eval, no arbitrary
 * JavaScript — a path lookup plus a fixed set of filters.
 *
 *   {{vars.price}}                     a workflow variable
 *   {{steps.Read price.output}}        what a step returned (by label or id)
 *   {{last}}                           what the previous step returned
 *   {{item}} {{index}}                 inside a loop
 *   {{trigger.url}}                    what started the run (event payload)
 *   {{run.id}} {{workflow}}             the run's id, the workflow's name
 *   {{memory.x}}                       a value kept between runs (Set variables: memory.x = …)
 *   {{error.message}}                  after a step failed and the run carried on
 *   {{now}}  {{now:YYYY-MM-DD HH:mm}}  the time, optionally formatted
 *   {{env.HOME}}                       NOT available — the environment stays out on purpose
 *
 * Filters, chained with | :
 *   upper lower trim length first last json number int round:2 default:"x"
 *   slice:0,10 replace:"a","b" join:", " split:"," urlencode base64 lines
 *   match:"regex"  (first capture group, or the whole match)
 *   date:"YYYY-MM-DD" keys values count sum
 *
 * render(template, ctx) — a string. A template that is exactly ONE placeholder
 * returns the value itself (an array stays an array), so a step's config can
 * pass lists and objects through.
 */

const RE = /\{\{\s*([^{}]+?)\s*\}\}/g;
const ONE = /^\s*\{\{\s*([^{}]+?)\s*\}\}\s*$/;

function _pad(n, w = 2) { return String(n).padStart(w, '0'); }
function formatDate(d, fmt = 'YYYY-MM-DD HH:mm:ss') {
  const t = d instanceof Date ? d : new Date(d);
  if (isNaN(t.getTime())) return '';
  return String(fmt)
    .replace(/YYYY/g, t.getFullYear()).replace(/MM/g, _pad(t.getMonth() + 1)).replace(/DD/g, _pad(t.getDate()))
    .replace(/HH/g, _pad(t.getHours())).replace(/mm/g, _pad(t.getMinutes())).replace(/ss/g, _pad(t.getSeconds()))
    .replace(/X/g, Math.floor(t.getTime() / 1000));
}

/** split "a | b:1,2 | c:\"x|y\"" on pipes outside quotes */
function _splitPipes(s) {
  const out = []; let cur = '', q = null;
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '|') { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}
function _args(s) {
  if (s == null) return [];
  const out = []; let cur = '', q = null, quoted = false;
  for (const ch of s) {
    if (q) { if (ch === q) { q = null; continue; } cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; quoted = true; continue; }
    if (ch === ',') { out.push(quoted ? cur : cur.trim()); cur = ''; quoted = false; continue; }
    cur += ch;
  }
  out.push(quoted ? cur : cur.trim());
  return out;
}

/** lookup(ctx, "steps.Read price.output") — dotted path; segments may contain spaces */
function lookup(ctx, pathStr) {
  const p = String(pathStr).trim();
  if (p === 'now') return new Date();
  if (p.startsWith('now:')) return formatDate(new Date(), p.slice(4));
  const parts = [];
  // steps.<label with dots?>… — labels are matched greedily against the steps map
  if (p.startsWith('steps.') && ctx && ctx.steps) {
    const rest = p.slice(6);
    const keys = Object.keys(ctx.steps).sort((a, b) => b.length - a.length);
    const k = keys.find(key => rest === key || rest.startsWith(key + '.'));
    if (k) {
      let v = ctx.steps[k];
      const tail = rest.slice(k.length + 1);
      for (const seg of tail ? tail.split('.') : []) v = v == null ? undefined : v[seg];
      return v;
    }
    return undefined;
  }
  for (const seg of p.split('.')) parts.push(seg);
  let v = ctx;
  for (const seg of parts) {
    if (v == null) return undefined;
    if (Array.isArray(v) && /^-?\d+$/.test(seg)) { const i = +seg; v = v[i < 0 ? v.length + i : i]; continue; }
    v = v[seg];
  }
  return v;
}

const FILTERS = {
  upper: (v) => String(v ?? '').toUpperCase(),
  lower: (v) => String(v ?? '').toLowerCase(),
  trim: (v) => String(v ?? '').trim(),
  length: (v) => (v == null ? 0 : typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).length : (v.length ?? String(v).length)),
  count: (v) => FILTERS.length(v),
  first: (v) => (Array.isArray(v) ? v[0] : String(v ?? '').charAt(0)),
  last: (v) => (Array.isArray(v) ? v[v.length - 1] : String(v ?? '').slice(-1)),
  json: (v) => JSON.stringify(v ?? null),
  parse: (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch (_) { return v; } },
  number: (v) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.eE+\-]/g, '')); return isNaN(n) ? null : n; },
  int: (v) => { const n = parseInt(String(v ?? '').replace(/[^0-9+-]/g, ''), 10); return isNaN(n) ? null : n; },
  round: (v, d = '0') => { const n = parseFloat(v); if (isNaN(n)) return null; const f = 10 ** (parseInt(d, 10) || 0); return Math.round(n * f) / f; },
  default: (v, d = '') => (v == null || v === '' || (Array.isArray(v) && !v.length) ? d : v),
  slice: (v, a = '0', b) => (Array.isArray(v) ? v : String(v ?? '')).slice(parseInt(a, 10) || 0, b === undefined || b === '' ? undefined : parseInt(b, 10)),
  replace: (v, a = '', b = '') => String(v ?? '').split(a).join(b),
  join: (v, sep = ', ') => (Array.isArray(v) ? v.map(x => (typeof x === 'object' ? JSON.stringify(x) : x)).join(sep) : String(v ?? '')),
  split: (v, sep = ',') => String(v ?? '').split(sep).map(x => x.trim()).filter(x => x !== ''),
  lines: (v) => String(v ?? '').split(/\r?\n/).map(x => x.trim()).filter(Boolean),
  urlencode: (v) => encodeURIComponent(String(v ?? '')),
  base64: (v) => Buffer.from(String(v ?? '')).toString('base64'),
  match: (v, re = '') => { let r; try { r = new RegExp(re); } catch (_) { return null; } const m = String(v ?? '').match(r); return m ? (m[1] !== undefined ? m[1] : m[0]) : null; },
  date: (v, fmt) => formatDate(v == null || v === '' ? new Date() : (typeof v === 'number' || /^\d+$/.test(String(v)) ? +v : v), fmt),
  keys: (v) => (v && typeof v === 'object' ? Object.keys(v) : []),
  values: (v) => (v && typeof v === 'object' ? Object.values(v) : []),
  sum: (v) => (Array.isArray(v) ? v.reduce((a, x) => a + (parseFloat(x) || 0), 0) : parseFloat(v) || 0),
  pluck: (v, k) => (Array.isArray(v) ? v.map(x => (x && typeof x === 'object' ? x[k] : undefined)) : []),
  unique: (v) => (Array.isArray(v) ? [...new Set(v.map(x => (typeof x === 'object' ? JSON.stringify(x) : x)))].map(x => { try { return JSON.parse(x); } catch (_) { return x; } }) : v),
};

function evaluate(expr, ctx) {
  const [head, ...filters] = _splitPipes(expr);
  // a quoted literal: {{"hello" | upper}}
  let v = /^(["']).*\1$/.test(head) ? head.slice(1, -1) : /^-?\d+(\.\d+)?$/.test(head) ? parseFloat(head) : lookup(ctx, head);
  for (const f of filters) {
    const m = f.match(/^([a-z]+)(?::(.*))?$/i);
    if (!m) continue;
    const fn = FILTERS[m[1]];
    if (!fn) throw new Error(`unknown filter "${m[1]}" (known: ${Object.keys(FILTERS).join(', ')})`);
    v = fn(v, ..._args(m[2]));
  }
  return v;
}

function _str(v) {
  if (v == null) return '';
  if (v instanceof Date) return formatDate(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** render(value, ctx) — strings rendered; arrays/objects rendered deeply; everything else as is */
function render(value, ctx = {}) {
  if (typeof value === 'string') {
    const one = value.match(ONE);
    if (one) { const v = evaluate(one[1], ctx); return v instanceof Date ? formatDate(v) : v; }
    if (!value.includes('{{')) return value;
    return value.replace(RE, (_, expr) => _str(evaluate(expr, ctx)));
  }
  if (Array.isArray(value)) return value.map(v => render(v, ctx));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = render(v, ctx);
    return out;
  }
  return value;
}

/** placeholders(value) — every {{…}} used, for validation / the UI */
function placeholders(value) {
  const out = new Set();
  const walk = (v) => {
    if (typeof v === 'string') { let m; RE.lastIndex = 0; while ((m = RE.exec(v))) out.add(m[1].trim()); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(value);
  return [...out];
}

module.exports = { render, evaluate, lookup, placeholders, formatDate, FILTERS };
