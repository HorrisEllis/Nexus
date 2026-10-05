'use strict';
/**
 * lib/registry-harness.js — the component registry as a small model's wiring harness.
 * comp_id: nexus.lib.registry-harness
 *
 * §0.39.266 — James: "use the component registry as the wiring harness like loom does for nexus, that way
 * it makes the registry a map and event bus, so chunks can have minial context" · "it's meant to make small
 * llms capable of building entire codebases regardless of the size … thats way too much to inject when we
 * have tools they can use to get context" · "loom should have this mapped already".
 *
 * Nothing new is mapped here. This is a read view over maps Nexus already keeps:
 *   nexus repos   loom/data/registry.json (components, hooks, wires) + loom/data/events.json (every emit/listen)
 *                 + the nexus-self snapshot (which file each component id is: loom's own idFor rule)
 *   other repos   the repo's own graph.json (idearium import pipeline) in the same shape, events read with
 *                 loom's own eventsOf()
 *   tools         the registered agent tools (lib/agent-tools/tool-catalog.js groups), found like anything else
 *
 * One component = one file (James, D1). A model starts from one component's CARD — what it is, what it
 * requires, who requires it, the events it emits and hears and who is on the other end, the tests that cover
 * it — and pulls anything else with find / card / read. Nothing is pushed into its prompt but that card.
 *
 * Pure reads; the only writes go through lib/repo-inject.js (and, for a nexus repo, its approval gate).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LOOM_REGISTRY = path.join(ROOT, 'loom', 'data', 'registry.json');
const LOOM_EVENTS = path.join(ROOT, 'loom', 'data', 'events.json');
const READ_MAX_LINES = parseInt(process.env.HARNESS_READ_MAX_LINES || '200', 10);
const READ_MAX_CHARS = parseInt(process.env.HARNESS_READ_MAX_CHARS || '12000', 10);
const CODE_EXT = /\.(?:[cm]?js|jsx|ts|tsx)$/;
const TEST_RE = /(?:^|\/)(?:tests?|__tests__)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;

const SM = () => require('../loom/scanners/source-map.js');
const _readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } };
const _mtime = (p) => { try { return fs.statSync(p).mtimeMs; } catch (_) { return 0; } };

// ── the index: one shape for both sources ─────────────────────────────────────────────────────────────
// { kind:'nexus'|'repo', files:Set(path), idOf(path)->id, fileOf(id)->path|null,
//   requires: Map(id->Set(id)), requiredBy: Map(id->Set(id)), events: {byFile, byEvent}, routes: Map(id->[route]) }

let _nexus = null, _nexusKey = null;
function _nexusIndex({ liveRoot = null } = {}) {
  const store = require('./nexus-self/store.js');
  const head = store.head();
  const key = `${_mtime(LOOM_REGISTRY)}|${_mtime(LOOM_EVENTS)}|${head.hash}|${liveRoot || ''}`;
  if (_nexus && _nexusKey === key) return _nexus;
  const snap = head.hash ? store.loadSnapshot(head.hash) : null;
  _nexus = buildNexusIndex({ files: snap ? store.filesOf(snap).map(([p]) => p) : [], root: liveRoot, snapshot: head.hash || null });
  _nexusKey = key;
  return _nexus;
}

/**
 * buildNexusIndex({ files, root }) — the nexus index over any file list: the snapshot's (the harness) or a walk of
 * the live tree (lib/atlas-generate.js, 0.39.266 A1). Same registry, same events, same rules.
 */
