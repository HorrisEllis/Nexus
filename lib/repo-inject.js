'use strict';
/**
 * lib/repo-inject.js — agent-built code into its compartment, as .inject nodes.
 * UUID: nexus-repo-inject-v1-0000-2026-0921-jamesbrooks-001
 * Version: 0.1.0
 *
 * §INJECT 2026-09-21 — James: "we need .inject node with editor for the agent
 * to build code for compartments, like the agents outputs go directly into the
 * compartment automatically, maybe using the .agent agent id or hat id."
 *
 * §WHAT AN .inject IS. One proposed write of one file into one compartment's
 * repo, authored by one agent (its hat uuid is the agentId — the hat is the
 * agent's identity, and the .agent export already carries it as _originUuid),
 * with its full lifecycle on the node itself:
 *     proposed → applied → reverted
 *              ↘ rejected
 * A write the person or the agent can see, edit, apply, and undo — not a
 * side effect buried in a reply.
 *
 * §NOT injection / inject_rule. Both existing types are PROMPT-CONTEXT
 * injection (copilot's makeNcpCallModel priming, and server.js's five
 * _inject* context sites). This is code written INTO a compartment's files —
 * a different thing that happens to share a verb, stated in schema.inject so
 * nobody reads one as the other.
 *
 * §ADDRESSING. Only a fenced block whose info string states a path becomes an
 * .inject — ```js src/x.js — via guardian/lib/code-artifact.js's own
 * fenceDeclaredPath(), the same rule captureAll() uses, through the same
 * _safeRelative() guard (../escape.js is refused, never written outside the
 * tree). A block with no stated path has no honest target, so it is reported
 * as unaddressed rather than given an invented name and written somewhere.
 *
 * §UNDO WITHOUT VERSIONIUM. Every .inject records `before` — the file's exact
 * content when the inject was applied, or null if the file did not exist.
 * Revert writes it back (or deletes a file the inject created). Self-contained
 * on purpose: an undo that depends on another service being up is an undo
 * that sometimes is not there.
 *
 * §CONFLICTS ARE REFUSED, NOT MERGED. Apply refuses if the file changed since
 * the inject was proposed (its baseSha no longer matches); revert refuses if
 * the file changed since the inject was applied. Both overridable with
 * force:true, and both say exactly which hash disagreed. Silently writing over
 * someone's newer edit is the failure this exists to prevent.
 *
 * §THE LAYER IS INJECTED. This module never imports idearium's ESM RepoLayer;
 * callers pass { readFile, writeTextFile, deleteFile } — the real RepoLayer in
 * production and in tests alike — so there is one write path into a repo, the
 * one every other idearium write already goes through (chunk store, source
 * layer, materialize, reindex).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODULE_ID = 'repo-inject';
const VERSION = '0.1.0';
const TYPE = 'inject';
// §0.39.279 (staging-self-heal S1) — 'staged': proposed on a staging branch (lib/code-edit.js stage), not in the review
// queue and not in the tree; promote() applies it (the only way staged code reaches the repo), reject() drops it.
const STATUSES = Object.freeze(['proposed', 'staged', 'applied', 'rejected', 'reverted']);
const MODES = Object.freeze(['review', 'auto']);

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_DIR = path.join(ROOT, 'idearium', 'data', 'nodes', 'inject');
const SETTINGS_TABLE = 'repo_agent_settings';

function _nx()  { return require('./node-export.js'); }
function _ca()  { return require('../guardian/lib/code-artifact.js'); }
function _jaa() { return require('./../cortex/memory/jaa-db.js').jaaDB; }
// §0.39.266 — an inject on a Nexus repo (immutable) targets the apply gate, on approval.
function _gate() { return require('./nexus-self/inject-gate.js'); }
function _isGate(n) { return !!(n && n.target && n.target.kind === 'nexus-gate'); }
// §SANDBOX 2026-09-25 — ensure() gives a test process its own NEXUS_INJECT_DIR.
function _dir() { require('./test-sandbox.js').ensure(); return process.env.NEXUS_INJECT_DIR || DEFAULT_DIR; }

function sha(s) { return s == null ? null : crypto.createHash('sha256').update(String(s), 'utf8').digest('hex'); }

function _file(id) { return path.join(_dir(), `${id}.${TYPE}`); }

function _write(node) {
  _logActivity(node);
  fs.mkdirSync(_dir(), { recursive: true });
  return _nx().exportToFile(TYPE, node.uuid, node, {
    system: 'nexus.lib.repo-inject',
    summary: `${node.status} · ${node.op === 'delete' ? 'delete ' : ''}${node.path} → ${node.repoUuid}${node.hatName ? ` by ${node.hatName}` : ''}`,
    context: node.compartmentId || null,
  }, _dir());
}

// §0.39.368 AL1 — every event in a proposal's history is a row of its repo's activity log, once (activityAt marks the
// last one logged): proposed by the agent, edited, applied (by whom), staged, rejected, reverted. One hook, at the one
// place every status change is written.
function _logActivity(n) {
  const last = n && Array.isArray(n.history) ? n.history[n.history.length - 1] : null;
  if (!last || !n.repoUuid || (n.activityAt && last.at <= n.activityAt)) return;
  n.activityAt = last.at;
  // applied: 'auto' (the repo's mode wrote it) is the agent's act; any other apply is the person's (approvedBy names them)
  const agent = n.hatName || (n.source && n.source.kind) || 'agent';
  const actor = n.status === 'applied' ? (n.approvedBy === 'auto' ? agent : (!n.approvedBy || n.approvedBy === 'idearium' ? 'person' : n.approvedBy))   // 'idearium': the page's Apply
    : ['rejected', 'reverted'].includes(n.status) ? 'person' : agent;
  // §0.40.0 VR1 — the commit this write settles into names who stands behind it and which proposal it was
  if ((n.status === 'applied' || n.status === 'reverted') && !_isGate(n)) {
    try { require('./repo-versions.js').attribute(n.repoUuid, { by: actor, ref: `inject:${n.uuid}` }); } catch (_) {}
  }
  try {
    require('./activity-log/compartment.js').record({ compartment: n.repoUuid, kind: `inject.${n.status}`, status: n.status, actor, hat: n.hatName || null, ref: n.uuid, ts: last.at,
      title: `${n.op === 'delete' ? 'delete ' : ''}${n.path} — ${last.event}${n.target && n.target.kind === 'nexus-gate' ? ` (${n.target.system}, live tree)` : ''}`,
      detail: last.reason ? String(last.reason) : null });
  } catch (_) { /* the log never stops a proposal */ }
}

