'use strict';
/**
 * lib/adapters/javascript.js — the JavaScript adapter (AD2, sliced in 0.60.286 FA1): what the new project tools need from JS, behind
 * the adapter contract (lib/adapters/contract.js).
 * comp_id: nexus.lib.adapters.javascript
 * UUID: nexus-lib-adapters-javascript-v1-0000-2026-1029-jamesbrooks-001
 * Spec: docs/project-spine.spec MOD-ADAPTERS · Map: docs/2026-10-29-finish-any-project-phasemap.spec FA1
 *
 * Wraps, does not rewrite (§8.6): lib/code-intel/structure.js lineInfo (each line's depth, and whether it starts a statement, with
 * strings, comments, templates and regex skipped) and lib/code-intel/decls.js matchDecl (what a statement declares). Parse is the
 * engine's own: node --check over stdin. A scanner, not a parser: a file whose braces do not balance answers its units as unsure.
 */

const { spawnSync } = require('child_process');
const { lineInfo } = require('../code-intel/structure.js');
const { matchDecl } = require('../code-intel/decls.js');
const { identifiersOf, stripCode } = require('../code-intel/text.js');

const MODULE_ID = 'nexus.lib.adapters.javascript';
const VERSION = '1.0.0';
const BANNER = /^\s*\/\/\s*[─━═\-=]{2,}\s*(.*?)\s*[─━═\-=]*\s*$/;   // // ── Locate kernel ──────
const ID = /^[A-Za-z_$][\w$]*$/;

