'use strict';
/**
 * clear-glass/src/mesh/automation-engine.js — real workflow scheduler.
 * docs/2026-09-11-brainos-external-concept-mapping.spec named this the
 * ONE genuine gap: NEXUS had real dependency graphs (RAID) and real
 * retry state machines (lib/seam/queue.js, agent-mesh's drainer) but no
 * real trigger/schedule-driven multi-step workflow engine anywhere.
 *
 * Every step calls a REAL, already-existing function — no second
 * dispatch path (§10.3): 'agent' steps go through the exact same
 * this.enqueue() the drainer and route-graph already use; browser steps go
 * through the Clear Glass driver (the browserFn hook the main process sets).
 *
 * §0.39.265 — v2. James: "expand the workflow, and macros, as much as you can
 * … tasker, automate, etc. as much as i can automate on a browser, with
 * scheduling, dom tools, full enterprise grade." What that added, all
 * backward compatible with every saved v1 workflow:
 *
 *   Data flow   every step's output is kept: {{last}}, {{steps.<label or id>.output}},
 *               {{vars.x}}, {{item}}/{{index}} in loops, {{trigger.url}}, {{memory.x}}
 *               (kept between runs). Every text field is a template (automation/template.js).
 *   Steps       browser (any driver action, on the workflow's own hidden page or an open
 *               window), extract (text, lists, attributes, records, tables, links, the page),
 *               wait_until, set, loop (for each / N times, only-new items), http (any URL),
 *               file (text / JSON / CSV into the output folder), workflow (a sub-workflow),
 *               log, emit, stop, fail — plus v1's agent (now optionally awaited), macro,
 *               delay, condition (now with contains/matches/in/empty/changed …), command, notify.
 *               The catalogue is automation/steps.js.
 *   Per step    saveAs, retry { count, delayMs, backoff }, timeoutMs, onError (fail /
 *               continue / stop / go to a step).
 *   Triggers    several per workflow: every N, daily at, cron (automation/cron.js), events
 *               (page visited, download finished, app start, another workflow finished or
 *               failed, custom events), and webhooks (POST /automation/hook/<id> with a token).
 *   Runs        concurrency (skip / queue / parallel), cancel, a step limit, a run time limit,
 *               a per-run record (every step's status, time, output and the run log) kept on
 *               disk as JSON lines, capped per workflow.
 *   Portability export / import, validate.
 */
const fs = require('fs');
const path = require('path');
const { randomUUID, randomBytes, timingSafeEqual } = require('crypto');
const T = require('../automation/template.js');
const CRON = require('../automation/cron.js');
const DOM = require('../automation/dom.js');
const STEPS = require('../automation/steps.js');

// §0.39.265 — under the shared data root (NEXUS_DATA_ROOT, like every other
// store), so a test process — lib/test-sandbox.js points that root at a temp
// folder — never reads or deletes the real saved workflows. Was hard-coded to
// <repo>/data, and tests/modules/automation-engine.test.js rm -rf's this dir.
require('../../../lib/test-sandbox.js').ensure();
const DATA_ROOT = process.env.NEXUS_DATA_ROOT || path.join(__dirname, '..', '..', '..', 'data');
const WORKFLOWS_DIR = path.join(DATA_ROOT, 'brainos', 'workflows');
const RUNS_DIR = path.join(DATA_ROOT, 'brainos', 'automation-runs');
const OUTPUT_DIR = path.join(DATA_ROOT, 'brainos', 'automation-output');
const TICK_MS = 5000;
const RUNS_KEPT = 200;
const MAX_DEPTH = 5;
const DEFAULTS = { concurrency: 'skip', maxSteps: 5000, timeoutMs: 3600000 };
const STEP_META = ['saveAs', 'retry', 'timeoutMs', 'onError', 'note'];
// step types whose config the step renders itself (piece by piece), not all at once up front
const RAW_CONFIG = new Set(['set', 'loop', 'wait_until']);

// §BUILT — real, already-established ports (guardian.spec, ollama/server.js,
// copilot/server.js, clear-glass's own real convention) — reused verbatim,
// not re-derived, for the 'command' step type below.
// §0.39.265 — 'clear-glass' is the name the Settings page offers (and every
// other part of NEXUS uses); only 'clearglass' was listed, so every command
// step aimed at Clear Glass failed with "unknown system". Both work now.
const SYSTEM_PORTS = { guardian: 7820, ollama: 3749, copilot: 3750, clearglass: 7704, 'clear-glass': 7704 };

/**
 * nextScheduled(cfg, from) — when a trigger next fires.
 *   { intervalMs }                       every N ms
 *   { at: 'HH:MM', days: [0..6] }        daily at a local time, on those weekdays (all when empty)
 *   { cron: '0 9 * * 1-5' }              a cron expression
 * Returns a timestamp, or null for a trigger with no schedule (manual, event, webhook).
 */
function nextScheduled(cfg = {}, from = Date.now()) {
  if (cfg.cron) { try { return CRON.next(cfg.cron, from); } catch (_) { return null; } }
  if (cfg.at && /^\d{1,2}:\d{2}$/.test(cfg.at)) {
    const [hh, mm] = cfg.at.split(':').map(n => parseInt(n, 10));
    const days = Array.isArray(cfg.days) && cfg.days.length ? cfg.days.map(Number) : [0, 1, 2, 3, 4, 5, 6];
    const d = new Date(from);
    d.setHours(hh, mm, 0, 0);
    for (let i = 0; i < 8; i++) {
      if (d.getTime() > from && days.includes(d.getDay())) return d.getTime();
      d.setDate(d.getDate() + 1); d.setHours(hh, mm, 0, 0);
    }
    return null;
  }
  const iv = parseInt(cfg.intervalMs, 10);
  return iv > 0 ? from + iv : null;
}

function _loadAll() {
  const out = [];
  try {
    if (!fs.existsSync(WORKFLOWS_DIR)) return out;
    for (const f of fs.readdirSync(WORKFLOWS_DIR)) {
      if (!f.endsWith('.workflow.json')) continue;
      try { out.push(JSON.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, f), 'utf8'))); }
      catch (e) { console.warn(`[automation-engine] skipping unreadable ${f} (non-fatal): ${e.message}`); }
    }
  } catch (e) {
    console.warn(`[automation-engine] _loadAll failed (non-fatal, starting empty): ${e.message}`);
  }
  return out;
}

