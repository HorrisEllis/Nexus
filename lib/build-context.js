'use strict';
/**
 * lib/build-context.js — what a build agent knows about the file it is writing: its relations, not the whole project.
 * comp_id: nexus.lib.build-context
 * Version: 1.0.0 (0.39.308)
 *
 * James, 2026-10-05: "Should be more than that. Like using the traversal of chunks, primitives, like the relationship
 * between words when generating code. The boundaries. Learning to code from that" · "And the agents use it for context
 * right?" · "Yes. We need the agents to use it. Also what about the .node types. Also combining primitives or
 * invariants to build higher leverage code for less tokens."
 *
 * Found before building: the Agent tab's agent was given glyphs, registry cards, the atlas and its memory — the agent
 * that BUILDS a file was given the spec digest and the export lines of finished files, nothing else. The chunk cards,
 * the glyphs (lib/chunk-glyph.js), the registry harness's requires / required-by / events, the component store and the
 * spec's own obligations all existed and none reached a file's prompt.
 *
 * pack({ manifest, chunk, repo, repoDir, budget }) -> { text, chars, sections, sources, left }
 *
 * One bounded block, deterministic (no model, no network), every section labelled with where it came from:
 *   BUILDS ON     the files this one depends on (chunk.dependsOn, already built): path, purpose, exports, glyph —
 *                 their INTERFACE, never their code. Ranked by what this file's path and purpose name.
 *   USED BY       the files that will depend on this one: what they are for, so it exposes what they need.
 *   RELATIONS     when the file already exists in a repo (a repair, a rebuild, Nexus rebuilding itself): its registry
 *                 card — requires (and one level further), required by, events emitted and who hears them, tests.
 *                 The same index the Agent tab's harness reads (lib/registry-harness.js): loom's wires for Nexus,
 *                 the repo's graph.json otherwise.
 *   PRIMITIVES    proven components from OTHER projects that do this kind of work (lib/component-store.js): their
 *                 interface and glyph only, so the agent composes or mirrors a proven shape instead of inventing one.
 *                 This revises C-D6's default ("near matches are found, not injected") for build prompts — a build
 *                 agent has no find tool to look them up with; bytes are still never injected. Off: stored:false or
 *                 BUILD_CONTEXT_STORED=0.
 *   INVARIANTS    the spec's own obligations (MUST / NEVER / ALWAYS …) that name what this file is about.
 *
 * What did not fit the budget is listed in `left`, never dropped silently (§1.2). Sources that could not be read are
 * named in `sources`. The block rides BESIDE the prompt (the `memory` channel) so WARP's cache key stays the contract.
 */

const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.lib.build-context';
const VERSION = '1.0.0';
const DEFAULT_BUDGET = parseInt(process.env.BUILD_CONTEXT_BUDGET_CHARS || '3600', 10);
const SHARE = { buildsOn: 0.36, usedBy: 0.1, relations: 0.2, primitives: 0.2, invariants: 0.14 };
const GLYPH_MAX = 260;

const STOP = new Set(('the and for with that this from into your you are was were have has had not but all any can will what when where '
  + 'which who how why its file code only one each real use uses used make makes new data src lib index main app test tests '
  + 'module modules function functions export exports value values type types object string number list').split(' '));

function _words(s) {
  return new Set((String(s || '').toLowerCase().match(/[a-z][a-z0-9]{2,}/g) || []).filter(w => !STOP.has(w)));
}
function _overlap(a, b) { let n = 0; for (const w of a) if (b.has(w)) n++; return n; }
function _clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function _glyph(file, text) {
  try { const g = require('./chunk-glyph.js').glyph({ file, text }); return g.glyph ? _clip(g.glyph, GLYPH_MAX) : ''; }
  catch (_) { return ''; }
}
function _exports(text) {
  let names = [];
  try { names = require('./registry-harness.js')._exportsOf(String(text || '')); } catch (_) {}
  return [...new Set([...names, ..._objectExportKeys(text)])];
}
/**
 * the top-level keys of `module.exports = { … }` / `export default { … }`, read with brace depth — the harness's
 * one-line regex stops at the first `}`, so method shorthand (`{ play() { … }, stop }`) read as no exports at all.
 */