function _lang(p) { return /\.(ts|tsx)$/i.test(p || '') ? 'typescript' : 'javascript'; }
function isModuleSyntax(text) { return /^\s*(import\s[\s\S]*?from\s*['"]|import\s*['"]|export\s+(default|const|let|var|function|class|async|\{|\*))/m.test(String(text || '')); }

/** parse(text, path) — node --check over stdin (CommonJS, or ESM when the file is .mjs or uses import/export) */
function parse(text, p = '') {
  if (/\.(ts|tsx)$/i.test(p)) return { verdict: 'unknown', why: 'TypeScript is not checked without a compiler' };
  const esm = /\.mjs$/i.test(p) || (!/\.cjs$/i.test(p) && isModuleSyntax(text));
  const r = spawnSync(process.execPath, [...(esm ? ['--input-type=module'] : []), '--check'], { input: String(text || ''), encoding: 'utf8', timeout: 15000 });
  if (r.error) return { verdict: 'unknown', why: r.error.message };
  if (r.status === 0) return { verdict: 'pass' };
  const m = /\n([A-Za-z]*Error: [^\n]+)/.exec(r.stderr || '');
  return { verdict: 'fail', error: m ? m[1] : String(r.stderr || '').split('\n').filter(Boolean).slice(-1)[0] || 'syntax error' };
}

/** the names a top-level declaration binds: function f / class C / const a = … / const { a, b: c, ...d } = … / const [x, y] = … */
function bindingNames(stmt) {
  const t = String(stmt || '');
  let m = /^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(t) || /^\s*(?:export\s+(?:default\s+)?)?class\s+([A-Za-z_$][\w$]*)/.exec(t);
  if (m) return [m[1]];
  m = /^\s*(?:export\s+)?(const|let|var)\s+/.exec(t);
  if (!m) return [];
  const rest = t.slice(m[0].length);
  const names = [];
  // walk declarators at depth 0 until the statement ends: name or pattern, then = expression up to a depth-0 comma
  let i = 0, depth = 0;
  const readPattern = () => {
    const start = i; let d = 0;
    for (; i < rest.length; i++) { const c = rest[i]; if ('{['.includes(c)) d++; else if ('}]'.includes(c)) { d--; if (d === 0) { i++; break; } } else if (d === 0 && /[=;,\n]/.test(c)) break; }
    return rest.slice(start, i).trim();
  };
  for (let guard = 0; guard < 50 && i < rest.length; guard++) {
    while (i < rest.length && /\s/.test(rest[i])) i++;
    const pat = readPattern();
    if (ID.test(pat)) names.push(pat);
    else if (/^[{[]/.test(pat)) {
      for (const part of pat.slice(1, -1).split(',')) {
        const p = part.trim(); if (!p) continue;
        const n = (p.includes(':') ? p.split(':').pop() : p).split('=')[0].trim().replace(/^\.\.\./, '');
        if (ID.test(n)) names.push(n);
      }
    } else break;
    // skip the initializer to the next depth-0 comma or the statement's end
    let s = null; depth = 0;
    for (; i < rest.length; i++) {
      const c = rest[i];
      if (s) { if (c === '\\') { i++; continue; } if (c === s) s = null; continue; }
      if (c === '"' || c === "'" || c === '`') { s = c; continue; }
      if ('{[('.includes(c)) depth++; else if ('}])'.includes(c)) depth--;
      else if (depth === 0 && c === ',') { i++; break; }
      else if (depth === 0 && c === ';') { i = rest.length; break; }
    }
  }
  return [...new Set(names)];
}

/**
 * units(text, path) → top-level units, 1-based inclusive lines. Leading comments attach to the unit below them. A banner comment
 * (// ── name ──) opens a section; every unit after it carries that section until the next banner.
 */
function units(text, p = '') {
  const src = String(text || '');
  const lines = src.split('\n');
  const li = lineInfo(src, _lang(p));
  const info = li.lines;
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    const r = info[i]; if (!r || r.blank || r.comment || !r.logical) continue;
    if (r.depth !== 0 || r.paren !== 0) continue;
    starts.push(i);
  }
  if (!starts.length) return [];
  const attached = starts.map(s => { let a = s; while (a > 0 && info[a - 1] && !info[a - 1].blank && info[a - 1].comment) a--; return a; });
  attached[0] = 0;
  const out = [];
  let section = null;
  for (let k = 0; k < starts.length; k++) {
    const a = attached[k];
    for (let i = (k ? attached[k - 1] : 0); i <= a; i++) { const b = BANNER.exec(lines[i] || ''); if (b && b[1] && info[i] && info[i].comment) section = b[1].replace(/\s+/g, ' ').trim(); }
    for (let i = a; i < starts[k]; i++) { const b = BANNER.exec(lines[i] || ''); if (b && b[1]) section = b[1].replace(/\s+/g, ' ').trim(); }
    let end = (k + 1 < starts.length ? attached[k + 1] : lines.length) - 1;
    while (end > starts[k] && !lines[end].trim()) end--;
    const first = lines[starts[k]].trim();
    const stmt = lines.slice(starts[k], end + 1).join('\n');
    const d = matchDecl('javascript', first) || {};
    let kind;
    if (/^['"]use strict['"]/.test(first)) kind = 'directive';
    else if (/^module\.exports\b|^exports\.[\w$]+\s*=|^module\.exports\.[\w$]+\s*=/.test(first)) kind = 'export';
    else if (/^(?:export\s+)?(?:async\s+)?function\b/.test(first)) kind = 'function';
    else if (/^(?:export\s+)?class\b/.test(first)) kind = 'class';
    else if (/^(const|let|var)\s/.test(first)) kind = d.kind === 'import' || /=\s*require\(\s*['"][^'"]+['"]\s*\)\s*(\.[\w$]+\s*)?;?\s*$/.test(stmt.split('\n')[0]) ? 'require' : (/^const\b/.test(first) ? 'const' : first.split(/\s/)[0]);
    else if (/^import\b/.test(first)) kind = 'import';
    else kind = 'statement';
    const names = ['function', 'class', 'const', 'let', 'var', 'require'].includes(kind) ? bindingNames(stmt) : [];
    const req = kind === 'require' ? (/require\(\s*['"]([^'"]+)['"]\s*\)/.exec(stmt) || [])[1] || null : null;
    out.push({ kind, name: names[0] || d.name || null, names, start: a + 1, stmtStart: starts[k] + 1, end: end + 1, section, exported: !!d.exported, require: req,
      ...(kind === 'function' && /\bfunction\s*\*?\s*[A-Za-z_$][\w$]*\s*\(/.test(first) && !/^(const|let|var)/.test(first) ? { hoisted: true } : {}) });
  }
  if (li.fallback) for (const u of out) u.unsure = li.fallback;
  return out;
}

/** symbols(text) → the names module.exports / exports.x / export statements give, or null when the file's exports cannot be read */
function symbols(text) {
  const src = String(text || '');
  const out = new Set();
  let m;
  const obj = /module\.exports\s*=\s*(?:Object\.freeze\(\s*)?\{([\s\S]*?)\}\s*\)?\s*;?\s*(?:\n|$)/g;
  while ((m = obj.exec(src))) {
    let depth = 0, cur = '';
    for (const c of m[1]) { if ('{[('.includes(c)) depth++; else if ('}])'.includes(c)) depth--; if (c === ',' && depth === 0) { _key(cur, out); cur = ''; } else cur += c; }
    _key(cur, out);
  }
  const prop = /(?:^|[^.\w$])(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = prop.exec(src))) out.add(m[1]);
  const esm = /\bexport\s*\{([^}]*)\}/g;
  while ((m = esm.exec(src))) for (const part of m[1].split(',')) { const n = part.trim().split(/\s+as\s+/).pop().trim(); if (ID.test(n)) out.add(n); }
  const decl = /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function\s*\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
  while ((m = decl.exec(src))) out.add(m[1]);
  if (/^\s*export\s+default\b/m.test(src)) out.add('default');
  if (!out.size && /module\.exports\s*=\s*[A-Za-z_$]/.test(src)) return null;   // module.exports = someValue: names unknown without running it
  return [...out].sort();
}
function _key(part, out) {
  const p = String(part).replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim(); if (!p || p.startsWith('...')) return;
  const k = p.split(/[:(]/)[0].trim().replace(/^(async|get|set)\s+/, '').replace(/^['"]|['"]$/g, '');
  if (/^[A-Za-z_$][\w$-]*$/.test(k)) out.add(k);
}

/** dependencies(text) → every require / import / dynamic import / re-export, with its line; comment lines skipped */
function dependencies(text, p = '') {
  const lines = String(text || '').split('\n');
  const info = lineInfo(String(text || ''), _lang(p)).lines;   // a line that starts inside a string or template is generated text, not code
  const out = [];
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    if (info[i] && info[i].inCode === false && !info[i].inComment) continue;
    let l = lines[i];
    if (inBlock) { const e = l.indexOf('*/'); if (e < 0) continue; l = l.slice(e + 2); inBlock = false; }
    l = l.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const open = l.indexOf('/*'); if (open >= 0 && l.indexOf('*/', open) < 0) { l = l.slice(0, open); inBlock = true; }
    if (/^\s*\/\//.test(l)) continue;
    l = l.replace(/(^|[^:'"`\\])\/\/[^'"`]*$/, '$1');
    let m;
    const re = /\brequire\(\s*(['"`])([^'"`$]+)\1\s*\)|\bimport\s*\(\s*(['"`])([^'"`$]+)\3\s*\)|\b(?:import|export)\b[^'"`;]*?\bfrom\s*(['"])([^'"]+)\5|^\s*import\s*(['"])([^'"]+)\7/g;
    while ((m = re.exec(l))) {
      const spec = m[2] || m[4] || m[6] || m[8];
      if (spec.includes('${') || _inString(l, m.index)) continue;   // a template's text (code this file generates), not a dependency of this file
      out.push({ spec, kind: m[2] ? 'require' : m[4] ? 'dynamic-import' : 'import', line: i + 1 });
    }
  }
  return out;
}

/** identifiers(text) → the names a piece of code uses (strings and comments skipped, properties excluded) — what a split needs to
 *  know which top-level names each unit reaches. Optional in the contract: only an adapter that can split a file answers it. */
function identifiers(text) { return new Set(identifiersOf(String(text || ''), 'javascript').names.keys()); }
/** code(text) → the text with comments and string contents removed (template interpolations kept): what actually runs */
function code(text) { return stripCode(String(text || ''), 'javascript'); }

/** whether position idx of a line (which starts in code) sits inside a string literal: emitted code like out.push(`require('x')`) */
function _inString(l, idx) {
  let q = null;
  for (let i = 0; i < idx; i++) { const c = l[i]; if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; } else if (c === '"' || c === "'" || c === '`') q = c; }
  return !!q;
}

module.exports = {
  id: 'javascript', language: 'javascript', MODULE_ID, VERSION,
  extensions: ['.js', '.cjs', '.mjs', '.jsx', '.ts', '.tsx'],
  sample: "'use strict';\nconst path = require('path');\n// ── one ──\nfunction a() { return path.sep; }\nmodule.exports = { a };\n",
  parse, units, symbols, dependencies, identifiers, code, bindingNames, isModuleSyntax, BANNER,
};
