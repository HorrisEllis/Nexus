'use strict';
/**
 * lib/repo-procedures.js — a repo's replayable procedures: tool calls kept as a file, run again in order (DK1, 0.60.118)
 * comp_id: nexus.lib.repo-procedures
 * UUID: nexus-lib-repo-procedures-v1-0000-2026-1017-jamesbrooks-001
 * Map: docs/2026-10-16-code-tab-rebuild-phasemap.spec (addendum_c DK1_procedures_backend)
 *
 * James, 2026-10-17: "maybe buttons for agent tools, for the repo, to execute. replayable proceedures?" · his standing rule
 * (2026-10-16): "all data is meant to persist. hardcoded has to earn its place."
 *
 * A procedure is a node file, <idearium data>/procedures/<repo>/<id>.procedure (lib/node-export.js envelope, type
 * 'procedure'): { id, repoUuid, name, steps: [{ tool, args }], from: { kind: 'run'|'hand', runId? }, runs: [{ at, ok, by,
 * results: [{ tool, ok, error?, summary? }] }], createdAt, updatedAt }. Written atomically (tmp + rename, as lib/run-state.js).
 * Removing one archives it (<id>.procedure.removed-<ts>), never deletes it (§0.3).
 *
 *   save({ repoUuid, name, steps, from })      → the procedure (new id), or { ok:false, error }
 *   list(repoUuid) / get(repoUuid, id)         → read back
 *   remove(repoUuid, id)                       → archived
 *   fromRun({ repoUuid, runId, name })         → a procedure from a run's tool calls (lib/run-state.js). A step whose
 *                                                 arguments were cut when the run kept them (arg is JSON cut at 110 chars)
 *                                                 cannot be replayed exactly: it is left out and NAMED, never guessed.
 *   replay(repoUuid, id, { runTool, by })      → each step through runTool(tool, args) in order; the first failure stops
 *                                                 the replay and is named. The run is appended to the file.
 * runTool is injected (Idearium passes lib/repo-agent.js runTool: copilot's one tool door, the repo's scope enforced), so
 * this module knows no transport and the test needs no copilot.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODULE_ID = 'nexus.lib.repo-procedures';
const VERSION = '1.0.0';
const MAX_STEPS = 50;       // a procedure is a short recipe, not a run log
const MAX_RUNS = 30;        // runs kept on the file (the count stays)

function _nx() { return require('./node-export.js'); }
function _safe(s) { return String(s == null ? '' : s).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'x'; }
function root() {
  if (process.env.REPO_PROCEDURES_DIR) return process.env.REPO_PROCEDURES_DIR;
  try { return path.join(require('../idearium/lib/data-dir.cjs').ideariumDataDir(), 'procedures'); }
  catch (_) { return path.join(__dirname, '..', 'data', 'idearium', 'procedures'); }
}
function _dir(repoUuid) { return path.join(root(), _safe(repoUuid)); }
function _file(repoUuid, id) { return path.join(_dir(repoUuid), `${_safe(id)}.procedure`); }

function _write(p) {
  fs.mkdirSync(_dir(p.repoUuid), { recursive: true });
  const env = _nx().wrap('procedure', p.id, p, { context: 'a repo procedure — tool calls kept to run again in order', system: 'idearium',
    tags: [`repo:${p.repoUuid}`, `from:${(p.from && p.from.kind) || 'hand'}`], summary: `${p.name} · ${p.steps.length} step${p.steps.length === 1 ? '' : 's'} · ${p.runs.length} run${p.runs.length === 1 ? '' : 's'}` });
  const f = _file(p.repoUuid, p.id), tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, _nx().toYaml(env), 'utf8');
  fs.renameSync(tmp, f);   // atomic: a crash mid-write leaves the last whole file
  return p;
}

function _cleanSteps(steps) {
  const out = [], bad = [];
  (Array.isArray(steps) ? steps : []).slice(0, MAX_STEPS).forEach((s, i) => {
    const tool = s && typeof s.tool === 'string' ? s.tool.trim() : '';
    const args = s && s.args && typeof s.args === 'object' && !Array.isArray(s.args) ? s.args : (s && s.args == null ? {} : null);
    if (!tool || args === null) bad.push(i + 1); else out.push({ tool, args });
  });
  return { steps: out, bad };
}

function save({ repoUuid, name, steps, from = { kind: 'hand' } } = {}) {
  if (!repoUuid) return { ok: false, error: 'repoUuid is required' };
  const c = _cleanSteps(steps);
  if (c.bad.length) return { ok: false, error: `step ${c.bad.join(', ')} has no tool name or its args are not an object` };
  if (!c.steps.length) return { ok: false, error: 'a procedure needs at least one step { tool, args }' };
  const now = Date.now();
  const p = { id: `proc-${now.toString(36)}-${crypto.randomBytes(3).toString('hex')}`, repoUuid, name: String(name || `${c.steps.length} step${c.steps.length === 1 ? '' : 's'}`).slice(0, 120),
    steps: c.steps, from: from && typeof from === 'object' ? from : { kind: 'hand' }, runs: [], runCount: 0, createdAt: now, updatedAt: now };
  return { ok: true, procedure: _write(p) };
}

function get(repoUuid, id) {
  try { return _nx().importFromFile(_file(repoUuid, id)).payload || null; } catch (_) { return null; }
}

function list(repoUuid) {
  let names = [];
  try { names = fs.readdirSync(_dir(repoUuid)).filter(f => f.endsWith('.procedure')); } catch (_) { return []; }
  return names.map(f => get(repoUuid, f.replace(/\.procedure$/, ''))).filter(Boolean).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function remove(repoUuid, id) {
  const f = _file(repoUuid, id);
  if (!fs.existsSync(f)) return { ok: false, error: `no procedure ${id}` };
  const arch = `${f}.removed-${Date.now()}`;
  fs.renameSync(f, arch);   // archived, never deleted (§0.3)
  return { ok: true, archived: arch };
}

/** fromRun — a run's tool calls as a procedure; steps whose kept arguments were cut are left out and named */
function fromRun({ repoUuid, runId, name = null, load = null } = {}) {
  const RS = require('./run-state.js');
  const run = (load || RS.load)(runId);
  if (!run) return { ok: false, error: `no run ${runId}` };
  const steps = [], cut = [];
  for (const s of run.steps || []) {
    if (s.ok === false) continue;   // a failed call is not part of the recipe
    let args = null;
    try { args = s.arg ? JSON.parse(s.arg) : {}; } catch (_) { args = null; }
    if (args === null || typeof args !== 'object' || Array.isArray(args)) { cut.push({ n: s.n, tool: s.name }); continue; }
    steps.push({ tool: s.name, args });
  }
  if (!steps.length) return { ok: false, error: `run ${runId} has no step whose arguments were kept whole${cut.length ? ` (${cut.length} were cut when the run kept them)` : ''}`, cut };
  const r = save({ repoUuid: repoUuid || run.repoUuid, name: name || `from run: ${String(run.goal || runId).slice(0, 80)}`, steps, from: { kind: 'run', runId } });
  return r.ok ? { ...r, cut } : r;
}

