/**
 * idearium/repo/code-api.js — the codebase surface of a repo: /api/repos/:uuid/code/*
 * comp_id: nexus.idearium.repo.code-api
 * UUID: nexus-idearium-repo-code-api-v1-0000-2026-0927-jamesbrooks-001
 *
 * §0.39.273 CB4 (docs/2026-09-27-idearium-codebase-toolkit-phasemap.spec). James: "I want idearium solid for building
 * codebases … Agent tools completely solid, all context is easy to search and understand for each chunk."
 *
 * Reads go through lib/code-intel (cards, search, grep, outlines — derived from the pipeline's own output). Writes go
 * through lib/code-edit (plan → diff → syntax check → commit as .injects through lib/repo-inject.js and RepoLayer),
 * so every agent change keeps its history and its undo, review mode is respected, and a Nexus repo still needs
 * James's approval. Nothing here is a second store.
 *
 *   GET  overview · tree · search · grep · chunk · outline · read · definition · changes
 *   POST edit · write · delete · move · batch · check
 *
 * Every handler returns { status, body }; idearium/api/index.js sends it.
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { runImportPipeline } from './import-pipeline.js';

const _require = createRequire(import.meta.url);
const CI = () => _require('../../lib/code-intel/index.js');
const CE = () => _require('../../lib/code-edit.js');
const RI = () => _require('../../lib/repo-inject.js');

const ok = (body) => ({ status: 200, body });
const bad = (status, error, extra = {}) => ({ status, body: { error, ...extra } });
const bool = (v, d = false) => (v == null || v === '' ? d : v === true || v === 'true' || v === '1' || v === 1);

/** the repo's cards exist, or the pipeline is run once now (an index from before 0.39.273 has none) */
function ensureIntel(ctx) {
  const cardsPath = path.join(ctx.dir, 'indexes', 'cards.json');
  if (fs.existsSync(cardsPath)) return null;
  try {
    const repo = ctx.layer.get(ctx.uuid);
    const r = runImportPipeline(repo, ctx.dir, { lazyTests: !(repo && repo.nexusSelf) });
    if (!fs.existsSync(cardsPath)) return `indexing ran (${r.state}) but produced no cards: ${(r.intel && r.intel.error) || r.error || 'unknown'}`;
    return null;
  } catch (e) { return `indexing failed: ${e.message}`; }
}

function _hat(ctx) { try { return _require('../../lib/repo-hat.js').getRepoHat(ctx.uuid); } catch (_) { return null; } }
function _proofFor(ctx, chunkId) {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(ctx.dir, 'proof.json'), 'utf8'));
    const c = (p.chunks || []).find(x => x.chunkId === chunkId);
    return c ? { proof: c.proof, stale: !!c.stale, tests: (c.tests || []).slice(0, 5) } : { proof: 'none recorded' };
  } catch (_) { return null; }
}
const _mode = (ctx) => RI().modeFor(ctx.repo);
const _modeNote = (m, nexus) => (m === 'auto' ? null
  : nexus ? 'proposed — James approves it in the Agent tab before it reaches the live Nexus tree; code_read shows your pending version meanwhile'
  : 'proposed (this repo is in review mode) — it lands when approved; your later edits to the same file stack onto this proposal, and code_read shows the pending version');

// ── reads ────────────────────────────────────────────────────────────────────────────────────────────
function overview(ctx) {
  const warn = ensureIntel(ctx);
  const o = CI().overview(ctx.dir);
  if (o.error) return bad(409, o.error);
  let pending = 0;
  try { pending = RI().list(ctx.uuid, { status: 'proposed' }).length; } catch (_) {}
  return ok({ repo: { uuid: ctx.uuid, name: ctx.repo.name || null, nexus: !!ctx.repo.nexusSelf, writeMode: _mode(ctx), pendingProposals: pending }, ...o, ...(warn ? { warning: warn } : {}) });
}

function tree(ctx) {
  ensureIntel(ctx);
  return ok(CI().tree(ctx.dir, { path: ctx.query.path || '', depth: ctx.query.depth, limit: Math.min(parseInt(ctx.query.limit, 10) || 300, 1000) }));
}

