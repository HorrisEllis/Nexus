'use strict';
/**
 * lib/code-intel/chunker.js — structural chunk plan for one file.
 * comp_id: nexus.lib.code-intel.chunker
 * UUID: nexus-lib-code-intel-chunker-v2-0000-2026-0927-jamesbrooks-001
 *
 * §0.39.273 CB1. planChunks(content, language) -> { chunks, symbols, family, fallback }.
 *
 * The rules, each one a measured failure of the 0.39.272 chunker:
 *   R1 cut only at a statement start of the level being chunked (./structure.js) — never mid-body.
 *   R2 a declaration's doc comment, decorators and attributes open ITS chunk, not the previous one's tail.
 *   R3 bounded size: a unit over LIMITS.max lines is split at its own members (class → methods, object → keys,
 *      function body → statements / switch cases, markdown → sub-headings), recursively; only a single indivisible
 *      statement is cut at a blank line (forced:true says so).
 *   R4 small neighbours merge: imports / variables / statements become one block; tiny one-line helpers group.
 *   R5 every line of the file belongs to exactly one chunk, in order (checked; a plan that fails the check is
 *      replaced by plain windows and says so — never a lost line).
 *   R6 a chunk's KEY is its kind + qualified name (+ an ordinal only among same-named chunks), so an id derived from
 *      it survives adding code above it.
 */

const { lineInfo, indentWidth } = require('./structure.js');
const { matchDecl, signatureOf } = require('./decls.js');

const VERSION = '2.0.0';
const LIMITS = Object.freeze({
  target: parseInt(process.env.CODE_INTEL_CHUNK_TARGET || '60', 10),   // merge neighbours up to this
  max: parseInt(process.env.CODE_INTEL_CHUNK_MAX || '150', 10),        // split anything over this
  tiny: 3,
  maxDepth: 10,
});

const SYMBOL_KINDS = new Set(['function', 'class', 'interface', 'type', 'enum', 'namespace', 'struct', 'trait', 'module', 'impl', 'macro', 'method']);
const MEMBER_CONTAINERS = new Set(['class', 'interface', 'enum', 'struct', 'trait', 'impl', 'namespace', 'module', 'key', 'export', 'variable', 'section']);

function _isCode(r) { return r && !r.blank && !r.comment && r.logical; }

/** the names a JS/TS destructuring or multi-declaration line introduces */
function definesOf(text, decl) {
  const out = [];
  if (decl && decl.kind === 'import') return out;
  if (decl && decl.name && decl.kind !== 'statement-label' && decl.kind !== 'section' && decl.kind !== 'test' && decl.kind !== 'route') out.push(decl.name);
  const m = /^(?:export\s+)?(?:const|let|var)\s+([{[])([^=]*?)[}\]]\s*=/.exec(text);
  if (m) for (const part of m[2].split(',')) { const n = part.split(':').pop().split('=')[0].trim().replace(/^\.\.\./, ''); if (/^[A-Za-z_$][\w$]*$/.test(n)) out.push(n); }
  return [...new Set(out)];
}

/** names listed in module.exports = { … }, export { … }, exports.x = / module.exports.x =, module.exports = name */
function exportedNames(text) {
  const out = new Set();
  const src = String(text || '');
  let m;
  const obj = /module\.exports\s*=\s*(?:Object\.freeze\()?\{([\s\S]*?)\}\s*\)?\s*;?\s*(?:$|\n)/g;
  while ((m = obj.exec(src))) for (const part of m[1].split(',')) { const n = part.split(':').pop().trim().replace(/^\.\.\./, ''); const k = part.split(':')[0].trim(); if (/^[A-Za-z_$][\w$]*$/.test(n)) out.add(n); if (/^[A-Za-z_$][\w$]*$/.test(k)) out.add(k); }
  const esm = /\bexport\s*\{([^}]*)\}/g;
  while ((m = esm.exec(src))) for (const part of m[1].split(',')) { const n = part.trim().split(/\s+as\s+/)[0].trim(); if (/^[A-Za-z_$][\w$]*$/.test(n)) out.add(n); }
  const prop = /(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)?/g;
  while ((m = prop.exec(src))) { out.add(m[1]); if (m[2]) out.add(m[2]); }
  const single = /module\.exports\s*=\s*([A-Za-z_$][\w$]*)\s*;?\s*$/m.exec(src);
  if (single) out.add(single[1]);
  return out;
}

