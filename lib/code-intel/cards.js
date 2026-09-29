'use strict';
/**
 * lib/code-intel/cards.js — a card per chunk: what it is, what it uses, what uses it.
 * comp_id: nexus.lib.code-intel.cards
 * UUID: nexus-lib-code-intel-cards-v1-0000-2026-0927-jamesbrooks-001
 *
 * §0.39.273 CB2. James: "all context is easy to search and understand for each chunk." A card is small on purpose
 * (ids, names, one-line summary — never code) so a small model can hold many of them and read code only where needed.
 *
 *   { id, file, range, lines, language, kind, name, qualifiedName, parent, prev, next, signature, doc, summary,
 *     defines, exported, imports, uses:[{ name, chunkId, file, basis }], usedBy:[{ chunkId, name, file, basis }],
 *     tests:[chunkId], glyph, hash }
 *
 * §HONEST BASIS (invariant I2) — `uses` is found BY NAME, and every entry says how it was resolved:
 *   import     the identifier is bound by an import/require in this file and the module resolved to a file in this
 *              repo that defines that name (or the member accessed through the binding)
 *   same-file  defined by another chunk of the same file (including this.method → the class's own method)
 *   name       defined at top level in exactly ONE other file, with no import to say so — the weakest basis
 * A card never claims a call graph (graph.js keeps `calls` declared unsupported): a name that could not be resolved
 * is simply not listed.
 */

const path = require('path');
const T = require('./text.js');

const CARD_VERSION = '1.0.0';
const CAP = { uses: 25, usedBy: 25, tests: 10, doc: 320, summary: 200 };
const TEST_RE = /(?:^|\/)(?:tests?|__tests__|spec)\/|\.(?:test|spec)\.[cm]?[jt]sx?$|_test\.(?:go|py)$|(?:^|\/)test_[^/]+\.py$/i;
const BASIS_RANK = { import: 0, 'same-file': 1, name: 2 };
const CODE_LANG = /^(javascript|jsx|typescript|tsx|python|go|rust|java|kotlin|scala|csharp|c|cpp|objectivec|php|swift|dart|ruby|elixir|lua)$/;
const FAMILY_OF = (l) => (/^(javascript|jsx|typescript|tsx)$/.test(l || '') ? 'js' : /^(c|cpp|objectivec)$/.test(l || '') ? 'c' : l || '');
/** a name specific enough to count as a reference by itself: camelCase / snake_case / PascalCase, or 8+ letters */
function distinctive(n) { return n.length >= 5 && (/[a-z][A-Z]/.test(n) || /_/.test(n.replace(/^_+/, '')) || /^[A-Z][a-z]+[A-Z]/.test(n) || n.length >= 8); }