function buildNexusIndex({ files: fileList, root = null, snapshot = null }) {
  const files = new Set(fileList);
  const { idFor } = SM();
  const byId = new Map();
  for (const p of files) if (CODE_EXT.test(p)) byId.set(idFor(p), p);
  const reg = _readJson(LOOM_REGISTRY) || { component: {}, hook: {}, wire: {} };
  const hookComp = new Map(Object.values(reg.hook || {}).map(h => [h.id, h.component_id]));
  const requires = new Map(), requiredBy = new Map();
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
  for (const w of Object.values(reg.wire || {})) {
    if (w.type === 'event') continue;                            // events come from events.json (wired or not)
    const from = hookComp.get(w.from_hook_id), to = hookComp.get(w.to_hook_id);
    if (!from || !to || from === to) continue;
    // a require wire runs dependency.export -> consumer.import: the consumer requires the dependency
    add(requires, to, from); add(requiredBy, from, to);
  }
  const routes = new Map();
  for (const c of Object.values(reg.component || {})) if (c.route) { if (!routes.has(c.id)) routes.set(c.id, []); routes.get(c.id).push(c.route); }
  const ev = _readJson(LOOM_EVENTS) || { byFile: {}, byEvent: {} };
  return {
    kind: 'nexus', files, snapshot,
    idOf: (p) => (CODE_EXT.test(p) ? idFor(p) : p),
    fileOf: (id) => byId.get(id) || (files.has(id) ? id : null),
    ids: () => [...byId.keys()],
    requires, requiredBy, routes, events: { byFile: ev.byFile || {}, byEvent: ev.byEvent || {} },
    registryComponents: Object.keys(reg.component || {}).length,
    // the LIVE file, not the snapshot blob: what the model reads is what the approval gate compares against
    read: (p) => { if (!files.has(p)) throw new Error(`${p} is not a Nexus file`); return fs.readFileSync(path.join(root || require('./nexus-self/systems.js').ROOT, p), 'utf8'); },
    registry: reg,
  };
}

const _repoCache = new Map();   // repoDir -> { key, index }
function _repoIndex(repoDir) {
  const gp = path.join(repoDir, 'graph.json');
  const key = `${_mtime(gp)}`;
  const hit = _repoCache.get(repoDir);
  if (hit && hit.key === key) return hit.index;
  const g = _readJson(gp) || { nodes: [], edges: [] };
  const files = new Set((g.nodes || []).filter(n => n.kind === 'file' && n.file).map(n => n.file));
  const requires = new Map(), requiredBy = new Map();
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
  for (const e of g.edges || []) {
    if (e.resolution !== 'resolved' || !e.from || !e.to) continue;
    // §SB34 0.39.326 — the graph also holds each edge's inverse (relation depended_on_by, via inverse): read as a
    // require it made every dependency look required both ways. Inverse edges are turned round, so each is counted once.
    let from = String(e.from).replace(/^file:/, ''), to = String(e.to).replace(/^file:/, '');
    if (e.relation === 'depended_on_by') [from, to] = [to, from];
    if (!files.has(from) || !files.has(to) || from === to) continue;
    add(requires, from, to); add(requiredBy, to, from);
  }
  const byFile = {}, byEvent = {};
  const { eventsOf, stripNonCode } = SM();
  for (const p of files) {
    if (!CODE_EXT.test(p)) continue;
    let src; try { src = stripNonCode(fs.readFileSync(path.join(repoDir, p), 'utf8')); } catch (_) { continue; }
    const ev = eventsOf(src);
    if (!ev.emits.length && !ev.listens.length) continue;
    byFile[p] = ev;
    for (const n of ev.emits) (byEvent[n] = byEvent[n] || { emitters: [], listeners: [] }).emitters.push(p);
    for (const n of ev.listens) (byEvent[n] = byEvent[n] || { emitters: [], listeners: [] }).listeners.push(p);
  }
  const index = {
    kind: 'repo', files, idOf: (p) => p, fileOf: (id) => (files.has(id) ? id : null), ids: () => [...files].filter(p => CODE_EXT.test(p)),
    requires, requiredBy, routes: new Map(), events: { byFile, byEvent },
    read: (p) => fs.readFileSync(path.join(repoDir, p), 'utf8'),
  };
  _repoCache.set(repoDir, { key, index });
  return index;
}

/** indexFor(repo, repoDir) — the harness index this repo's agent navigates. */
function indexFor(repo, repoDir, { liveRoot = null } = {}) {
  if (repo && repo.nexusSelf) return _nexusIndex({ liveRoot });
  if (!repoDir) throw new Error('this repo has no directory to read');
  return _repoIndex(repoDir);
}