function searchCode(ctx) {
  const q = ctx.query.q || ctx.query.query;
  if (!q) return bad(400, 'q (what to look for) is required');
  const warn = ensureIntel(ctx);
  const r = CI().query(ctx.dir, q, { limit: ctx.query.limit, path: ctx.query.path || null, kind: ctx.query.kind || null, language: ctx.query.language || null,
    includeTests: ctx.query.tests == null ? null : bool(ctx.query.tests) });
  if (r.error) return bad(409, r.error);
  return ok({ ...r, ...(warn ? { warning: warn } : {}), ...(!r.hits.length ? { tip: 'nothing ranked — try other words, code_grep for exact text, or code_tree to browse' } : {}) });
}

function grep(ctx) {
  const pattern = ctx.query.pattern || ctx.query.q;
  if (!pattern) return bad(400, 'pattern is required');
  ensureIntel(ctx);
  const r = CI().grepRepo(ctx.dir, { pattern, regex: bool(ctx.query.regex), caseSensitive: bool(ctx.query.case), wholeWord: bool(ctx.query.word),
    path: ctx.query.path || null, context: ctx.query.context, limit: ctx.query.limit });
  return r.error ? bad(400, r.error) : ok({ pattern, ...r });
}

function chunk(ctx) {
  const ref = ctx.query.id || ctx.query.ref || ctx.query.chunk || ctx.query.name;
  if (!ref) return bad(400, 'id (a chunk id, path:line, path#Name or a name) is required');
  ensureIntel(ctx);
  const I = CI();
  const intel = I.load(ctx.dir);
  if (intel.error) return bad(409, intel.error);
  const rr = I.resolveRef(intel, ref);
  const proof = rr.ids.length === 1 ? _proofFor(ctx, rr.ids[0]) : null;
  const r = I.card(ctx.dir, ref, { code: bool(ctx.query.code, true), around: bool(ctx.query.around, true), proof });
  if (r.error) return bad(r.candidates ? 409 : 404, r.error, r.candidates ? { candidates: r.candidates } : {});
  // a pending proposal for this file means the working text differs from what the card describes
  try {
    const pend = CE()._pendingFor(RI(), ctx.uuid, r.card.file);
    if (pend) r.pending = { inject: pend.uuid, op: pend.op || 'write', note: 'this file has a pending proposal from you — the card and text are the committed version; code_read shows the pending one' };
  } catch (_) {}
  return ok(r);
}

function outline(ctx) {
  if (!ctx.query.path) return bad(400, 'path is required');
  ensureIntel(ctx);
  const r = CI().outline(ctx.dir, ctx.query.path);
  return r.error ? bad(404, r.error, r.didYouMean ? { didYouMean: r.didYouMean } : {}) : ok(r);
}

function read(ctx) {
  const p = ctx.query.path;
  if (!p) return bad(400, 'path is required');
  const view = ctx.query.view === 'committed' ? 'committed' : 'working';
  const start = ctx.query.start, end = ctx.query.end;
  if (view === 'working' || ctx.repo.nexusSelf) {
    const cur = CE().current({ layer: ctx.layer, RI: RI(), repo: ctx.repo, path: p, view });
    if (cur.error) return bad(400, cur.error);
    if (cur.pending || ctx.repo.nexusSelf) {
      if (!cur.exists) return bad(404, cur.pending ? `${p} is pending deletion (inject ${cur.pending.inject})` : `no such file: ${p}`);
      const tmpLines = String(cur.content).split('\n');
      const s = Math.max(1, parseInt(start, 10) || 1);
      const e = Math.min(tmpLines.length, parseInt(end, 10) || s + 249, s + 249);
      let text = ''; let last = s - 1;
      for (let i = s; i <= e; i++) { const line = `${i}\t${tmpLines[i - 1]}\n`; if (text.length + line.length > 16000 && i > s) break; text += line; last = i; }
      return ok({ file: p, start: s, end: last, totalLines: tmpLines.length, text, hash: cur.sha,
        more: last < tmpLines.length ? `lines ${last + 1}-${tmpLines.length} not shown — read again with start=${last + 1}` : null,
        ...(cur.pending ? { pending: { inject: cur.pending.inject, note: 'this is YOUR PENDING version (not yet approved/applied)' } } : {}),
        ...(ctx.repo.nexusSelf ? { source: 'the live Nexus tree (what the approval gate compares against)' } : {}) });
    }
  }
  const r = CI().readLines(ctx.dir, p, { start, end });
  if (r.error) return bad(/no such file/.test(r.error) ? 404 : 400, r.error);
  try { r.hash = CE().sha(fs.readFileSync(path.resolve(ctx.dir, p), 'utf8')); } catch (_) {}
  return ok(r);
}

