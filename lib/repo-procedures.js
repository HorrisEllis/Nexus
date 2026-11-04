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
 *
 * PD1 (0.60.354) — James, 2026-11-01: "can you make that a macro or framework and then into a command like a batch but a .framework or .macro
 * that me and copilot can use. i feel we need more proceedures." · choosing the name: ".procedure" — the name of this, his 0.60.118 feature, so
 * the new abilities land here, not in a second module (§8.6, §10.3; docs/2026-11-01-procedures-phasemap.spec PD_D0 addendum). Two step kinds
 * beside { tool, args }:
 *   { confirm: "<what it is about to do>" }   his yes: without it the run stops there (waiting), for copilot too
 *   { check: { of: <step number>, contains | equals | matches | notEmpty } }   what that step gave must hold, else the run stops, said
 * And a library: procedures shipped with the code (no repo), in the folder the serving system hands in.
 *   library({ dir }) → procedures (with .bad) · fromLibrary(id, { dir }) · runSteps(p, { runTool, yes, by }) → { ok, waiting?, run }
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODULE_ID = 'nexus.lib.repo-procedures';
const VERSION = '1.1.0';   // 1.1.0 PD1: confirm and check steps, the shipped library, runSteps
const MAX_STEPS = 50;       // a procedure is a short recipe, not a run log
const MAX_RUNS = 30;        // runs kept on the file (the count stays)
const CHECK_KEYS = ['contains', 'equals', 'matches', 'notEmpty'];

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
    if (s && typeof s.confirm === 'string') { if (s.confirm.trim()) out.push({ confirm: s.confirm.trim().slice(0, 300) }); else bad.push(i + 1); return; }   // PD1
    if (s && s.check && typeof s.check === 'object') {   // PD1 — of: an earlier step's number; one thing that must hold
      const c = s.check, of = Number(c.of), keys = CHECK_KEYS.filter(k => c[k] != null);
      let re = true; if (c.matches != null) { try { new RegExp(c.matches); } catch (_) { re = false; } }
      if (Number.isInteger(of) && of >= 1 && of <= i && keys.length && re) out.push({ check: { of, ...Object.fromEntries(keys.map(k => [k, c[k]])) } }); else bad.push(i + 1);
      return;
    }
    const tool = s && typeof s.tool === 'string' ? s.tool.trim() : '';
    const args = s && s.args && typeof s.args === 'object' && !Array.isArray(s.args) ? s.args : (s && s.args == null ? {} : null);
    if (!tool || args === null) bad.push(i + 1); else out.push({ tool, args });
  });
  return { steps: out, bad };
}

function save({ repoUuid, name, steps, from = { kind: 'hand' } } = {}) {
  if (!repoUuid) return { ok: false, error: 'repoUuid is required' };
  const c = _cleanSteps(steps);
  if (c.bad.length) return { ok: false, error: `step ${c.bad.join(', ')} is not { tool, args }, { confirm: "…" } or { check: { of: <an earlier step>, contains | equals | matches | notEmpty } }` };
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

function _output(r) { return r && r.text != null ? r.text : r && r.result !== undefined ? r.result : r; }

/** runSteps(p, { runTool, yes, by }) — in order; a confirm passes only with yes (else the run waits there); a failing tool, a refusal or a
 *  check that does not hold stops it, named (§1.2). Nothing is written: replay keeps it on the repo's file; a library run is recorded by its caller. */
async function runSteps(p, { runTool, yes = false, by = 'person' } = {}) {
  if (typeof runTool !== 'function') return { ok: false, error: 'a procedure needs a tool runner' };
  const results = [], outs = [];
  let ok = true, waiting = false;
  for (const s of p.steps || []) {
    if (s.confirm != null) {
      if (!yes) { results.push({ confirm: s.confirm, ok: false, waiting: true }); ok = false; waiting = true; break; }
      results.push({ confirm: s.confirm, ok: true, yes: true }); outs.push(null); continue;
    }
    if (s.check) {
      const { gateOpen } = require('./automation/pipeline.js');
      const g = gateOpen(Object.fromEntries(CHECK_KEYS.filter(k => s.check[k] != null).map(k => [k, s.check[k]])), outs[s.check.of - 1]);
      results.push({ check: s.check, ok: g.open, ...(g.open ? {} : { error: `step ${s.check.of}: ${g.why}` }) }); outs.push(null);
      if (!g.open) { ok = false; break; }
      continue;
    }
    let r;
    try { r = await runTool(s.tool, s.args); } catch (e) { r = { ok: false, error: e.message }; }
    const good = !!(r && r.ok !== false && !r.error && !r.refused);   // PD1: a refusal (a person's row, asked by an agent) stops it too
    results.push({ tool: s.tool, ok: good, ...(good ? { summary: _summary(r) } : { error: String((r && (r.error || r.reason)) || 'the tool did not answer').slice(0, 300) }) });
    outs.push(good ? _output(r) : null);
    if (!good) { ok = false; break; }
  }
  const run = { at: Date.now(), ok, by, results, ...(waiting ? { waiting: true } : {}), ...(ok ? {} : { stoppedAt: results.length, of: (p.steps || []).length }) };
  return { ok, ...(waiting ? { waiting: true } : {}), procedure: { id: p.id, name: p.name }, run };
}

/** replay — runSteps on a repo's procedure; the run is kept on the file. */
async function replay(repoUuid, id, { runTool, by = 'person', yes = false } = {}) {
  if (typeof runTool !== 'function') return { ok: false, error: 'replay needs a tool runner' };
  const p = get(repoUuid, id);
  if (!p) return { ok: false, error: `no procedure ${id}` };
  const { ok, waiting, run } = await runSteps(p, { runTool, yes, by });
  p.runs = [...(p.runs || []), run].slice(-MAX_RUNS);
  p.runCount = (p.runCount || 0) + 1;
  p.updatedAt = Date.now();
  _write(p);
  return { ok, ...(waiting ? { waiting: true } : {}), procedure: { id: p.id, name: p.name }, run };
}

/** library({ dir }) — the procedures shipped with the code (no repo), in the folder the serving system hands in; a file that does not read is in .bad (§1.2) */
function library({ dir } = {}) {
  const out = [], bad = [];
  let names = [];
  try { names = fs.readdirSync(dir).filter(f => f.endsWith('.procedure')).sort(); } catch (_) { return Object.assign(out, { bad }); }
  for (const f of names) {
    try {
      const p = _nx().importFromFile(path.join(dir, f)).payload;
      const c = _cleanSteps(p && p.steps);
      if (!p || !p.id || c.bad.length || !c.steps.length) throw new Error(c.bad.length ? `step ${c.bad.join(', ')} is not a step` : 'no id or no steps');
      out.push({ ...p, steps: c.steps });
    } catch (e) { bad.push({ file: f, why: e.message }); }
  }
  return Object.assign(out, { bad });
}
function fromLibrary(id, { dir } = {}) { return library({ dir }).find(p => p.id === id) || null; }

module.exports = { MODULE_ID, VERSION, MAX_STEPS, root, save, get, list, remove, fromRun, replay, runSteps, library, fromLibrary };