// ── segment: statement starts at one level → raw units ──────────────────────────────────────────────────
function segment(ctx, a, b, level, member) {
  const { lines, info, language, family } = ctx;
  const starts = [];
  for (let i = a; i <= b; i++) {
    const r = info[i];
    if (family === 'md') {
      if (r.heading && r.depth === level.depth) starts.push(i);
      continue;
    }
    if (!_isCode(r)) continue;
    if (r.depth !== level.depth || r.paren !== level.paren) continue;
    if (family === 'indent' && level.indent != null && indentWidth(lines[i]) !== level.indent) continue;
    starts.push(i);
  }
  const units = [];
  for (let k = 0; k < starts.length; k++) {
    const s = starts[k];
    const e = k + 1 < starts.length ? starts[k + 1] - 1 : b;
    const text = lines[s].trim();
    let decl;
    if (family === 'md') decl = { kind: 'section', name: text.replace(/^#+\s*/, '').replace(/\s*#+\s*$/, '').slice(0, 100), primary: true, container: true };
    else decl = matchDecl(language, text, { member }) || { kind: 'statement', name: null, primary: false };
    const syms = decl.primary && decl.name && SYMBOL_KINDS.has(decl.kind) ? [{ name: decl.name, line: s, kind: decl.kind, exported: !!decl.exported }] : [];
    units.push({ start: s, end: e, declLine: s, decl, defines: family === 'md' ? [] : definesOf(text, decl), syms });
  }
  // decorators / annotations: fold into the unit they decorate
  for (let k = units.length - 2; k >= 0; k--) {
    if (units[k].decl.attach) { units[k + 1].start = units[k].start; units.splice(k, 1); }
  }
  // R2 — the comment block directly above a unit (or above its decorators) is its own. One blank line may separate
  // them when the block stands free (a blank line or the region start above it): a banner like "// ── Exports ──"
  // introduces what follows. A comment that trails the previous code with no blank line after that code stays there.
  const isDoc = (j) => info[j].comment && (family === 'md' || family === 'indent' || info[j].depth === level.depth);
  const leading = (s, floor) => {
    let j = s - 1, gap = false, top = null;
    if (j > floor && info[j].blank && j - 1 > floor && isDoc(j - 1)) { j--; gap = true; }
    while (j > floor && isDoc(j)) { top = j; j--; }
    if (top == null) return { start: s, gap: false };
    if (!gap || j <= floor || info[j].blank) return { start: top, gap, reachesFloor: j <= floor };
    return { start: s, gap: false };
  };
  for (let k = 1; k < units.length; k++) {
    const u = units[k], prev = units[k - 1];
    const l = leading(u.start, prev.declLine);
    if (l.start < u.start) { prev.end = l.start - 1; u.start = l.start; }
  }
  // lines before the first start: the doc above the first unit is its own; the rest is a preamble. A file header
  // that begins the file and is separated from the first unit by a blank line describes the FILE: it stays preamble.
  if (units.length && units[0].start > a) {
    const l = leading(units[0].start, a - 1);
    let moved = l.start;
    if (a === 0 && l.gap && l.reachesFloor) moved = units[0].start;
    units[0].start = moved;
    if (moved > a) units.unshift({ start: a, end: moved - 1, declLine: null, decl: { kind: 'preamble', name: null, primary: false }, defines: [], syms: [] });
  }
  if (!units.length) units.push({ start: a, end: b, declLine: null, decl: { kind: 'block', name: null, primary: false }, defines: [], syms: [] });
  return units;
}
function _docEnd(l) { return /^\s*\*\/\s*$/.test(l) || /^\s*\/\/\//.test(l) || /^\s*"""\s*$/.test(l); }

// ── arrange: merge small neighbours (R4); case labels own what follows them ─────────────────────────────
function arrange(units, { target = LIMITS.target } = {}) {
  let list = units;
  if (list.some(u => u.decl.label)) {
    const out = [];
    for (const u of list) {
      if (u.decl.label || !out.length || (out[out.length - 1].decl.primary && !out[out.length - 1].decl.label)) out.push({ ...u, defines: [...u.defines], syms: [...(u.syms || [])] });
      else { const g = out[out.length - 1]; g.end = u.end; g.defines.push(...u.defines); g.syms.push(...(u.syms || [])); }
    }
    list = out;
  }
  const size = (u) => u.end - u.start + 1;
  const out = [];
  for (const u of list) {
    const last = out[out.length - 1];
    const mergeable = (x) => !x.decl.primary && !(x.decl.container && size(x) > target);
    const tinyPrimary = (x) => x.decl.primary && !x.decl.container && !x.decl.label && x.declLine != null && (x.end - x.declLine + 1) <= LIMITS.tiny;
    if (last && ((mergeable(last) && mergeable(u)) || (last._group && tinyPrimary(u)) || (tinyPrimary(last) && tinyPrimary(u)) || (last.decl.label && u.decl.label))
        && size(last) + size(u) <= target) {
      if (tinyPrimary(last) && !last._group && tinyPrimary(u)) { last._group = true; last._members = [last.decl]; }
      if (last.decl.label && u.decl.label) { last._labels = (last._labels || [last.decl.name]).concat(u.decl.name); }
      if (last._group) last._members.push(u.decl);
      last.end = u.end; last.defines = [...last.defines, ...u.defines]; last.syms = [...(last.syms || []), ...(u.syms || [])];
      if (!last._group && !last.decl.label) last.decl = _blockDecl(last.decl, u.decl);
      continue;
    }
    out.push({ ...u, defines: [...u.defines], syms: [...(u.syms || [])] });
  }
  for (const u of out) if (u._group) u.decl = { kind: 'group', name: null, primary: true, container: false, exported: u._members.some(m => m.exported) };
  return out;
}
function _blockDecl(a, b) {
  const kinds = new Set([a._kinds || [a.kind], [b.kind]].flat());
  const only = (k) => [...kinds].every(x => x === k || x === 'preamble');
  const kind = kinds.has('preamble') ? 'preamble' : only('import') ? 'imports' : [...kinds].every(x => x === 'variable' || x === 'import' || x === 'field') ? (kinds.has('field') ? 'fields' : 'variables') : 'block';
  return { kind, name: null, primary: false, container: false, _kinds: [...kinds] };
}

// ── emit: a unit becomes one chunk, or is split at its own members (R3) ─────────────────────────────────
function emit(ctx, u, parent, depth, out) {
  const size = u.end - u.start + 1;
  const base = _chunkOf(ctx, u, parent);
  if (size <= LIMITS.max || depth >= LIMITS.maxDepth) { out.push(base); return; }
  const inner = _innerRegion(ctx, u);
  if (!inner) { _windows(ctx, u, base, out); return; }
  const member = ctx.family !== 'md' && (MEMBER_CONTAINERS.has(u.decl.kind) || (u.decl.container && u.decl.kind !== 'test' && u.decl.kind !== 'function'));
  let subs = arrange(segment(ctx, inner.a, inner.b, inner.level, member));
  if (subs.length <= 1) {
    // one statement fills the body — go one level into it
    const only = subs[0] || { start: inner.a, end: inner.b, declLine: inner.a, decl: { kind: 'statement', primary: false }, defines: [] };
    const deeper = _innerRegion(ctx, only);
    if (!deeper) { _windows(ctx, u, base, out); return; }
    subs = arrange(segment(ctx, deeper.a, deeper.b, deeper.level, false));
    if (subs.length <= 1) { _windows(ctx, u, base, out); return; }
    subs[0].start = inner.a;
    subs[subs.length - 1].end = inner.b;
  }
  // a tiny non-declaration tail (closing lines, a trailing return) joins the part before it
  while (subs.length > 2) {
    const t = subs[subs.length - 1], p = subs[subs.length - 2];
    if (!t.decl.primary && t.end - t.start + 1 <= LIMITS.tiny && p.end - p.start + 1 + (t.end - t.start + 1) <= LIMITS.max) { p.end = t.end; subs.pop(); }
    else break;
  }
  // header (signature, leading lines) opens the first part; the closing lines end the last part
  subs[0].start = u.start;
  subs[0]._head = true;
  subs[subs.length - 1].end = u.end;
  const parentChunk = { ...base, _container: true };
  subs.forEach((s, i) => {
    const sub = { ...s, _parent: parentChunk, _part: i + 1, _parts: subs.length, _first: i === 0 };
    emit(ctx, sub, parentChunk, depth + 1, out);
  });
}

/** the body of a unit: the lines one level inside its declaration line */
function _innerRegion(ctx, u) {
  const { info, lines, family } = ctx;
  const h = u.declLine != null ? u.declLine : u.start;
  if (family === 'md') {
    const lvl = info[h].heading ? info[h].depth + 1 : null;
    if (lvl == null) return null;
    let a = null;
    for (let i = h + 1; i <= u.end; i++) if (info[i].heading && info[i].depth >= lvl) { a = i; break; }
    if (a == null) return null;
    return { a, b: u.end, level: { depth: info[a].depth, paren: 0 } };
  }
  const hd = info[h].depth, hp = info[h].paren, hi = indentWidth(lines[h]);
  for (let i = h + 1; i <= u.end; i++) {
    const r = info[i];
    if (!_isCode(r)) continue;
    const deeper = family === 'indent' ? indentWidth(lines[i]) > hi && r.depth > hd - 0 : (r.depth > hd || (r.depth === hd && r.paren > hp));
    if (!deeper) continue;
    let b = u.end;
    for (let j = u.end; j > i; j--) {
      const rj = info[j];
      if (rj.blank) continue;
      if (family === 'indent' ? indentWidth(lines[j]) > hi || rj.comment : rj.depth >= r.depth) { b = j; break; }
    }
    return { a: i, b, level: { depth: r.depth, paren: r.paren, indent: family === 'indent' ? indentWidth(lines[i]) : undefined } };
  }
  return null;
}

/** last resort for one indivisible statement: cut at blank lines (or anywhere), forced:true */
function _windows(ctx, u, base, out) {
  const { info } = ctx;
  let s = u.start, part = 1;
  const pieces = [];
  while (s <= u.end) {
    let e = Math.min(u.end, s + LIMITS.max - 1);
    if (e < u.end) {
      let best = -1, bestDepth = Infinity;
      for (let j = e; j >= s + Math.floor(LIMITS.target / 2); j--) {
        if (info[j].blank || (info[j + 1] && _isCode(info[j + 1]))) { const d = info[j + 1] ? info[j + 1].depth : 0; if (d < bestDepth) { bestDepth = d; best = j; } }
      }
      if (best >= s) e = best;
    }
    pieces.push([s, e]);
    s = e + 1;
  }
  if (pieces.length === 1) { out.push(base); return; }
  for (const [a, b] of pieces) {
    out.push({ ...base, start: a, end: b, kind: part === 1 ? base.kind : 'part', forced: true,
      name: part === 1 ? base.name : `${base.name || base.kind} (part ${part})`,
      qualifiedName: part === 1 ? base.qualifiedName : `${base.qualifiedName || base.kind} › part ${part}`,
      symbol: part === 1 ? base.symbol : null, syms: part === 1 ? base.syms : [], parentQName: part === 1 ? base.parentQName : (base.qualifiedName || null),
      keyBase: part === 1 ? base.keyBase : `${base.keyBase}#${part}` });
    part++;
  }
}

/** a short, stable name for an unnamed part: its first line of code ("switch (action)", "result.state = 'MAPPING'") */
function _gist(lines, u, ctx) {
  // a part that opens with its own comment is named by it ("§24-26 GRAPHING — MCO1"); otherwise by its first
  // meaningful line of code ("switch (action)"), skipping bare openers like `try {`
  const clip = (t) => (t.length > 48 ? t.slice(0, 47) + '…' : t);
  for (let i = u.start; i <= u.end; i++) {
    const r = ctx.info[i];
    if (!r || r.blank) continue;
    if (r.comment) {
      const t = lines[i].trim().replace(/^(\/\*\*?|\*\/?|\/\/\/?|#+|--)\s*/, '').replace(/\*\/\s*$/, '').replace(/^[─═—\-=\s]+|[─═—\-=\s]+$/g, '').trim();
      if (t.length >= 4 && /[A-Za-z]/.test(t)) return clip(t);
      continue;
    }
    break;
  }
  for (let i = u.start; i <= u.end; i++) {
    const r = ctx.info[i];
    if (!r || r.blank || r.comment || !r.inCode) continue;
    let t = lines[i].trim().replace(/\s*\{\s*$/, '').replace(/;\s*$/, '').replace(/\s+/g, ' ');
    if (!t || /^[}\])]/.test(t) || /^(try|else|do|finally|\{)$/.test(t)) continue;
    return clip(t);
  }
  return null;
}

function _chunkOf(ctx, u, parent) {
  const { lines, language } = ctx;
  const d = u.decl || {};
  const inBody = !!(parent && parent._container);
  const pName = parent ? parent.qualifiedName || parent.name : null;
  let name = d.name || null;
  let kind = d.kind;
  if (u._labels) name = `${u._labels[0]}${u._labels.length > 1 ? ` … +${u._labels.length - 1}` : ''}`;
  if (inBody && u._first && u._head) { kind = parent.kind; name = parent.name; }
  const memberish = new Set(['method', 'field', 'key', 'fields']);
  let qualifiedName;
  if (inBody && u._first && u._head) qualifiedName = parent.qualifiedName;
  else if (!parent) qualifiedName = name;
  else if (memberish.has(kind) && name) qualifiedName = `${pName}.${name}`;
  else qualifiedName = `${pName || '?'} › ${name || _gist(lines, u, ctx) || `part ${u._part || '?'}`}`;
  if (inBody && !(u._first && u._head) && !memberish.has(kind) && kind !== 'statement-label' && !d.primary) kind = 'part';
  if (kind === 'statement-label') kind = 'case';
  if (kind === 'statement') kind = 'block';
  // symbols: every top-level declaration this chunk holds (a group of one-line helpers holds several); the first
  // part of a split declaration carries the declaration's own symbol
  const syms = !parent ? (u.syms || []) : (inBody && u._first && u._head ? (parent.syms || []) : []);
  const topSymbol = syms.length ? syms[0].name : null;
  const declLine = u.declLine != null ? u.declLine : null;
  const keyBase = `${kind}:${qualifiedName || (u.defines[0] ? `@${u.defines[0]}` : '@')}`;
  return {
    start: u.start, end: u.end, kind, name, qualifiedName: qualifiedName || null,
    parentQName: inBody && !(u._first && u._head) ? (parent.qualifiedName || parent.name || null) : (parent && !inBody ? pName : (inBody ? parent.parentQName || null : null)),
    symbol: topSymbol, syms, exported: !!d.exported, defines: [...new Set(u.defines)],
    declLine, signature: declLine != null && ctx.family !== 'md' ? signatureOf(lines, declLine) : (ctx.family === 'md' && declLine != null ? lines[declLine].trim() : null),
    forced: false, keyBase, language,
  };
}

/**
 * planChunks(content, language) -> { chunks:[{ start, end (1-based, inclusive), kind, name, qualifiedName,
 *   parentQName, symbol, exported, defines, declLine, signature, key, forced }], symbols, family, fallback, version }
 */
function planChunks(content, language, { limits = null } = {}) {
  const text = String(content ?? '');
  const lines = text.split('\n');
  const li = lineInfo(text, language);
  const ctx = { lines, info: li.lines, language, family: li.family };
  const out = [];
  let fallback = li.fallback;
  try {
    const units = arrange(segment(ctx, 0, lines.length - 1, { depth: 0, paren: 0, indent: li.family === 'indent' ? 0 : undefined }, false));
    for (const u of units) emit(ctx, u, null, 0, out);
  } catch (e) {
    fallback = `chunk plan failed (${e.message}) — plain windows`;
    out.length = 0;
  }
  // a file's opening comment + imports/variables is its preamble
  if (out.length && out[0].start === 0 && ctx.info[0] && ctx.info[0].comment && ['variables', 'imports', 'block', 'import', 'variable', 'fields'].includes(out[0].kind) && !out[0].symbol) {
    out[0].kind = 'preamble'; out[0].keyBase = out[0].keyBase.replace(/^[^:]+:/, 'preamble:');
  }
  // R5 — contiguous, complete, ordered
  out.sort((x, y) => x.start - y.start);
  let ok = out.length > 0 && out[0].start === 0 && out[out.length - 1].end === lines.length - 1;
  for (let i = 1; ok && i < out.length; i++) if (out[i].start !== out[i - 1].end + 1 || out[i].end < out[i].start) ok = false;
  if (!ok) {
    fallback = fallback || 'chunk plan did not cover the file exactly — plain windows';
    out.length = 0;
    for (let s = 0, p = 1; s < lines.length; s += LIMITS.max, p++) {
      out.push({ start: s, end: Math.min(lines.length - 1, s + LIMITS.max - 1), kind: 'part', name: null, qualifiedName: null, parentQName: null, symbol: null, syms: [], exported: false, defines: [], declLine: null, signature: null, forced: true, keyBase: `window:${p}`, language });
    }
  }
  // R6 — stable keys
  const seen = new Map();
  let anon = 0;
  for (const c of out) {
    let kb = c.keyBase;
    if (kb.endsWith(':@')) kb = `${kb}${++anon}`;
    const n = (seen.get(kb) || 0) + 1; seen.set(kb, n);
    c.key = n > 1 ? `${kb}~${n}` : kb;
    delete c.keyBase;
    c.start += 1; c.end += 1; if (c.declLine != null) c.declLine += 1;
  }
  // every top-level declaration, once, at its declaration line; each chunk lists the symbols it holds
  const symbols = [];
  const at = new Set();
  for (const c of out) {
    const recs = (c.syms || []).map(x => ({ name: x.name, line: x.line + 1, kind: x.kind, exported: !!x.exported }));
    c.symbolNames = recs.map(x => x.name);
    delete c.syms;
    for (const r of recs) { const k = `${r.name}:${r.line}`; if (!at.has(k)) { at.add(k); symbols.push(r); } }
  }
  const uniq = symbols;
  // CommonJS / ESM export lists name what the file exports even when the declaration itself says nothing
  if (li.family === 'js' || /^(javascript|jsx|typescript|tsx)$/.test(language)) {
    const ex = exportedNames(text);
    if (ex.size) {
      for (const c of out) if ((c.symbolNames || []).some(n => ex.has(n)) || (c.defines || []).some(n => ex.has(n)) || (c.name && ex.has(c.name) && !c.parentQName)) c.exported = true;
      for (const sy of uniq) if (ex.has(sy.name)) sy.exported = true;
    }
  }
  return { chunks: out, symbols: uniq, family: li.family, fallback, version: VERSION };
}

module.exports = { planChunks, VERSION, LIMITS, definesOf, exportedNames };
