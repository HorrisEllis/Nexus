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
//   - an event emitted through a constant (`bus.emit(EVENTS.X)`) is not read; it shows as an UNUSED key, said, not failed.
//   - test files and directories, node_modules, data and _archive are not the system's emits.
// Pure core (checkSources) + one IO wrapper (checkSystem). Never writes anything.

const fs = require('fs');
const path = require('path');

const MODULE_ID = 'lib.event-contract-check';
const VERSION = '1.0.0';

// a method (`bus.emit(`, `this.postEvent(`) or a bare helper (`_emitEvent(`, `busEmit?.(`), then a literal name
const CALL = String.raw`(?:\.|(?<![\w$.]))(?:emit|_emit|emitEvent|_emitEvent|busEmit|postEvent|broadcast|publish)(?:\?\.)?\(\s*`;
const EMIT_RE = new RegExp(CALL + String.raw`(['"\`])((?:(?!\1)[^\\\n]|\\.)*)\1`, 'g');
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

/** extractEmits(text) → [{ event, line, dynamic, declaredBy?, payload }] — every emit in one file's source */
function extractEmits(text) {
  const out = [];
  const lines = text.split('\n');
  const lineAt = (idx) => text.slice(0, idx).split('\n').length;
  let m; EMIT_RE.lastIndex = 0;
  while ((m = EMIT_RE.exec(text))) {
    const quote = m[1], name = m[2], line = lineAt(m.index);
    const after = text.slice(EMIT_RE.lastIndex).replace(/^\s*,/, '');
    const payload = /^\s*,/.test(text.slice(EMIT_RE.lastIndex)) ? payloadKeys(after) : null;
    if (quote === '`' && name.includes('${')) {
      const cm = EMITS_COMMENT_RE.exec(lines[line - 1] || '') || EMITS_COMMENT_RE.exec(lines[line - 2] || '');
      const named = cm ? cm[1].split(',').map(x => x.trim()).filter(Boolean) : [];
      if (!named.length) { out.push({ event: name, line, dynamic: true, unresolved: true, payload }); continue; }
      for (const ev of named) out.push({ event: ev, line, dynamic: true, declaredBy: 'emits comment', payload });
      continue;
    }
    if (!isSystemEvent(name)) continue;
    out.push({ event: name, line, dynamic: false, payload });
  }
  TERNARY_RE.lastIndex = 0;
  while ((m = TERNARY_RE.exec(text))) {
    const line = lineAt(m.index);
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
 */
function checkSources({ system, sources, taxonomy }) {
  const byEvent = new Map(); const unresolved = [];
  for (const { file, text } of sources) {
    for (const e of extractEmits(text)) {
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
  return { system, emitted, undeclared, unresolved, unused, collisions, ok: !undeclared.length && !unresolved.length && !collisions.length };
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
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) _walk(path.join(dir, e.name), out); }
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
 * check began (contracts/event-contract-baseline.json): per system, the undeclared events and the unresolved templates.
 * It only shrinks. `added` — undeclared now, not in the baseline: new drift, a failure. `cleared` — in the baseline,
 * no longer undeclared: declared since, so the baseline must drop it (also a failure, so the file stays exact).
 * A collision always fails; the baseline never excuses one.
 */
function againstBaseline(report, baseline = {}) {
  const was = new Set([...(baseline.undeclared || []), ...(baseline.unresolved || []).map(t => `template:${t}`)]);
  const now = new Set([...report.undeclared.map(r => r.event), ...report.unresolved.map(u => `template:${u.template}`)]);
  const added = [...now].filter(x => !was.has(x)).sort();
  const cleared = [...was].filter(x => !now.has(x)).sort();
  return { ok: !added.length && !cleared.length && !report.collisions.length && !report.loadError, added, cleared };
}

const BASELINE_FILE = 'contracts/event-contract-baseline.json';
/** loadBaseline(root) → { systems: { <system>: { undeclared, unresolved } } } — the systems held to the contract */
function loadBaseline(root) { return JSON.parse(fs.readFileSync(path.join(root, BASELINE_FILE), 'utf8')); }

module.exports = { MODULE_ID, VERSION, BASELINE_FILE, keyOf, payloadKeys, extractEmits, checkSources, checkSystem, taxonomyFileOf, againstBaseline, loadBaseline };
