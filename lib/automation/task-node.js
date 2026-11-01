'use strict';
/**
 * lib/automation/task-node.js — the .task node: one unit of work Nexus can run now or on a schedule, against any system. OC1, 0.60.348.
 * comp_id: nexus.lib.automation.task-node
 * Spec: docs/orchestration-console.spec MOD-OC-TASK-NODE · Map: docs/2026-11-01-orchestration-console-phasemap.spec OC1 · Schema: lib/node-schemas/schema.task
 *
 * James, 2026-11-01: "rebuild brianos/orchastration ui with enterprise grade code. include anything from idearium, and clearglass, and cos, deploy
 * them to any system, all the agent tools which uses the index, scheduler with a calender with persistent data, .task nodes. .pipeline nodes"
 *
 * The file is the record (OC-001): a task made by the console, the CLI or an agent is a .task file first; tables and memory are caches.
 * Same envelope as the .pipeline/.macro nodes (lib/automation-nodes.js). Every save is a Versionium record (§17.12).
 *
 *   taskNode(task)                    → text   the node (YAML envelope, type task)
 *   parseTask(text)                   → TaskNode (throws on a node of another type)
 *   validateTask(task, { stepTypes }) → { ok, problems }   every problem listed, never the first only
 *   saveTask(task, { dir, by })       → { ok, file } | { ok:false, problems }   one file per task: <dir>/<id>.task
 *   loadTask(id, { dir }) · listTasks({ dir }) → TaskNode[] · archiveTask(id, { dir, by }) (moved under _archive/, never deleted, §0.3)
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const MODULE_ID = 'nexus.lib.automation.task-node';
const VERSION = '1.0.0';
const ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
// what a task can do: the engine's own step kinds, plus three the orchestration console adds (OC4 system-op, OC5 tool, Idearium's build-phase)
const ENGINE_KINDS = ['macro', 'workflow', 'pipeline', 'agent', 'command'];
const KINDS = Object.freeze([...ENGINE_KINDS, 'tool', 'system-op', 'build-phase']);
const CONCURRENCY = Object.freeze(['allow', 'skip-if-running', 'queue']);
const CATCHUP = Object.freeze(['skip', 'once', 'all']);
const BY_RE = /^(person|rule:[\w.-]+|agent:[\w.-]+)$/;
const DEFAULT_TZ = 'America/Los_Angeles';   // his zone (Portland), the default when a schedule names none

function _defaults(t) {
  return { title: t.id, target: { system: null }, schedule: null, gate: null, retries: { max: 0, backoff: { baseMs: 1000, factor: 2, capMs: 60000 } },
    timeoutMs: 600000, concurrency: 'skip-if-running', priority: 5, tags: [], ...t };
}

/** validateTask(task, { stepTypes }) → { ok, problems } — every problem, by field */
function validateTask(task, { stepTypes = null } = {}) {
  const p = [];
  const t = task || {};
  if (!ID_RE.test(String(t.id || ''))) p.push('id: lowercase letters, digits, . _ - (1–64), starting with a letter or digit');
  if (!t.do || typeof t.do !== 'object') p.push('do: { kind, ref, args } is required');
  else {
    if (!KINDS.includes(t.do.kind)) p.push(`do.kind "${t.do.kind}" is not one of ${KINDS.join(', ')}`);
    else if (stepTypes && ENGINE_KINDS.includes(t.do.kind) && !stepTypes.includes(t.do.kind)) p.push(`do.kind "${t.do.kind}" is not a step this engine knows (${stepTypes.join(', ')})`);
    if (!t.do.ref || typeof t.do.ref !== 'string') p.push('do.ref: what it runs (a macro, workflow or pipeline name, an agent hat, a command, a tool id, a system op, a phase)');
    if (t.do.args != null && (typeof t.do.args !== 'object' || Array.isArray(t.do.args))) p.push('do.args is an object');
  }
  if (!BY_RE.test(String(t.by || ''))) p.push('by: person | rule:<id> | agent:<hat> — whose task it is (OC-002)');
  if (t.target != null && (typeof t.target !== 'object' || (t.target.system != null && typeof t.target.system !== 'string'))) p.push('target: { system, compartment? }');
  if (t.concurrency != null && !CONCURRENCY.includes(t.concurrency)) p.push(`concurrency: ${CONCURRENCY.join(' | ')}`);
  if (t.priority != null && !(Number.isInteger(t.priority) && t.priority >= 0 && t.priority <= 9)) p.push('priority: an integer 0–9');
  if (t.timeoutMs != null && !(Number.isFinite(t.timeoutMs) && t.timeoutMs >= 1000 && t.timeoutMs <= 86400000)) p.push('timeoutMs: 1000 to 86400000');
  if (t.retries != null) {
    const r = t.retries; if (typeof r !== 'object' || !(Number.isInteger(r.max) && r.max >= 0 && r.max <= 10)) p.push('retries.max: an integer 0–10');
  }
  const s = t.schedule;
  if (s != null) {
    const set = ['cron', 'at', 'every'].filter(k => s[k] != null);
    if (set.length !== 1) p.push('schedule: exactly one of cron, at, every');
    if (s.cron != null) { try { require('./cron.js').parse(String(s.cron)); } catch (e) { p.push(`schedule.cron: ${e.message}`); } }
    if (s.at != null && !Number.isFinite(s.at)) p.push('schedule.at: epoch ms');
    if (s.every != null && !(Number.isFinite(s.every) && s.every >= 60000)) p.push('schedule.every: at least 60000 ms');
    if (s.catchUp != null && !CATCHUP.includes(s.catchUp)) p.push(`schedule.catchUp: ${CATCHUP.join(' | ')}`);
    if (s.tz != null) { try { new Intl.DateTimeFormat('en-US', { timeZone: s.tz }); } catch (_) { p.push(`schedule.tz "${s.tz}" is not an IANA zone`); } }
  }
  return { ok: !p.length, problems: p };
}