function definition(ctx) {
  const name = ctx.query.name || ctx.query.q;
  if (!name) return bad(400, 'name is required');
  ensureIntel(ctx);
  const r = CI().definition(ctx.dir, name);
  return r.error ? bad(409, r.error) : ok(r);
}

function changes(ctx) {
  const E = CE();
  const list = RI().list(ctx.uuid, { status: ctx.query.status || null, limit: Math.min(parseInt(ctx.query.limit, 10) || 30, 200) });
  return ok({ repoUuid: ctx.uuid, writeMode: _mode(ctx), changes: list.map(n => ({ inject: n.uuid, path: n.path, op: n.op || 'write', status: n.status,
    by: n.hatName || (n.source && n.source.kind) || null, via: (n.source && n.source.via) || null, at: n.appliedAt || n.createdAt,
    ...(n.status === 'proposed' ? { lines: n.content ? String(n.content).split('\n').length : 0 } : {}) })),
    how: 'agents: code_changes action "revert" (an applied change) or "withdraw" (your pending proposal); approving is the person\'s (POST /api/repos/:uuid/injects/:inject/apply)', via: E.VIA });
}

// ── writes ───────────────────────────────────────────────────────────────────────────────────────────
function _expectOk(cur, expectHash) {
  if (!expectHash) return null;
  const h = String(expectHash).trim().toLowerCase();
  if (h.length < 8) return 'expectHash must be at least 8 hex characters';
  if (!cur.sha || !cur.sha.startsWith(h)) return `the file changed since you read it (expected ${h.slice(0, 12)}, it is now ${cur.sha ? cur.sha.slice(0, 12) : 'missing'}) — read it again`;
  return null;
}
function _introduced(before, after) {
  const key = (d) => `${d.severity}|${d.message}`;
  const had = new Set((before || []).filter(d => d.severity === 'error').map(key));
  return (after || []).filter(d => d.severity === 'error' && !had.has(key(d)));
}

/**
 * prepare(ctx, op, state) — compute one operation's new content against the WORKING state (earlier ops in the same
 * batch included). Returns { changes:[{ path, content } | { path, delete:true }], report } or { error, status }.
 */