function _summary(res) {
  if (!res || typeof res !== 'object') return null;
  try { const s = JSON.stringify(res.result !== undefined ? res.result : res); return s.length > 240 ? `${s.slice(0, 240)}…` : s; } catch (_) { return null; }
}

/** replay — in order through runTool; the first failure stops it. The run is kept on the file. */
async function replay(repoUuid, id, { runTool, by = 'person' } = {}) {
  if (typeof runTool !== 'function') return { ok: false, error: 'replay needs a tool runner' };
  const p = get(repoUuid, id);
  if (!p) return { ok: false, error: `no procedure ${id}` };
  const results = [];
  let ok = true;
  for (const s of p.steps) {
    let r;
    try { r = await runTool(s.tool, s.args); } catch (e) { r = { ok: false, error: e.message }; }
    const good = !!(r && r.ok !== false && !r.error);
    results.push({ tool: s.tool, ok: good, ...(good ? { summary: _summary(r) } : { error: String((r && r.error) || 'the tool did not answer').slice(0, 300) }) });
    if (!good) { ok = false; break; }
  }
  const run = { at: Date.now(), ok, by, results, ...(ok ? {} : { stoppedAt: results.length, of: p.steps.length }) };
  p.runs = [...(p.runs || []), run].slice(-MAX_RUNS);
  p.runCount = (p.runCount || 0) + 1;
  p.updatedAt = Date.now();
  _write(p);
  return { ok, procedure: { id: p.id, name: p.name }, run };
}

module.exports = { MODULE_ID, VERSION, MAX_STEPS, root, save, get, list, remove, fromRun, replay };