function get(id) {
  if (!id || !/^[\w-]+$/.test(id)) return null;
  const f = _file(id);
  if (!fs.existsSync(f)) return null;
  try { return _nx().importFromFile(f).payload; } catch (_) { return null; }
}

/** list(repoUuid, { status }) — newest first. Reads the node files; they ARE the store. */
function list(repoUuid, { status = null, limit = 200 } = {}) {
  const dir = _dir();
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(`.${TYPE}`)) continue;
    let n; try { n = _nx().importFromFile(path.join(dir, f)).payload; } catch (_) { continue; }
    if (repoUuid && n.repoUuid !== repoUuid) continue;
    if (status && n.status !== status) continue;
    out.push(n);
  }
  return out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, limit);
}

function _current(layer, repoUuid, relPath) {
  // §0.39.273 — readTextFile (RepoLayer) reads an imported file's REAL bytes; readFile reads its chunk, which the
  // import truncated at max_chunk_bytes. Proposing against the truncated copy would write the truncation back.
  const r = typeof layer.readTextFile === 'function' ? layer.readTextFile(repoUuid, relPath) : layer.readFile(repoUuid, relPath);
  return r && !r.error ? String(r.content ?? '') : null; // null = file does not exist
}

/**
 * propose({ layer, repo, hat, path, content, syntax, source }) → { ok, inject }
 * baseSha pins the file as it was when proposed, so apply can detect a change.
 */
function propose({ layer, repo, hat = null, path: relPath, content, syntax = null, source = {}, ...opts } = {}) {
  if (!repo || !repo.uuid) return { ok: false, errors: ['repo with a uuid is required'] };
  const safe = relPath ? _ca()._safeRelative(String(relPath)) : null;
  if (!safe) return { ok: false, errors: [`unsafe or missing path: ${relPath}`] };
  // §0.39.273 — op:'delete' proposes removing the file (content null); apply deletes it, revert restores `before`
  const op = opts.op === 'delete' ? 'delete' : 'write';
  if (op === 'write' && typeof content !== 'string') return { ok: false, errors: ['content must be a string'] };
  const gate = _gate().isNexus(repo);
  if (op === 'delete' && !gate && layer && _current(layer, repo.uuid, safe) === null) return { ok: false, errors: [`${safe} does not exist — nothing to delete`] };
  if (op === 'delete' && gate) return { ok: false, errors: ['deleting a file of the live Nexus tree is not something the approval gate does — propose a write, or delete it by hand'] };
  let base;
  if (gate) { try { base = _gate().current(safe, { fresh: true, liveRoot: opts.liveRoot }); } catch (e) { return { ok: false, errors: [e.message] }; } }
  else base = layer ? _current(layer, repo.uuid, safe) : null;
  const node = {
    schema: 'nexus.inject/1',
    uuid: crypto.randomUUID(),
    repoUuid: repo.uuid,
    compartmentId: repo.compartmentId || null,
    agentId: hat ? (hat.uuid || hat.id || null) : null,
    hatName: hat ? hat.name : null,
    path: safe,
    op,
    syntax,
    content: op === 'delete' ? null : content,
    contentSha256: op === 'delete' ? null : sha(content),
    baseSha256: sha(base),            // null = file did not exist at proposal
    creates: base === null,
    before: null,                     // set at apply — the real prior content
    status: 'proposed',
    source: { kind: source.kind || (hat ? 'agent' : 'person'), ...source },
    createdAt: Date.now(),
    editedAt: null, appliedAt: null, rejectedAt: null, revertedAt: null,
    via: null, history: [{ at: Date.now(), event: 'proposed' }],
    // null: this repo's own files through RepoLayer. nexus-gate: the live Nexus tree
    // through lib/nexus-self/apply.js, only after the person approves (never auto).
    target: gate ? _gate().target(safe) : null,
  };
  _write(node);
  return { ok: true, inject: node };
}

