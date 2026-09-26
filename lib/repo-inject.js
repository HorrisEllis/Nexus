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
const STATUSES = Object.freeze(['proposed', 'applied', 'rejected', 'reverted']);
const MODES = Object.freeze(['review', 'auto']);

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_DIR = path.join(ROOT, 'idearium', 'data', 'nodes', 'inject');
const SETTINGS_TABLE = 'repo_agent_settings';

function _nx()  { return require('./node-export.js'); }
function _ca()  { return require('../guardian/lib/code-artifact.js'); }
function _jaa() { return require('./../cortex/memory/jaa-db.js').jaaDB; }
// §SANDBOX 2026-09-25 — ensure() gives a test process its own NEXUS_INJECT_DIR.
function _dir() { require('./test-sandbox.js').ensure(); return process.env.NEXUS_INJECT_DIR || DEFAULT_DIR; }

function sha(s) { return s == null ? null : crypto.createHash('sha256').update(String(s), 'utf8').digest('hex'); }

function _file(id) { return path.join(_dir(), `${id}.${TYPE}`); }

function _write(node) {
  fs.mkdirSync(_dir(), { recursive: true });
  return _nx().exportToFile(TYPE, node.uuid, node, {
    system: 'nexus.lib.repo-inject',
    summary: `${node.status} · ${node.path} → ${node.repoUuid}${node.hatName ? ` by ${node.hatName}` : ''}`,
    context: node.compartmentId || null,
  }, _dir());
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
  const r = layer.readFile(repoUuid, relPath);
  return r && !r.error ? String(r.content ?? '') : null; // null = file does not exist
}

/**
 * propose({ layer, repo, hat, path, content, syntax, source }) → { ok, inject }
 * baseSha pins the file as it was when proposed, so apply can detect a change.
 */
function propose({ layer, repo, hat = null, path: relPath, content, syntax = null, source = {} } = {}) {
  if (!repo || !repo.uuid) return { ok: false, errors: ['repo with a uuid is required'] };
  const safe = relPath ? _ca()._safeRelative(String(relPath)) : null;
  if (!safe) return { ok: false, errors: [`unsafe or missing path: ${relPath}`] };
  if (typeof content !== 'string') return { ok: false, errors: ['content must be a string'] };
  const base = layer ? _current(layer, repo.uuid, safe) : null;
  const node = {
    schema: 'nexus.inject/1',
    uuid: crypto.randomUUID(),
    repoUuid: repo.uuid,
    compartmentId: repo.compartmentId || null,
    agentId: hat ? (hat.uuid || hat.id || null) : null,
    hatName: hat ? hat.name : null,
    path: safe,
    syntax,
    content,
    contentSha256: sha(content),
    baseSha256: sha(base),            // null = file did not exist at proposal
    creates: base === null,
    before: null,                     // set at apply — the real prior content
    status: 'proposed',
    source: { kind: source.kind || (hat ? 'agent' : 'person'), ...source },
    createdAt: Date.now(),
    editedAt: null, appliedAt: null, rejectedAt: null, revertedAt: null,
    via: null, history: [{ at: Date.now(), event: 'proposed' }],
  };
  _write(node);
  return { ok: true, inject: node };
}

/** edit(id, content) — only while proposed. The editor's save. */
function edit(id, content) {
  const n = get(id);
  if (!n) return { ok: false, errors: [`no inject ${id}`] };
  if (n.status !== 'proposed') return { ok: false, errors: [`cannot edit an inject that is ${n.status}`] };
  if (typeof content !== 'string') return { ok: false, errors: ['content must be a string'] };
  n.content = content; n.contentSha256 = sha(content); n.editedAt = Date.now();
  n.history.push({ at: n.editedAt, event: 'edited' });
  _write(n);
  return { ok: true, inject: n };
}