// ── small helpers ─────────────────────────────────────────────────────────
const _token = () => randomBytes(18).toString('base64url');
const _slug = (s) => String(s || 'workflow').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'workflow';
const _isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !Object.keys(v).length);
function _preview(v, max = 4000) {
  if (v === undefined) return undefined;
  let s;
  try { s = typeof v === 'string' ? v : JSON.stringify(v); } catch (_) { s = String(v); }
  if (s === undefined) return undefined;
  if (s.length <= max) return typeof v === 'string' ? v : (() => { try { return JSON.parse(s); } catch (_) { return s; } })();
  return `${s.slice(0, max)}… (${s.length} characters)`;
}
function _glob(pattern, value) {
  const p = String(pattern || '').trim();
  if (!p || p === '*') return true;
  const v = String(value || '');
  if (!p.includes('*')) return v.toLowerCase().includes(p.toLowerCase());
  const re = new RegExp('^' + p.split('*').map(x => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i');
  return re.test(v);
}
function _safeEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
function _csvCell(v) {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function _csvHeader(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}
/** turn a text list ("a\nb", '["a","b"]', "a, b") or anything else into an array */
function _asList(v) {
  if (Array.isArray(v)) return v;
  if (v == null || v === '') return [];
  if (typeof v === 'number') return Array.from({ length: Math.max(0, Math.floor(v)) }, (_, i) => i + 1);
  if (typeof v === 'object') return Object.entries(v).map(([key, value]) => ({ key, value }));
  const s = String(v).trim();
  if (s.startsWith('[')) { try { const a = JSON.parse(s); if (Array.isArray(a)) return a; } catch (_) { /* fall through */ } }
  return s.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
}
/** a kv field: {a:1} as is; "a = 1\nb = 2" / "a=1" lines to an object */
function _kv(v) {
  if (!v) return {};
  if (typeof v === 'object' && !Array.isArray(v)) return v;
  if (Array.isArray(v)) return Object.fromEntries(v.filter(x => x && x.name).map(x => [x.name, x.value]));
  const out = {};
  for (const line of String(v).split(/\r?\n/)) {
    const i = line.search(/[=:]/);
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

class Cancelled extends Error { constructor(why) { super(why || 'cancelled'); this.cancelled = true; } }

class AutomationEngine {
  constructor({ enqueueFn, busEmit, meshViewFn, statsFn, runMacroFn, notifyFn, browserFn, askAgentFn } = {}) {
    // §0.39.265 — hooks for the step types that need Clear Glass's main process
    // (macros, notifications, the browser, awaited agent replies); the owner
    // sets them later (setHooks), since those live outside the mesh.
    this._stats = typeof statsFn === 'function' ? statsFn : () => ({});
    this._runMacro = typeof runMacroFn === 'function' ? runMacroFn : null;
    this._notify = typeof notifyFn === 'function' ? notifyFn : null;
    this._browser = typeof browserFn === 'function' ? browserFn : null;
    this._askAgent = typeof askAgentFn === 'function' ? askAgentFn : null;
    this._enqueue = typeof enqueueFn === 'function' ? enqueueFn : () => {};
    this._busEmit = typeof busEmit === 'function' ? busEmit : () => {};
    // §BUILT — meshViewFn gives 'condition' steps real, live data to evaluate
    // against (the exact same mesh.listMeshView() the canvas and floating
    // panel's Agents tab already read) — not a second, separate state snapshot.
    this._meshView = typeof meshViewFn === 'function' ? meshViewFn : () => [];
    this._workflows = _loadAll();
    this._workflows.forEach(w => this._normalize(w));
    this._log = []; // the recent-activity feed, in memory and capped; each run's full record is on disk (RUNS_DIR)
    this._tickTimer = null;
    this._active = new Map();    // runId → live run record
    this._queues = new Map();    // workflowId → promise chain (concurrency: queue)
    this._cooldown = new Map();  // `${wfId}:${stepId}` → last event fire
  }

  start() {
    if (this._tickTimer) return;
    this._tickTimer = setInterval(() => this.tick(), TICK_MS);
    // §BUILT-FIX — unref() so this background poller never keeps the
    // process alive on its own — a test or a clean shutdown that constructs
    // an AgentMesh should exit normally, not hang on this interval forever.
    if (typeof this._tickTimer.unref === 'function') this._tickTimer.unref();
  }
  stop() {
    if (this._tickTimer) { clearInterval(this._tickTimer); this._tickTimer = null; }
  }

  setHooks({ statsFn, runMacroFn, notifyFn, browserFn, askAgentFn } = {}) {
    if (typeof statsFn === 'function') this._stats = statsFn;
    if (typeof runMacroFn === 'function') this._runMacro = runMacroFn;
    if (typeof notifyFn === 'function') this._notify = notifyFn;
    if (typeof browserFn === 'function') this._browser = browserFn;
    if (typeof askAgentFn === 'function') this._askAgent = askAgentFn;
  }

  _triggers(wf) { return (wf.steps || []).filter(s => s.type === 'trigger' && s.enabled !== false); }

  /** nextRunAt(wf) — when an active workflow's schedule fires next (null: no schedule / off). */
  nextRunAt(wf) {
    if (!wf || wf.status !== 'active') return null;
    const now = Date.now();
    const times = this._triggers(wf).map(t => (wf._nextRuns && wf._nextRuns[t.id]) || nextScheduled(t.config || {}, now)).filter(Boolean);
    return times.length ? Math.min(...times) : null;
  }

  list() { return this._workflows.slice(); }
  get(id) { return this._workflows.find(w => w.id === id) || null; }
  find(idOrName) { return this.get(idOrName) || this._workflows.find(w => String(w.name).toLowerCase() === String(idOrName || '').toLowerCase()) || null; }

  _persist(wf) {
    try {
      fs.mkdirSync(WORKFLOWS_DIR, { recursive: true });
      const clean = Object.fromEntries(Object.entries(wf).filter(([k]) => !k.startsWith('_')));   // _nextRuns etc. are runtime only
      fs.writeFileSync(path.join(WORKFLOWS_DIR, `${wf.id}.workflow.json`), JSON.stringify(clean, null, 2), 'utf8');
    } catch (e) {
      console.warn(`[automation-engine] failed to persist ${wf.id} (non-fatal): ${e.message}`);
    }
  }

  /** every webhook trigger has a token; memory exists */
  _normalize(wf) {
    for (const s of wf.steps || []) {
      if (s.type === 'trigger' && s.config && s.config.webhook && !s.config.token) s.config.token = _token();
    }
    if (!wf.memory || typeof wf.memory !== 'object') wf.memory = { vars: {}, seen: {}, last: {} };
    for (const k of ['vars', 'seen', 'last']) if (!wf.memory[k] || typeof wf.memory[k] !== 'object') wf.memory[k] = {};
    return wf;
  }

  _copyStep(st, id) {
    const s = { id, type: st.type, config: { ...(st.config || {}) } };
    if (st.enabled === false) s.enabled = false;
    if (st.label) s.label = st.label;
    for (const k of STEP_META) if (st[k] !== undefined && st[k] !== '' && st[k] !== null) s[k] = st[k];
    return s;
  }

  create({ name, status, steps, description, vars, settings }) {
    const wf = {
      id: randomUUID(), name: name || 'Untitled Workflow', status: status || 'draft', description: description || '',
      // §0.39.265 — every step gets its own id here: a template or a duplicate
      // hands in steps with none, or with another workflow's. Condition
      // branches (and onError jumps) that named a step by its old id are pointed at the new one.
      steps: [], lastRun: null, runCount: 0, createdAt: Date.now(),
    };
    if (vars && typeof vars === 'object') wf.vars = { ...vars };
    if (settings && typeof settings === 'object') wf.settings = { ...settings };
    const src = Array.isArray(steps) ? steps : [];
    const newIds = src.map(() => randomUUID());
    const idMap = new Map(src.map((st, i) => [st.id, newIds[i]]).filter(([old]) => old));   // only steps that HAD an id can be branched to
    wf.steps = src.map((st, i) => {
      const s = this._copyStep(st, newIds[i]);
      for (const k of ['onTrue', 'onFalse']) if (s.config[k] && idMap.has(s.config[k])) s.config[k] = idMap.get(s.config[k]);
      if (s.onError && idMap.has(s.onError)) s.onError = idMap.get(s.onError);
      if (s.type === 'trigger' && s.config.token) delete s.config.token;   // a copy never shares the original's webhook secret
      return s;
    });
    this._normalize(wf);
    this._workflows.push(wf);
    this._persist(wf);
    this._busEmit('automation.workflow.created', { id: wf.id, name: wf.name });
    return { ok: true, workflow: wf };
  }

  update(id, patch) {
    const wf = this.get(id);
    if (!wf) return { ok: false, error: 'no such workflow' };
    if (patch.name !== undefined) wf.name = patch.name;
    if (patch.description !== undefined) wf.description = patch.description;
    if (patch.status !== undefined) { wf.status = patch.status; delete wf._nextRuns; }
    if (patch.steps !== undefined) { wf.steps = patch.steps; delete wf._nextRuns; }
    if (patch.vars !== undefined) wf.vars = patch.vars && typeof patch.vars === 'object' ? { ...patch.vars } : {};
    if (patch.settings !== undefined) wf.settings = { ...(wf.settings || {}), ...(patch.settings || {}) };
    if (patch.resetMemory) wf.memory = null;
    this._normalize(wf);
    this._persist(wf);
    return { ok: true, workflow: wf };
  }

  remove(id) {
    const idx = this._workflows.findIndex(w => w.id === id);
    if (idx === -1) return { ok: false, error: 'no such workflow' };
    const [wf] = this._workflows.splice(idx, 1);
    try { fs.unlinkSync(path.join(WORKFLOWS_DIR, `${wf.id}.workflow.json`)); } catch (_) {}
    try { fs.unlinkSync(path.join(RUNS_DIR, `${wf.id}.jsonl`)); } catch (_) {}
    this._busEmit('automation.workflow.removed', { id: wf.id });
    return { ok: true };
  }

  getLog(limit = 50, workflowId = null) { return (workflowId ? this._log.filter(e => e.workflowId === workflowId) : this._log).slice(0, limit); }

  _logEntry(wf, msg, status, run = null) {
    const e = { ts: Date.now(), workflowId: wf.id, workflowName: wf.name, msg, status, ...(run ? { runId: run.id } : {}) };
    this._log.unshift(e);
    if (this._log.length > 300) this._log.pop();
    if (run && run.log.length < 1000) run.log.push({ ts: e.ts, msg, status });
    this._busEmit('automation.log', { workflowId: wf.id, runId: run ? run.id : null, msg, status, ts: e.ts });
  }

  // ── Triggers ────────────────────────────────────────────────────────────
  /** tick() — fires every active workflow's scheduled triggers that are due. Manual runs bypass this via run(). */
  tick() {
    const now = Date.now();
    for (const wf of this._workflows) {
      if (wf.status !== 'active') continue;
      for (const trigger of this._triggers(wf)) {
        const cfg = trigger.config || {};
        wf._nextRuns = wf._nextRuns || {};
        // first arm is not persisted (recomputed each boot)
        if (!wf._nextRuns[trigger.id]) wf._nextRuns[trigger.id] = nextScheduled(cfg, now);
        if (!wf._nextRuns[trigger.id]) continue;   // no schedule — manual, event or webhook
        if (now >= wf._nextRuns[trigger.id]) {
          wf._nextRuns[trigger.id] = nextScheduled(cfg, now);
          const reason = cfg.cron ? 'cron' : cfg.at ? 'schedule' : 'interval';
          this.run(wf.id, reason, { trigger: { kind: reason, at: now, triggerId: trigger.id } }).catch(() => {});
        }
      }
    }
  }

  /**
   * emitEvent(name, payload) — starts every active workflow with a trigger listening for `name`
   * whose `match` fits. Built-in names: page.visited, download.done, app.start,
   * workflow.finished, workflow.failed; anything else is a custom event. Returns how many started.
   */
  emitEvent(name, payload = {}, { chain = 0 } = {}) {
    if (!name || chain > MAX_DEPTH) return 0;
    const now = Date.now();
    let n = 0;
    for (const wf of this._workflows) {
      if (wf.status !== 'active') continue;
      if (/^workflow\./.test(name) && payload.workflowId === wf.id) continue;   // never re-triggers itself
      for (const t of this._triggers(wf)) {
        const cfg = t.config || {};
        if (cfg.event !== name) continue;
        const subject = payload.url || payload.file || payload.workflowName || payload.name || '';
        if (cfg.match && !_glob(cfg.match, subject)) continue;
        const key = `${wf.id}:${t.id}`;
        const cool = cfg.cooldownMs !== undefined ? parseInt(cfg.cooldownMs, 10) || 0 : name === 'page.visited' ? 30000 : 0;
        if (cool && now - (this._cooldown.get(key) || 0) < cool) continue;
        this._cooldown.set(key, now);
        n++;
        this.run(wf.id, `event:${name}`, { trigger: { event: name, ...payload }, chain: chain + 1 }).catch(() => {});
        break;   // one start per workflow per event
      }
    }
    return n;
  }

  /** fireWebhook(id, token, payload) — for POST /automation/hook/<id>. Checks the trigger's token. */
  async fireWebhook(id, token, payload = {}, { wait = false } = {}) {
    const wf = this.get(id);
    if (!wf) return { ok: false, status: 404, error: 'no such workflow' };
    const t = this._triggers(wf).find(s => s.config && s.config.webhook);
    if (!t || !_safeEqual(t.config.token, token)) return { ok: false, status: 403, error: 'this workflow has no webhook with that token' };
    if (wf.status !== 'active') return { ok: false, status: 409, error: 'the workflow is switched off' };
    const p = this.run(wf.id, 'webhook', { trigger: { via: 'webhook', ...payload } });
    if (!wait) { p.catch(() => {}); return { ok: true, accepted: true }; }
    const r = await p;
    return { ...r, status: r.ok ? 200 : r.skipped ? 409 : 500 };
  }

  // ── Runs ────────────────────────────────────────────────────────────────
  activeRuns(workflowId = null) {
    return [...this._active.values()].filter(r => !workflowId || r.workflowId === workflowId).map(r => this._runSummary(r));
  }
  _runSummary(r) {
    return { id: r.id, workflowId: r.workflowId, workflowName: r.workflowName, reason: r.reason, status: r.status, startedAt: r.startedAt, finishedAt: r.finishedAt || null, durationMs: (r.finishedAt || Date.now()) - r.startedAt, error: r.error || null, stepCount: r.steps.length, current: r.current || null };
  }

  cancel(runId) {
    const r = this._active.get(runId);
    if (!r) return { ok: false, error: 'that run is not running' };
    r.cancelled = 'cancelled by you';
    return { ok: true };
  }
  cancelAll(workflowId) {
    let n = 0;
    for (const r of this._active.values()) if (r.workflowId === workflowId) { r.cancelled = 'cancelled by you'; n++; }
    return { ok: true, cancelled: n };
  }

  /** listRuns(workflowId, limit) — newest first; running ones first of all */
  listRuns(workflowId, limit = 30) {
    const live = this.activeRuns(workflowId);
    const done = [];
    try {
      const lines = fs.readFileSync(path.join(RUNS_DIR, `${workflowId}.jsonl`), 'utf8').split('\n').filter(Boolean);
      for (let i = lines.length - 1; i >= 0 && done.length < limit; i--) {
        try { const r = JSON.parse(lines[i]); done.push(this._runSummary(r)); } catch (_) {}
      }
    } catch (_) { /* no runs yet */ }
    return [...live, ...done].slice(0, limit);
  }

  getRun(runId) {
    const live = this._active.get(runId);
    if (live) return { ...live, ctx: undefined };
    try {
      for (const f of fs.readdirSync(RUNS_DIR)) {
        if (!f.endsWith('.jsonl')) continue;
        const txt = fs.readFileSync(path.join(RUNS_DIR, f), 'utf8');
        if (!txt.includes(runId)) continue;
        for (const line of txt.split('\n')) if (line.includes(runId)) { try { const r = JSON.parse(line); if (r.id === runId) return r; } catch (_) {} }
      }
    } catch (_) {}
    return null;
  }

  _saveRun(run) {
    try {
      fs.mkdirSync(RUNS_DIR, { recursive: true });
      const fp = path.join(RUNS_DIR, `${run.workflowId}.jsonl`);
      const rec = { ...run }; delete rec.ctx; delete rec.cancelled;
      fs.appendFileSync(fp, JSON.stringify(rec) + '\n');
      const lines = fs.readFileSync(fp, 'utf8').split('\n').filter(Boolean);
      if (lines.length > RUNS_KEPT + 50) fs.writeFileSync(fp, lines.slice(-RUNS_KEPT).join('\n') + '\n');
    } catch (e) { console.warn(`[automation-engine] run record not saved (non-fatal): ${e.message}`); }
  }

  /**
   * run(id, reason, opts) — runs the workflow's steps in order.
   *   opts.vars     values for {{vars.x}} (over the workflow's own defaults)
   *   opts.trigger  what started it ({{trigger.*}})
   * Concurrency (settings.concurrency): 'skip' (default — a scheduled or event run is skipped while one
   * is going; Run now always runs), 'queue' (one after another), 'parallel'.
   * Resolves { ok, runId, status, error?, vars, output }.
   */
  async run(id, reason = 'manual', opts = {}) {
    const wf = this.get(id);
    if (!wf) return { ok: false, error: 'no such workflow' };
    const mode = (wf.settings && wf.settings.concurrency) || DEFAULTS.concurrency;
    const busy = [...this._active.values()].some(r => r.workflowId === wf.id && !r.depth);
    if (mode === 'queue' && !opts.depth) {
      const prev = this._queues.get(wf.id) || Promise.resolve();
      const p = prev.then(() => this._execute(wf, reason, opts));
      this._queues.set(wf.id, p.catch(() => {}));
      return p;
    }
    if (mode === 'skip' && busy && reason !== 'manual' && !opts.depth) {
      this._logEntry(wf, `– ${reason} run skipped: the previous run is still going`, 'skipped');
      return { ok: false, skipped: true, error: 'already running' };
    }
    return this._execute(wf, reason, opts);
  }

  async _execute(wf, reason, opts = {}) {
    const settings = { ...DEFAULTS, ...(wf.settings || {}) };
    const run = { id: randomUUID(), workflowId: wf.id, workflowName: wf.name, reason, depth: opts.depth || 0, startedAt: Date.now(), status: 'running', steps: [], log: [], trigger: _preview(opts.trigger || {}, 2000) };
    const ctx = {
      vars: { ...(wf.vars || {}), ...(opts.vars || {}) }, steps: {}, last: null, trigger: opts.trigger || {},
      run: { id: run.id, reason, startedAt: run.startedAt }, workflow: wf.name, workflowId: wf.id,
      memory: wf.memory.vars, item: null, index: null, loop: null, error: null,
    };
    const R = { wf, run, ctx, settings, count: 0, chain: opts.chain || 0, depth: opts.depth || 0 };
    this._active.set(run.id, run);
    let timer = null;
    if (settings.timeoutMs > 0) { timer = setTimeout(() => { run.cancelled = `the run went over its time limit (${Math.round(settings.timeoutMs / 1000)} s)`; }, settings.timeoutMs); if (timer.unref) timer.unref(); }

    if (!R.depth) {
      wf.lastRun = Date.now();
      wf.runCount = (wf.runCount || 0) + 1;
      this._persist(wf);
    }
    this._logEntry(wf, `▶ start (${reason})`, 'running', run);
    this._busEmit('automation.run.start', { id: wf.id, runId: run.id, reason, ts: Date.now() });

    let result;
    try {
      const sig = await this._runRange(R, 0, wf.steps.length, true);
      run.status = 'ok';
      this._logEntry(wf, '✓ complete', 'ok', run);
      this._busEmit('automation.run.complete', { id: wf.id, runId: run.id, ts: Date.now() });
      result = { ok: true, runId: run.id, status: 'ok', vars: ctx.vars, output: ctx.last };
    } catch (e) {
      run.status = e.cancelled ? 'cancelled' : 'error';
      run.error = e.message;
      if (e.cancelled) this._logEntry(wf, `■ ${e.message}`, 'cancelled', run);
      this._busEmit('automation.run.error', { id: wf.id, runId: run.id, step: e.stepType || null, error: e.message, ts: Date.now() });
      result = { ok: false, runId: run.id, status: run.status, error: e.message, vars: ctx.vars, output: ctx.last };
    } finally {
      if (timer) clearTimeout(timer);
      run.finishedAt = Date.now();
      run.vars = _preview(ctx.vars, 8000);
      this._active.delete(run.id);
      if (!R.depth) { wf.lastStatus = run.status; wf.lastError = run.error || null; wf.lastDurationMs = run.finishedAt - run.startedAt; }
      this._persist(wf);   // also what it remembered (seen items, changed values, memory.*) — a sub-workflow's too
      this._saveRun(run);
    }
    if (!R.depth) {
      this.emitEvent(result.ok ? 'workflow.finished' : 'workflow.failed', { workflowId: wf.id, workflowName: wf.name, name: wf.name, ok: result.ok, error: result.error || null, runId: run.id }, { chain: R.chain });
    }
    return result;
  }

  _checkCancel(R) { if (R.run.cancelled) throw new Cancelled(R.run.cancelled); }
  async _sleep(R, ms) {
    const end = Date.now() + Math.max(0, ms || 0);
    while (Date.now() < end) {
      this._checkCancel(R);
      await new Promise(r => setTimeout(r, Math.min(250, end - Date.now())));
    }
    this._checkCancel(R);
  }

  /**
   * _runRange(R, from, to) — the steps from..to-1. Returns a control signal
   * for the caller: { stop }, { finish }, { brk }, { cont }, { jump: stepId } or null.
   * §BUILT — a condition can redirect flow to a named step id (onTrue/onFalse),
   * the same if/then primitive Tasker-style tools use: a plain array walk with an index jump.
   */
  async _runRange(R, from, to, top = false) {
    const steps = R.wf.steps;
    let i = from;
    while (i < to) {
      this._checkCancel(R);
      const step = steps[i];
      if (step.type === 'trigger') { i++; continue; } // the trigger already fired — that is why we are running
      if (step.enabled === false) { this._logEntry(R.wf, `– ${step.label || step.type} step skipped (switched off)`, 'skipped', R.run); i++; continue; }
      if (++R.count > R.settings.maxSteps) throw new Error(`the run went over ${R.settings.maxSteps} steps — a loop that never ends?`);

      let res;
      if (step.type === 'loop') {
        const l = await this._loop(R, i);
        if (l.signal) {
          if (l.signal.jump) { const ni = steps.findIndex(s => s.id === l.signal.jump); if (ni >= from && ni < to) { i = ni; continue; } }
          return l.signal;
        }
        i = l.next; continue;
      }
      res = await this._attempt(R, step);

      const target = res && res.nextStepId;
      if (!target || target === 'next') { i++; continue; }
      if (target === 'stop') {
        this._logEntry(R.wf, res.finish ? '■ finished here' : '■ stopped by a condition', 'ok', R.run);
        return { stop: true, finish: !!res.finish };
      }
      if (target === 'fail') throw Object.assign(new Error(`${step.label || step.type}: the condition failed the run`), { stepType: step.type });
      if (target === 'break') { if (top) return { stop: true }; return { brk: true }; }
      if (target === 'continue') { if (top) { i++; continue; } return { cont: true }; }
      const ni = steps.findIndex(s => s.id === target);
      if (ni < 0) { i++; continue; }                    // that step is gone — carry on
      if (ni >= from && ni < to) { i = ni; continue; }
      return { jump: target };                          // outside this loop body — the caller handles it
    }
    return null;
  }

  async _loop(R, i) {
    const steps = R.wf.steps, step = steps[i];
    const t0 = Date.now();
    const raw = step.config || {};
    const n = Math.max(1, parseInt(T.render(raw.body, R.ctx), 10) || 1);
    const end = Math.min(steps.length, i + 1 + n);
    let items;
    if (!_isEmpty(raw.items)) items = _asList(T.render(raw.items, R.ctx));
    else items = _asList(parseInt(T.render(raw.times, R.ctx), 10) || 0);
    const max = Math.max(1, parseInt(T.render(raw.max, R.ctx), 10) || 500);
    const total = items.length;
    if (items.length > max) items = items.slice(0, max);
    // only items this workflow has not seen before (a job board: only new jobs)
    let fresh = null;
    if (!_isEmpty(raw.onlyNew)) {
      const seen = R.wf.memory.seen[step.id] = R.wf.memory.seen[step.id] || [];
      const keyOf = (item, index) => String(T.render(raw.onlyNew, { ...R.ctx, item, index }));
      fresh = [];
      items = items.filter((item, index) => { const k = keyOf(item, index); if (seen.includes(k)) return false; fresh.push(k); return true; });
    }
    const delayMs = parseInt(T.render(raw.delayMs, R.ctx), 10) || 0;
    const saved = { item: R.ctx.item, index: R.ctx.index, loop: R.ctx.loop };
    const name = step.label || 'For each';
    this._logEntry(R.wf, `↺ ${name}: ${items.length} round${items.length === 1 ? '' : 's'}${total > items.length && !fresh ? ` (of ${total} — the limit is ${max})` : ''}${fresh ? ` (${total - items.length} already seen)` : ''}`, 'ok', R.run);
    let rounds = 0, signal = null;
    try {
      for (let k = 0; k < items.length; k++) {
        this._checkCancel(R);
        R.ctx.item = items[k]; R.ctx.index = k;
        R.ctx.loop = { index: k, number: k + 1, count: items.length, first: k === 0, last: k === items.length - 1 };
        rounds++;
        const sig = await this._runRange(R, i + 1, end);
        if (fresh && fresh[k] !== undefined) this._remember(R.wf, step.id, fresh[k]);
        if (sig && sig.brk) break;
        if (sig && (sig.stop || sig.jump)) { signal = sig; break; }
        if (delayMs && k < items.length - 1) await this._sleep(R, delayMs);
      }
    } finally {
      Object.assign(R.ctx, saved);
    }
    this._keep(R, step, rounds);
    this._record(R, step, { status: 'ok', ms: Date.now() - t0, output: rounds });
    return signal ? { signal } : { next: end };
  }

  _remember(wf, stepId, key) {
    const seen = wf.memory.seen[stepId] = wf.memory.seen[stepId] || [];
    if (!seen.includes(key)) seen.push(key);
    if (seen.length > 5000) seen.splice(0, seen.length - 5000);
  }

  _keep(R, step, output) {
    R.ctx.last = output;
    const rec = { output, ok: true };
    R.ctx.steps[step.id] = rec;
    if (step.label) R.ctx.steps[step.label] = rec;
    if (step.saveAs) {
      const k = String(step.saveAs).trim().replace(/^vars\./, '');
      if (k.startsWith('memory.')) R.wf.memory.vars[k.slice(7)] = output; else R.ctx.vars[k] = output;
    }
  }

  _record(R, step, { status, ms, output, error, attempt }) {
    if (R.run.steps.length >= 2000) return;
    R.run.steps.push({ id: step.id, type: step.type, label: step.label || null, status, ms, ...(output !== undefined ? { output: _preview(output, 2000) } : {}), ...(error ? { error } : {}), ...(attempt ? { attempt } : {}), ...(R.ctx.index != null ? { item: R.ctx.index } : {}) });
  }

  /** one step with its retry, time limit and on-error rule */
  async _attempt(R, step) {
    const retry = step.retry || {};
    const tries = 1 + Math.max(0, Math.min(parseInt(retry.count, 10) || 0, 20));
    const baseDelay = Math.max(0, parseInt(retry.delayMs, 10) || 2000);
    const timeoutMs = parseInt(step.timeoutMs, 10) || 0;
    const name = step.label || step.type;
    let lastErr = null;
    R.run.current = { stepId: step.id, label: name, since: Date.now() };
    for (let a = 0; a < tries; a++) {
      if (a) {
        const wait = retry.backoff ? baseDelay * 2 ** (a - 1) : baseDelay;
        this._logEntry(R.wf, `↻ ${name}: retry ${a} of ${tries - 1} in ${Math.round(wait / 100) / 10} s — ${lastErr.message}`, 'retry', R.run);
        await this._sleep(R, wait);
      }
      const t0 = Date.now();
      try {
        let p = this._runStep(step, R.wf, R);
        if (timeoutMs > 0) {
          let to;
          p = Promise.race([p, new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`took longer than ${Math.round(timeoutMs / 1000)} s`)), timeoutMs); })]).finally(() => clearTimeout(to));
        }
        const result = await p;
        const output = result && Object.prototype.hasOwnProperty.call(result, 'output') ? result.output : undefined;
        if (output !== undefined) this._keep(R, step, output);
        this._record(R, step, { status: 'ok', ms: Date.now() - t0, output, attempt: a || undefined });
        this._logEntry(R.wf, `✓ ${name} step${result && result.note ? ` — ${result.note}` : ''}`, 'ok', R.run);
        R.run.current = null;
        return result;
      } catch (e) {
        if (e.cancelled) { this._record(R, step, { status: 'cancelled', ms: Date.now() - t0, error: e.message }); throw e; }
        lastErr = e;
        this._record(R, step, { status: 'error', ms: Date.now() - t0, error: e.message, attempt: a || undefined });
      }
    }
    R.run.current = null;
    R.ctx.error = { step: name, stepId: step.id, message: lastErr.message };
    const onError = step.onError || 'fail';
    if (onError === 'continue') { this._logEntry(R.wf, `⚠ ${name} step failed, carrying on: ${lastErr.message}`, 'warn', R.run); return { nextStepId: 'next' }; }
    if (onError === 'stop') { this._logEntry(R.wf, `⚠ ${name} step failed, stopping: ${lastErr.message}`, 'warn', R.run); return { nextStepId: 'stop' }; }
    if (onError !== 'fail' && R.wf.steps.some(s => s.id === onError)) { this._logEntry(R.wf, `⚠ ${name} step failed, going to its error step: ${lastErr.message}`, 'warn', R.run); return { nextStepId: onError }; }
    this._logEntry(R.wf, `✕ ${step.type} step: ${lastErr.message}`, 'error', R.run);
    lastErr.stepType = step.type;
    throw lastErr;
  }

  /**
   * _resolveVar(varPath) — real, read-only lookup against the live mesh
   * view for 'condition' steps. Path shape: "<nodeOrAgentId>.<field>",
   * e.g. "deepseek.status" or "deepseek.health" — resolved against
   * whatever meshViewFn() returns right now, never cached/stale.
   */
  _resolveVar(varPath) {
    if (!varPath) return undefined;
    const [id, field] = String(varPath).split('.');
    // §0.39.265 — mesh-wide values: mesh.queueDepth, mesh.agentCount, …
    if (id === 'mesh') { const st = this._stats() || {}; return field ? st[field] : st; }
    const entry = this._meshView().find(n => n.id === id || n.label === id);
    if (!entry) return undefined;
    return field ? entry[field] : entry;
  }

  /** _compare(actual, op, target) — data, not code: a fixed set of comparisons */
  _compare(actual, op, target, memo = null) {
    const s = (v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
    const num = (v) => parseFloat(typeof v === 'string' ? v.replace(/[^0-9.eE+-]/g, '') : v);
    switch (op) {
      case '==': return s(actual) === s(target);
      case '!=': return s(actual) !== s(target);
      case '>':  return num(actual) > num(target);
      case '<':  return num(actual) < num(target);
      case '>=': return num(actual) >= num(target);
      case '<=': return num(actual) <= num(target);
      case 'contains': return Array.isArray(actual) ? actual.map(s).includes(s(target)) : s(actual).toLowerCase().includes(s(target).toLowerCase());
      case 'not_contains': return !this._compare(actual, 'contains', target);
      case 'starts': return s(actual).toLowerCase().startsWith(s(target).toLowerCase());
      case 'ends': return s(actual).toLowerCase().endsWith(s(target).toLowerCase());
      case 'matches': { let re; try { const t = s(target); const m = t.match(/^\/(.*)\/([a-z]*)$/); re = m ? new RegExp(m[1], m[2]) : new RegExp(t, 'i'); } catch (e) { throw new Error(`the pattern is not a valid regex: ${e.message}`); } return re.test(s(actual)); }
      case 'in': return s(target).split(',').map(x => x.trim().toLowerCase()).includes(s(actual).trim().toLowerCase());
      case 'empty': return _isEmpty(actual);
      case 'not_empty': return !_isEmpty(actual);
      case 'exists': return actual !== undefined && actual !== null;
      case 'missing': return actual === undefined || actual === null;
      case 'changed': {
        if (!memo) return false;
        const now = s(actual), before = memo.wf.memory.last[memo.key];
        memo.wf.memory.last[memo.key] = now.slice(0, 4000);
        return before !== undefined && before !== now.slice(0, 4000);
      }
      default: throw new Error(`unknown condition operator: "${op}"`);
    }
  }

  // ── Browser plumbing ────────────────────────────────────────────────────
  _page(cfg, wf) {
    const p = cfg.page || cfg.agentId || 'auto';
    return p === 'auto' ? `auto-${String(wf.id).slice(0, 8)}` : p;
  }
  async _drive(wf, page, action, args = {}) {
    if (!this._browser) throw new Error('browser steps need Clear Glass running (no browser here)');
    return this._browser({ page, workflowId: wf.id, workflowName: wf.name, action, args, settings: wf.settings || {} });
  }
  async _evalIn(wf, page, script) {
    const r = await this._drive(wf, page, 'eval', { code: script });
    const v = r && typeof r === 'object' && 'result' in r ? r.result : r;
    if (v && typeof v === 'object' && typeof v.__nxError === 'string') throw new Error(v.__nxError);   // see automation/dom.js wrap()
    return v;
  }
  _outDir(wf) { return path.join(OUTPUT_DIR, _slug(wf.name)); }
  _outPath(wf, rel) {
    const clean = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!clean || clean.split('/').some(p => p === '..')) throw new Error(`the file path "${rel}" must stay inside the output folder`);
    const base = this._outDir(wf);
    const fp = path.resolve(base, clean);
    if (!fp.startsWith(path.resolve(base) + path.sep)) throw new Error(`the file path "${rel}" must stay inside the output folder`);
    return fp;
  }

  async _browserStep(cfg, wf, R) {
    const page = this._page(cfg, wf);
    const action = cfg.action || 'navigate';
    const sel = cfg.selector;
    const act = (op, value) => this._evalIn(wf, page, DOM.act({ op, selector: sel, value }));
    const center = async () => {
      await act('scroll_to');
      const r = await this._evalIn(wf, page, DOM.extract({ selector: sel, what: 'rect' }));
      if (!r) throw new Error(`element not found: ${sel}`);
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    };
    let out;
    switch (action) {
      case 'navigate': {
        let url = String(cfg.url || '').trim();
        if (!url) throw new Error('navigate needs a URL');
        if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url}`;
        if (!/^(https?|about|file):/i.test(url)) throw new Error(`only http(s) pages can be opened (got ${url.split(':')[0]}:)`);
        out = await this._drive(wf, page, 'navigate', { url });
        break;
      }
      case 'click': { const p = await center(); out = await this._drive(wf, page, 'click', p); break; }
      case 'hover': { const p = await center(); out = await this._drive(wf, page, 'hover', p); break; }
      case 'dom_click': out = await act('click'); break;
      case 'fill': out = await act('fill', cfg.value == null ? '' : cfg.value); break;
      case 'select': out = await act('select', cfg.value); break;
      case 'check': case 'uncheck': case 'submit': case 'scroll_to': out = await act(action); break;
      case 'upload_text': out = await act('upload_text', { name: cfg.fileName || 'file.txt', content: cfg.value == null ? '' : String(cfg.value) }); break;
      case 'highlight': out = await this._evalIn(wf, page, DOM.highlight({ selector: sel })); break;
      case 'type': {
        if (sel) await act('focus');
        out = await this._drive(wf, page, 'type', { text: String(cfg.value == null ? '' : cfg.value), delay: cfg.delay || 40 });
        break;
      }
      case 'press': out = await this._evalIn(wf, page, DOM.key({ key: cfg.key || 'Enter', selector: sel || null })); break;
      case 'scroll': out = await this._evalIn(wf, page, `(function(){ window.scrollBy(0, ${JSON.stringify(parseInt(cfg.deltaY, 10) || 600)}); return { y: window.scrollY, height: document.documentElement.scrollHeight }; })()`); break;
      case 'back': case 'forward': case 'reload': out = await this._drive(wf, page, action); break;
      case 'screenshot': {
        const r = await this._drive(wf, page, 'screenshot');
        const b64 = r && (r.screenshot || r.data);
        if (!b64) throw new Error('the page gave no screenshot');
        const fp = this._outPath(wf, cfg.path || `screenshots/${T.formatDate(new Date(), 'YYYY-MM-DD_HH-mm-ss')}-${R.run.id.slice(0, 4)}.png`);
        fs.mkdirSync(path.dirname(fp), { recursive: true });
        fs.writeFileSync(fp, Buffer.from(b64, 'base64'));
        out = fp;
        break;
      }
      case 'eval': {
        const code = String(cfg.code || '').trim();
        if (!code) throw new Error('eval needs JavaScript');
        // one bare expression gives its value; anything with statements runs as written (return what you want back)
        const statements = /\breturn\b/.test(code) || /[;\n]/.test(code) || /^\s*(throw|const|let|var|if|for|while|do|switch|try|function|class)\b/.test(code);
        const body = statements ? code : `return (${code});`;
        out = await this._evalIn(wf, page, `(async function(){ try { ${body}\n} catch (e) { return { __nxError: String((e && e.message) || e) }; } })()`);
        break;
      }
      case 'cookies_get': out = await this._drive(wf, page, 'cookies.get', {}); out = out && out.cookies ? out.cookies : out; break;
      case 'cookies_clear': out = await this._drive(wf, page, 'cookies.clear', {}); break;
      case 'storage_get': out = await this._drive(wf, page, 'storage.get', { key: cfg.key || null }); out = out && 'value' in out ? out.value : out; break;
      case 'storage_set': out = await this._drive(wf, page, 'storage.set', { key: cfg.key, value: cfg.value == null ? '' : String(cfg.value) }); break;
      case 'show': case 'close': out = await this._drive(wf, page, action); break;
      default: throw new Error(`unknown browser action "${action}"`);
    }
    const after = parseInt(cfg.waitAfterMs, 10) || 0;
    if (after > 0) await this._sleep(R, Math.min(after, 600000));
    return { output: out, note: `${action}${cfg.url ? ` ${cfg.url}` : sel ? ` ${sel}` : ''}` };
  }

  async _extractStep(cfg, wf) {
    const page = this._page(cfg, wf);
    const mode = cfg.mode || 'text';
    const limit = parseInt(cfg.limit, 10) || 200;
    let script;
    switch (mode) {
      case 'text': script = DOM.extract({ selector: cfg.selector, what: 'text' }); break;
      case 'list': script = DOM.extract({ selector: cfg.selector, what: 'text', all: true, limit }); break;
      case 'attr': { const a = cfg.attr || 'href'; script = DOM.extract({ selector: cfg.selector, what: a === 'href' || a === 'src' ? a : `attr:${a}`, all: !!cfg.all, limit }); break; }
      case 'value': case 'html': script = DOM.extract({ selector: cfg.selector, what: mode, all: !!cfg.all, limit }); break;
      case 'count': case 'exists': script = DOM.extract({ selector: cfg.selector, what: mode }); break;
      case 'records': {
        const fields = _kv(cfg.fields);
        if (!Object.keys(fields).length) throw new Error('records need at least one field (name = selector)');
        script = DOM.extract({ selector: cfg.selector, fields, limit });
        break;
      }
      case 'table': script = DOM.table({ selector: cfg.selector || 'table', limit }); break;
      case 'links': script = DOM.links({ selector: cfg.selector || null, match: cfg.match || null, limit }); break;
      case 'page': script = DOM.page({}); break;
      default: throw new Error(`unknown read mode "${mode}"`);
    }
    let v = await this._evalIn(wf, page, script);
    if (cfg.transform) v = T.evaluate(`__v | ${cfg.transform}`, { __v: v });
    const n = Array.isArray(v) ? `${v.length} item${v.length === 1 ? '' : 's'}` : typeof v === 'string' ? `“${v.slice(0, 40)}${v.length > 40 ? '…' : ''}”` : JSON.stringify(v);
    return { output: v, note: `${mode}: ${n}` };
  }

  async _waitStep(step, wf, R) {
    const raw = step.config || {};
    const cfg = T.render({ ...raw, left: undefined }, R.ctx);
    const kind = cfg.kind || 'present';
    const timeout = Math.max(100, parseInt(cfg.timeoutMs, 10) || 30000);
    const every = Math.max(100, parseInt(cfg.intervalMs, 10) || 500);
    const t0 = Date.now();
    let lastErr = null;
    for (;;) {
      this._checkCancel(R);
      let ok = false;
      try {
        if (kind === 'expression') {
          const left = raw.left !== undefined && raw.left !== '' ? T.render(raw.left, R.ctx) : this._resolveVar(cfg.var);
          ok = this._compare(left, cfg.op || '==', cfg.value);
        } else {
          ok = !!(await this._evalIn(wf, this._page(cfg, wf), DOM.check({ kind, selector: cfg.selector || null, text: cfg.text, url: cfg.url })));
        }
        lastErr = null;
      } catch (e) { lastErr = e; if (/browser steps need/.test(e.message)) throw e; }   // a page mid-navigation throws — try again
      if (ok) return { output: Date.now() - t0, note: `after ${Math.round((Date.now() - t0) / 100) / 10} s` };
      if (Date.now() - t0 >= timeout) {
        const what = kind === 'expression' ? 'the value matched' : `${kind}${cfg.selector ? ` ${cfg.selector}` : ''}${cfg.text ? ` “${cfg.text}”` : ''}${cfg.url ? ` ${cfg.url}` : ''}`;
        throw new Error(`timed out after ${Math.round(timeout / 1000)} s waiting until ${what}${lastErr ? ` (${lastErr.message})` : ''}`);
      }
      await this._sleep(R, every);
    }
  }

  async _httpStep(cfg) {
    const url = String(cfg.url || '').trim();
    if (!/^https?:\/\//i.test(url)) throw new Error(`a web request needs an http(s) URL (got "${url.slice(0, 60)}")`);
    const method = String(cfg.method || 'GET').toUpperCase();
    const headers = Object.fromEntries(Object.entries(_kv(cfg.headers)).map(([k, v]) => [k, String(v)]));
    let body;
    if (!['GET', 'HEAD'].includes(method) && cfg.body !== undefined && cfg.body !== '') {
      if (typeof cfg.body === 'object') { body = JSON.stringify(cfg.body); if (!Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json'; }
      else { body = String(cfg.body); if (/^\s*[[{]/.test(body) && !Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json'; }
    }
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), Math.max(1000, parseInt(cfg.timeoutMs, 10) || 30000));
    let res, text;
    try {
      res = await fetch(url, { method, headers, body, signal: ac.signal, redirect: 'follow' });
      text = await res.text();
    } catch (e) { throw new Error(`${method} ${url}: ${e.name === 'AbortError' ? 'timed out' : e.message}`); }
    finally { clearTimeout(to); }
    let parsed = text;
    if ((res.headers.get('content-type') || '').includes('json') || /^\s*[[{]/.test(text)) { try { parsed = JSON.parse(text); } catch (_) {} }
    if (!res.ok && cfg.failOnHttpError !== false && cfg.failOnHttpError !== 'false') throw new Error(`${method} ${url} → HTTP ${res.status}: ${String(text).slice(0, 200)}`);
    return { output: { status: res.status, ok: res.ok, body: parsed }, note: `${method} → ${res.status}` };
  }

  _fileStep(cfg, wf) {
    const fp = this._outPath(wf, cfg.path);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    const format = cfg.format || 'text';
    const append = (cfg.mode || 'append') === 'append';
    let content = cfg.content;
    if (typeof content === 'string' && ['json', 'jsonl', 'csv'].includes(format) && /^\s*[[{]/.test(content)) { try { content = JSON.parse(content); } catch (_) {} }
    const exists = fs.existsSync(fp) && fs.statSync(fp).size > 0;
    let written = 0;
    if (format === 'text') {
      const s = typeof content === 'object' ? JSON.stringify(content, null, 2) : String(content == null ? '' : content);
      append ? fs.appendFileSync(fp, (exists ? '\n' : '') + s) : fs.writeFileSync(fp, s);
      written = 1;
    } else if (format === 'json') {
      if (append && exists) {
        let arr; try { arr = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (_) { arr = null; }
        if (!Array.isArray(arr)) throw new Error(`${cfg.path} is not a JSON list — pick “replace the file” or another file`);
        const add = Array.isArray(content) ? content : [content];
        arr.push(...add); written = add.length;
        fs.writeFileSync(fp, JSON.stringify(arr, null, 2));
      } else { fs.writeFileSync(fp, JSON.stringify(append && !Array.isArray(content) ? [content] : content, null, 2)); written = 1; }
    } else if (format === 'jsonl') {
      const rows = Array.isArray(content) ? content : [content];
      const s = rows.map(r => JSON.stringify(r)).join('\n') + '\n';
      append ? fs.appendFileSync(fp, s) : fs.writeFileSync(fp, s);
      written = rows.length;
    } else if (format === 'csv') {
      const rows = (Array.isArray(content) ? content : [content]).map(r => (r && typeof r === 'object' && !Array.isArray(r) ? r : { value: r }));
      let header;
      if (append && exists) header = _csvHeader(fs.readFileSync(fp, 'utf8').split(/\r?\n/)[0]);
      else header = [...new Set(rows.flatMap(r => Object.keys(r)))];
      const lines = rows.map(r => header.map(h => _csvCell(r[h])).join(','));
      if (append && exists) fs.appendFileSync(fp, lines.join('\n') + (lines.length ? '\n' : ''));
      else fs.writeFileSync(fp, [header.map(_csvCell).join(','), ...lines].join('\n') + '\n');
      written = rows.length;
    } else throw new Error(`unknown file format "${format}"`);
    return { output: fp, note: `${append ? 'added to' : 'wrote'} ${path.relative(this._outDir(wf), fp)} (${written})` };
  }

  async _runStep(step, wf, R) {
    R = R || { wf, ctx: { vars: {}, steps: {}, workflow: wf.name }, run: { id: 'adhoc', log: [], steps: [] }, settings: DEFAULTS, count: 0, depth: 0, chain: 0 };
    const cfg = RAW_CONFIG.has(step.type) ? (step.config || {}) : T.render(step.config || {}, R.ctx);

    if (step.type === 'agent') {
      if (!cfg.agentKey || !cfg.prompt) throw new Error('agent step requires agentKey and prompt');
      const task = { agentKey: cfg.agentKey, prompt: cfg.prompt, ...(cfg.accountId ? { accountId: cfg.accountId } : {}) };
      if (cfg.await === true || cfg.await === 'true') {
        if (!this._askAgent) throw new Error('waiting for an agent’s reply needs Clear Glass running');
        const r = await this._askAgent(task);
        const text = r == null ? '' : typeof r === 'string' ? r : (r.text ?? r.reply ?? r.response ?? r.content ?? JSON.stringify(r));
        if (r && r.error) throw new Error(`${cfg.agentKey}: ${r.error}`);
        return { output: text, note: `${cfg.agentKey} replied (${String(text).length} characters)` };
      }
      // §0.39.265 — an agent step can name the account to send as
      this._enqueue(task);
      return null;
    }

    // §0.39.265 — run a saved Clear Glass macro (the Macros page) in a window.
    if (step.type === 'macro') {
      if (!cfg.name) throw new Error('macro step requires a macro name');
      if (!this._runMacro) throw new Error('macro step: macros are not available here');
      const params = _kv(cfg.params);
      const r = await this._runMacro({ name: cfg.name, agentId: cfg.agentId || 'default', params });
      if (r && (r.error || r.ok === false)) throw new Error(`macro "${cfg.name}": ${r.error || 'failed'}`);
      return { note: `macro ${cfg.name}`, output: r === undefined ? null : r };
    }

    // §0.39.265 — a desktop notification; {{workflow}} becomes the workflow's name.
    if (step.type === 'notify') {
      const title = (cfg.title == null || cfg.title === '' ? wf.name : String(cfg.title));
      const body = cfg.body == null ? '' : typeof cfg.body === 'object' ? JSON.stringify(cfg.body) : String(cfg.body);
      if (this._notify) await this._notify({ title, body });
      this._busEmit('automation.notify', { workflowId: wf.id, title, body, ts: Date.now() });
      return null;
    }

    if (step.type === 'delay') {
      const base = Math.min(parseInt(cfg.ms, 10) || 1000, 3600000);   // capped at 1 h (the run can be cancelled while it waits)
      const ms = base + Math.floor(Math.random() * Math.min(parseInt(cfg.jitterMs, 10) || 0, 3600000));
      await this._sleep(R, ms);
      return { output: ms };
    }

    // §BUILT — "condition... if/then." Real, read-only comparison — no eval,
    // no arbitrary expression language: a value (a template, or a live mesh value) and a fixed operator.
    if (step.type === 'condition') {
      const actual = cfg.left !== undefined && cfg.left !== '' ? cfg.left : this._resolveVar(cfg.var);
      const target = cfg.value;
      const passed = this._compare(actual, cfg.op, target, cfg.op === 'changed' ? { wf, key: step.id } : null);
      this._busEmit('automation.condition.evaluated', { workflowId: wf.id, stepId: step.id, var: cfg.var || null, actual: _preview(actual, 200), op: cfg.op, target, passed, ts: Date.now() });
      return { nextStepId: passed ? (cfg.onTrue || 'next') : (cfg.onFalse || 'next'), output: passed, note: passed ? 'yes' : 'no' };
    }

    // §BUILT — Real HTTP call against one of NEXUS's own systems by name
    // (guardian/ollama/copilot/clear-glass); GET /commands on each lists what's callable.
    if (step.type === 'command') {
      const port = SYSTEM_PORTS[cfg.system];
      if (!port) throw new Error(`command step: unknown system "${cfg.system}" (expected one of: ${Object.keys(SYSTEM_PORTS).join(', ')})`);
      const method = (cfg.method || 'GET').toUpperCase();
      const url = `http://127.0.0.1:${port}${cfg.endpoint || '/health'}`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'GET' || !cfg.body ? undefined : (typeof cfg.body === 'object' ? JSON.stringify(cfg.body) : cfg.body),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`command step: ${cfg.system}${cfg.endpoint} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
      let out = text; try { out = JSON.parse(text); } catch (_) {}
      return { output: out };
    }

    if (step.type === 'browser') return this._browserStep(cfg, wf, R);
    if (step.type === 'extract') return this._extractStep(cfg, wf);
    if (step.type === 'wait_until') return this._waitStep(step, wf, R);
    if (step.type === 'http') return this._httpStep(cfg);
    if (step.type === 'file') return this._fileStep(cfg, wf);

    if (step.type === 'set') {
      const raw = cfg.assign !== undefined ? _kv(cfg.assign) : cfg.name ? { [cfg.name]: cfg.value } : {};
      const done = {};
      for (const [k0, v] of Object.entries(raw)) {   // one at a time, so a later one can use an earlier one
        const k = k0.replace(/^vars\./, '');
        const val = T.render(v, R.ctx);
        if (k.startsWith('memory.')) R.wf.memory.vars[k.slice(7)] = val; else R.ctx.vars[k] = val;
        done[k] = val;
      }
      return { output: done, note: Object.keys(done).join(', ') };
    }

    if (step.type === 'workflow') {
      const child = this.find(cfg.workflow);
      if (!child) throw new Error(`no workflow called "${cfg.workflow}"`);
      if ((R.depth || 0) + 1 > MAX_DEPTH) throw new Error(`workflows can call each other at most ${MAX_DEPTH} deep`);
      const r = await this._execute(child, `from “${wf.name}”`, { vars: _kv(cfg.vars), depth: (R.depth || 0) + 1, chain: R.chain, trigger: { from: wf.name, runId: R.run.id } });
      if (!r.ok) throw new Error(`workflow "${child.name}": ${r.error}`);
      return { output: r.vars, note: child.name };
    }

    if (step.type === 'log') {
      const msg = typeof cfg.message === 'object' ? JSON.stringify(cfg.message) : String(cfg.message == null ? '' : cfg.message);
      this._logEntry(wf, `✎ ${msg}`, 'info', R.run);
      return { output: msg };
    }
    if (step.type === 'emit') {
      if (!cfg.event) throw new Error('send an event: name it');
      const n = this.emitEvent(String(cfg.event), { name: String(cfg.event), ..._kv(cfg.payload), from: wf.name }, { chain: R.chain + 1 });
      return { output: n, note: `${cfg.event} → ${n} workflow${n === 1 ? '' : 's'}` };
    }
    if (step.type === 'stop') return { nextStepId: 'stop', finish: true };
    if (step.type === 'fail') throw new Error(String(cfg.message || 'the workflow failed at a “Fail the run” step'));

    throw new Error(`unknown step type: "${step.type}" (known: ${STEPS.KNOWN_TYPES.join(', ')})`);
  }

  /**
   * runStep(step, { page, vars }) — one step on its own, outside any workflow:
   * the co-pilot's browser_automation tool and the Settings "Try it" button use this.
   */
  async runStep(step, { vars = {}, workflowId = null } = {}) {
    const base = workflowId && this.get(workflowId);
    const wf = base || this._normalize({ id: 'adhoc-agent', name: 'agent', steps: [step], settings: {} });
    const R = { wf, ctx: { vars: { ...(base && base.vars), ...vars }, steps: {}, last: null, trigger: {}, workflow: wf.name, memory: wf.memory.vars }, run: { id: randomUUID(), log: [], steps: [] }, settings: DEFAULTS, count: 0, depth: 0, chain: 0 };
    try {
      if (!STEPS.byType.has(step.type)) throw new Error(`unknown step type: "${step.type}"`);
      const r = await this._runStep({ id: step.id || 'adhoc', ...step }, wf, R);
      return { ok: true, output: r && r.output !== undefined ? r.output : null, note: (r && r.note) || null, log: R.run.log.map(l => l.msg) };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  // ── Portability ─────────────────────────────────────────────────────────
  validate(idOrWf) {
    const wf = typeof idOrWf === 'string' ? this.get(idOrWf) : idOrWf;
    if (!wf) return { ok: false, error: 'no such workflow' };
    const problems = STEPS.validateWorkflow(wf);
    return { ok: true, valid: !problems.length, problems };
  }
  exportWorkflow(id) {
    const wf = this.get(id);
    if (!wf) return { ok: false, error: 'no such workflow' };
    const steps = wf.steps.map(s => { const c = this._copyStep(s, s.id); if (c.config.token) delete c.config.token; return c; });
    return { ok: true, workflow: { format: 'nexus-workflow', version: 2, name: wf.name, description: wf.description || '', vars: wf.vars || {}, settings: wf.settings || {}, steps } };
  }
  importWorkflow(obj) {
    const w = obj && (obj.workflow || obj);
    if (!w || !Array.isArray(w.steps)) return { ok: false, error: 'that is not a workflow (no steps list)' };
    const bad = w.steps.map(s => s && s.type).filter(t => !STEPS.KNOWN_TYPES.includes(t));
    if (bad.length) return { ok: false, error: `unknown step type${bad.length > 1 ? 's' : ''}: ${[...new Set(bad)].join(', ')}` };
    return this.create({ name: w.name || 'Imported workflow', description: w.description || '', status: 'paused', steps: w.steps, vars: w.vars, settings: w.settings });
  }
  outputDir(id) { const wf = this.get(id); return wf ? this._outDir(wf) : OUTPUT_DIR; }

  // ── Per-step CRUD — the real Tasker-style step editor's backend ──────
  addStep(workflowId, step) {
    const wf = this.get(workflowId);
    if (!wf) return { ok: false, error: 'no such workflow' };
    const s = this._copyStep(step, randomUUID());
    if (Number.isInteger(step.index) && step.index >= 0 && step.index < wf.steps.length) wf.steps.splice(step.index, 0, s); else wf.steps.push(s);
    this._normalize(wf);
    if (s.type === 'trigger') delete wf._nextRuns;
    this._persist(wf);
    return { ok: true, workflow: wf, step: s };
  }

  updateStep(workflowId, stepId, patch) {
    const wf = this.get(workflowId);
    if (!wf) return { ok: false, error: 'no such workflow' };
    const s = wf.steps.find(st => st.id === stepId);
    if (!s) return { ok: false, error: 'no such step' };
    if (patch.type !== undefined) s.type = patch.type;
    if (patch.config !== undefined) {
      const keepToken = s.type === 'trigger' && s.config && s.config.token && patch.config && patch.config.webhook && !patch.config.token ? s.config.token : null;
      s.config = patch.config;
      if (keepToken) s.config.token = keepToken;
    }
    if (patch.enabled !== undefined) { if (patch.enabled) delete s.enabled; else s.enabled = false; }
    if (patch.label !== undefined) { if (patch.label) s.label = patch.label; else delete s.label; }
    for (const k of STEP_META) if (patch[k] !== undefined) { if (patch[k] === '' || patch[k] === null) delete s[k]; else s[k] = patch[k]; }
    if (patch.regenerateToken && s.type === 'trigger' && s.config && s.config.webhook) s.config.token = _token();
    if (s.type === 'trigger') delete wf._nextRuns;
    this._normalize(wf);
    this._persist(wf);
    return { ok: true, workflow: wf, step: s };
  }

  removeStep(workflowId, stepId) {
    const wf = this.get(workflowId);
    if (!wf) return { ok: false, error: 'no such workflow' };
    wf.steps = wf.steps.filter(s => s.id !== stepId);
    delete wf._nextRuns;
    this._persist(wf);
    return { ok: true, workflow: wf };
  }

  moveStep(workflowId, stepId, dir) {
    const wf = this.get(workflowId);
    if (!wf) return { ok: false, error: 'no such workflow' };
    const i = wf.steps.findIndex(s => s.id === stepId);
    if (i === -1) return { ok: false, error: 'no such step' };
    const ni = typeof dir === 'number' ? dir : i + (dir === 'up' ? -1 : 1);
    if (ni < 0 || ni >= wf.steps.length || ni === i) return { ok: true, workflow: wf }; // real, honest no-op at either end
    const [s] = wf.steps.splice(i, 1);
    wf.steps.splice(ni, 0, s);
    this._persist(wf);
    return { ok: true, workflow: wf };
  }
}

module.exports = { AutomationEngine, WORKFLOWS_DIR, RUNS_DIR, OUTPUT_DIR, TICK_MS, SYSTEM_PORTS, nextScheduled, _kv, _asList, _glob };
