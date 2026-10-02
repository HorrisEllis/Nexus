'use strict';
/**
 * lib/nexstore/writers.js — every place the code persists data, each with its node type or its stated reason (0.39.300).
 * component_id: nexus.lib.nexstore.writers
 * Map: docs/2026-10-01-idearium-agent-ready-master-phasemap.spec (DT1_persistence_census) — second by leverage in
 * intelligence's gap synthesis once N0–N2 closed. N0 (lib/nexstore/census.js) found every data SHAPE in the tree; this
 * finds every WRITER in the code, so a new one cannot appear unseen (I0: anything that persists is a node type).
 *
 * census({ root, register }) → { writers, stats, register }
 *   A writer is a call that persists: fs.writeFileSync / writeFile / appendFileSync / appendFile / a _writeAtomic with JSON
 *   in reach, or a table write (syncTable, appendRow). Its key is stable across edits: file · call · target (the first
 *   argument, normalised) — never a line number.
 *   Each writer is, in order:
 *     typed    its target names a catalogued type (docs/nexstore-type-catalogue.yaml) or a node schema (lib/node-schemas)
 *     reason   docs/nexstore-writers.yaml gives a reason (a cache view, an export, the store engine itself, …)
 *     owed     in the register, but a type or a reason is still owed — listed, counted, never hidden
 *     new      not in the register at all: the census test fails on it (a new JSON writer must be declared)
 * CLI: node lib/nexstore/writers.js [--write]   --write adds new writers to the register as owed (an explicit act)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const REGISTER = 'docs/nexstore-writers.yaml';
const SKIP = /(^|\/)(node_modules|\.git|_archive|archive|unintegrated|dist|fixtures|output|projects|tests|test|__tests__|data|vendor|coverage|\.claude)(\/|$)/;
const CALL = /\b(writeFileSync|writeFile|appendFileSync|appendFile|syncTable|appendRow|_writeAtomic)\s*\(/g;
const FILE_CALLS = new Set(['writeFileSync', 'writeFile', 'appendFileSync', 'appendFile', '_writeAtomic']);

/** the first argument of the call that opens at text[i] (just past the "(") — up to the first top-level comma */
function firstArg(text, i) {
  let depth = 0, q = null, out = '';
  for (let j = i; j < text.length && out.length < 300; j++) {
    const ch = text[j];
    if (q) { out += ch; if (ch === '\\') { out += text[++j] || ''; continue; } if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; out += ch; continue; }
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) { if (depth === 0) break; depth--; }
    if (ch === ',' && depth === 0) break;
    out += ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** what the target names: a table, or the .json/.jsonl file names in reach (literals in the arg, or in its const) */
function namesOf(arg, text) {
  const lit = [...arg.matchAll(/['"`]([^'"`]+)['"`]/g)].map(m => m[1]);
  const idents = (arg.match(/^[A-Za-z_$][\w$]*$/) || arg.match(/^(?:this\.)?([A-Za-z_$][\w$]*)$/)) ? [arg.replace(/^this\./, '')] : [...arg.matchAll(/\b([A-Z_][A-Z0-9_]{2,}|[a-z][A-Za-z0-9]*(?:Path|File|FILE|PATH|Dir|DIR))\b/g)].map(m => m[1]);
  for (const id of idents) {
    const m = text.match(new RegExp(`(?:const|let|var)\\s+${id.replace(/\$/g, '\\$')}\\s*=\\s*([^;\\n]{1,240})`));
    if (m) lit.push(...[...m[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map(x => x[1]));
  }
  return lit.map(s => s.replace(/\$\{[^}]*\}/g, '*'));
}

function codeFiles(root) {
  const out = [];
  (function walk(dir, depth) {
    if (depth > 12) return;
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name), r = path.relative(root, p).split(path.sep).join('/');
      if (SKIP.test(r)) continue;
      if (e.isDirectory()) walk(p, depth + 1);
      else if (/\.(c|m)?js$/.test(e.name) && !/\.(test|spec|min)\.(c|m)?js$/.test(e.name)) out.push(r);
    }
  })(root, 0);
  return out.sort();
}

/** the top-level keys of the object literal that opens at text[i] (a table row: its fields as the code writes them) */
function keysOf(text, i) {
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== '{') return [];
  const keys = []; let depth = 0, q = null, tok = '';
  for (let j = i; j < text.length && j < i + 4000; j++) {
    const ch = text[j];
    if (q) { if (ch === '\\') { j++; continue; } if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
    if ('([{'.includes(ch)) { depth++; if (depth === 1) { tok = ''; continue; } }
    if (')]}'.includes(ch)) { depth--; if (depth === 0) { const k = tok.trim().match(/^([A-Za-z_$][\w$]*)$/); if (k) keys.push(k[1]); break; } }
    if (depth !== 1) continue;
    if (ch === ',' ) { const k = tok.trim().match(/^([A-Za-z_$][\w$]*)$/); if (k) keys.push(k[1]); tok = ''; continue; }
    if (ch === ':') { const k = tok.trim().match(/^([A-Za-z_$][\w$]*)$/); if (k) keys.push(k[1]); tok = '\u0000'; continue; }
    if (tok !== '\u0000') tok += ch;
  }
  return keys.filter(k => k !== '...');
}

/** constIndex(root, files) → Map(NAME → literal) — NAME = 'x' declared once in the tree, so A.NAME resolves */
function constIndex(root, files) {
  const seen = new Map();
  for (const f of files) {
    let text; try { text = fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { continue; }
    for (const m of text.matchAll(/\b([A-Z][A-Z0-9_]*TABLE[A-Z0-9_]*)\s*[:=]\s*['"`]([\w.-]+)['"`]/g)) {
      const prev = seen.get(m[1]); seen.set(m[1], prev === undefined || prev === m[2] ? m[2] : null);   // two different values: ambiguous, unresolved
    }
  }
  return seen;
}

/**
 * viaModule(root, file, text, arg) → the literal a constant names, followed through the file's own import:
 *   A.NAME  where A = require('m') / await import('m') / import * as A from 'm'
 *   NAME    where const { NAME } = X and X is such a module (or NAME is imported from one)
 */
function viaModule(root, file, text, arg) {
  const m = arg.match(/^(?:([A-Za-z_$][\w$]*)\.)?([A-Z][A-Z0-9_]*)$/); if (!m) return null;
  const [, obj, name] = m, esc = (x) => x.replace(/\$/g, '\\$');
  const modOf = (id) => { const r = text.match(new RegExp(`\\b${esc(id)}\\s*=\\s*(?:await\\s+)?(?:require|import)\\(\\s*['"]([^'"]+)['"]`)) || text.match(new RegExp(`import\\s+\\*\\s+as\\s+${esc(id)}\\s+from\\s+['"]([^'"]+)['"]`)); return r ? r[1] : null; };
  let spec = obj ? modOf(obj) : null;
  if (!obj) {
    const d = text.match(new RegExp(`\\{[^}]*\\b${name}\\b[^}]*\\}\\s*=\\s*(?:await\\s+)?(?:(?:require|import)\\(\\s*['"]([^'"]+)['"]|([A-Za-z_$][\\w$]*))`)) || text.match(new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`));
    if (d) spec = d[1] || (d[2] ? modOf(d[2]) : null);
  }
  if (!spec || !spec.startsWith('.')) return null;
  for (const cand of [spec, `${spec}.js`, `${spec}.mjs`, `${spec}/index.js`]) {
    let t; try { t = fs.readFileSync(path.join(root, path.dirname(file), cand), 'utf8'); } catch (_) { continue; }
    const v = t.match(new RegExp(`\\b${name}\\s*[:=]\\s*['"\`]([\\w.-]+)['"\`]`)); if (v) return v[1];
  }
  return null;
}

/** scan(root) → writers [{ key, file, line, call, target, names, fields }] */
function scan(root) {
  const writers = [];
  const files = codeFiles(root), consts = constIndex(root, files);
  for (const f of files) {
    let text; try { text = fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { continue; }
    if (!CALL.test(text)) { CALL.lastIndex = 0; continue; }
    CALL.lastIndex = 0;
    const lineAt = (i) => text.slice(0, i).split('\n').length;
    let m;
    while ((m = CALL.exec(text))) {
      if (/(function\s+|\.prototype\.)$/.test(text.slice(Math.max(0, m.index - 20), m.index))) continue;   // a definition, not a call
      const call = m[1], arg = firstArg(text, m.index + m[0].length);
      if (!arg) continue;
      const names = namesOf(arg, text);
      let fields = [];
      if (!FILE_CALLS.has(call)) {
        const mem = arg.match(/(?:^|\.)([A-Z][A-Z0-9_]*)$/);
        if (!names.length && mem) { const v = viaModule(root, f, text, arg) || consts.get(mem[1]); if (v) names.push(v); }
        const afterArg = text.indexOf(arg.slice(-Math.min(arg.length, 20)), m.index) + Math.min(arg.length, 20);
        const comma = text.indexOf(',', afterArg - 1);
        if (comma > 0 && comma - afterArg < 4) fields = keysOf(text, comma + 1);
      }
      if (FILE_CALLS.has(call)) {
        const stmt = text.slice(m.index, m.index + 400), end = stmt.search(/\)\s*;|\n\s*\n/);
        // the call's own statement, and up to four lines before it — stopping at the previous write (its data is its own)
        const before = text.slice(0, m.index).split('\n').slice(-5), back = [];
        for (let k = before.length - 1; k >= 0; k--) { if (k < before.length - 1 && /\b(writeFileSync|writeFile|appendFileSync|appendFile|syncTable|appendRow|_writeAtomic)\s*\(/.test(before[k])) break; back.unshift(before[k]); }
        const reach = back.join('\n') + (end > 0 ? stmt.slice(0, end) : stmt);
        // a helper that writes what its caller passes (atomicWrite, _writeAtomic, saveJson): the data is the caller's, the writer is here
        const helper = /(function\s+|const\s+|let\s+)\w*(atomic|Atomic|json|Json|JSON|save|Save|persist|Persist)\w*\s*(=\s*(\([^)]*\)|\w+)\s*=>|\()/.test(back.join('\n'));
        if (!helper && !/json|JSON|\.nex\b|\.ya?ml/.test(reach) && !names.some(n => /\.(jsonl?|nex|ya?ml)$/.test(n))) continue;   // not persisting data
      }
      const target = arg.length > 120 ? arg.slice(0, 117) + '…' : arg;
      writers.push({ key: `${f} · ${call} · ${target}`, file: f, line: lineAt(m.index), call, target, names, fields });
    }
  }
  // the same key twice in one file is one writer, seen at several lines
  const byKey = new Map();
  for (const w of writers) { const h = byKey.get(w.key); if (h) { h.lines.push(w.line); h.fields = Array.from(new Set([...h.fields, ...w.fields])); } else byKey.set(w.key, { ...w, lines: [w.line] }); }
  return Array.from(byKey.values());
}

/** the names the type system knows: catalogue type names (last segment), catalogue source basenames, node schema ids */
function knownTypes(root, yaml) {
  // tables: by table name (a type's last segment); files: by the data file's basename — each only when it names ONE type
  const tables = new Map(), files = new Map();
  const put = (m, k, v) => { if (!k) return; const prev = m.get(k); m.set(k, prev === undefined || prev === v ? v : null); };
  try {
    const cat = yaml.load(fs.readFileSync(path.join(root, 'docs', 'nexstore-type-catalogue.yaml'), 'utf8'));
    for (const t of cat.types || []) {
      put(tables, String(t.name).split('.').pop().replace(/@.*$/, ''), t.name);
      if (t.source && /\.(jsonl?|nex)$/.test(t.source)) put(files, path.basename(t.source), t.name);
    }
  } catch (_) { /* no catalogue: nothing typed by it */ }
  try { for (const f of fs.readdirSync(path.join(root, 'lib', 'node-schemas'))) if (f.startsWith('schema.')) { const id = f.slice(7); if (!tables.has(id)) tables.set(id, `schema.${id}`); } } catch (_) {}
  return { tables, files };
}

function loadRegister(root, yaml, file) {
  try { const d = yaml.load(fs.readFileSync(path.join(root, file || REGISTER), 'utf8')) || {}; return { rules: d.rules || [], writers: d.writers || {} }; }
  catch (_) { return { rules: [], writers: {} }; }
}

/** a rule: { match: <regex over the key>, reason } — a reason that covers a class of writers (the store engines, exports) */
function ruleFor(rules, key) { for (const r of rules) { try { if (new RegExp(r.match).test(key)) return r; } catch (_) {} } return null; }

function census({ root = ROOT, register = null, yaml = require('js-yaml') } = {}) {
  const reg = register || loadRegister(root, yaml);
  const known = knownTypes(root, yaml);
  const writers = scan(root).map(w => {
    const tableish = w.call === 'syncTable' || w.call === 'appendRow';
    const hit = tableish
      ? w.names.map(n => known.tables.get(n)).find(Boolean)
      : w.names.filter(n => /\.(jsonl?|nex)$/.test(n) && !path.basename(n).includes('*')).map(n => known.files.get(path.basename(n))).find(Boolean);
    const entry = reg.writers[w.key];
    if (hit) return { ...w, status: 'typed', type: hit };
    if (entry && entry.type) return { ...w, status: 'typed', type: entry.type };
    if (entry && entry.reason && !/^OWED\b/.test(entry.reason)) return { ...w, status: 'reason', reason: entry.reason };
    const rule = ruleFor(reg.rules, w.key);
    if (rule) return { ...w, status: 'reason', reason: rule.reason };
    if (entry) return { ...w, status: 'owed', reason: entry.reason || 'OWED' };
    return { ...w, status: 'new' };
  });
  const count = (s) => writers.filter(w => w.status === s).length;
  const bySystem = {};
  for (const w of writers) { const s = w.file.split('/')[0]; (bySystem[s] = bySystem[s] || { typed: 0, reason: 0, owed: 0, new: 0 })[w.status]++; }
  return { writers, stats: { writers: writers.length, files: new Set(writers.map(w => w.file)).size, typed: count('typed'), reason: count('reason'), owed: count('owed'), new: count('new'), bySystem }, register: reg };
}

/** registerYaml(c, yaml) — the register with every writer the census saw; a new one enters as owed */
function registerYaml(c, yaml) {
  const writers = {};
  for (const w of c.writers) {
    const prev = c.register.writers[w.key];
    if (w.status === 'typed' && !(prev && prev.type)) continue;          // typed by the catalogue: nothing to declare
    if (w.status === 'reason' && !prev) continue;                        // covered by a rule
    writers[w.key] = prev || { reason: 'OWED — a node type or a stated reason' };
  }
  const doc = { register: { name: 'nexstore writers', map: 'docs/2026-10-01-idearium-agent-ready-master-phasemap.spec (DT1)', generatedBy: 'lib/nexstore/writers.js', stats: { writers: c.stats.writers, files: c.stats.files, typed: c.stats.typed, reason: c.stats.reason, owed: c.stats.owed + c.stats.new } }, rules: c.register.rules, writers };
  return `# docs/nexstore-writers.yaml — every writer that persists data: its node type, or the reason it is not one (DT1).\n# A writer not listed here fails tests/modules/test-nexstore-writers.test.js. Add one with a reason, or a type:\n#   "<file> · <call> · <target>": { reason: "…" }   or   { type: <catalogue type> }\n# node lib/nexstore/writers.js --write adds new writers as OWED (then give each its reason).\n` + yaml.dump(doc, { lineWidth: 160, noRefs: true });
}

if (require.main === module) {
  const yaml = require('js-yaml');
  const c = census({ yaml });
  if (process.argv.includes('--write')) { fs.writeFileSync(path.join(ROOT, REGISTER), registerYaml(c, yaml)); console.log(`wrote ${REGISTER}`); }
  console.log(JSON.stringify({ ...c.stats, bySystem: undefined }, null, 1));
  for (const w of c.writers.filter(x => x.status === 'new')) console.log(`  new  ${w.key}  (line ${w.lines.join(',')})`);
}

module.exports = { census, scan, registerYaml, firstArg, namesOf, keysOf, codeFiles, REGISTER };