/** edit(id, content) — only while proposed. The editor's save. */
function edit(id, content) {
  const n = get(id);
  if (!n) return { ok: false, errors: [`no inject ${id}`] };
  if (n.status !== 'proposed') return { ok: false, errors: [`cannot edit an inject that is ${n.status}`] };
  if (n.op === 'delete') return { ok: false, errors: ['a delete proposal has no content to edit — reject it and propose a write'] };
  if (typeof content !== 'string') return { ok: false, errors: ['content must be a string'] };
  n.content = content; n.contentSha256 = sha(content); n.editedAt = Date.now();
  n.history.push({ at: n.editedAt, event: 'edited' });
  _write(n);
  return { ok: true, inject: n };
}

function apply(id, { layer, force = false, liveRoot, approvedBy = null, defer = false } = {}) {
  const n = get(id);
  if (!n) return { ok: false, errors: [`no inject ${id}`] };
  if (n.status !== 'proposed' && n.status !== 'staged') return { ok: false, errors: [`cannot apply an inject that is ${n.status}`] };
  if (_isGate(n)) {
    const r = _gate().apply(n, { force, liveRoot, reason: `approved inject ${n.uuid}${n.hatName ? ` by ${n.hatName}` : ''}${approvedBy ? ` — approved by ${approvedBy}` : ''}` });
    if (!r.ok) return { ok: false, conflict: !!r.conflict, errors: r.errors };
    n.before = r.before; n.creates = r.before === null;
    n.appliedSha256 = n.contentSha256; n.normalized = false;
    n.applyId = r.applyId; n.snapshot = r.snapshot; n.approvedBy = approvedBy;
    n.status = 'applied'; n.appliedAt = Date.now(); n.via = 'nexus-self.apply';
    n.history.push({ at: n.appliedAt, event: `approved → applied to the live tree (${r.applyId})${force ? ' (forced)' : ''}` });
    _write(n);
    return { ok: true, inject: n, gate: { system: r.system, applyId: r.applyId, snapshot: r.snapshot } };
  }
  if (!layer) return { ok: false, errors: ['a repo layer is required to apply'] };
  const now = _current(layer, n.repoUuid, n.path);
  if (!force && sha(now) !== n.baseSha256) {
    return { ok: false, conflict: true, errors: [`${n.path} changed since this inject was proposed (expected ${n.baseSha256 ? n.baseSha256.slice(0, 12) : 'no file'}, found ${now === null ? 'no file' : sha(now).slice(0, 12)}) — re-propose or force`] };
  }
  // §0.39.273 — a delete proposal removes the file (the real source bytes too, when the source layer owns it)
  if (n.op === 'delete') {
    if (now === null) return { ok: false, errors: [`${n.path} does not exist any more — nothing to delete`] };
    const d = typeof layer.deleteTextFile === 'function' ? layer.deleteTextFile(n.repoUuid, n.path, { defer }) : layer.deleteFile(n.repoUuid, n.path, { defer });
    if (!d || d.error) return { ok: false, errors: [`delete failed: ${(d && d.error) || 'unknown'}`] };
    const gone = _current(layer, n.repoUuid, n.path);
    if (gone !== null) return { ok: false, errors: [`delete reported ok but ${n.path} still reads back`] };
    n.before = now; n.creates = false; n.appliedSha256 = null;
    n.status = 'applied'; n.appliedAt = Date.now(); n.via = d.via || null; n.approvedBy = approvedBy;
    n.history.push({ at: n.appliedAt, event: force ? 'applied — deleted (forced)' : 'applied — deleted' });
    _write(n);
    return { ok: true, inject: n };
  }
  // §0.39.273 defer — a caller applying several injects (lib/code-edit.js commit) materializes + reindexes once
  const w = layer.writeTextFile(n.repoUuid, n.path, n.content, { preserveWhitespace: true, defer });
  if (!w || w.error) return { ok: false, errors: [`write failed: ${(w && w.error) || 'unknown'}`] };
  // Read back rather than trust the write — the repo layer projects through
  // chunk store and materialize, and "wrote" is not "is there".
  //
  // Injects write with preserveWhitespace (RepoLayer opt-in, 2026-09-21):
  // source code needs its exact bytes. The one tolerated difference is a
  // file that pre-dates this and was stored trimmed by an older write path;
  // that is recorded as normalized:true rather than accepted silently.
  const after = _current(layer, n.repoUuid, n.path);
  const exact = after === n.content;
  if (!exact && after !== n.content.trim()) return { ok: false, errors: [`write reported ok but ${n.path} does not read back as the injected content`] };
  n.normalized = !exact;
  n.appliedSha256 = sha(after);   // what actually landed — revert's conflict check pins to this
  n.before = now; n.creates = now === null;
  n.status = 'applied'; n.appliedAt = Date.now(); n.via = w.via || null; n.approvedBy = approvedBy;
  n.history.push({ at: n.appliedAt, event: force ? 'applied (forced)' : 'applied' });
  _write(n);
  return { ok: true, inject: n };
}