// ── resolve: whatever the model wrote → one component ─────────────────────────────────────────────────
function resolve(idx, ref) {
  const r = String(ref || '').trim().replace(/^['"`]|['"`]$/g, '').replace(/^\.\//, '').replace(/:\d+(-\d+)?$/, '');
  if (!r) return null;
  if (idx.fileOf(r)) return { id: idx.kind === 'nexus' && CODE_EXT.test(r) ? idx.idOf(r) : r, file: idx.fileOf(r) };
  if (idx.files.has(r)) return { id: idx.idOf(r), file: r };
  for (const ext of ['.js', '.cjs', '.mjs', '.ts', '/index.js']) if (idx.files.has(r + ext)) return { id: idx.idOf(r + ext), file: r + ext };
  // a bare basename that names exactly one file
  if (!r.includes('/')) {
    const hits = [...idx.files].filter(p => p.split('/').pop() === r || p.split('/').pop().replace(/\.[^.]+$/, '') === r);
    if (hits.length === 1) return { id: idx.idOf(hits[0]), file: hits[0] };
  }
  return null;
}

// ── find ──────────────────────────────────────────────────────────────────────────────────────────────
/**
 * find(idx, query, { kind, limit, tools }) -> { results:[{ kind, id, file?, why }] }
 * kind: component | event | tool | text | stored | any. (stored = lib/component-store.js, 0.39.266 C4) Components match on path and id; events on name; tools on name and
 * description (tools passed in by the caller: the tool list lives in copilot's process).
 */
function find(idx, query, { kind = 'any', limit = 15, tools = null } = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { error: 'query is required' };
  const words = q.split(/[\s/._:-]+/).filter(w => w.length > 1);
  const score = (s) => { s = String(s).toLowerCase(); if (s === q) return 100; if (s.endsWith('/' + q) || s.endsWith('.' + q)) return 60; if (s.includes(q)) return 40; return words.length > 1 && words.every(w => s.includes(w)) ? 20 : 0; };
  const out = [];
  if (kind === 'any' || kind === 'component') {
    for (const p of idx.files) {
      const id = idx.idOf(p); const sc = Math.max(score(p), score(id));
      if (sc) out.push({ kind: 'component', id, file: p, score: sc + (CODE_EXT.test(p) ? 5 : 0) - (TEST_RE.test(p) ? 10 : 0) });
    }
  }
  if (kind === 'any' || kind === 'event') {
    for (const [name, v] of Object.entries(idx.events.byEvent)) {
      const sc = score(name);
      if (sc) out.push({ kind: 'event', id: name, why: `${v.emitters.length} emitter(s), ${v.listeners.length} listener(s)`, score: sc });
    }
  }
  if ((kind === 'any' || kind === 'tool') && Array.isArray(tools)) {
    const groups = require('./agent-tools/tool-catalog.js');
    for (const t of tools) {
      const g = groups.groupOf ? groups.groupOf(t.name) : null;
      const sc = Math.max(score(t.name), score(t.description || '') ? 15 : 0, g && (score(g.id) || score(g.title)) ? 30 : 0);
      if (sc) out.push({ kind: 'tool', id: t.name, why: `${g ? g.title + ' — ' : ''}${String(t.description || '').split(/(?<=\.)\s/)[0].slice(0, 140)}`, score: sc });
    }
  }
  // text: where the words appear in code — a small model asks by concept ("the flush lock"), not by file name.
  // Every word must be on the same line; tests rank last. Bounded: stops at 4x the limit.
  if (kind === 'text' || (kind === 'any' && out.filter(o => o.kind === 'component').length < 3)) {
    const want = words.length ? words : [q];
    const hits = [];
    for (const p of idx.files) {
      if (!CODE_EXT.test(p)) continue;
      let src; try { src = idx.read(p); } catch (_) { continue; }
      const low = src.toLowerCase();
      if (!want.every(w => low.includes(w))) continue;
      const lines = low.split('\n');
      // code lines outrank comment lines: a changelog comment that mentions "flush lock" is not the flush lock
      const isComment = (l) => /^\s*(\/\/|\*|\/\*|#)/.test(l);
      let codeAt = -1, codeN = 0, commentAt = -1;
      for (let i = 0; i < lines.length; i++) {
        if (!want.every(w => lines[i].includes(w))) continue;
        if (isComment(lines[i])) { if (commentAt < 0) commentAt = i; } else { if (codeAt < 0) codeAt = i; codeN++; }
      }
      const at = codeAt >= 0 ? codeAt : commentAt;
      if (at < 0) continue;
      hits.push({ kind: 'text', id: idx.idOf(p), file: p, line: at + 1, why: src.split('\n')[at].trim().slice(0, 140),
                  score: (codeN ? 12 + Math.min(codeN, 8) * 2 : 4) - (TEST_RE.test(p) ? 6 : 0) - (/(^|\/)(version|changelog)/i.test(p) ? 6 : 0) });
      if (hits.length >= limit * 4) break;
    }
    out.push(...hits);
  }
  // §0.39.266 (C4) — the component store: what WARP already built, in any project. Found, never injected (C-D6).
  if (kind === 'stored' || kind === 'any') {
    try { for (const r of require('./component-store.js').find(q, { limit })) out.push({ ...r, score: kind === 'stored' ? 50 : 10 }); } catch (_) {}
  }
  out.sort((a, b) => b.score - a.score || String(a.id).length - String(b.id).length);
  return { query, kind, total: out.length, results: out.slice(0, limit).map(({ score, ...r }) => r) };
}

// ── card ──────────────────────────────────────────────────────────────────────────────────────────────
function _exportsOf(src) {
  const names = new Set();
  const s = src.replace(/\/\*[\s\S]*?\*\//g, '');
  let m;
  const rxME = /module\.exports\s*=\s*\{([^}]*)\}/g;
  while ((m = rxME.exec(s))) for (const part of m[1].split(',')) { const n = part.split(':')[0].trim().replace(/\.\.\./, ''); if (/^[A-Za-z_$][\w$]*$/.test(n)) names.add(n); }
  const rxE = /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = rxE.exec(s))) names.add(m[1]);
  const rxEB = /\bexport\s*\{([^}]*)\}/g;
  while ((m = rxEB.exec(s))) for (const part of m[1].split(',')) { const n = part.trim().split(/\s+as\s+/).pop(); if (/^[A-Za-z_$][\w$]*$/.test(n)) names.add(n); }
  const rxEX = /\bexports\.([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = rxEX.exec(s))) names.add(m[1]);
  return [...names];
}
function _purposeOf(src) {
  const head = src.slice(0, 1600);
  const block = /\/\*\*?([\s\S]*?)\*\//.exec(head);
  const text = (block ? block[1] : (head.match(/^\s*\/\/.*$/gm) || []).join('\n'))
    .split('\n').map(l => l.replace(/^\s*\*?\s?|^\s*\/\/\s?/, '').trim())
    .filter(l => l && !/^(uuid|comp_id|version|layer)\s*:/i.test(l) && !/^[-═─=*]+$/.test(l) && !/^'use strict'/.test(l));
  return text.slice(0, 2).join(' ').slice(0, 240) || null;
}

