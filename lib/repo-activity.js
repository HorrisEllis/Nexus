'use strict';
/**
 * lib/repo-activity.js — a compartment's background tasks: everything an agent wearing its hat is doing, and did. §0.39.366
 * UUID: nexus-lib-repo-activity-v1-0000-2026-1007-jamesbrooks-001
 *
 * James (with a screenshot of Claude Code's Background tasks panel): "the background tasks, i want that for each repo.
 * any activity from an agent wearing the hat."
 *
 * Every call to an agent wearing a repo's hat goes through one door, lib/repo-agent.js dispatch(), whatever answers
 * (a guardian tab, Ollama through copilot, Claude Code). That door records a TASK here. A phase build is a task too,
 * the parent of its attempts, built from its own rows (idearium_phase_runs): each rung, escalation, memory skip and
 * proof is a step on it. What happens while a task runs is a step on it as well: the live feed of a guardian tab
 * (dispatched, gates, the reply growing) or an Ollama model writing, and every tool call.
 *
 *   task { id, repoUuid, hat, kind, title, status: running | done | failed | stale, provider, model, session, runId,
 *          parent, startedAt, endedAt, ms, steps: [{ ts, text, bad }], result: { chars, files, tools, error } }
 *
 * kind: phase (a phase build) · build (one attempt of it) · review (the draft review) · repair (a proof retry) · chat ·
 * run (a run in the repo's compartment: lib/cos-run.js, §0.39.370 DT1).
 * In memory, bounded (MAX_PER_REPO tasks, MAX_STEPS steps each). Before the first task of this process, the history
 * comes from the compartment's own exchange log (repo_agent_log), so a restart doesn't empty the panel. A task that
 * says running but has had nothing for STALE_MS reads 'stale': said, never shown as live.
 *
 * Every change goes to onChange (idearium broadcasts it: idearium.repo.task) so a panel can draw it as it happens.
 */
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const MAX_PER_REPO = 150;
const MAX_STEPS = 60;
const STALE_MS = 15 * 60 * 1000;

const _tasks = new Map();     // repoUuid -> [task] (newest last)
const _byId = new Map();      // id -> task
const _seeded = new Set();
const _als = new AsyncLocalStorage();
let _onChange = null;

function onChange(fn) { _onChange = typeof fn === 'function' ? fn : null; }
function _emit(t) { if (_onChange) { try { _onChange(view(t)); } catch (_) {} } }

function _list(repoUuid) { if (!_tasks.has(repoUuid)) _tasks.set(repoUuid, []); return _tasks.get(repoUuid); }
function _add(t) {
  const l = _list(t.repoUuid);
  l.push(t); _byId.set(t.id, t);
  // the oldest finished go first; a running task is never dropped
  while (l.length > MAX_PER_REPO) { const i = l.findIndex(x => x.status !== 'running'); if (i < 0) break; _byId.delete(l[i].id); l.splice(i, 1); }
  return t;
}

/** kindOf(session) — what an agent call is, from its session name */
function kindOf(session) {
  const s = String(session || '');
  if (!s) return 'chat';
  if (/-review$/.test(s)) return 'review';
  if (/^phrun-.*-a\d+$/.test(s)) return 'repair';
  if (/^phrun-/.test(s)) return 'build';
  return 'chat';
}
/** runOf(session) — the phase run an agent call belongs to: "phrun-<a>-<b>" */
function runOf(session) { const m = String(session || '').match(/^(phrun-[a-z0-9]+-[a-z0-9]+)/i); return m ? m[1] : null; }

function _title(kind, message, session) {
  const first = String(message || '').split('\n').map(l => l.trim()).find(l => l && !/^you are the project agent/i.test(l)) || String(message || '').trim();
  const s = first.length > 90 ? `${first.slice(0, 89)}…` : first;
  const tag = String(session || '').match(/-c(\d+)(?:-r(\d+)t(\d+))?$/) || String(session || '').match(/-r(\d+)t(\d+)$/);
  const where = /-c\d+/.test(session || '') ? ` · file ${tag[1]}${tag[2] ? ` · rung ${tag[2]}` : ''}` : (tag ? ` · rung ${tag[1]} try ${tag[2]}` : '');
  return `${kind}${where}${s ? ` — ${s}` : ''}`;
}

// §0.39.368 AL1 — a task's start and end, and every phase-run row, are rows of the compartment's durable activity log
function _log(r) { try { require('./activity-log/compartment.js').record(r); } catch (_) { /* the log never stops the work */ } }