/**
 * currentOf({ layer, repo, path }) -> { path, content } | { error } — the file an inject for this repo would be
 * proposed against: the live Nexus tree for a Nexus repo (through the gate), the repo's real bytes otherwise.
 * content null = the file does not exist. §0.39.273 — for lib/code-edit.js, so an edit is computed from exactly
 * what apply will compare against.
 */
function currentOf({ layer, repo, path: relPath, liveRoot } = {}) {
  const safe = relPath ? _ca()._safeRelative(String(relPath)) : null;
  if (!safe) return { error: `unsafe or missing path: ${relPath}` };
  if (_gate().isNexus(repo)) { try { return { path: safe, content: _gate().current(safe, { fresh: true, liveRoot }), via: 'nexus-gate' }; } catch (e) { return { error: e.message }; } }
  return { path: safe, content: layer ? _current(layer, repo.uuid, safe) : null, via: 'repo' };
}

/** preview(id) — for a nexus-gate inject: what approving would do (system, diff, the gate's plan). */
function preview(id, { liveRoot } = {}) {
  const n = get(id);
  if (!n) return { ok: false, errors: [`no inject ${id}`] };
  if (!_isGate(n)) return { ok: true, gate: null };
  try { return { ok: true, gate: _gate().preview(n, { liveRoot }) }; }
  catch (e) { return { ok: false, errors: [e.message] }; }
}

/**
 * stage(id, { branch, causedBy, commitId }) — §0.39.279 (S1): a proposal moves onto a staging branch. It leaves the
 * review queue (list status 'proposed' no longer shows it), the tree is untouched, and it carries where it was staged.
 */
function stage(id, { branch = null, causedBy = null, commitId = null } = {}) {
  const n = get(id);
  if (!n) return { ok: false, errors: [`no inject ${id}`] };
  if (n.status !== 'proposed') return { ok: false, errors: [`cannot stage an inject that is ${n.status}`] };
  if (_isGate(n)) return { ok: false, errors: ['a Nexus repo\'s code goes through its approval gate, not staging'] };
  n.status = 'staged'; n.stagedAt = Date.now();
  n.staging = { branch, causedBy, commitId };
  n.history.push({ at: n.stagedAt, event: `staged on ${branch || '(no branch)'}${causedBy ? ` for ${causedBy}` : ''}` });
  _write(n);
  return { ok: true, inject: n };
}

/** setStagingCommit(id, commitId) — the versionium commit a staged batch became (recorded after the commit returns). */
function setStagingCommit(id, commitId) {
  const n = get(id);
  if (!n || n.status !== 'staged') return { ok: false, errors: [`no staged inject ${id}`] };
  n.staging = { ...(n.staging || {}), commitId };
  _write(n);
  return { ok: true, inject: n };
}

function reject(id, { reason = null } = {}) {
  const n = get(id);
  if (!n) return { ok: false, errors: [`no inject ${id}`] };
  if (n.status !== 'proposed' && n.status !== 'staged') return { ok: false, errors: [`cannot reject an inject that is ${n.status}`] };
  n.status = 'rejected'; n.rejectedAt = Date.now();
  n.history.push({ at: n.rejectedAt, event: 'rejected', reason });
  _write(n);
  _undoneFault(n, 'rejected', reason);
  return { ok: true, inject: n };
}