function prepare(ctx, op, state) {
  const E = CE();
  const cur = (p) => {
    if (state.has(p)) return state.get(p);
    const c = E.current({ layer: ctx.layer, RI: RI(), repo: ctx.repo, path: p });
    state.set(p, { ...c, before: c.content });
    return state.get(p);
  };
  const kind = op.op || op.kind || (op.edits || op.old != null || op.startLine != null ? 'edit' : op.from ? 'move' : op.delete ? 'delete' : 'write');
  if (kind === 'edit') {
    let p = op.path;
    let edits = op.edits || (op.old != null || op.startLine != null || op.insertAfter != null || op.insertBefore != null || op.append != null ? [op] : null);
    if (op.chunk || op.chunkId) {
      ensureIntel(ctx);
      const I = CI(); const intel = I.load(ctx.dir);
      if (intel.error) return { status: 409, error: intel.error };
      const rr = I.resolveRef(intel, op.chunk || op.chunkId);
      if (rr.ids.length !== 1) return { status: 404, error: rr.ids.length ? `"${op.chunk || op.chunkId}" matches ${rr.ids.length} chunks — pass one id` : `no chunk "${op.chunk || op.chunkId}"` };
      const card = intel.cards[rr.ids[0]];
      p = card.file;
      if (typeof op.content !== 'string' && typeof op.new !== 'string') return { status: 400, error: 'content (the chunk\'s full new text) is required with chunk' };
      const c = cur(p);
      if (!c.exists) return { status: 404, error: `${p} does not exist` };
      const lines = String(c.content).split('\n').slice(card.range.start_line - 1, card.range.end_line).join('\n');
      if (card.hash && E.sha(lines) !== card.hash) return { status: 409, error: `chunk ${card.id} (${p}:${card.range.start_line}-${card.range.end_line}) changed since it was indexed — read it again (code_chunk) or edit by exact text` };
      edits = [{ startLine: card.range.start_line, endLine: card.range.end_line, new: typeof op.content === 'string' ? op.content : op.new }];
    }
    if (!p) return { status: 400, error: 'path (or chunk) is required' };
    if (!edits || !edits.length) return { status: 400, error: 'edits are required: [{ old, new }] or [{ startLine, endLine, new }] or [{ insertAfter, new }]' };
    const c = cur(p);
    if (c.error) return { status: 400, error: c.error };
    if (!c.exists) return { status: 404, error: `${p} does not exist — create it with code_write` };
    const x = _expectOk(c, op.expectHash); if (x) return { status: 409, error: x };
    const plan = E.planEdits(c.content, edits);
    if (!plan.ok) return { status: 422, error: plan.errors.join(' · '), errors: plan.errors };
    state.set(p, { ...c, exists: true, content: plan.content, sha: E.sha(plan.content), touched: true });
    return { changes: [{ path: p }], report: { op: 'edit', path: p, edits: plan.changes, changed: plan.changed } };
  }
  if (kind === 'write') {
    const p = op.path;
    if (!p) return { status: 400, error: 'path is required' };
    if (typeof op.content !== 'string') return { status: 400, error: 'content (the whole file) is required' };
    const c = cur(p);
    if (c.error) return { status: 400, error: c.error };
    if (c.exists && !bool(op.overwrite)) return { status: 409, error: `${p} already exists (${String(c.content).split('\n').length} lines) — use code_edit to change part of it, or pass overwrite:true to replace it whole` };
    const x = _expectOk(c, op.expectHash); if (x) return { status: 409, error: x };
    state.set(p, { ...c, exists: true, content: op.content, sha: E.sha(op.content), touched: true, created: !c.exists });
    return { changes: [{ path: p }], report: { op: 'write', path: p, created: !c.exists, lines: op.content.split('\n').length } };
  }
  if (kind === 'delete') {
    const p = op.path;
    if (!p) return { status: 400, error: 'path is required' };
    const c = cur(p);
    if (!c.exists) return { status: 404, error: `${p} does not exist` };
    state.set(p, { ...c, exists: false, content: null, sha: null, touched: true, deleted: true });
    return { changes: [{ path: p }], report: { op: 'delete', path: p } };
  }
  if (kind === 'move') {
    const from = op.from, to = op.to;
    if (!from || !to) return { status: 400, error: 'from and to are required' };
    if (from === to) return { status: 400, error: 'from and to are the same path' };
    const a = cur(from);
    if (!a.exists) return { status: 404, error: `${from} does not exist` };
    const b = cur(to);
    if (b.exists && !bool(op.overwrite)) return { status: 409, error: `${to} already exists — pass overwrite:true to replace it` };
    state.set(to, { ...b, exists: true, content: a.content, sha: a.sha, touched: true, created: !b.exists });
    state.set(from, { ...a, exists: false, content: null, sha: null, touched: true, deleted: true });
    let refs = null;
    try { const g = CI().grepRepo(ctx.dir, { pattern: path.basename(from).replace(/\.[^.]+$/, ''), wholeWord: true, limit: 20 }); refs = (g.matches || []).filter(m => m.file !== from).map(m => `${m.file}:${m.line}`); } catch (_) {}
    return { changes: [{ path: to }, { path: from }], report: { op: 'move', from, to, ...(refs && refs.length ? { mayReference: refs.slice(0, 20), note: 'these lines name the old file — update imports with code_edit' } : {}) } };
  }
  return { status: 400, error: `unknown op "${kind}" — edit | write | delete | move` };
}

/**
 * runOps(ctx, ops, { dryRun, force }) — the one write path behind edit/write/delete/move/batch.
 * All ops are computed first (nothing is written if any fails), checked for syntax, then committed together.
 */