function step(t, text, bad = false) {
  if (!t) return null;
  t.steps.push({ ts: Date.now(), text: String(text).slice(0, 300), bad: !!bad });
  if (t.steps.length > MAX_STEPS) t.steps.splice(0, t.steps.length - MAX_STEPS);
  t.updatedAt = Date.now();
  return t;
}

/** note(task, text, bad) — a step on a running task, sent at once (a setup's provision lines, a run's progress) */
function note(t, text, bad = false) { if (!t || t.status !== 'running') return t; step(t, text, bad); _emit(t); return t; }

/** begin({ repoUuid, hat, session, message, provider, model }) -> task — an agent wearing the hat starts something */
function begin({ repoUuid, hat = null, session = null, message = '', provider = null, model = null, kind: given = null } = {}) {
  if (!repoUuid) return null;
  _seed(repoUuid);
  const kind = given || kindOf(session);   // §0.39.370 — a caller that is not an agent call names its kind ('run')
  const runId = runOf(session);
  const outer = _als.getStore();
  const t = _add({ id: `task-${crypto.randomUUID().slice(0, 12)}`, repoUuid, hat, kind, title: _title(kind, message, session), status: 'running',
    provider: provider || null, model: model || null, session: session || null, runId,
    parent: outer && outer.repoUuid === repoUuid ? outer.id : (runId && _byId.has(runId) ? runId : null),
    promptChars: String(message || '').length, startedAt: Date.now(), updatedAt: Date.now(), endedAt: null, ms: null, steps: [], result: null });
  step(t, `started${t.provider ? ` on ${t.provider}` : ''}${t.model ? ` (${t.model})` : ''} · ${t.promptChars} chars sent`);
  _log({ compartment: repoUuid, kind: `task.${kind}`, status: 'running', actor: t.provider, hat, ref: t.id, title: `${t.title} — started`, ts: t.startedAt });
  _emit(t);
  return t;
}

/** end(task, out) — out is repo-agent's answer: { ok, error, text, provider(Used), injects, toolCalls, elapsedMs } */
function end(t, out = {}) {
  if (!t || t.status !== 'running') return t;
  const o = out || {};
  t.status = o.ok ? 'done' : 'failed';
  t.endedAt = Date.now(); t.ms = t.endedAt - t.startedAt;
  t.provider = o.providerUsed || o.provider || t.provider;
  const files = o.injects && Array.isArray(o.injects.injects) ? o.injects.injects.map(i => i.path || i.file).filter(Boolean) : [];
  const tools = Array.isArray(o.toolCalls) ? o.toolCalls.map(c => ({ name: String(c && c.name || '').replace(/^idearium\.|\.tool$/g, ''), ok: !(c && (c.ok === false || c.error)) })) : [];
  t.result = { chars: o.text ? String(o.text).length : 0, files, tools: tools.slice(0, 40), error: o.ok ? null : String(o.error || 'failed').slice(0, 400) };
  step(t, o.ok ? `done in ${Math.round(t.ms / 1000)}s · ${t.result.chars} chars${files.length ? ` · ${files.length} file(s): ${files.slice(0, 4).join(', ')}` : ''}${tools.length ? ` · ${tools.length} tool call(s)` : ''}`
    : `failed after ${Math.round(t.ms / 1000)}s — ${t.result.error}`, !o.ok);
  _log({ compartment: t.repoUuid, kind: `task.${t.kind}`, status: o.ok ? 'ok' : 'failed', actor: t.provider, hat: t.hat, ref: t.id, ms: t.ms, ts: t.endedAt,
    title: `${t.title} — ${t.steps[t.steps.length - 1].text}`, detail: { session: t.session, runId: t.runId, files: t.result.files, tools: t.result.tools, chars: t.result.chars, error: t.result.error } });
  _emit(t);
  return t;
}

/** run(meta, fn) — fn inside a task: a call fn makes to begin() is this task's child (a fallback hop, a nested call) */
async function run(meta, fn) {
  const t = begin(meta);
  if (!t) return fn();
  try { const out = await _als.run(t, fn); end(t, out); return out; }
  catch (e) { end(t, { ok: false, error: e.message }); throw e; }
}

function _running(repoUuid) { return _list(repoUuid).filter(t => t.status === 'running' && t.kind !== 'phase'); }
// a feed or tool event's session can carry a prefix ("repo-agent-<uuid>-phrun-…"): it belongs to the task whose session it ends with
function _pick(repoUuid, session) {
  const run = _running(repoUuid);
  const s = String(session || '');
  return (s && run.filter(x => x.session && (s === x.session || s.endsWith(`-${x.session}`))).pop()) || run[run.length - 1] || null;
}