function revert(id, { layer, force = false, liveRoot, defer = false } = {}) {
  const n = get(id);
  if (!n) return { ok: false, errors: [`no inject ${id}`] };
  if (n.status !== 'applied') return { ok: false, errors: [`cannot revert an inject that is ${n.status}`] };
  if (_isGate(n)) {
    const r = _gate().revert(n, { liveRoot });
    if (!r.ok) return { ok: false, conflict: !!r.conflict, errors: r.errors };
    n.status = 'reverted'; n.revertedAt = Date.now(); n.revertSnapshot = r.snapshot;
    n.history.push({ at: n.revertedAt, event: `reverted — gate rollback of ${n.applyId}` });
    _write(n);
    _undoneFault(n, 'reverted');
    return { ok: true, inject: n, gate: { system: r.system, snapshot: r.snapshot } };
  }
  if (!layer) return { ok: false, errors: ['a repo layer is required to revert'] };
  const now = _current(layer, n.repoUuid, n.path);
  const expected = n.op === 'delete' ? null : (n.appliedSha256 || n.contentSha256);
  if (!force && sha(now) !== expected) {
    return { ok: false, conflict: true, errors: [`${n.path} changed since this inject was applied — reverting would discard that change; force to override`] };
  }
  const del = (p) => (typeof layer.deleteTextFile === 'function' ? layer.deleteTextFile(n.repoUuid, p, { defer }) : layer.deleteFile(n.repoUuid, p, { defer }));
  const r = n.creates ? del(n.path) : layer.writeTextFile(n.repoUuid, n.path, n.before, { preserveWhitespace: true, defer });
  if (!r || r.error) return { ok: false, errors: [`revert failed: ${(r && r.error) || 'unknown'}`] };
  const back = _current(layer, n.repoUuid, n.path);
  if (n.creates ? back !== null : (back !== n.before && back !== String(n.before).trim())) return { ok: false, errors: [`revert reported ok but ${n.path} does not read back as its prior state`] };
  n.status = 'reverted'; n.revertedAt = Date.now();
  n.history.push({ at: n.revertedAt, event: force ? 'reverted (forced)' : 'reverted' });
  _write(n);
  _undoneFault(n, 'reverted');
  return { ok: true, inject: n };
}

// ── Per-compartment mode ──────────────────────────────────────────────────────
/** modeFor(repo) — a Nexus repo is always 'review': its code reaches the live tree only on approval. */
function modeFor(repo) { return _gate().isNexus(repo) ? 'review' : getMode(repo.uuid); }
function getMode(repoUuid) {
  const row = (_jaa().query(SETTINGS_TABLE, r => r.repoUuid === repoUuid, 1) || [])[0];
  return row && MODES.includes(row.injectMode) ? row.injectMode : 'review';
}
function setMode(repoUuid, mode) {
  if (!MODES.includes(mode)) return { ok: false, errors: [`mode must be one of: ${MODES.join(', ')}`] };
  const jaa = _jaa();
  const row = (jaa.query(SETTINGS_TABLE, r => r.repoUuid === repoUuid, 1) || [])[0];
  if (row) jaa.update(SETTINGS_TABLE, { uuid: row.uuid }, { injectMode: mode, updatedAt: Date.now() });
  else jaa.insert(SETTINGS_TABLE, { uuid: crypto.randomUUID(), repoUuid, injectMode: mode, updatedAt: Date.now() });
  return { ok: true, repoUuid, injectMode: mode };
}

// ── Understanding where code goes ────────────────────────────────────────────
// §RESOLVE 2026-09-21 — James: "the agent's fucking job is to understand it."
// v0.39.197 only injected blocks whose fence stated a path and punted the rest
// back to the person as "unaddressed". Wrong division of labour: the agent has
// the atlas, the chunk index and this turn's context. Resolution now runs in
// order of evidence strength, and every inject records how it was addressed:
//   fence   — the agent stated the path in the fence              (its claim)
//   symbols — the block defines symbols that exist in exactly ONE
//             file of this repo, per the repo's own chunk index     (the code)
//   agent   — still ambiguous or new: the agent itself is asked
//             where the block goes, given the candidates            (its call)
// Shell/console blocks are commands, not files — reported as such, never
// written and never worth a round trip.
const SHELL = new Set(['bash', 'sh', 'shell', 'zsh', 'console', 'powershell', 'ps1', 'cmd', 'bat', 'terminal', 'fish']);

// Top-level definitions a block introduces. Deliberately the same shallow,
// declaration-level idea the import pipeline's own symbol extraction uses —
// enough to match a block to the file that owns those names, not a parser.
const DEF_RES = [
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm,
  /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/gm,
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm,
  /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/gm,
  /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/gm,
  /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:fn|struct|enum|trait)\s+([A-Za-z_]\w*)/gm,
  /^\s*(?:export\s+)?(?:interface|type)\s+([A-Za-z_$][\w$]*)/gm,
];
function definedSymbols(code) {
  const out = new Set();
  for (const re of DEF_RES) { re.lastIndex = 0; let m; while ((m = re.exec(code))) out.add(m[1]); }
  return [...out];
}