/**
 * card(idx, ref) -> the component's registry card, or { error }.
 * Small on purpose: ids and names, never code. Each list is capped and says how many it left out.
 */
const _isStored = (ref) => /^store:/.test(String(ref || '').trim());
function _storedCard(ref) {
  const CS = require('./component-store.js');
  const g = CS.get(ref);
  if (!g) return { error: `no stored component "${ref}" — use find with kind "stored"` };
  const m = g.manifest;
  return { id: `store:${m.id}@${m.version}`, file: m.path, lines: g.content.split('\n').length, chars: g.content.length, purpose: m.purpose,
           exports: _exportsOf(g.content).slice(0, 30), dependencies: m.dependencies, unresolved: m.unresolved.map(u => u.path), npm: m.npm,
           versions: (CS.loadIndex().components[m.id] || {}).versions ? Object.keys(CS.loadIndex().components[m.id].versions) : [m.version],
           builtBy: m.builtBy && { spec: m.builtBy.specName, agent: m.builtBy.agent } };
}

function card(idx, ref, { cap = 12 } = {}) {
  if (_isStored(ref)) return _storedCard(ref);
  const hit = resolve(idx, ref);
  if (!hit) return { error: `no component "${ref}" — use find first` };
  const { id, file } = hit;
  let src = '';
  try { src = idx.read(file); } catch (e) { return { error: `cannot read ${file}: ${e.message}` }; }
  const list = (set) => { const a = [...(set || [])].sort(); return a.length > cap ? [...a.slice(0, cap), `… +${a.length - cap} more`] : a; };
  const fileEv = idx.events.byFile[idx.kind === 'nexus' ? id : file] || { emits: [], listens: [] };
  const other = (name, side) => { const v = idx.events.byEvent[name] || { emitters: [], listeners: [] }; return (side === 'emit' ? v.listeners : v.emitters).filter(x => x !== id && x !== file); };
  const requiredBy = [...(idx.requiredBy.get(id) || [])];
  const tests = requiredBy.filter(x => TEST_RE.test(idx.fileOf(x) || x) || /^nexus\.tests\./.test(x));
  return {
    id, file, lines: src.split('\n').length, chars: src.length,
    purpose: _purposeOf(src),
    exports: _exportsOf(src).slice(0, 30),
    requires: list(idx.requires.get(id)),
    requiredBy: list(requiredBy.filter(x => !tests.includes(x))),
    emits: fileEv.emits.slice(0, cap).map(n => ({ event: n, heardBy: other(n, 'emit').slice(0, 6) })),
    listens: fileEv.listens.slice(0, cap).map(n => ({ event: n, emittedBy: other(n, 'listen').slice(0, 6) })),
    routes: (idx.routes.get(id) || []).slice(0, cap),
    tests: list(tests),
  };
}

