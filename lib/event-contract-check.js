'use strict';
// lib/event-contract-check.js — EV0 (3): is every event a system emits declared in its own event-taxonomy?
// component_id: lib.event-contract-check
// Map: docs/2026-10-02-emerge-field-memory-build-phasemap.spec (EV0, invariant E14)
//
// Beside lib/event-taxonomy-pattern.js (ET1, the SHAPE of a taxonomy): this checks the CONTENT against the code. It
// reads a system's own source, finds every emit of a literal event name, and says which are not in that system's
// taxonomy — so an emit added without its declaration fails the suite instead of piling up as drift.
//
// What it reads, said (§1.1 — no guess presented as a finding):
//   - an emit is a call to emit|_emit|emitEvent|_emitEvent|busEmit|postEvent|broadcast|publish — as a method or a bare
//     helper, `?.(` included — whose first argument is a literal <name>, or a ternary of two, carrying a '.' or ':' (the dotted
//     convention ET1 documents; a bare 'error' / 'data' / 'close' is a stream's own event, not a system event);
//   - a key is the name upper-cased with '.', ':' and '-' as '_' (ET1: IDEARIUM_PHASE_PROVEN ↔ idearium.phase.proven);
//   - an emit built from a template (`idearium.${x}`) cannot be read statically. Its site declares what it can emit in
//     a comment on the same line or the line above — `// emits: a.b.c, a.b.d` — and those are checked like literals.
//     A dynamic emit with no such comment is UNRESOLVED, and fails: an event nobody can name is not declared.
//   - a call quoted inside a string (a hook's name, "os.emit('x.y')") or in a comment is not an emit.
//   - a SISO event (`emit(new Event('host:x:y', …))`, `E(…)`, `{ type: … }`) is an emit like any other.
//   - a constant (`emit(new Event(HOST.COMPARTMENT_CREATED, …))`) is read through the frozen string tables in the system's
//     OWN source (cos/foundation/event-contracts.js's HOST, …); one no table resolves is UNREAD — listed, not failed;
//     one whose table is there but lacks the key is MISSING — the emit sends undefined — and fails.
//   - an argument that is a plain variable (`emit(type, …)`) forwards an event made elsewhere; it is not an origin.
//   - test files and directories, node_modules, data and _archive are not the system's emits.
//   - a directory holding a `.template-tree` marker is another system's code kept as a template (cos/archetype/
//     nexus-system, 0.39.359): its emits are the systems built from it, declared in their own taxonomies, not this one's.
// Pure core (checkSources) + one IO wrapper (checkSystem). Never writes anything.

const fs = require('fs');
const path = require('path');

const MODULE_ID = 'lib.event-contract-check';
const VERSION = '1.0.0';