function runOps(ctx, ops, { dryRun = false, force = false } = {}) {
  const E = CE();
  if (!Array.isArray(ops) || !ops.length) return bad(400, 'ops is required (a non-empty list)');
  if (ops.length > 50) return bad(400, 'at most 50 operations per call');
  const state = new Map();
  const reports = [];
  for (let i = 0; i < ops.length; i++) {
    const r = prepare(ctx, ops[i] || {}, state);
    if (r.error) return bad(r.status || 400, ops.length > 1 ? `op ${i + 1}: ${r.error}` : r.error, { ...(r.errors ? { errors: r.errors } : {}), op: i + 1, nothingWritten: true });
    reports.push(r.report);
  }
  // per file: the final content vs where it started
  const files = [];
  for (const [p, s] of state) {
    if (!s.touched) continue;
    const before = s.before ?? null;
    const after = s.deleted ? null : s.content;
    if (before === after) continue;
    const diagBefore = before != null ? E.diagnose(p, before) : [];
    const diagAfter = after != null ? E.diagnose(p, after) : [];
    files.push({ path: p, before, after, deleted: !!s.deleted, created: before == null && after != null,
      diff: E.unifiedDiff(before, after, { path: p }), diagnostics: diagAfter, introduced: _introduced(diagBefore, diagAfter) });
  }
  if (!files.length) return ok({ ok: true, changed: false, note: 'nothing changed — the result is identical to the current content', ops: reports });
  const broken = files.filter(f => f.introduced.length);
  const view = files.map(f => ({ path: f.path, ...(f.created ? { created: true } : {}), ...(f.deleted ? { deleted: true } : {}),
    ...(f.after != null ? { lines: f.after.split('\n').length, hash: E.sha(f.after) } : {}), diff: f.diff,
    ...(f.diagnostics.length ? { diagnostics: f.diagnostics } : {}) }));
  if (broken.length && !force) {
    return bad(422, `refused: this would introduce ${broken.map(f => `${f.introduced.length} syntax error(s) in ${f.path} (${f.introduced.map(d => `${d.line ? `line ${d.line}: ` : ''}${d.message}`).join('; ')})`).join(', ')} — fix the edit, or pass force:true if the file is meant to be broken for a moment`,
      { files: view, nothingWritten: true });
  }
  if (dryRun) return ok({ ok: true, dryRun: true, files: view, ops: reports });
  const hat = _hat(ctx);
  const c = E.commit({ layer: ctx.layer, RI: RI(), repo: ctx.repo, hat, changes: files.map(f => (f.deleted ? { path: f.path, delete: true } : { path: f.path, content: f.after })),
    source: { tool: ctx.tool || null } });
  if (!c.ok) return bad(409, (c.errors || ['commit failed']).join('; '), { rolledBack: c.rolledBack || [], nothingWritten: true });
  for (const f of c.files) ctx.emit && ctx.emit('idearium.repo.code.changed', { repoUuid: ctx.uuid, path: f.path, op: f.op, status: f.status, inject: f.inject });
  const byPath = new Map(c.files.map(f => [f.path, f]));
  const note = _modeNote(c.mode, !!ctx.repo.nexusSelf);
  return ok({ ok: true, mode: c.mode, status: c.mode === 'auto' ? 'applied' : 'proposed', ...(note ? { note } : {}), ...(c.warning ? { warning: c.warning } : {}),
    files: view.map(v => ({ ...v, inject: (byPath.get(v.path) || {}).inject || null, ...((byPath.get(v.path) || {}).stacked ? { stacked: true } : {}) })), ops: reports,
    next: c.mode === 'auto' ? 'the repo is reindexed — code_check runs the syntax check and the related tests' : null });
}

function edit(ctx) {
  const b = ctx.body || {};
  return runOps(ctx, [{ ...b, op: 'edit' }], { dryRun: bool(b.dryRun), force: bool(b.force) });
}
function write(ctx) { const b = ctx.body || {}; return runOps(ctx, [{ ...b, op: 'write' }], { dryRun: bool(b.dryRun), force: bool(b.force) }); }
function del(ctx) { const b = ctx.body || {}; return runOps(ctx, [{ path: b.path || ctx.query.path, op: 'delete' }], { dryRun: bool(b.dryRun) }); }
function move(ctx) { const b = ctx.body || {}; return runOps(ctx, [{ ...b, op: 'move' }], { dryRun: bool(b.dryRun), force: bool(b.force) }); }
function batch(ctx) { const b = ctx.body || {}; return runOps(ctx, b.ops, { dryRun: bool(b.dryRun), force: bool(b.force) }); }

/**
 * check(ctx) — { paths?, tests? } → syntax diagnostics for each file (working version), and with tests:true the tests
 * that exercise those files: test files whose chunks use them (code-intel), plus the registry's covering tests.
 */
async function check(ctx) {
  const b = ctx.body || {};
  const E = CE();
  let paths = Array.isArray(b.paths) ? b.paths : b.path ? [b.path] : [];
  if (!paths.length) {
    // default: the files these tools changed most recently in this repo
    paths = [...new Set(RI().list(ctx.uuid, { limit: 20 }).filter(n => n.source && n.source.via === E.VIA && n.op !== 'delete').map(n => n.path))].slice(0, 10);
    if (!paths.length) return bad(400, 'paths is required (nothing was changed through the code tools yet)');
  }
  const files = [];
  for (const p of paths.slice(0, 30)) {
    const c = E.current({ layer: ctx.layer, RI: RI(), repo: ctx.repo, path: p });
    if (!c.exists) { files.push({ path: p, error: 'no such file' }); continue; }
    const d = E.diagnose(p, c.content);
    files.push({ path: p, ok: !d.some(x => x.severity === 'error'), diagnostics: d, ...(c.pending ? { pending: true } : {}) });
  }
  // `passed`, not `ok`: the HTTP envelope's own ok (the request worked) must not be confused with the verdict
  const out = { passed: files.every(f => f.ok), files };
  if (bool(b.tests)) out.tests = await _runRelatedTests(ctx, paths, Math.min(parseInt(b.max, 10) || 4, 8));
  if (out.tests && out.tests.ran) out.passed = out.passed && out.tests.allPassed === true;
  return ok(out);
}