function _chunkIndex(repoDir) {
  if (!repoDir) return [];
  try { const j = JSON.parse(fs.readFileSync(path.join(repoDir, 'chunks', 'index.json'), 'utf8')); return Array.isArray(j) ? j : []; }
  catch (_) { return []; }
}

/**
 * bySymbols(code, index, preferFiles) -> { file, symbols, candidates }
 * file is set only when the evidence points at exactly one file (after
 * preferring files the agent was actually shown this turn). Otherwise the
 * candidates go to the agent — a symbol match never guesses between files.
 */
function bySymbols(code, index, preferFiles = []) {
  const syms = definedSymbols(code);
  if (!syms.length || !index.length) return { file: null, symbols: syms, candidates: [] };
  const want = new Set(syms);
  const files = new Map();
  for (const c of index) {
    const names = (c.symbols || []).map(x => String(x && x.name || x));
    const hit = names.filter(n => want.has(n));
    if (hit.length) files.set(c.file, (files.get(c.file) || 0) + hit.length);
  }
  let candidates = [...files.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
  if (candidates.length > 1 && preferFiles.length) {
    const shown = candidates.filter(f => preferFiles.includes(f));
    if (shown.length === 1) return { file: shown[0], symbols: syms, candidates };
  }
  return { file: candidates.length === 1 ? candidates[0] : null, symbols: syms, candidates };
}

/**
 * fromReply({ layer, repo, hat, text, repoDir, contextFiles, resolve, exchange })
 *   resolve: async ({ code, syntax, symbols, candidates }) -> string reply
 *            — the agent answering where a block goes. Injected by
 *            lib/repo-agent.js so this module stays free of transport.
 * Returns { mode, injects, commands, unresolved, refused }.
 */
// §0.39.361 AR2 — James: "Failure modes and faults are still first class data." An agent's code the person undid, or a
// reply refused for collapsing a file, is a fault record (lib/phase-faults.js → lib/fault-log.js). A person's own
// proposal undone is not an agent's fault and is not logged.
function _pf(fn) { try { fn(require('./phase-faults.js')); } catch (_) { /* never fails the action */ } }
function _undoneFault(n, how, reason = null) {
  if (!n || !n.source || n.source.kind !== 'agent') return;
  _pf(pf => pf.logInject({ mode: 'undone', node: n, reason: reason || `${how} by the person`, extra: { how, applied: !!n.appliedAt } }));
}

/**
 * §0.39.361 — _collapses(path, code, base) -> a reason, or null. A block that is only a path, or that would cut an
 * existing file of 40+ lines to under a tenth of it (and under 20 lines), is a partial reply, not the file.
 */
function _collapses(target, code, base) {
  const body = String(code || '').trim();
  if (/^[\w@./-]+\.[A-Za-z0-9]+$/.test(body) || body === target) return `the block holds only a path (${body.slice(0, 80)}), not the file`;
  if (base == null) return null;
  const n = String(base).split('\n').length, m = body.split('\n').length;
  if (n >= 40 && m < 20 && m < n / 10) return `it would cut the file from ${n} lines to ${m} — a partial reply, not the whole file`;
  return null;
}

async function fromReply({ layer, repo, hat, text, repoDir = null, contextFiles = [], resolve = null, exchange = {}, liveRoot, stage = null } = {}) {
  const ca = _ca();
  const mode = modeFor(repo);
  const out = { mode, approval: _gate().isNexus(repo), injects: [], commands: 0, unresolved: [], refused: [] };
  // §0.39.281 EC5 — stage = { causedBy, record }: the answering provider's economy tier is one the policy stages, so an
  // 'auto' repo's code goes to repo-<uuid>@staging (lib/code-edit.js stage) instead of being applied. Review mode is
  // unchanged (its proposals already wait); a Nexus repo keeps its own approval gate.
  const staging = stage && typeof stage.record === 'function' && mode === 'auto' && !out.approval ? [] : null;
  // §0.39.282 N21 — the reply passes its gate first (lib/step-gate.js, lib/step-gates/reply.accept.step_gate): a reply
  // that only says it cannot do the work is BLOCKED — nothing from it is turned into files, and the caller reports
  // 'blocked' with the reason instead of 'replied'.
  const SG = require('./step-gate.js');
  const replyGate = SG.gate('reply.accept', { text: typeof text === 'string' ? text : '' }, { causedBy: exchange.causedBy || null, source: 'lib/repo-inject' });
  if (!replyGate.ok) { out.blocked = { step: 'reply.accept', eventId: replyGate.eventId, reasons: replyGate.reasons }; out.refused.push({ reason: `blocked: ${replyGate.reasons.map(r => r.reason).join('; ')}` }); return out; }
  if (typeof text !== 'string' || !/```/.test(text)) return out;
  if (ca.unclosedFence && ca.unclosedFence(text)) { out.refused.push({ reason: 'unclosed code fence — nothing injected' }); return out; }
  const index = _chunkIndex(repoDir);
  const known = new Set(index.map(c => c.file));

  for (const b of ca.extractCodeBlocks(text)) {
    const tag = String(b.tag || '').toLowerCase();
    if (SHELL.has(tag)) { out.commands++; continue; }

    let target = null, addressedBy = null, evidence = null;
    const stated = ca.fenceDeclaredPath(b);
    const statedUnsafe = !stated && /[\w./-]+\.[A-Za-z0-9]+\s*$/.test(b.info || '') && /\.\.|(?:^|\s)\//.test(b.info || '');
    if (statedUnsafe) { out.refused.push({ blockIndex: b.index, reason: `unsafe path in fence: ${b.info}` }); continue; }
    if (stated) { target = stated; addressedBy = 'fence'; }

    let sym = null;
    if (!target) {
      sym = bySymbols(b.code, index, contextFiles);
      if (sym.file) { target = sym.file; addressedBy = 'symbols'; evidence = sym.symbols.join(', '); }
    }

    if (!target && typeof resolve === 'function') {
      const candidates = [...new Set([...(sym ? sym.candidates : []), ...contextFiles, ...[...known].slice(0, 40)])].slice(0, 40);
      let answer = null;
      try { answer = await resolve({ code: b.code, syntax: b.syntax || tag || null, symbols: sym ? sym.symbols : definedSymbols(b.code), candidates }); }
      catch (e) { out.unresolved.push({ blockIndex: b.index, reason: `agent could not be asked: ${e.message}` }); continue; }
      const line = String(answer || '').split('\n').map(x => x.trim()).find(Boolean) || '';
      if (/^NONE\b/i.test(line)) { out.unresolved.push({ blockIndex: b.index, reason: 'the agent says this block is not meant to be written to a file' }); continue; }
      const cand = line.replace(/^NEW\s+/i, '').replace(/^[`'"]|[`'"]$/g, '');
      const safe = cand ? ca._safeRelative(cand) : null;
      if (!safe) { out.unresolved.push({ blockIndex: b.index, reason: `the agent named no usable path (${line.slice(0, 80) || 'empty reply'})` }); continue; }
      target = safe; addressedBy = 'agent'; evidence = line.slice(0, 200);
    }

    if (!target) { out.unresolved.push({ blockIndex: b.index, reason: 'no stated path, no unique symbol match, and no agent to ask' }); continue; }

    land({ layer, repo, hat, path: target, content: b.code, syntax: b.syntax || tag || null, mode, liveRoot, staging, out, causedBy: replyGate.eventId,
           blockIndex: b.index, source: { kind: 'agent', blockIndex: b.index, exchangeTs: exchange.ts || Date.now(), addressedBy, evidence }, exchangeTs: exchange.ts });
  }
  await _flushStaging({ layer, repo, hat, staging, stage, out });
  return out;
}