function _objectExportKeys(text) {
  const src = String(text || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const m = /(?:module\.exports|export\s+default)\s*=?\s*\{/.exec(src);
  if (!m) return [];
  const keys = [];
  let depth = 1, i = m.index + m[0].length, atKey = true, quote = null;
  for (; i < src.length && depth > 0; i++) {
    const ch = src[i];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{' || ch === '(' || ch === '[') { depth++; continue; }
    if (ch === '}' || ch === ')' || ch === ']') { depth--; continue; }
    if (depth !== 1) continue;
    if (ch === ',') { atKey = true; continue; }
    if (atKey && /[A-Za-z_$]/.test(ch)) {
      const k = /^(?:async\s+|get\s+|set\s+|\*\s*)?([A-Za-z_$][\w$]*)/.exec(src.slice(i));
      if (k) { keys.push(k[1]); i += k[0].length - 1; }
      atKey = false;
    } else if (!/\s/.test(ch)) atKey = false;
  }
  return keys.filter(k => !['async', 'get', 'set'].includes(k));
}
function _purposeOf(text) {
  try { return require('./registry-harness.js')._purposeOf(String(text || '')); } catch (_) { return null; }
}

/** the words that say what this file is: its path parts and its planned purpose */
function _subjectOf(chunk) {
  const f = chunk.file || {};
  const p = chunk.realPath || f.path || chunk.title || '';
  return { path: p, layer: f.layer || null, purpose: f.purpose || chunk.sectionDesc || '', words: _words(`${p.replace(/[/._-]+/g, ' ')} ${f.purpose || chunk.sectionDesc || ''}`) };
}

function _live(manifest) { return (manifest.chunks || []).filter(c => c.status !== 'removed'); }
function _sectionOf(c) { return c.sectionId || c.id || null; }

// ── sections ──────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * rankFiles(chunk, files) — the files most relevant to the one being built, first: a file this one's path or purpose
 * NAMES (by its base name) outranks one that only shares words with it; ties keep path order. Deterministic.
 * files: [{ realPath, content, file: { layer, purpose } }]
 */
function rankFiles(chunk, files) {
  const subject = _subjectOf(chunk);
  const hay = `${subject.path} ${subject.purpose}`.toLowerCase();
  return (files || []).map(c => {
    const base = path.basename(c.realPath || '').replace(/\.[^.]+$/, '').toLowerCase();
    const named = base.length >= 3 && !STOP.has(base) && new RegExp(`(^|[^a-z0-9])${base.replace(/[^a-z0-9]/g, '\\$&')}([^a-z0-9]|$)`).test(hay) ? 6 : 0;
    const words = _words(`${String(c.realPath || '').replace(/[/._-]+/g, ' ')} ${(c.file && c.file.purpose) || ''}`);
    return { c, score: named + _overlap(subject.words, words) * 2 };
  }).sort((a, b) => b.score - a.score || String(a.c.realPath).localeCompare(String(b.c.realPath))).map(x => x.c);
}

/** interfaceOf(c) — a built file as another file sees it: path, layer, purpose, exports, glyph. Never its code. */
function interfaceOf(c) {
  const ex = _exports(c.content).slice(0, 14);
  const lines = [`- ${c.realPath}${c.file && c.file.layer ? ` (${c.file.layer})` : ''} — ${_clip((c.file && c.file.purpose) || _purposeOf(c.content) || 'no stated purpose', 140)}`];
  if (ex.length) lines.push(`    exports: ${ex.join(', ')}`);
  const g = _glyph(c.realPath, c.content);
  if (g) lines.push(`    glyph: ${g}`);
  return lines.join('\n');
}

/** the sections a chunk depends on, all the way down (a layer's dependsOn names only the nearest layer below it) */
function _dependsClosure(manifest, chunk) {
  const bySection = new Map(_live(manifest).map(c => [_sectionOf(c), c]));
  const seen = new Set();
  const stack = [...(chunk.dependsOn || [])];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id) || id === _sectionOf(chunk)) continue;
    seen.add(id);
    const c = bySection.get(id);
    if (c) stack.push(...(c.dependsOn || []));
  }
  return seen;
}

function _buildsOn(manifest, chunk) {
  const deps = _dependsClosure(manifest, chunk);
  if (!deps.size) return { items: [], why: 'no declared dependencies (a bottom layer)' };
  const built = _live(manifest).filter(c => c.uuid !== chunk.uuid && deps.has(_sectionOf(c)) && c.status === 'complete'
    && c.realPath && typeof c.content === 'string' && c.content.trim());
  const items = rankFiles(chunk, built).map(c => ({ key: c.realPath, text: interfaceOf(c) }));
  return { items, pending: [...deps].filter(d => !_live(manifest).some(c => _sectionOf(c) === d && c.status === 'complete')).length };
}

function _usedBy(manifest, chunk) {
  const me = _sectionOf(chunk);
  // every file that stands on this one, through any number of layers — the ones that name it first
  const users = _live(manifest).filter(c => c.uuid !== chunk.uuid && c.realPath && _dependsClosure(manifest, c).has(me));
  return { items: rankFiles(chunk, users).map(c => ({ key: c.realPath, text: `- ${c.realPath} — ${_clip((c.file && c.file.purpose) || c.sectionDesc || '', 120)}` })) };
}

function _relations(repo, repoDir, subject) {
  if (!subject.path || (!repoDir && !(repo && repo.nexusSelf))) return { items: [], why: 'no repo on disk to read relations from' };
  let H, idx;
  try { H = require('./registry-harness.js'); idx = H.indexFor(repo || {}, repoDir); }
  catch (e) { return { items: [], why: `registry unavailable: ${e.message}` }; }
  const c = H.card(idx, subject.path, { cap: 8 });
  if (c.error) return { items: [], why: 'the file is not in the repo yet — nothing to relate' };
  const items = [];
  const join = (a) => (a || []).join(', ');
  items.push({ key: 'card', text: `- ${c.id}${c.purpose ? ` — ${_clip(c.purpose, 140)}` : ''}` });
  if (c.exports && c.exports.length) items.push({ key: 'exports', text: `    exports now: ${join(c.exports.slice(0, 16))}` });
  if (c.requires && c.requires.length) items.push({ key: 'requires', text: `    requires: ${join(c.requires)}` });
  // one level further up: what its dependencies themselves stand on (the upstream walk, lib/relational-context.js's
  // direction, over the same wires the harness already loaded — no second registry read)
  const further = new Set();
  for (const r of (idx.requires.get(c.id) || [])) for (const r2 of (idx.requires.get(r) || [])) if (r2 !== c.id && !(idx.requires.get(c.id) || new Set()).has(r2)) further.add(r2);
  if (further.size) items.push({ key: 'upstream', text: `    and through them: ${join([...further].sort().slice(0, 8))}${further.size > 8 ? ` … +${further.size - 8}` : ''}` });
  if (c.requiredBy && c.requiredBy.length) items.push({ key: 'requiredBy', text: `    required by (keep their imports working): ${join(c.requiredBy)}` });
  for (const e of c.emits || []) items.push({ key: `emit:${e.event}`, text: `    emits ${e.event}${e.heardBy.length ? ` → heard by ${join(e.heardBy)}` : ''}` });
  for (const e of c.listens || []) items.push({ key: `hear:${e.event}`, text: `    hears ${e.event}${e.emittedBy.length ? ` ← from ${join(e.emittedBy)}` : ''}` });
  if (c.tests && c.tests.length) items.push({ key: 'tests', text: `    tests: ${join(c.tests)}` });
  return { items };
}

function _primitives(manifest, subject, { limit = 3 } = {}) {
  let CS;
  try { CS = require('./component-store.js'); } catch (e) { return { items: [], why: `component store unavailable: ${e.message}` }; }
  const idx = CS.loadIndex();
  // the store keys a project by its slug (component-store idFor's first part) — compare like with like
  const own = (() => { try { return CS.idFor(manifest.name || 'project', 'x').split('.')[0]; } catch (_) { return String(manifest.name || '').toLowerCase(); } })();
  const base = path.basename(subject.path || '').replace(/\.[^.]+$/, '').toLowerCase();
  const scored = [];
  for (const c of Object.values(idx.components || {})) {
    if (String(c.project || '') === own) continue;                      // its own project: BUILDS ON covers it
    const v = c.versions && c.versions[c.latest];
    if (!v || v.failedVerification) continue;                                            // never offer a failed version
    if (path.extname(c.path || '') !== path.extname(subject.path || '')) continue;      // same kind of file
    const m = CS.manifest(c.id) || {};
    const words = _words(`${String(c.path).replace(/[/._-]+/g, ' ')} ${m.purpose || ''}`);
    const same = path.basename(c.path || '').replace(/\.[^.]+$/, '').toLowerCase() === base ? 4 : 0;
    const score = same + _overlap(subject.words, words) * 2;
    if (score >= 4) scored.push({ c, m, score });
  }
  scored.sort((a, b) => b.score - a.score || a.c.id.localeCompare(b.c.id));
  const items = [];
  for (const { c, m } of scored.slice(0, limit)) {
    const g = CS.get(`${c.id}@${c.latest}`);
    if (!g) continue;
    const ex = _exports(g.content).slice(0, 12);
    const lines = [`- store:${c.id}@${c.latest} (${c.path}, ${g.content.split('\n').length} lines${Object.keys(m.dependencies || {}).length ? `, ${Object.keys(m.dependencies).length} dep(s)` : ''}) — ${_clip(m.purpose || 'no stated purpose', 130)}`];
    if (ex.length) lines.push(`    exports: ${ex.join(', ')}`);
    const gl = _glyph(c.path, g.content);
    if (gl) lines.push(`    glyph: ${gl}`);
    items.push({ key: `store:${c.id}`, text: lines.join('\n') });
  }
  return { items, considered: scored.length };
}

const OBLIGATION = /\b(must|must not|never|always|shall|required|requires|only|cannot|guarantee[sd]?|invariant)\b/i;
function _invariants(manifest, subject, { limit = 6 } = {}) {
  const text = String(manifest.description || '');
  if (!text.trim()) return { items: [] };
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map(s => s.replace(/^[\s>*#-]+/, '').trim()).filter(s => s.length >= 16 && s.length <= 320 && OBLIGATION.test(s));
  const seen = new Set();
  const ranked = sentences.map((s, i) => ({ s, i, score: _overlap(subject.words, _words(s)) })).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const items = [];
  for (const { s } of ranked) { const k = s.toLowerCase(); if (seen.has(k)) continue; seen.add(k); items.push({ key: `inv${items.length}`, text: `- ${_clip(s, 220)}` }); if (items.length >= limit) break; }
  return { items };
}

// ── pack ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const HEADS = {
  buildsOn: 'BUILDS ON — files this one depends on, already built. Their interface, not their code: import these exports, do not redefine them.',
  usedBy: 'USED BY — files that will depend on this one. Export what they will need.',
  relations: 'RELATIONS — this file in the repo as it stands (the registry): keep these connections working.',
  primitives: 'PROVEN PRIMITIVES — components built and kept in other projects that do this kind of work. Mirror their shape and interface where it fits; write only what is new.',
  invariants: 'INVARIANTS — what the spec says must always hold, where it names this file\'s subject.',
};

/**
 * pack({ manifest, chunk, repo, repoDir, budget, stored, buildsOn }) — see the header. Never throws: a section that
 * fails is named in `sources` and the rest still go. buildsOn:false when the caller's prompt already carries the files
 * below (idearium's file prompt does — spec-engine _buildFilePrompt, through rankFiles + interfaceOf).
 */
function pack({ manifest, chunk, repo = null, repoDir = null, budget = DEFAULT_BUDGET, stored = process.env.BUILD_CONTEXT_STORED !== '0', buildsOn = true } = {}) {
  const sources = {};
  if (!manifest || !chunk) return { text: '', chars: 0, sections: {}, sources: { error: 'manifest and chunk are required' }, left: [] };
  const subject = _subjectOf(chunk);
  const run = (name, fn) => { try { const r = fn(); sources[name] = r.why || (r.items.length ? r.items.length : 0); return r.items; } catch (e) { sources[name] = `failed: ${e.message}`; return []; } };
  const all = {
    buildsOn: buildsOn ? run('buildsOn', () => _buildsOn(manifest, chunk)) : (sources.buildsOn = 'in the prompt', []),
    usedBy: run('usedBy', () => _usedBy(manifest, chunk)),
    relations: run('relations', () => _relations(repo, repoDir, subject)),
    primitives: stored ? run('primitives', () => _primitives(manifest, subject)) : (sources.primitives = 'off', []),
    invariants: run('invariants', () => _invariants(manifest, subject)),
  };
  const out = [`[BUILD CONTEXT — ${subject.path || 'this file'}: what it relates to. Use it; do not repeat it back]`];
  let used = out[0].length;
  const sections = {}, left = [];
  // a section's unused share passes to the next, so a bottom-layer file (nothing to build on) spends it on primitives
  let carry = 0;
  for (const name of ['buildsOn', 'relations', 'usedBy', 'primitives', 'invariants']) {
    const items = all[name];
    const cap = Math.round(budget * SHARE[name]) + carry;
    if (!items.length) { carry = cap; continue; }
    const block = [HEADS[name]];
    let n = block[0].length, kept = 0;
    for (const it of items) {
      if (n + it.text.length + 1 > cap || used + n + it.text.length + 1 > budget) { left.push(`${name}: ${it.key}`); continue; }
      block.push(it.text); n += it.text.length + 1; kept++;
    }
    if (kept) { out.push(block.join('\n')); used += n + 2; sections[name] = kept; carry = Math.max(0, cap - n); }
    else carry = cap;
  }
  if (out.length === 1) return { text: '', chars: 0, sections, sources, left };
  if (left.length) out.push(`(left out for the budget: ${left.length} — ${_clip(left.join('; '), 200)})`);
  out.push('[END BUILD CONTEXT]');
  const text = out.join('\n\n');
  return { text, chars: text.length, sections, sources, left };
}

module.exports = { pack, rankFiles, interfaceOf, MODULE_ID, VERSION, DEFAULT_BUDGET, _subjectOf, _invariants, _primitives, _buildsOn, _usedBy, _relations };
