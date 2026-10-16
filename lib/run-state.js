'use strict';
/**
 * lib/run-state.js — what a run has done, kept by Nexus, not by the agent (CE1, 0.60.50)
 * comp_id: nexus.lib.run-state
 * UUID: nexus-lib-run-state-v1-0000-2026-1015-jamesbrooks-001
 * Map: docs/2026-10-15-code-tab-run-state-phasemap.spec (CE1_the_run_state, CE2_the_task_header)
 *
 * James, 2026-10-15: "i feel lime also needs to use the gates to maintain persistence using the memory. so we can use
 * nexus for the workload, instead of relying on the agents to remember." · "i want it to start exactly where it left
 * off if it restarts."
 *
 * Found in his own runs (the .response files): a build step made 7 tool calls, then ChatGPT answered "What would you like
 * me to do with this material?" — the goal lived only in the first turn. The retry replayed the original prompt, so its
 * first call was code_map again and the 7 calls of reading were gone.
 *
 * The run is a node (.run, lib/node-export.js type 'run'): the goal, the tool calls made, the files read and changed, the
 * attempt. One file per run, written after every tool call (atomically), so a restart loads it. A run is keyed by the
 * repo and the session (a phase build's session id is stable across its retries), so the same task sent again finds
 * its run and RESUMES it: attempt + 1, the steps kept. A different task in that session starts a new run.
 *
 *   begin({ repoUuid, session, goal, provider })   → the run (new, or resumed when the goal is the same and it is unfinished)
 *   begin({ ..., brick })                           → §GW2 0.60.77: the run of a BRICK (a chunk of a contract), whatever the session
 *
 * §GW2 0.60.77 — James: "make each agent able to not need the same chat, like the gates, and nexus hold the persistent
 * data, so we could use a different chat or agent each gate" · "Yes. It’s analysis. The bricks." · "A brick is a chunk."
 * A brick's attempts each had their own session (…-r1t2, a fallback's chat) and their own goal (the retry carries the gate's
 * feedback), so each began a blank run: the next attempt, or the next agent, knew nothing of what the last one read, changed
 * or how it ended. Keyed by the brick, every attempt, fallback and fresh chat RESUMES the brick's one run: attempt + 1, steps
 * kept, the goal updated to what is asked now, the agents that tried it listed. The session is only a pointer.
 *   step(runId, ev)                                 → records a tool call ev { name, arguments, ok, error, iteration }
 *   header(runId, template)                         → the task header text, from an editable block (CE2); null without a run
 *   finish(runId, status, note)                     → status done | failed | stopped
 *   load(runId) / list({ repoUuid, status })        → read back
 *
 * The header's words are NOT here: its template is the 'task-header' prompt block (lib/repo-prompt-blocks.js) he edits in
 * Settings → Agents. This module only fills its placeholders: {goal} {step} {done} {last} {attempt} {next}.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODULE_ID = 'nexus.lib.run-state';
const VERSION = '1.1.0';
const MAX_STEPS = 60;          // kept per run; older ones drop off the list (the count stays)
const HEADER_MAX = 700;        // the header is never a second prompt

function dir() { return process.env.RUN_STATE_DIR || path.join(__dirname, '..', 'data', 'run-state'); }
function _safe(s) { return String(s == null ? '' : s).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'x'; }
function _hash(s) { return crypto.createHash('sha256').update(String(s || '').replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 12); }
function _nx() { return require('./node-export.js'); }

/** runIdFor({ repoUuid, session }) → the stable id of the run a repo's session owns */
function runIdFor({ repoUuid = null, session = null, brick = null } = {}) { return brick ? `${_safe(repoUuid || 'repo')}__brick-${_safe(brick)}` : `${_safe(repoUuid || 'repo')}__${_safe(session || 'agent')}`; }
function _file(runId) { return path.join(dir(), `${_safe(runId)}.run`); }