/**
 * feed(p) — a live feed event (idearium.repo.agent.feed: a guardian tab or an Ollama model) onto the running agent task
 * of that compartment it belongs to (its session, else the newest running one). Chunks are counted, not each a step.
 */
function feed(p = {}) {
  if (!p.repoUuid) return null;
  const t = _pick(p.repoUuid, p.session);
  if (!t) return null;
  if (p.provider && !t.provider) t.provider = p.provider;
  if (p.jobId) t.jobId = p.jobId;
  t.live = { generating: p.generating != null ? !!p.generating : (t.live && t.live.generating) || false, chars: p.fullLen || p.chars || (t.live && t.live.chars) || 0, gate: p.event === 'gate' ? `${p.label || p.gate || ''} ${p.state || ''}`.trim() : (t.live && t.live.gate) || null };
  if (p.event === 'chunk' || (p.event === 'progress' && p.stage === 'dom')) { t.updatedAt = Date.now(); _emit(t); return t; }
  const text = p.event === 'gate' ? `gate ${p.label || p.gate} · ${p.state}${p.detail ? ` — ${p.detail}` : ''}` : `${p.event}${p.stage ? `:${p.stage}` : ''}${p.error ? ` — ${p.error}` : p.reason ? ` — ${p.reason}` : ''}`;
  step(t, text, p.event === 'error' || p.event === 'timeout' || (p.event === 'gate' && p.state === 'failed'));
  _emit(t);
  return t;
}

/** tool(repoUuid, ev) — a tool call the agent made (copilot's tool loop: POST /api/repos/:uuid/agent/tool/event); its end is
 *  a step (ok or failed), its start only marks the task as moving */
function tool(repoUuid, ev = {}) {
  const t = _pick(repoUuid, ev.session);
  if (!t) return null;
  const name = String(ev.name || ev.tool || 'tool').replace(/^idearium\.|\.tool$/g, '');
  if (ev.state === 'running') { t.updatedAt = Date.now(); t.live = { ...(t.live || {}), tool: name }; _emit(t); return t; }
  const failed = ev.state === 'failed' || ev.ok === false || !!ev.error;
  const args = typeof ev.args === 'string' ? ev.args : ev.args && ev.args.path ? ev.args.path : '';
  if (t.live) t.live.tool = null;
  step(t, `tool ${name}${args ? ` ${String(args).slice(0, 80)}` : ''}${failed ? ` ✗${ev.error ? ` ${String(ev.error).slice(0, 120)}` : ''}` : ' ✓'}`, failed);
  _emit(t);
  return t;
}

// a phase run's states: which end it, and how each reads as a step
const _PHASE_END = new Set(['proven', 'unproven', 'no-proof', 'refused']);
/**
 * phaseRow(row) — an idearium_phase_runs row onto its phase-build task (created by its first row). The run ends at its
 * proof, a stopped chunk, an exhausted ladder or a failure of the run itself; every row is a step.
 */
function phaseRow(row = {}) {
  const repoUuid = row.repoUuid || row.targetRepo || null;
  const runId = row.buildRunId || String(row.runId || '').replace(/-proof$/, '') || null;
  if (!repoUuid || !runId) return null;
  _seed(repoUuid);
  let t = _byId.get(runId);
  if (!t) {
    t = _add({ id: runId, repoUuid, hat: null, kind: 'phase', title: `phase ${row.phase || '?'}${row.map ? ` · ${row.map}` : ''}`, status: 'running', provider: null, model: null,
      session: null, runId, parent: null, startedAt: row.ts || Date.now(), updatedAt: Date.now(), endedAt: null, ms: null, steps: [], result: null });
    for (const c of _list(repoUuid)) if (c.runId === runId && c.id !== runId && !c.parent) c.parent = runId;
  }
  const st = row.state || '?';
  const who = row.provider ? ` · ${row.provider}` : '';
  const where = row.chunk ? ` · file ${row.chunk}/${row.chunks}${row.file ? ` ${row.file}` : ''}` : '';
  const err = row.error ? ` — ${String(row.error).slice(0, 200)}` : '';
  step(t, `${st}${who}${where}${st === 'escalating' && row.to ? ` → ${row.to}` : ''}${err}`, ['failed', 'blocked', 'incomplete', 'unproven', 'refused', 'skipped'].includes(st));
  if (row.provider) t.provider = row.provider;
  _log({ compartment: repoUuid, kind: `phase.${st}`, status: ['failed', 'blocked', 'incomplete', 'unproven', 'refused'].includes(st) ? 'failed' : st === 'skipped' ? 'skipped' : 'ok',
    actor: row.provider || null, ref: runId, ts: row.ts || Date.now(), title: `${t.title} · ${t.steps[t.steps.length - 1].text}`,
    detail: { rung: row.rung || null, rungs: row.rungs || null, attempt: row.attempt || null, chunk: row.chunk || null, file: row.file || null, uuid: row.uuid || null } });
  // a failed or blocked attempt on a ladder (it has a rung) is followed by the next one; with no ladder, or the ladder
  // spent, nothing follows it — the run is over (a blocked reply is never proven)
  const over = _PHASE_END.has(st) || row.chunkStopped || row.ladderExhausted || (['failed', 'blocked'].includes(st) && !row.rung);
  if (over && t.status === 'running') {
    t.status = st === 'proven' ? 'done' : 'failed';
    t.endedAt = row.ts || Date.now(); t.ms = t.endedAt - t.startedAt;
    t.result = { chars: 0, files: [], tools: [], error: st === 'proven' ? null : (row.error ? String(row.error).slice(0, 400) : st) };
  }
  _emit(t);
  return t;
}