/** taskNode(task) → the node's text (the same envelope as .pipeline nodes) */
function taskNode(task) {
  const t = _defaults(task);
  if (t.schedule) t.schedule = { tz: DEFAULT_TZ, catchUp: 'once', paused: false, ...t.schedule };
  const doc = { envelope: 1, uuid: `nexus-task-${t.id}`, type: 'task', id: t.id, context: 'a unit of work Nexus runs now or on a schedule (OC1)',
    intent: t.title, summary: `${t.do.kind} ${t.do.ref}${t.target && t.target.system ? ` on ${t.target.system}` : ''}${t.schedule ? ` · ${t.schedule.cron || (t.schedule.every ? `every ${t.schedule.every} ms` : `at ${new Date(t.schedule.at).toISOString()}`)}` : ''}`,
    system: (t.target && t.target.system) || null, tags: t.tags || [], payload: { ...t, createdAt: t.createdAt || Date.now() } };
  return yaml.dump(doc, { lineWidth: 140, noRefs: true });
}

/** parseTask(text) → TaskNode */
function parseTask(text) {
  const d = yaml.load(String(text));
  if (!d || d.type !== 'task' || !d.payload) throw new Error(`not a .task node (type ${d && d.type})`);
  return d.payload;
}

const _file = (dir, id) => path.join(dir, `${id}.task`);

/** saveTask(task, { dir, by, stepTypes }) → { ok, file, changed } — validated, written, recorded in Versionium (buffered while it is down) */
function saveTask(task, { dir, by = null, stepTypes = null } = {}) {
  if (!dir) throw new Error('saveTask needs dir (the owning system\'s data/nodes/task)');
  const v = validateTask(task, { stepTypes });
  if (!v.ok) return { ok: false, problems: v.problems };
  fs.mkdirSync(dir, { recursive: true });
  const fp = _file(dir, task.id);
  const before = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : null;
  const prev = before ? parseTask(before) : null;
  const text = taskNode({ ...task, createdAt: (prev && prev.createdAt) || task.createdAt });
  fs.writeFileSync(fp, text, 'utf8');
  try {
    const VR = require('../versionium-record.js');
    VR.record({ kind: 'orchestration.task.' + (before ? 'changed' : 'created'), system: 'cos', by: by || task.by, message: `task ${task.id} ${before ? 'changed' : 'created'}: ${task.do.kind} ${task.do.ref}`,
      change: [{ path: path.basename(fp), op: before ? 'modify' : 'add', beforeText: before, afterText: text }] }).catch(() => {});
  } catch (_) {}
  return { ok: true, file: fp, changed: !!before };
}

function loadTask(id, { dir }) { const fp = _file(dir, id); return fs.existsSync(fp) ? parseTask(fs.readFileSync(fp, 'utf8')) : null; }

/** listTasks({ dir }) → TaskNode[] — a file that does not parse is listed in bad, never dropped silently (§1.2) */
function listTasks({ dir }) {
  const out = [], bad = [];
  if (!dir || !fs.existsSync(dir)) return Object.assign(out, { bad });
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.task')).sort()) {
    try { out.push(parseTask(fs.readFileSync(path.join(dir, f), 'utf8'))); } catch (e) { bad.push({ file: f, why: e.message }); }
  }
  return Object.assign(out, { bad });
}

/** archiveTask(id, { dir, by }) — moved under <dir>/_archive/<date>/, never deleted (§0.3) */
function archiveTask(id, { dir, by = null }) {
  const fp = _file(dir, id); if (!fs.existsSync(fp)) return { ok: false, why: `no task ${id}` };
  const to = path.join(dir, '_archive', new Date().toISOString().slice(0, 10)); fs.mkdirSync(to, { recursive: true });
  const dest = path.join(to, path.basename(fp)); fs.renameSync(fp, dest);
  try { require('../versionium-record.js').record({ kind: 'orchestration.task.archived', system: 'cos', by, message: `task ${id} archived`, change: [{ path: path.basename(fp), op: 'archive' }] }).catch(() => {}); } catch (_) {}
  return { ok: true, file: dest };
}

module.exports = { taskNode, parseTask, validateTask, saveTask, loadTask, listTasks, archiveTask, KINDS, ENGINE_KINDS, CONCURRENCY, CATCHUP, DEFAULT_TZ, MODULE_ID, VERSION };
