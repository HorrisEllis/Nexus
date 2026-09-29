'use strict';
/**
 * lib/code-intel/text.js — the one tokenizer every code-intel index and query uses.
 * comp_id: nexus.lib.code-intel.text
 * UUID: nexus-lib-code-intel-text-v1-0000-2026-0927-jamesbrooks-001
 *
 * §0.39.273 CB3. Identifiers are indexed whole (`materializequiet`) AND split (`materialize`, `quiet`), so a query
 * that names the function finds it exactly and a query in plain words ("materialize quietly") still lands. Words are
 * stemmed lightly (plural, -ing, -ed) — enough that "chunks" finds "chunk" and "parsing" finds "parse", never so much
 * that two different identifiers collide.
 */

const STOP = new Set(('a an and are as at be by for from has have in is it its of on or that the this to was were will with not no '
  + 'if else return const let var function true false null undefined new typeof void this self def end do then elif fn pub '
  + 'use using import export default from require module exports async await catch try finally throw class extends '
  + 'we you our your can may must should would could all any each into out up so but also only just than when which who what '
  + 'how why where there here get set').split(/\s+/));

const CODE_KEYWORDS = new Set(['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'return', 'function', 'const', 'let', 'var',
  'new', 'this', 'typeof', 'instanceof', 'in', 'of', 'try', 'catch', 'finally', 'throw', 'class', 'extends', 'super', 'import', 'export', 'default',
  'from', 'async', 'await', 'yield', 'true', 'false', 'null', 'undefined', 'void', 'delete', 'static', 'get', 'set', 'def', 'self', 'None', 'True',
  'False', 'elif', 'pass', 'lambda', 'not', 'and', 'or', 'is', 'with', 'as', 'fn', 'pub', 'impl', 'struct', 'enum', 'mut', 'match', 'use', 'mod',
  'func', 'package', 'type', 'interface', 'public', 'private', 'protected', 'int', 'string', 'bool', 'boolean', 'number', 'any', 'require', 'module',
  'exports', 'console', 'log', 'end', 'then', 'nil', 'local']);

function stem(w) {
  if (w.length <= 4) return w;
  if (w.endsWith('ies') && w.length > 5) return w.slice(0, -3) + 'y';
  if (w.endsWith('sses')) return w.slice(0, -2);
  if (w.endsWith('ing') && w.length > 6) { const b = w.slice(0, -3); return /(.)\1$/.test(b) ? b.slice(0, -1) : b; }
  if (w.endsWith('ed') && w.length > 5 && !w.endsWith('eed')) { const b = w.slice(0, -2); return /(.)\1$/.test(b) ? b.slice(0, -1) : b; }
  if (w.endsWith('es') && /(ch|sh|x|z|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) return w.slice(0, -1);
  return w;
}

/** splitIdent('materializeQuiet_v2') -> ['materialize', 'quiet', 'v2'] */
function splitIdent(id) {
  return String(id)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_$\-./:]+/)
    .map(s => s.toLowerCase())
    .filter(Boolean);
}

/**
 * terms(text, { keepStop }) -> string[] — every searchable term in order (duplicates kept; callers count them).
 * Whole identifiers (lowercased) are emitted alongside their stemmed parts.
 */
function terms(text, { keepStop = false } = {}) {
  const out = [];
  const src = String(text || '');
  const re = /[A-Za-z_$][\w$]*|\d{2,}/g;
  let m;
  while ((m = re.exec(src))) {
    const w = m[0];
    const lw = w.toLowerCase().replace(/^\$+|\$+$/g, '');
    if (!lw) continue;
    const parts = splitIdent(w);
    if (parts.length > 1 && lw.length >= 3) out.push(lw.replace(/[$]/g, ''));
    for (const p of parts) {
      if (p.length < 2) continue;
      if (!keepStop && STOP.has(p)) continue;
      out.push(stem(p));
    }
  }
  return out;
}

/** identifiers(code) — identifier tokens with comments and string literals removed (c-like, python, ruby, shell) */
function stripCode(code, language = 'javascript') {
  let s = String(code || '');
  const hashComments = /^(python|ruby|elixir|bash|yaml|toml|perl|r|julia|powershell)$/.test(language);
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');
  if (!hashComments) s = s.replace(/(^|[^:\\"'`])\/\/[^\n]*/g, '$1');
  else s = s.replace(/(^|\s)#[^\n]*/g, '$1');
  if (language === 'python') s = s.replace(/("""|''')[\s\S]*?\1/g, ' ');
  // strings: keep the interpolations of template literals (they are code), drop the text
  s = s.replace(/`(?:[^`\\]|\\[\s\S])*`/g, (t) => (t.match(/\$\{[^}]*\}/g) || []).join(' '));
  s = s.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, ' ');
  return s;
}

/** identifiersOf(code, language) -> { names: Map(name -> firstOffset), pairs: Set('obj.prop'), thisMembers: Set(name) } */
function identifiersOf(code, language) {
  const s = stripCode(code, language);
  const names = new Map();
  const pairs = new Set();
  const thisMembers = new Set();
  const re = /([A-Za-z_$][\w$]*)(\s*\??\.\s*#?([A-Za-z_$][\w$]*))?/g;
  let m;
  while ((m = re.exec(s))) {
    const a = m[1];
    if (m.index > 0 && s[m.index - 1] === '.') continue;   // a property, reached through its object below
    if (!names.has(a)) names.set(a, m.index);
    if (m[3]) {
      if (a === 'this' || a === 'self') thisMembers.add(m[3]);
      else pairs.add(`${a}.${m[3]}`);
      re.lastIndex = m.index + m[0].length - m[3].length;   // let the property start the next match (a.b.c)
    }
  }
  // a lazy module getter used in place: _hat().getRepoHat(...) → the pair _hat.getRepoHat
  const lazy = /([A-Za-z_$][\w$]*)\(\s*\)\s*\.\s*([A-Za-z_$][\w$]*)/g;
  while ((m = lazy.exec(s))) if (!(m.index > 0 && s[m.index - 1] === '.')) pairs.add(`${m[1]}.${m[2]}`);
  return { names, pairs, thisMembers };
}

/** inlineRequires(code) -> [{ specifier, member }] for require('./x').member / (await import('./x')).member */
function inlineRequires(code) {
  const out = [];
  const re = /(?:\b|_)require\(\s*['"`]([^'"`]+)['"`]\s*\)\s*\.\s*([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(String(code || '')))) out.push({ specifier: m[1], member: m[2] });
  return out;
}

module.exports = { terms, stem, splitIdent, stripCode, identifiersOf, inlineRequires, STOP, CODE_KEYWORDS };