// ── imports: the local names a file binds to other modules ──────────────────────────────────────────────
/** importBindings(code, language) -> [{ local, imported, specifier }]  imported: a name, 'default' or '*' */
function importBindings(code, language) {
  const out = [];
  const src = String(code || '').replace(/\/\*[\s\S]*?\*\//g, ' ');
  if (/^(javascript|jsx|typescript|tsx)$/.test(language || '')) {
    let m;
    const reqObj = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:_?require|await\s+import)\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    while ((m = reqObj.exec(src))) for (const part of m[1].split(',')) { const [imp, loc] = part.split(':').map(x => x && x.trim()); if (imp && /^[\w$]+$/.test(imp)) out.push({ local: (loc || imp).split('=')[0].trim(), imported: imp, specifier: m[2] }); }
    const reqNs = /(?:const|let|var)\s+([\w$]+)\s*=\s*(?:_?require|await\s+import)\(\s*['"`]([^'"`]+)['"`]\s*\)(\.([\w$]+))?/g;
    while ((m = reqNs.exec(src))) out.push({ local: m[1], imported: m[4] || '*', specifier: m[2] });
    const lazy = /(?:function|const|let|var)\s+([\w$]+)\s*(?:=\s*)?\(\s*\)\s*(?:=>)?\s*\{?\s*(?:return\s+)?_?require\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    while ((m = lazy.exec(src))) out.push({ local: m[1], imported: '*', specifier: m[2], lazy: true });
    const imp = /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"`]([^'"`]+)['"`]/g;
    while ((m = imp.exec(src))) {
      const clause = m[1].trim(), spec = m[2];
      const ns = /\*\s+as\s+([\w$]+)/.exec(clause); if (ns) out.push({ local: ns[1], imported: '*', specifier: spec });
      const def = /^([\w$]+)\s*(,|$)/.exec(clause); if (def) out.push({ local: def[1], imported: 'default', specifier: spec });
      const named = /\{([^}]*)\}/.exec(clause);
      if (named) for (const part of named[1].split(',')) { const p = part.trim().replace(/^type\s+/, ''); if (!p) continue; const [a, b] = p.split(/\s+as\s+/); if (/^[\w$]+$/.test(a)) out.push({ local: (b || a).trim(), imported: a.trim(), specifier: spec }); }
    }
  } else if (language === 'python') {
    let m;
    const from = /^\s*from\s+([.\w]+)\s+import\s+\(?([^)\n]+)\)?/gm;
    while ((m = from.exec(src))) for (const part of m[2].split(',')) { const [a, b] = part.trim().split(/\s+as\s+/); if (/^\w+$/.test(a || '')) out.push({ local: (b || a).trim(), imported: a, specifier: m[1] }); }
    const imp = /^\s*import\s+([\w.]+)(?:\s+as\s+(\w+))?/gm;
    while ((m = imp.exec(src))) out.push({ local: m[2] || m[1].split('.')[0], imported: '*', specifier: m[1] });
  }
  return out;
}

// ── doc: the comment above a declaration, or a python docstring ─────────────────────────────────────────
const NOISE_LINE = /^(uuid|comp_id|component|version|seam id|phase|layer|author|license|@license|@module|@file)\s*:?/i;
function docOf(lines, chunk, language) {
  const start = chunk.range.start_line, decl = chunk.declLine || null;
  const raw = [];
  const stopAt = decl ? decl - 1 : Math.min(chunk.range.end_line, start + 40);
  for (let i = start; i <= stopAt; i++) {
    const l = lines[i - 1];
    if (l == null) break;
    const t = l.trim();
    if (!t) { if (raw.length && decl == null) break; continue; }
    if (/^(\/\*\*?|\*\/?|\/\/\/?|#(?![!\[])|--|<!--)/.test(t) || (raw.length && /^\*/.test(t))) raw.push(t);
    else if (/^@/.test(t)) continue;           // a decorator
    else break;
  }
  if (language === 'python' && decl) {
    const after = lines.slice(decl, decl + 30).join('\n');
    const m = /^\s*(?:[rRuU]?)("""|''')([\s\S]*?)\1/.exec(after);
    if (m) raw.push(...m[2].split('\n'));
  }
  const text = raw
    .map(l => l.replace(/^\s*(\/\*\*?|\*\/|\*(?!\/)|\/\/\/?|#+|--|<!--|-->)\s?/, '').replace(/\*\/\s*$/, '').trim())
    .filter(l => l && !NOISE_LINE.test(l) && !/^[-─═=*~#_.]{3,}\s*$/.test(l) && !/^@(param|returns?|throws|type|typedef|example)\b/.test(l))
    .map(l => l.replace(/^[─═—-]{2,}\s*|\s*[─═—-]{2,}$/g, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > CAP.doc ? text.slice(0, CAP.doc - 1) + '…' : text;
}
function firstSentence(s, max = 140) {
  if (!s) return '';
  const m = /^(.{12,}?[.!?])(\s|$)/.exec(s);
  const t = m ? m[1] : s;
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

const KIND_LABEL = { function: 'function', method: 'method', class: 'class', interface: 'interface', type: 'type', enum: 'enum', namespace: 'namespace',
  struct: 'struct', trait: 'trait', impl: 'impl', module: 'module', macro: 'macro', test: 'test', route: 'route', section: 'section', key: 'key',
  case: 'case', part: 'part of', preamble: 'file header', imports: 'imports', variables: 'variables', variable: 'variable', fields: 'fields',
  field: 'field', block: 'block', group: 'helpers', export: 'exports', import: 'import', table: 'table' };

/**
 * buildCards({ files, chunks, resolve, glyphs, prev }) -> { version, byChunk, stats }
 *   files   [{ path, language, content }]
 *   chunks  pipeline chunk records (id, file, range, kind, qualifiedName, name, defines, parent, signature, declLine,
 *           exported, hash)
 *   resolve (specifier, fromFile, language) -> repo-relative path | null     (graph.js resolveSpecifier)
 *   glyphs  { [chunkId]: { glyph } }   optional
 */
function buildCards({ files, chunks, resolve = () => null, glyphs = null } = {}) {
  const t0 = Date.now();
  const fileBy = new Map(files.map(f => [f.path, f]));
  const linesOf = new Map();
  const lines = (p) => { if (!linesOf.has(p)) linesOf.set(p, String((fileBy.get(p) || {}).content || '').split('\n')); return linesOf.get(p); };
  const byFile = new Map();
  for (const c of chunks) { if (!byFile.has(c.file)) byFile.set(c.file, []); byFile.get(c.file).push(c); }
  for (const list of byFile.values()) list.sort((a, b) => a.range.start_line - b.range.start_line);

  // definitions: file -> name -> chunk (top level, and members by their own name within the file)
  const defsInFile = new Map();          // file -> Map(name -> chunk)
  const membersOf = new Map();           // parent chunk id -> Map(memberName -> chunk)
  const topDefs = new Map();             // name -> [chunk] across files (top-level only)
  for (const c of chunks) {
    const names = new Set([...(c.defines || [])]);
    if (c.name && !c.parent && !['case', 'part', 'section', 'test', 'route', 'key', 'block', 'preamble'].includes(c.kind)) names.add(c.name);
    if (!defsInFile.has(c.file)) defsInFile.set(c.file, new Map());
    const m = defsInFile.get(c.file);
    if (c.parent && c.name && (c.kind === 'method' || c.kind === 'field')) {
      if (!membersOf.has(c.parent)) membersOf.set(c.parent, new Map());
      if (!membersOf.get(c.parent).has(c.name)) membersOf.get(c.parent).set(c.name, c);
      continue;
    }
    if (c.parent) continue;
    for (const n of names) {
      if (!m.has(n)) m.set(n, c);
      // cross-file matching by NAME only for code, and only for distinctive names: a data/prose key ("name",
      // "version") or a common word ("read", "check") defined once somewhere is not evidence of a reference
      if (CODE_LANG.test(c.language || '') && distinctive(n)) { if (!topDefs.has(n)) topDefs.set(n, []); topDefs.get(n).push(c); }
    }
  }
  const chunkById = new Map(chunks.map(c => [c.id, c]));
  const classOf = (c) => { let x = c; const seen = new Set(); while (x && !seen.has(x.id)) { seen.add(x.id); if (membersOf.has(x.id)) return x; x = x.parent ? chunkById.get(x.parent) : null; } return null; };

  // imports per file
  const importsOf = new Map();
  for (const f of files) {
    const bind = new Map();
    for (const b of importBindings(f.content, f.language)) {
      let target = null;
      try { target = resolve(b.specifier, f.path, f.language); } catch (_) { target = null; }
      if (!bind.has(b.local)) bind.set(b.local, { ...b, target });
    }
    importsOf.set(f.path, bind);
  }

  const cards = {};
  const usedBy = new Map();
  let resolved = { import: 0, 'same-file': 0, name: 0 };
  for (const c of chunks) {
    const L = lines(c.file);
    const text = L.slice(c.range.start_line - 1, c.range.end_line).join('\n');
    const lang = c.language || (fileBy.get(c.file) || {}).language || null;
    const ids = T.identifiersOf(text, lang || 'text');
    const own = new Set([...(c.defines || []), c.name].filter(Boolean));
    const binds = importsOf.get(c.file) || new Map();
    const sameFile = defsInFile.get(c.file) || new Map();
    const uses = [];
    const seen = new Set();
    const push = (u) => { if (!u.chunkId || u.chunkId === c.id || seen.has(u.chunkId)) return; seen.add(u.chunkId); uses.push(u); };
    const specifiers = new Set();
    // members reached through a module binding: X.foo
    for (const pr of ids.pairs) {
      const [obj, prop] = pr.split('.');
      const b = binds.get(obj);
      if (!b || !b.target || b.imported !== '*') continue;
      specifiers.add(b.specifier);
      const d = (defsInFile.get(b.target) || new Map()).get(prop);
      if (d) push({ name: `${obj}.${prop}`, chunkId: d.id, file: d.file, basis: 'import' });
    }
    // require('./x').member in place, no binding at all
    if (/^(javascript|jsx|typescript|tsx)$/.test(lang || '')) {
      for (const r of T.inlineRequires(text)) {
        let target = null; try { target = resolve(r.specifier, c.file, lang); } catch (_) { target = null; }
        specifiers.add(r.specifier);
        const d = target ? (defsInFile.get(target) || new Map()).get(r.member) : null;
        if (d) push({ name: `require('${r.specifier}').${r.member}`, chunkId: d.id, file: d.file, basis: 'import' });
      }
    }
    // this.member → the enclosing class's own member
    const cls = classOf(c);
    if (cls) for (const n of ids.thisMembers) { const d = membersOf.get(cls.id).get(n); if (d) push({ name: `this.${n}`, chunkId: d.id, file: d.file, basis: 'same-file' }); }
    for (const [n] of ids.names) {
      if (own.has(n) || T.CODE_KEYWORDS.has(n) || n.length < 2) continue;
      const b = binds.get(n);
      if (b) {
        specifiers.add(b.specifier);
        if (!b.target) continue;
        const want = b.imported === 'default' || b.imported === '*' ? null : b.imported;
        const d = want ? (defsInFile.get(b.target) || new Map()).get(want) : null;
        if (d) push({ name: n, chunkId: d.id, file: d.file, basis: 'import' });
        continue;
      }
      const s = sameFile.get(n);
      if (s) { push({ name: n, chunkId: s.id, file: s.file, basis: 'same-file' }); continue; }
      if (distinctive(n)) {
        const cands = (topDefs.get(n) || []).filter(x => x.file !== c.file && FAMILY_OF(x.language) === FAMILY_OF(lang));
        const filesOf = new Set(cands.map(x => x.file));
        if (filesOf.size === 1 && cands.length === 1) push({ name: n, chunkId: cands[0].id, file: cands[0].file, basis: 'name' });
      }
    }
    uses.sort((a, b) => BASIS_RANK[a.basis] - BASIS_RANK[b.basis]);
    for (const u of uses) resolved[u.basis]++;
    for (const u of uses) {
      if (!usedBy.has(u.chunkId)) usedBy.set(u.chunkId, []);
      usedBy.get(u.chunkId).push({ chunkId: c.id, name: c.qualifiedName || c.name || (c.defines && c.defines[0]) || `${c.kind || 'block'}@${c.range.start_line}`, file: c.file, basis: u.basis });
    }
    const doc = docOf(L, c, lang);
    cards[c.id] = {
      id: c.id, file: c.file, range: c.range, lines: c.range.end_line - c.range.start_line + 1, language: lang,
      kind: c.kind || 'block', name: c.name || null, qualifiedName: c.qualifiedName || null, parent: c.parent || null,
      prev: null, next: null, signature: c.signature || null, doc, summary: null,
      defines: (c.defines || []).slice(0, 20), exported: !!c.exported,
      imports: [...specifiers].slice(0, 12), uses: uses.slice(0, CAP.uses), usesTotal: uses.length,
      usedBy: [], usedByTotal: 0, tests: [], glyph: glyphs && glyphs[c.id] ? glyphs[c.id].glyph || null : null,
      hash: c.hash && c.hash.content ? c.hash.content : (typeof c.hash === 'string' ? c.hash : null), forced: !!c.forced,
    };
  }
  for (const list of byFile.values()) for (let i = 0; i < list.length; i++) {
    const card = cards[list[i].id];
    if (!card) continue;
    card.prev = i > 0 ? list[i - 1].id : null;
    card.next = i + 1 < list.length ? list[i + 1].id : null;
  }
  for (const [id, list] of usedBy) {
    const card = cards[id]; if (!card) continue;
    list.sort((a, b) => BASIS_RANK[a.basis] - BASIS_RANK[b.basis] || (TEST_RE.test(a.file) ? 1 : 0) - (TEST_RE.test(b.file) ? 1 : 0));
    card.usedBy = list.slice(0, CAP.usedBy); card.usedByTotal = list.length;
    card.tests = [...new Set(list.filter(u => TEST_RE.test(u.file)).map(u => u.chunkId))].slice(0, CAP.tests);
  }
  for (const card of Object.values(cards)) card.summary = summarize(card);
  return { version: CARD_VERSION, generatedAt: Date.now(), byChunk: cards,
    stats: { chunks: chunks.length, uses: resolved, ms: Date.now() - t0 } };
}

/** summarize(card) — one line a small model can read: what it is, then what its author said or what it touches. */
function summarize(card) {
  const label = KIND_LABEL[card.kind] || card.kind;
  const who = card.qualifiedName || card.name || (card.defines && card.defines.length ? card.defines.slice(0, 4).join(', ') : '') || path.basename(card.file);
  let what = firstSentence(card.doc);
  if (!what) {
    const bits = [];
    if (card.uses && card.uses.length) bits.push(`uses ${card.uses.slice(0, 3).map(u => u.name).join(', ')}${card.usesTotal > 3 ? ` +${card.usesTotal - 3}` : ''}`);
    if (card.usedByTotal) bits.push(`used by ${card.usedByTotal}`);
    if (!bits.length && card.signature && card.signature !== who) bits.push(card.signature);
    what = bits.join('; ');
  }
  const s = `${label} ${who}${card.lines ? ` (${card.lines} lines)` : ''}${what ? ` — ${what}` : ''}`;
  return s.length > CAP.summary ? s.slice(0, CAP.summary - 1) + '…' : s;
}

module.exports = { buildCards, importBindings, docOf, summarize, firstSentence, CARD_VERSION, TEST_RE, KIND_LABEL };