// a method (`bus.emit(`, `this.postEvent(`) or a bare helper (`_emitEvent(`, `busEmit?.(`); then the name — a literal or a
// constant (`HOST.COMPARTMENT_CREATED`) — given bare, as a SISO event (`new Event(…`, `E(…`) or as `{ type: … }`
const CALL = String.raw`(?:\.|(?<![\w$.]))(?:emit|_emit|emitEvent|_emitEvent|busEmit|postEvent|broadcast|publish)(?:\?\.)?\(\s*`;
const WRAP = String.raw`(?:new\s+[A-Za-z_$]*Event\(\s*|E\(\s*|\{\s*type\s*:\s*)?`;
const EMIT_RE = new RegExp(CALL + WRAP + String.raw`(?:(['"\`])((?:(?!\1)[^\\\n]|\\.)*)\1|([A-Z_$][A-Za-z0-9_$]*)\.([A-Z][A-Z0-9_]*)\b)`, 'g');
// a frozen (or plain) table of event names in the system's own source: `HOST = Object.freeze({ X: 'host:x:y', … })`
const TABLE_RE = /\b([A-Z_$][A-Za-z0-9_$]*)\s*=\s*(?:Object\.freeze\(\s*)?\{/g;
// `emit(ok ? 'a.done' : 'a.failed', …)` — both branches are emits
const TERNARY_RE = new RegExp(CALL + String.raw`[^,()'"\`]*\?\s*(['"])([^'"\n]+)\1\s*:\s*(['"])([^'"\n]+)\3`, 'g');
const EMITS_COMMENT_RE = /\/\/\s*emits:\s*([^\n]+)/;
const SKIP_DIRS = new Set(['node_modules', '.git', 'data', '_archive', 'test', 'tests', 'coverage', 'dist', 'build']);
const SOURCE_EXT = /\.(c|m)?js$/;
const TEST_FILE = /\.test\.(c|m)?js$|\.spec\.(c|m)?js$/;

/** keyOf('idearium.phase.proven') → 'IDEARIUM_PHASE_PROVEN' — ET1's naming, one rule */
function keyOf(event) { return String(event).toUpperCase().replace(/[.:\-]/g, '_'); }
const isSystemEvent = (name) => /^[a-z][a-zA-Z0-9_]*([.:][a-zA-Z0-9_\-]+)+$/.test(name);

/** the top-level keys of an object literal at the start of `s` (`{ a, b: 1, ...base }` → ['a','b','...base']); null if not a literal */
function payloadKeys(s) {
  let i = 0; while (i < s.length && /\s/.test(s[i])) i++;
  if (s[i] !== '{') return null;
  const keys = []; let depth = 0, tok = '', start = true;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === '{' || c === '[' || c === '(') { depth++; if (depth === 1) { start = true; tok = ''; continue; } }
    else if (c === '}' || c === ']' || c === ')') { depth--; if (depth === 0) { if (start && tok.trim()) keys.push(tok.trim()); break; } }
    if (depth !== 1) continue;
    if (c === ',') { if (start && tok.trim()) keys.push(tok.trim()); start = true; tok = ''; continue; }
    if (c === ':' && start) { keys.push(tok.trim()); start = false; tok = ''; continue; }
    if (start) tok += c;
  }
  return keys.map(k => k.replace(/^['"]|['"]$/g, '')).filter(k => /^(\.\.\.)?[\w$.()]+$/.test(k));
}

/** is column `col` of this line inside a string or after a // comment? (one line's view — a call quoted in a string, a
 *  hook's name like "os.emit('x.y')", or a commented-out call is not an emit) */
function _quotedOrCommented(lineText, col) {
  let q = null;
  for (let i = 0; i < col; i++) {
    const c = lineText[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && lineText[i + 1] === '/') return true;
    if (c === '/' && lineText[i + 1] === '*' && !lineText.slice(i + 2, col).includes('*/')) return true;
  }
  return !!q || /^\s*\*/.test(lineText);   // a JSDoc / block-comment continuation line
}

/** constantTables(texts) → Map('HOST.COMPARTMENT_CREATED' → 'host:compartment:created') — single-level string tables */
function constantTables(texts) {
  const table = new Map(); table.tables = new Set();
  for (const text of texts) {
    let m; TABLE_RE.lastIndex = 0;
    while ((m = TABLE_RE.exec(text))) {
      let depth = 1, i = TABLE_RE.lastIndex;
      for (; i < text.length && depth; i++) { if (text[i] === '{') depth++; else if (text[i] === '}') depth--; }
      const body = text.slice(TABLE_RE.lastIndex, i - 1);
      if (/\b[A-Z][A-Z0-9_]*\s*:\s*['"]/.test(body)) table.tables.add(m[1]);
      const ent = /\b([A-Z][A-Z0-9_]*)\s*:\s*(['"])([^'"\n]+)\2/g; let e;
      while ((e = ent.exec(body))) if (!table.has(`${m[1]}.${e[1]}`)) table.set(`${m[1]}.${e[1]}`, e[3]);
    }
  }
  return table;
}

/**
 * extractEmits(text, constants?) → [{ event, line, dynamic, via?, payload }] — every emit in one file's source.
 * A constant the tables do not resolve comes back as { constant: 'X.Y', unread: true } — said, not guessed.
 */
function extractEmits(text, constants = null) {
  const out = [];
  const lines = text.split('\n');
  const lineAt = (idx) => text.slice(0, idx).split('\n').length;
  let m; EMIT_RE.lastIndex = 0;
  while ((m = EMIT_RE.exec(text))) {
    const line = lineAt(m.index);
    const lineStart = text.lastIndexOf('\n', m.index - 1) + 1;
    if (_quotedOrCommented(lines[line - 1] || '', m.index - lineStart)) continue;
    const rest = text.slice(EMIT_RE.lastIndex);
    // `emit(name, { … })` → that object; `emit({ type: name, data: { … } })` → its data
    const dataM = /^\s*,\s*(?:data|payload)\s*:\s*/.exec(rest);
    const payload = dataM ? payloadKeys(rest.slice(dataM[0].length)) : /^\s*,/.test(rest) ? payloadKeys(rest.replace(/^\s*,/, '')) : null;
    if (m[3]) {
      const ref = `${m[3]}.${m[4]}`, name = constants && constants.get(ref);
      // the table is there and lacks the key: the emit sends `undefined` — a defect, not a gap in what is read
      if (!name) { out.push({ constant: ref, line, unread: true, missing: !!(constants && constants.tables && constants.tables.has(m[3])) }); continue; }
      if (isSystemEvent(name)) out.push({ event: name, line, dynamic: false, via: ref, payload });
      continue;
    }
    const quote = m[1], name = m[2];
    if (quote === '`' && name.includes('${')) {
      const cm = EMITS_COMMENT_RE.exec(lines[line - 1] || '') || EMITS_COMMENT_RE.exec(lines[line - 2] || '');
      // the names on the comment line; anything else on it (a reason after a dash) is prose
      const named = cm ? cm[1].split(/[,\s]+/).filter(isSystemEvent) : [];
      if (!named.length) { out.push({ event: name, line, dynamic: true, unresolved: true, payload }); continue; }
      for (const ev of named) out.push({ event: ev, line, dynamic: true, via: 'emits comment', payload });
      continue;
    }
    if (!isSystemEvent(name)) continue;
    out.push({ event: name, line, dynamic: false, payload });
  }
  TERNARY_RE.lastIndex = 0;
  while ((m = TERNARY_RE.exec(text))) {
    const line = lineAt(m.index);
    if (_quotedOrCommented(lines[line - 1] || '', m.index - (text.lastIndexOf('\n', m.index - 1) + 1))) continue;
    for (const name of [m[2], m[4]]) if (isSystemEvent(name)) out.push({ event: name, line, dynamic: false, payload: null });
  }
  return out;
}

/**
 * checkSources({ system, sources: [{ file, text }], taxonomy }) → the report (pure).
 *   emitted:      [{ event, key, sites: ['file:line'], payload: [keys seen at the sites] }]
 *   undeclared:   emitted events whose key the taxonomy lacks
 *   unresolved:   dynamic emits with no `// emits:` comment
 *   unused:       taxonomy keys no source emits (said; a key may be emitted from outside the system, e.g. a CLI)
 *   collisions:   two different event names that map to one key (a hard error — one key, one event)
 *   unread:       a constant (`EVENTS.X`) no table in the system's own source resolves — said, not failed
 *   missing:      a constant whose table IS in the source but has no such key — the emit sends undefined: a failure
 */
function checkSources({ system, sources, taxonomy }) {
  const byEvent = new Map(); const unresolved = [], unread = [], missing = [];
  const constants = constantTables(sources.map(x => x.text));
  for (const { file, text } of sources) {
    for (const e of extractEmits(text, constants)) {
      if (e.unread) { (e.missing ? missing : unread).push({ constant: e.constant, site: `${file}:${e.line}` }); continue; }
      if (e.unresolved) { unresolved.push({ template: e.event, site: `${file}:${e.line}` }); continue; }
      const row = byEvent.get(e.event) || { event: e.event, key: keyOf(e.event), sites: [], payload: new Set() };
      row.sites.push(`${file}:${e.line}`);
      for (const k of e.payload || []) row.payload.add(k);
      byEvent.set(e.event, row);
    }
  }
  const emitted = [...byEvent.values()].map(r => ({ ...r, payload: [...r.payload] })).sort((a, b) => a.event.localeCompare(b.event));
  const declared = new Set(Object.keys(taxonomy || {}));
  const undeclared = emitted.filter(r => !declared.has(r.key));
  const emittedKeys = new Set(emitted.map(r => r.key));
  const unused = [...declared].filter(k => !emittedKeys.has(k)).sort();
  const byKey = new Map(); const collisions = [];
  for (const r of emitted) { const prev = byKey.get(r.key); if (prev && prev !== r.event) collisions.push({ key: r.key, events: [prev, r.event] }); byKey.set(r.key, r.event); }
  return { system, emitted, undeclared, unresolved, unread, missing, unused, collisions, ok: !undeclared.length && !unresolved.length && !missing.length && !collisions.length };
}

/** taxonomyFileOf(root, system) → the system's own taxonomy file, or null (ET1 lets it sit at the root or under src/) */
function taxonomyFileOf(root, system) {
  for (const rel of ['event-taxonomy.js', 'event-taxonomy.cjs', 'src/event-taxonomy.js']) {
    const f = path.join(root, system, rel);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

function _walk(dir, out) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of ents) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !fs.existsSync(path.join(dir, e.name, '.template-tree'))) _walk(path.join(dir, e.name), out); }
    else if (SOURCE_EXT.test(e.name) && !TEST_FILE.test(e.name) && !/^event-taxonomy\./.test(e.name)) out.push(path.join(dir, e.name));
  }
  return out;
}

/** checkSystem(root, system) → the report for one system's directory, read from disk; `taxonomyFile: null` when it has none */
function checkSystem(root, system) {
  const sysDir = path.join(root, system);
  const files = _walk(sysDir, []);
  const sources = files.map(f => ({ file: path.relative(root, f), text: fs.readFileSync(f, 'utf8') }));
  const tf = taxonomyFileOf(root, system);
  let taxonomy = {}, loadError = null;
  if (tf) { try { delete require.cache[require.resolve(tf)]; taxonomy = require(tf); } catch (e) { loadError = e.message; } }
  const r = checkSources({ system, sources, taxonomy });
  return { ...r, taxonomyFile: tf && path.relative(root, tf), loadError, ok: r.ok && !!tf && !loadError };
}

/**
 * againstBaseline(report, baseline) → { ok, added, cleared } (pure). The baseline is the drift that existed when the
 * check began (contracts/event-contract-baseline.json): per system, the undeclared events, the unresolved templates and
 * the missing constants.
 * It only shrinks. `added` — undeclared now, not in the baseline: new drift, a failure. `cleared` — in the baseline,
 * no longer undeclared: declared since, so the baseline must drop it (also a failure, so the file stays exact).
 * A collision always fails; the baseline never excuses one.
 */
function againstBaseline(report, baseline = {}) {
  const was = new Set([...(baseline.undeclared || []), ...(baseline.unresolved || []).map(t => `template:${t}`), ...(baseline.missing || []).map(c => `missing:${c}`)]);
  const now = new Set([...report.undeclared.map(r => r.event), ...report.unresolved.map(u => `template:${u.template}`), ...(report.missing || []).map(c => `missing:${c.constant}`)]);
  const added = [...now].filter(x => !was.has(x)).sort();
  const cleared = [...was].filter(x => !now.has(x)).sort();
  return { ok: !added.length && !cleared.length && !report.collisions.length && !report.loadError, added, cleared };
}

const BASELINE_FILE = 'contracts/event-contract-baseline.json';
/** loadBaseline(root) → { systems: { <system>: { undeclared, unresolved } } } — the systems held to the contract */
function loadBaseline(root) { return JSON.parse(fs.readFileSync(path.join(root, BASELINE_FILE), 'utf8')); }

module.exports = { MODULE_ID, VERSION, BASELINE_FILE, keyOf, payloadKeys, constantTables, extractEmits, checkSources, checkSystem, taxonomyFileOf, againstBaseline, loadBaseline };
