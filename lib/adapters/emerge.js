'use strict';
/**
 * lib/adapters/emerge.js — the Emerge (.eg) adapter (0.60.286 FA1): Emerge's own language as components, so a project written in it
 * (Emerge itself: its native compiler, its core) is on the spine like any other.
 * comp_id: nexus.lib.adapters.emerge
 * UUID: nexus-lib-adapters-emerge-v1-0000-2026-1029-jamesbrooks-001
 * Spec: docs/project-spine.spec MOD-ADAPTERS · Map: docs/2026-10-29-finish-any-project-phasemap.spec FA1
 *
 * Read from Emerge's own MAP.md (emerge 1.7.2): a module is reached with `use "./path.eg" as name`; top-level units are fn, kind,
 * template, component, compartment, test, let and var. Braces and // comments as in JavaScript, so code-intel's brace scan reads the
 * depth. Parse answers unknown: the checker is Emerge's own (node lang/eg.js check, or its native binary), not Nexus's to run here.
 */

const { lineInfo } = require('../code-intel/structure.js');

const MODULE_ID = 'nexus.lib.adapters.emerge';
const VERSION = '1.0.0';
const TOP = /^(?:pub\s+)?(fn|kind|template|component|compartment|test|let|var|axiom|use)\b\s*("?[A-Za-z_][\w.]*"?)?/;

function parse() { return { verdict: 'unknown', why: "Emerge's checker is its own (lang/eg.js check / the native binary)" }; }

function units(text) {
  const lines = String(text || '').split('\n');
  const info = lineInfo(String(text || ''), 'javascript').lines;
  const starts = [];
  for (let i = 0; i < lines.length; i++) { const r = info[i]; if (r && !r.blank && !r.comment && r.depth === 0 && r.paren === 0 && /\S/.test(lines[i]) && !/^\s/.test(lines[i]) && !/^[}\])]/.test(lines[i])) starts.push(i); }
  const out = [];
  for (let k = 0; k < starts.length; k++) {
    let a = starts[k]; while (a > 0 && /^\s*\/\//.test(lines[a - 1])) a--;
    let end = (k + 1 < starts.length ? starts[k + 1] : lines.length) - 1;
    while (end > starts[k] && (!lines[end].trim() || /^\s*\/\//.test(lines[end]))) end--;
    const m = TOP.exec(lines[starts[k]].trim());
    const kind = m ? m[1] : 'statement';
    const name = m && m[2] ? m[2].replace(/"/g, '') : null;
    out.push({ kind, name, names: name && kind !== 'test' && kind !== 'use' ? [name] : [], start: a + 1, end: end + 1, section: null, exported: kind === 'fn' || kind === 'let' });
  }
  return out;
}

function symbols(text) { return units(text).filter(u => u.exported && u.name).map(u => u.name); }

function dependencies(text) {
  const out = []; const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i++) { const m = /^\s*use\s+"([^"]+)"(?:\s+as\s+([A-Za-z_]\w*))?/.exec(lines[i]); if (m) out.push({ spec: m[1], kind: 'use', line: i + 1, as: m[2] || null }); }
  return out;
}

module.exports = {
  id: 'emerge', language: 'emerge', MODULE_ID, VERSION, extensions: ['.eg'],
  sample: 'use "./lib/stats.eg" as stats\n\nfn mean(xs) {\n  return sum(xs) / len(xs)\n}\n\nlet version = "1"\n',
  parse, units, symbols, dependencies,
};