function _write(run) {
  fs.mkdirSync(dir(), { recursive: true });
  const tags = [`repo:${run.repoUuid || 'none'}`, `session:${run.session || 'none'}`, `status:${run.status}`, `attempt:${run.attempt}`];
  if (run.provider) tags.push(`provider:${run.provider}`);
  const env = _nx().wrap('run', run.runId, run, { context: 'run state — what this run has done, kept by Nexus so a restart continues it', system: 'core', tags,
    summary: `${run.status} · step ${run.stepCount} · attempt ${run.attempt} · ${String(run.goal || '').slice(0, 80)}` });
  const f = _file(run.runId); const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, _nx().toYaml(env), 'utf8');
  fs.renameSync(tmp, f);   // atomic: a crash mid-write leaves the last whole file, never half of one
  return run;
}

function load(runId) {
  try { return _nx().importFromFile(_file(runId)).payload || null; }
  catch (_) { return null; }
}

function list({ repoUuid = null, status = null } = {}) {
  let files = []; try { files = fs.readdirSync(dir()).filter(f => f.endsWith('.run')); } catch (_) { return []; }
  const out = [];
  for (const f of files) {
    try { const p = _nx().importFromFile(path.join(dir(), f)).payload; if ((!repoUuid || p.repoUuid === repoUuid) && (!status || p.status === status)) out.push(p); } catch (_) { /* unreadable: skipped, not deleted */ }
  }
  return out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/** forSession(session) → the most recently updated run a session owns (a job carries its session; this finds its run) */
function forSession(session) {
  if (!session) return null;
  return list().find(r => r.session === session) || null;
}

/** begin → the run. Same repo + session + goal and not finished = RESUMED (attempt + 1, steps kept); else a new run. */
function begin({ repoUuid = null, session = null, goal = '', provider = null, brick = null } = {}) {
  const runId = runIdFor({ repoUuid, session, brick });
  const gh = _hash(goal);
  const prev = load(runId);
  const now = Date.now();
  // §GW2 — a brick's run is the brick's: every attempt resumes it (a passed brick re-run after a change too: its history kept)
  if (prev && brick) {
    prev.attempt = (prev.attempt || 1) + 1; prev.status = 'running'; prev.resumed = true; prev.updatedAt = now;
    prev.goal = String(goal || '').slice(0, 2000); prev.goalHash = gh; prev.session = session || prev.session;
    prev.provider = provider || prev.provider;
    prev.providers = [...(prev.providers || []), { provider: provider || null, attempt: prev.attempt, session: session || null, at: now }].slice(-20);
    _emit('run.resumed', prev);
    return _write(prev);
  }
  if (prev && prev.goalHash === gh && prev.status !== 'done') {
    prev.attempt = (prev.attempt || 1) + 1; prev.status = 'running'; prev.resumed = true; prev.provider = provider || prev.provider; prev.updatedAt = now;
    _emit('run.resumed', prev);
    return _write(prev);
  }
  const run = { runId, repoUuid, session, ...(brick ? { brick, providers: [{ provider: provider || null, attempt: 1, session: session || null, at: now }] } : {}), goal: String(goal || '').slice(0, 2000), goalHash: gh, provider, status: 'running', attempt: 1, resumed: false,
    stepCount: 0, steps: [], filesRead: [], filesChanged: [], next: null, startedAt: now, updatedAt: now, note: null };
  _emit('run.started', run);
  return _write(run);
}

const _READ = /(code_(read|chunk|grep|outline|refs)|read_file|loom\.card|loom\.test)/i;
const _WRITE = /(code_(edit|write|batch)|loom\.write|write_file)/i;
function _pathOf(args) {
  const a = args && typeof args === 'object' ? args : {};
  const p = a.path || a.file || a.filePath || (typeof a.at === 'string' ? a.at.split(':')[0] : null);
  return typeof p === 'string' && p.trim() ? p.trim().slice(0, 200) : null;
}
function _add(list, v) { if (v && !list.includes(v)) { list.push(v); if (list.length > 200) list.shift(); } }

/** step(runId, ev) — one tool call. ev: { name, arguments, ok, error, iteration, at } */
function step(runId, ev = {}) {
  const run = load(runId); if (!run) return null;
  const name = String(ev.name || '');
  const p = _pathOf(ev.arguments);
  if (p && ev.ok !== false) { if (_WRITE.test(name)) _add(run.filesChanged, p); else if (_READ.test(name)) _add(run.filesRead, p); }
  let arg = ''; try { arg = JSON.stringify(ev.arguments || {}).slice(0, 110); } catch (_) {}
  run.stepCount = (run.stepCount || 0) + 1;
  run.steps.push({ n: run.stepCount, name, arg, ok: ev.ok !== false, error: ev.error ? String(ev.error).slice(0, 120) : null, attempt: run.attempt, at: ev.at || Date.now() });
  if (run.steps.length > MAX_STEPS) run.steps = run.steps.slice(-MAX_STEPS);
  run.updatedAt = Date.now();
  _emit('run.step', { runId, n: run.stepCount, name, ok: ev.ok !== false, path: p });
  return _write(run);
}

function setNext(runId, text) { const run = load(runId); if (!run) return null; run.next = text ? String(text).slice(0, 240) : null; run.updatedAt = Date.now(); return _write(run); }

/** note(runId, kind, text) — something that happened to the run that is not a tool call: off-task, reprompted, lost, fallback */
function note(runId, kind, text) {
  const run = load(runId); if (!run) return null;
  run.events = (run.events || []).concat([{ kind: String(kind).slice(0, 40), text: String(text || '').slice(0, 240), attempt: run.attempt, at: Date.now() }]).slice(-40);
  if (kind === 'off-task') run.offTask = (run.offTask || 0) + 1;
  run.updatedAt = Date.now();
  _emit(`run.${String(kind).replace(/[^a-z0-9.-]/gi, '')}`, { runId, repoUuid: run.repoUuid, status: run.status, attempt: run.attempt });
  return _write(run);
}

function finish(runId, status = 'done', note = null) {
  const run = load(runId); if (!run) return null;
  run.status = status; run.note = note ? String(note).slice(0, 300) : null; run.updatedAt = Date.now();
  _emit(status === 'done' ? 'run.finished' : 'run.failed', run);
  return _write(run);
}

function _emit(type, payload) {
  try { const bus = require('../nexus/nexus-bus.js'); if (bus && typeof bus.emit === 'function') bus.emit(type, { runId: payload.runId, repoUuid: payload.repoUuid || null, status: payload.status || null, attempt: payload.attempt || null, n: payload.n || null, name: payload.name || null, ok: payload.ok, path: payload.path || null, ts: Date.now() }, { source: MODULE_ID }); }
  catch (_) { /* the bus never stops a run */ }
}

const _short = (list, n) => list.length ? `${list.length} (${list.slice(-n).map(p => p.split('/').slice(-2).join('/')).join(', ')}${list.length > n ? ', …' : ''})` : 'none';

/** fill(template, run) → the template with its placeholders filled; pure */
function fill(template, run) {
  if (typeof template !== 'string' || !template || !run) return null;
  const last = run.steps && run.steps.length ? run.steps[run.steps.length - 1] : null;
  const vals = {
    goal: String(run.goal || '').replace(/\s+/g, ' ').slice(0, 260),
    step: String((run.stepCount || 0) + 1),
    done: `read ${_short(run.filesRead || [], 3)} · changed ${_short(run.filesChanged || [], 3)}`,
    last: last ? `${last.name}${last.ok ? '' : ' (failed)'}` : 'nothing yet',
    attempt: String(run.attempt || 1),
    next: run.next ? String(run.next) : '',
  };
  const lines = [];
  for (const line of template.split('\n')) {
    const keys = [...line.matchAll(/\{(goal|step|done|last|attempt|next)\}/g)].map(m => m[1]);
    if (keys.length && keys.every(k => !vals[k])) continue;   // a line whose placeholders are all empty is dropped
    lines.push(line.replace(/\{(goal|step|done|last|attempt|next)\}/g, (m, k) => vals[k]));
  }
  const out = lines.join('\n').trim();
  return out.length > HEADER_MAX ? out.slice(0, HEADER_MAX - 1) + '…' : out;
}

/** header(runId, template) → the filled task header, or null (no run, no template: nothing is sent) */
function header(runId, template) { return fill(template, load(runId)); }

module.exports = { MODULE_ID, VERSION, runIdFor, begin, step, setNext, note, forSession, finish, load, list, fill, header, dir };