async function _flushStaging({ layer, repo, hat, staging, stage, out }) {
  if (!staging || !staging.length) return;
  const r = await require('./code-edit.js').stage({ layer, RI: module.exports, repo, hat, changes: staging.map(c => ({ path: c.path, content: c.content })),
    causedBy: stage.causedBy || 'economy', record: stage.record, source: { economy: true } });
  if (r.ok) {
    out.staged = { branch: r.branch, commitId: r.commit.commitId, causedBy: r.causedBy };
    for (const f of r.files) { const c = staging.find(x => x.path === f.path) || {}; out.injects.push({ uuid: f.inject, path: f.path, status: 'staged', addressedBy: c.addressedBy, evidence: c.evidence }); }
  } else out.refused.push({ reason: `economy staging failed — nothing written: ${(r.errors || []).join('; ')}` });
}

/**
 * land({ layer, repo, hat, path, content, op, syntax, mode, liveRoot, staging, out, source }) — §0.39.367 CC1: ONE file an
 * agent produced, through the one path: its gate (code.write: never empty, parses where checkable), the collapse guard
 * (never a bare path or a sliver over a real file), then by the repo's mode — staged (the economy), proposed (review; a
 * Nexus repo always, through its approval gate), or applied (auto). Every agent's files come here: a reply's fenced
 * blocks (fromReply), a coding agent's diff (fromChanges). Its outcome is pushed onto out.injects / out.refused.
 */