/** eventCard(idx, name) — who emits and who hears one event. */
function eventCard(idx, name) {
  const v = idx.events.byEvent[name];
  if (!v) return { error: `no event "${name}" in the registry` };
  return { event: name, emitters: v.emitters, listeners: v.listeners };
}

// ── read ──────────────────────────────────────────────────────────────────────────────────────────────
/** read(idx, ref, { start, end }) -> numbered lines of one component; capped, and says what is left. */
function read(idx, ref, { start = 1, end = null } = {}) {
  let hit, src;
  if (_isStored(ref)) {                                     // store:<id>@<version> — a component WARP built before
    const g = require('./component-store.js').get(ref);
    if (!g) return { error: `no stored component "${ref}" — use find with kind "stored"` };
    hit = { id: `store:${g.id}@${g.version}`, file: g.manifest.path }; src = g.content;
  } else {
    hit = resolve(idx, ref);
    if (!hit) return { error: `no component "${ref}" — use find first` };
    try { src = idx.read(hit.file); } catch (e) { return { error: `cannot read ${hit.file}: ${e.message}` }; }
  }
  const lines = src.split('\n');
  const s = Math.max(1, parseInt(start, 10) || 1);
  let e = Math.min(lines.length, end ? parseInt(end, 10) : s + READ_MAX_LINES - 1, s + READ_MAX_LINES - 1);
  let body = '';
  for (let i = s; i <= e; i++) {
    const line = `${i}\t${lines[i - 1]}\n`;
    if (body.length + line.length > READ_MAX_CHARS) { e = i - 1; break; }
    body += line;
  }
  return { id: hit.id, file: hit.file, start: s, end: e, totalLines: lines.length, more: e < lines.length ? `lines ${e + 1}-${lines.length} not shown — read again with start=${e + 1}` : null, text: body };
}

/** namedIn(idx, text) -> components the text names by path or file name (for the one card a prompt carries). */
function namedIn(idx, text, max = 2) {
  const out = [];
  const seen = new Set();
  for (const m of String(text || '').matchAll(/[\w./-]+\.(?:[cm]?js|jsx|ts|tsx|json|md|spec)\b|[\w-]+(?:\/[\w.-]+)+/g)) {
    const hit = resolve(idx, m[0]);
    if (hit && !seen.has(hit.file)) { seen.add(hit.file); out.push(hit); if (out.length >= max) break; }
  }
  return out;
}

module.exports = { indexFor, buildNexusIndex, resolve, find, card, eventCard, read, namedIn, READ_MAX_LINES, READ_MAX_CHARS, TEST_RE, CODE_EXT, _purposeOf, _exportsOf, _nexusIndex, _repoIndex };