async function _runRelatedTests(ctx, paths, max) {
  if (ctx.repo.nexusSelf) return { ran: 0, note: 'a Nexus repo runs its tests through loom.test.tool (the COS nexus-self compartment)' };
  const testRe = CI().cards.TEST_RE;
  const found = new Set();
  for (const p of paths) if (testRe.test(p)) found.add(p);
  try {
    const intel = CI().load(ctx.dir);
    if (!intel.error) for (const p of paths) for (const c of intel.byFile.get(p) || []) for (const u of c.usedBy || []) if (testRe.test(u.file)) found.add(u.file);
  } catch (_) {}
  try {
    const H = _require('../../lib/registry-harness.js');
    const idx = H.indexFor(ctx.repo, ctx.dir);
    for (const p of paths) { const c = H.card(idx, p, { cap: 50 }); if (!c.error) for (const t of c.tests || []) if (!String(t).startsWith('…')) found.add(idx.fileOf(t) || t); }
  } catch (_) {}
  const list = [...found].slice(0, max);
  if (!list.length) return { ran: 0, note: 'no test in this repo uses these files — write one (code_write tests/…), then check again' };
  const CR = _require('../../lib/cos-run.js');
  let compartment = null;
  try { if (ctx.repo.compartmentId) compartment = _require('../../lib/cos-bridge.js').getCompartment(ctx.repo.compartmentId); } catch (_) {}
  const runs = [];
  for (const f of list) {
    let r;
    try { r = await CR.run({ repo: ctx.repo, repoDir: ctx.dir, compartment, option: 'test.file', file: f, timeoutMs: 120000 }); }
    catch (e) { r = { ok: false, errors: [e.message] }; }
    const one = (r.runs || [])[0] || {};
    if (!r.ok) { runs.push({ file: f, status: 'not-run', error: (r.errors || []).join('; ') }); continue; }
    runs.push({ file: f, status: r.allPassed ? 'passed' : 'failed', passed: !!r.allPassed, exitCode: one.exitCode ?? null, tail: String(one.stderr || one.stdout || '').slice(-800) });
  }
  const ran = runs.filter(x => x.status !== 'not-run');
  const notRun = runs.filter(x => x.status === 'not-run');
  return { ran: ran.length, allPassed: ran.length ? ran.every(x => x.passed) : null, runs,
    ...(notRun.length ? { couldNotRun: notRun.length, why: notRun[0].error, hint: /no COS compartment/.test(notRun[0].error || '') ? 'tests run inside the repo\'s COS compartment (isolation); an imported project has one — this repo does not' : undefined } : {}),
    ...(found.size > list.length ? { notRun: [...found].slice(list.length) } : {}) };
}

export const ROUTES = Object.freeze({
  GET: { overview, tree, search: searchCode, grep, chunk, outline, read, definition, changes },
  POST: { edit, write, delete: del, move, batch, check },
});

/**
 * handle({ method, op, layer, repo, uuid, dir, query, body, emit }) -> Promise<{ status, body }>
 */
export async function handleCode(ctx) {
  const table = ROUTES[ctx.method] || {};
  const fn = table[ctx.op];
  if (!fn) {
    const other = ctx.method === 'GET' ? ROUTES.POST : ROUTES.GET;
    return bad(other[ctx.op] ? 405 : 404, other[ctx.op] ? `use ${ctx.method === 'GET' ? 'POST' : 'GET'} for code/${ctx.op}` : `no code/${ctx.op} — GET ${Object.keys(ROUTES.GET).join('|')} · POST ${Object.keys(ROUTES.POST).join('|')}`);
  }
  try { return await fn(ctx); }
  catch (e) { console.error(`[idearium/code-api] ${ctx.method} code/${ctx.op} threw: ${e.stack || e.message}`); return bad(500, `code/${ctx.op} failed: ${e.message}`); }
}

export default { handleCode, ROUTES, ensureIntel };