function apply(id, { layer, force = false } = {}) {
  const n = get(id);
  if (!n) return { ok: false, errors: [`no inject ${id}`] };
  if (n.status !== 'proposed') return { ok: false, errors: [`cannot apply an inject that is ${n.status}`] };
  if (!layer) return { ok: false, errors: ['a repo layer is required to apply'] };
  const now = _current(layer, n.repoUuid, n.path);
  if (!force && sha(now) !== n.baseSha256) {
    return { ok: false, conflict: true, errors: [`${n.path} changed since this inject was proposed (expected ${n.baseSha256 ? n.baseSha256.slice(0, 12) : 'no file'}, found ${now === null ? 'no file' : sha(now).slice(0, 12)}) — re-propose or force`] };
  }
  const w = layer.writeTextFile(n.repoUuid, n.path, n.content, { preserveWhitespace: true });
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
  n.status = 'applied'; n.appliedAt = Date.now(); n.via = w.via || null;
  n.history.push({ at: n.appliedAt, event: force ? 'applied (forced)' : 'applied' });
  _write(n);
  return { ok: true, inject: n };
}

function reject(id, { reason = null } = {}) {
  const n = get(id);
  if (!n) return { ok: false, errors: [`no inject ${id}`] };
  if (n.status !== 'proposed') return { ok: false, errors: [`cannot reject an inject that is ${n.status}`] };
  n.status = 'rejected'; n.rejectedAt = Date.now();
  n.history.push({ at: n.rejectedAt, event: 'rejected', reason });
  _write(n);
  return { ok: true, inject: n };
}

function revert(id, { layer, force = false } = {}) {
  const n = get(id);
  if (!n) return { ok: false, errors: [`no inject ${id}`] };
  if (n.status !== 'applied') return { ok: false, errors: [`cannot revert an inject that is ${n.status}`] };
  if (!layer) return { ok: false, errors: ['a repo layer is required to revert'] };
  const now = _current(layer, n.repoUuid, n.path);
  if (!force && sha(now) !== (n.appliedSha256 || n.contentSha256)) {
    return { ok: false, conflict: true, errors: [`${n.path} changed since this inject was applied — reverting would discard that change; force to override`] };
  }
  const r = n.creates ? layer.deleteFile(n.repoUuid, n.path) : layer.writeTextFile(n.repoUuid, n.path, n.before, { preserveWhitespace: true });
  if (!r || r.error) return { ok: false, errors: [`revert failed: ${(r && r.error) || 'unknown'}`] };
  const back = _current(layer, n.repoUuid, n.path);
  if (n.creates ? back !== null : (back !== n.before && back !== String(n.before).trim())) return { ok: false, errors: [`revert reported ok but ${n.path} does not read back as its prior state`] };
  n.status = 'reverted'; n.revertedAt = Date.now();
  n.history.push({ at: n.revertedAt, event: force ? 'reverted (forced)' : 'reverted' });
  _write(n);
  return { ok: true, inject: n };
}

// ── Per-compartment mode ──────────────────────────────────────────────────────
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
async function fromReply({ layer, repo, hat, text, repoDir = null, contextFiles = [], resolve = null, exchange = {} } = {}) {
  const ca = _ca();
  const mode = getMode(repo.uuid);
  const out = { mode, injects: [], commands: 0, unresolved: [], refused: [] };
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

    const p = propose({ layer, repo, hat, path: target, content: b.code.endsWith('\n') ? b.code : b.code + '\n', syntax: b.syntax || null,
                        source: { kind: 'agent', blockIndex: b.index, exchangeTs: exchange.ts || Date.now(), addressedBy, evidence } });
    if (!p.ok) { out.refused.push({ blockIndex: b.index, reason: p.errors.join('; ') }); continue; }
    let inj = p.inject, applied = null;
    if (mode === 'auto') { applied = apply(inj.uuid, { layer }); if (applied.ok) inj = applied.inject; }
    out.injects.push({ uuid: inj.uuid, path: inj.path, status: inj.status, creates: inj.creates, addressedBy, evidence,
                       applyError: applied && !applied.ok ? applied.errors.join('; ') : undefined });
  }
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
  MODULE_ID, VERSION, TYPE, STATUSES, MODES, DEFAULT_DIR, INJECT_PROTOCOL,
  sha, get, list, propose, edit, apply, reject, revert, getMode, setMode, fromReply,
  definedSymbols, bySymbols, resolvePrompt, SHELL,
};