function land({ layer, repo, hat = null, path: target, content, op = 'write', syntax = null, mode = modeFor(repo), liveRoot, staging = null, out, causedBy = null, blockIndex = null, source = {}, exchangeTs = null } = {}) {
  const SG = require('./step-gate.js');
  const where = blockIndex != null ? { blockIndex } : { path: target };
  if (op !== 'delete') {
    const fileGate = SG.gate('code.write', { path: target, content, syntax }, { causedBy, source: 'lib/repo-inject' });
    if (!fileGate.ok) { (out.blockedFiles = out.blockedFiles || []).push({ path: target, eventId: fileGate.eventId, reasons: fileGate.reasons }); out.refused.push({ ...where, reason: `blocked ${target}: ${fileGate.reasons.map(r => r.reason).join('; ')}` }); return null; }
    // §0.39.361 — James, on BL15's proposal for lib/agent-tools/index.js: "i have no idea if i shuld have hit accept."
    // The reply's block held only the path; it parses as JS (a division), so code.write passed it, and the proposal
    // was -648 +1. An agent's file never replaces an existing file with a bare path or a sliver of it.
    const collapse = _collapses(target, content, (() => {
      try { return _gate().isNexus(repo) ? _gate().current(target, { fresh: true, liveRoot }) : (layer ? _current(layer, repo.uuid, target) : null); } catch (_) { return null; }
    })());
    if (collapse) {
      out.refused.push({ ...where, reason: `refused ${target}: ${collapse}` });
      _pf(pf => pf.logInject({ mode: 'reply-collapse', agent: hat ? hat.name : null, reason: collapse, extra: { path: target, repoUuid: repo.uuid, blockIndex, exchangeTs } }));
      return null;
    }
  }
  const body = op === 'delete' ? null : (content.endsWith('\n') ? content : content + '\n');
  if (staging && op !== 'delete') { staging.push({ path: target, content: body, addressedBy: source.addressedBy, evidence: source.evidence }); return null; }
  const p = propose({ layer, repo, hat, path: target, content: body, op, syntax, liveRoot, source });
  if (!p.ok) { out.refused.push({ ...where, reason: p.errors.join('; ') }); return null; }
  let inj = p.inject, applied = null;
  if (mode === 'auto') { applied = apply(inj.uuid, { layer, approvedBy: 'auto' }); if (applied.ok) inj = applied.inject; }
  const entry = { uuid: inj.uuid, path: inj.path, op: inj.op, status: inj.status, creates: inj.creates, addressedBy: source.addressedBy, evidence: source.evidence, system: inj.target ? inj.target.system : undefined,
    applyError: applied && !applied.ok ? applied.errors.join('; ') : undefined };
  out.injects.push(entry);
  return entry;
}

/**
 * fromChanges({ layer, repo, hat, changes, liveRoot, stage, source }) — §0.39.367 CC1: a coding agent's diff ({ path,
 * content, op }[] — Claude Code works in a copy and hands back what changed) landed file by file through land(), exactly
 * as a reply's blocks are. Before this, Claude Code's files were written straight through the repo layer: past review
 * mode, and past the approval gate of a Nexus repo. A binary change is refused with its reason.
 */
async function fromChanges({ layer, repo, hat = null, changes = [], liveRoot, stage = null, source = {} } = {}) {
  const mode = modeFor(repo);
  const out = { mode, approval: _gate().isNexus(repo), injects: [], commands: 0, unresolved: [], refused: [] };
  const staging = stage && typeof stage.record === 'function' && mode === 'auto' && !out.approval ? [] : null;
  for (const c of changes || []) {
    if (c.op === 'binary') { out.refused.push({ path: c.path, reason: c.note || 'a binary file — not landed' }); continue; }
    const safe = c.path ? _ca()._safeRelative(String(c.path)) : null;
    if (!safe) { out.refused.push({ path: c.path, reason: `unsafe path: ${c.path}` }); continue; }
    land({ layer, repo, hat, path: safe, content: c.content, op: c.op === 'delete' ? 'delete' : 'write', mode, liveRoot, staging, out, source: { kind: 'agent', addressedBy: 'diff', ...source } });
  }
  await _flushStaging({ layer, repo, hat, staging, stage, out });
  return out;
}

/** The narrow question the agent is asked when it did not say where code goes. */
function resolvePrompt({ code, syntax, symbols, candidates, question }, blocks = null) {
  // 0.39.258 — the text is the repo's editable 'inject-resolve' block (lib/repo-prompt-blocks.js); one definition.
  // Returns null when that block is switched off: the agent is not asked and the code waits unresolved.
  return require('./repo-prompt-blocks.js').renderResolve(blocks, { code, syntax, symbols, candidates, question });
}

const INJECT_PROTOCOL = [
  'Code you write for this project is written into it. Give each file its FULL content in its own block.',
  'Putting the path after the fence language (```js src/file.js) is fastest; if you leave it out you will be asked where the block goes.',
].join('\n');

module.exports = {
  currentOf,
  MODULE_ID, VERSION, TYPE, STATUSES, MODES, DEFAULT_DIR, INJECT_PROTOCOL,
  sha, get, list, propose, edit, apply, preview, reject, revert, getMode, setMode, modeFor, fromReply, fromChanges, land, stage, setStagingCommit,
  definedSymbols, bySymbols, resolvePrompt, SHELL, collapses: _collapses,
};