/** _seed(repoUuid) — once per process: the compartment's finished exchanges from repo_agent_log, so a restart keeps history */
let _historyOf = null;
function setHistorySource(fn) { _historyOf = typeof fn === 'function' ? fn : null; }
function _seed(repoUuid) {
  if (_seeded.has(repoUuid)) return;
  _seeded.add(repoUuid);
  if (!_historyOf) return;
  let rows = [];
  try { rows = _historyOf(repoUuid) || []; } catch (_) { rows = []; }
  const l = _list(repoUuid);
  for (const r of rows.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0)).slice(-60)) {
    const ms = Number(r.elapsedMs) || 0;
    const t = { id: `log-${r.uuid}`, repoUuid, hat: r.hatName || null, kind: 'chat', title: _title('chat', r.message || '', null), status: r.ok ? 'done' : 'failed',
      provider: r.backend || null, model: null, session: null, runId: null, parent: null, promptChars: r.promptChars || null,
      startedAt: (r.ts || 0) - ms, updatedAt: r.ts || 0, endedAt: r.ts || 0, ms, fromLog: true,
      steps: [{ ts: r.ts || 0, text: r.ok ? `done in ${Math.round(ms / 1000)}s · ${String(r.response || '').length} chars${(r.injects || []).length ? ` · ${(r.injects || []).length} file(s)` : ''}` : `failed — ${String(r.error || '').slice(0, 200)}`, bad: !r.ok }],
      result: { chars: String(r.response || '').length, files: (r.injects || []).map(i => i.path).filter(Boolean), tools: [], error: r.ok ? null : r.error || null } };
    l.unshift(t); _byId.set(t.id, t);
  }
}

function view(t, now = Date.now()) {
  const stale = t.status === 'running' && now - (t.updatedAt || t.startedAt) > STALE_MS;
  return { ...t, status: stale ? 'stale' : t.status, elapsedMs: t.ms != null ? t.ms : now - t.startedAt, steps: t.steps.slice() };
}

/** list(repoUuid, { limit }) -> { running, tasks } — newest first; a phase build's attempts are under it (children) */
function list(repoUuid, { limit = 80 } = {}) {
  if (!repoUuid) return { running: 0, tasks: [] };
  _seed(repoUuid);
  const now = Date.now();
  const all = _list(repoUuid).map(t => view(t, now));
  const kids = new Map();
  for (const t of all) if (t.parent) { if (!kids.has(t.parent)) kids.set(t.parent, []); kids.get(t.parent).push(t); }
  const top = all.filter(t => !t.parent || !all.some(p => p.id === t.parent))
    .sort((a, b) => (b.status === 'running') - (a.status === 'running') || (b.startedAt || 0) - (a.startedAt || 0)).slice(0, limit)
    .map(t => ({ ...t, children: (kids.get(t.id) || []).sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0)) }));
  return { running: all.filter(t => t.status === 'running').length, tasks: top };
}

function get(id) { const t = _byId.get(id); return t ? view(t) : null; }
function _reset() { _tasks.clear(); _byId.clear(); _seeded.clear(); _onChange = null; _historyOf = null; }

module.exports = { MODULE_ID: 'nexus.lib.repo-activity', VERSION: '1.1.0', MAX_PER_REPO, MAX_STEPS, STALE_MS, kindOf, runOf, begin, end, run, step, note, feed, tool, phaseRow, list, get, onChange, setHistorySource, _reset };
