'use strict';
/**
 * clear-glass/src/mesh/automation-engine.js — real workflow scheduler.
 * docs/2026-09-11-brainos-external-concept-mapping.spec named this the
 * ONE genuine gap: NEXUS had real dependency graphs (RAID) and real
 * retry state machines (lib/seam/queue.js, agent-mesh's drainer) but no
 * real trigger/schedule-driven multi-step workflow engine anywhere.
 *
 * §HONEST SCOPE — 5 real step types now ship end to end: trigger, agent,
 * delay, condition (if/then, evaluated against live mesh data, real
 * step-jump routing), and command (a real HTTP call against one of
 * NEXUS's own named systems — guardian/ollama/copilot/clear-glass).
 * branch/http(arbitrary-url)/notification are real, wanted extensions,
 * not built here; adding one means adding one real case to _runStep(),
 * same shape as the five above, discoverable through this file's own
 * contract (ui/brainos-float/brainos-float-contract.json) without a
 * client rebuild — that IS the hotswap point, not a promise this file
 * can't keep.
 *
 * Every step calls a REAL, already-existing mesh function — no second
 * dispatch path (§10.3): 'agent' steps go through the exact same
 * this.enqueue() the drainer and route-graph already use.
 */
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

// §0.39.265 — under the shared data root (NEXUS_DATA_ROOT, like every other
// store), so a test process — lib/test-sandbox.js points that root at a temp
// folder — never reads or deletes the real saved workflows. Was hard-coded to
// <repo>/data, and tests/modules/automation-engine.test.js rm -rf's this dir.
require('../../../lib/test-sandbox.js').ensure();
const WORKFLOWS_DIR = path.join(process.env.NEXUS_DATA_ROOT || path.join(__dirname, '..', '..', '..', 'data'), 'brainos', 'workflows');
const TICK_MS = 5000;

// §BUILT — real, already-established ports (guardian.spec, ollama/server.js,
// copilot/server.js, clear-glass's own real convention) — reused verbatim,
// not re-derived, for the new 'command' step type below.
// §0.39.265 — 'clear-glass' is the name the Settings page offers (and every
// other part of NEXUS uses); only 'clearglass' was listed, so every command
// step aimed at Clear Glass failed with "unknown system". Both work now.
const SYSTEM_PORTS = { guardian: 7820, ollama: 3749, copilot: 3750, clearglass: 7704, 'clear-glass': 7704 };

/**
 * nextScheduled(cfg, from) — §0.39.265 — when a trigger next fires.
 *   { intervalMs }                       every N ms
 *   { at: 'HH:MM', days: [0..6] }        daily at a local time, on those weekdays (all when empty)
 * Returns a timestamp, or null for a manual-only trigger.
 */
function nextScheduled(cfg = {}, from = Date.now()) {
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

class AutomationEngine {
  constructor({ enqueueFn, busEmit, meshViewFn, statsFn, runMacroFn, notifyFn } = {}) {
    // §0.39.265 — hooks for the newer step types and mesh.* values; the owner
    // can also set them later (setHooks), since the macro tool and the
    // notifier live in Clear Glass's main process, not in the mesh.
    this._stats = typeof statsFn === 'function' ? statsFn : () => ({});
    this._runMacro = typeof runMacroFn === 'function' ? runMacroFn : null;
    this._notify = typeof notifyFn === 'function' ? notifyFn : null;
    this._enqueue = typeof enqueueFn === 'function' ? enqueueFn : () => {};
    this._busEmit = typeof busEmit === 'function' ? busEmit : () => {};
    // §BUILT — James: "providers map to commands, intent map to commands
    // and contracts... condition... network calls, data and intent
    // routing." meshViewFn gives 'condition' steps real, live data to
    // evaluate against (the exact same mesh.listMeshView() the canvas
    // and floating panel's Agents tab already read) — not a second,
    // separate state snapshot.
    this._meshView = typeof meshViewFn === 'function' ? meshViewFn : () => [];
    this._workflows = _loadAll();
    this._log = []; // in-memory only, capped — real persistence is the workflow's own lastRun/runCount
    this._tickTimer = null;
  }

  start() {
    if (this._tickTimer) return;
    this._tickTimer = setInterval(() => this.tick(), TICK_MS);
    // §BUILT-FIX — unref() so this background poller never keeps the
    // process alive on its own (matches the expectation every other
    // real timer in this codebase already gets) — a test or a clean
    // shutdown that constructs an AgentMesh should exit normally, not
    // hang on this interval forever.
    if (typeof this._tickTimer.unref === 'function') this._tickTimer.unref();
  }
  stop() {
    if (this._tickTimer) { clearInterval(this._tickTimer); this._tickTimer = null; }
  }

  setHooks({ statsFn, runMacroFn, notifyFn } = {}) {
    if (typeof statsFn === 'function') this._stats = statsFn;
    if (typeof runMacroFn === 'function') this._runMacro = runMacroFn;
    if (typeof notifyFn === 'function') this._notify = notifyFn;
  }

  /** nextRunAt(wf) — when an active workflow's trigger fires next (null: manual only / paused). */
  nextRunAt(wf) {
    if (!wf || wf.status !== 'active') return null;
    const trigger = (wf.steps || []).find(s => s.type === 'trigger' && s.enabled !== false);
    if (!trigger) return null;
    return wf._nextRun || nextScheduled(trigger.config || {}, Date.now());
  }

  list() { return this._workflows.slice(); }
  get(id) { return this._workflows.find(w => w.id === id) || null; }

  _persist(wf) {
    try {
      fs.mkdirSync(WORKFLOWS_DIR, { recursive: true });
      fs.writeFileSync(path.join(WORKFLOWS_DIR, `${wf.id}.workflow.json`), JSON.stringify(wf, null, 2), 'utf8');
    } catch (e) {
      console.warn(`[automation-engine] failed to persist ${wf.id} (non-fatal): ${e.message}`);
    }
  }

  create({ name, status, steps, description }) {
    const wf = {
      id: randomUUID(), name: name || 'Untitled Workflow', status: status || 'draft', description: description || '',
      // §0.39.265 — every step gets its own id here: a template or a duplicate
      // hands in steps with none, or with another workflow's. Condition
      // branches that named a step by its old id are pointed at the new one.
      steps: [], lastRun: null, runCount: 0, createdAt: Date.now(),
    };
    const src = Array.isArray(steps) ? steps : [];
    const newIds = src.map(() => randomUUID());
    const idMap = new Map(src.map((st, i) => [st.id, newIds[i]]).filter(([old]) => old));   // only steps that HAD an id can be branched to
    wf.steps = src.map((st, i) => {
      const config = { ...(st.config || {}) };
      for (const k of ['onTrue', 'onFalse']) if (config[k] && idMap.has(config[k])) config[k] = idMap.get(config[k]);
      return { id: newIds[i], type: st.type, config, ...(st.enabled === false ? { enabled: false } : {}), ...(st.label ? { label: st.label } : {}) };
    });
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
    if (patch.status !== undefined) { wf.status = patch.status; delete wf._nextRun; }
    if (patch.steps !== undefined) wf.steps = patch.steps;
    this._persist(wf);
    return { ok: true, workflow: wf };
  }

  remove(id) {
    const idx = this._workflows.findIndex(w => w.id === id);
    if (idx === -1) return { ok: false, error: 'no such workflow' };
    const [wf] = this._workflows.splice(idx, 1);
    try { fs.unlinkSync(path.join(WORKFLOWS_DIR, `${wf.id}.workflow.json`)); } catch (_) {}
    this._busEmit('automation.workflow.removed', { id: wf.id });
    return { ok: true };
  }

  getLog(limit = 50, workflowId = null) { return (workflowId ? this._log.filter(e => e.workflowId === workflowId) : this._log).slice(0, limit); }

  _logEntry(wf, msg, status) {
    this._log.unshift({ ts: Date.now(), workflowId: wf.id, workflowName: wf.name, msg, status });
    if (this._log.length > 200) this._log.pop();
    this._busEmit('automation.log', { workflowId: wf.id, msg, status, ts: Date.now() });
  }

  /** tick() — checks every active workflow's interval trigger. Manual runs bypass this entirely via run(). */
  tick() {
    const now = Date.now();
    for (const wf of this._workflows) {
      if (wf.status !== 'active') continue;
      const trigger = wf.steps.find(s => s.type === 'trigger' && s.enabled !== false);
      if (!trigger) continue;
      // §0.39.265 — interval OR daily-at-a-time schedules (nextScheduled above)
      if (!wf._nextRun) wf._nextRun = nextScheduled(trigger.config || {}, now); // first arm, not persisted (recomputed each boot)
      if (!wf._nextRun) continue; // manual-only trigger — tick() never fires it
      if (now >= wf._nextRun) {
        wf._nextRun = nextScheduled(trigger.config || {}, now);
        this.run(wf.id, trigger.config && trigger.config.at ? 'schedule' : 'interval').catch(() => {});
      }
    }
  }

  /**
   * run(id, reason) — executes every step in order. 'agent' steps
   * dispatch through the real this._enqueue (the same mesh.enqueue the
   * drainer already owns) — this function does not wait for the agent's
   * response; a workflow that needs to react to it should be wired via
   * route-graph (Phase 2), not by this engine polling for completion.
   * §BUILT — 'condition' steps can redirect flow to a named step id
   * (onTrue/onFalse), same real if/then primitive Tasker-style tools use
   * — a plain array walk with an index jump, not a second engine.
   */
  async run(id, reason = 'manual') {
    const wf = this.get(id);
    if (!wf) return { ok: false, error: 'no such workflow' };
    wf.lastRun = Date.now();
    wf.runCount = (wf.runCount || 0) + 1;
    this._persist(wf);
    this._logEntry(wf, `▶ start (${reason})`, 'running');
    this._busEmit('automation.run.start', { id: wf.id, reason, ts: Date.now() });

    let i = 0;
    while (i < wf.steps.length) {
      const step = wf.steps[i];
      if (step.type === 'trigger') { i++; continue; } // real trigger check already happened in tick()/run() caller
      if (step.enabled === false) { this._logEntry(wf, `– ${step.type} step skipped (switched off)`, 'skipped'); i++; continue; }
      try {
        const result = await this._runStep(step, wf);
        this._logEntry(wf, `✓ ${step.label || step.type} step${result && result.note ? ` — ${result.note}` : ''}`, 'ok');
        if (result && result.nextStepId === 'stop') { this._logEntry(wf, '■ stopped by a condition', 'ok'); break; }
        if (result && result.nextStepId) {
          const ni = wf.steps.findIndex(s => s.id === result.nextStepId);
          i = ni >= 0 ? ni : i + 1;
        } else {
          i++;
        }
      } catch (e) {
        this._logEntry(wf, `✕ ${step.type} step: ${e.message}`, 'error');
        this._busEmit('automation.run.error', { id: wf.id, step: step.type, error: e.message, ts: Date.now() });
        return { ok: false, error: e.message };
      }
    }

    this._logEntry(wf, '✓ complete', 'ok');
    this._busEmit('automation.run.complete', { id: wf.id, ts: Date.now() });
    return { ok: true };
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

  async _runStep(step, wf) {
    const cfg = step.config || {};

    if (step.type === 'agent') {
      if (!cfg.agentKey || !cfg.prompt) throw new Error('agent step requires agentKey and prompt');
      // §0.39.265 — an agent step can name the account to send as
      this._enqueue({ agentKey: cfg.agentKey, prompt: cfg.prompt, ...(cfg.accountId ? { accountId: cfg.accountId } : {}) });
      return null;
    }

    // §0.39.265 — run a saved Clear Glass macro (the Macros page) in a window.
    if (step.type === 'macro') {
      if (!cfg.name) throw new Error('macro step requires a macro name');
      if (!this._runMacro) throw new Error('macro step: macros are not available here');
      const r = await this._runMacro({ name: cfg.name, agentId: cfg.agentId || 'default', params: cfg.params || {} });
      if (r && (r.error || r.ok === false)) throw new Error(`macro "${cfg.name}": ${r.error || 'failed'}`);
      return { note: `macro ${cfg.name}` };
    }

    // §0.39.265 — a desktop notification; {{workflow}} becomes the workflow's name.
    if (step.type === 'notify') {
      const fill = (t) => String(t || '').replace(/\{\{workflow\}\}/g, wf.name);
      const title = fill(cfg.title) || wf.name;
      if (this._notify) await this._notify({ title, body: fill(cfg.body) });
      this._busEmit('automation.notify', { workflowId: wf.id, title, body: fill(cfg.body), ts: Date.now() });
      return null;
    }

    if (step.type === 'delay') {
      const ms = Math.min(parseInt(cfg.ms, 10) || 1000, 300000); // capped at 5m, same cap as the uploaded reference's own delay step
      await new Promise(r => setTimeout(r, ms));
      return null;
    }

    // §BUILT — James: "condition... if/then." Real, read-only comparison
    // against live mesh data (see _resolveVar above) — no eval, no
    // arbitrary expression language, matching this file's own already-
    // stated "data, not code" discipline.
    if (step.type === 'condition') {
      const actual = this._resolveVar(cfg.var);
      const target = cfg.value;
      let passed = false;
      switch (cfg.op) {
        case '==': passed = String(actual) === String(target); break;
        case '!=': passed = String(actual) !== String(target); break;
        case '>':  passed = parseFloat(actual) > parseFloat(target); break;
        case '<':  passed = parseFloat(actual) < parseFloat(target); break;
        case '>=': passed = parseFloat(actual) >= parseFloat(target); break;
        case '<=': passed = parseFloat(actual) <= parseFloat(target); break;
        default: throw new Error(`unknown condition operator: "${cfg.op}"`);
      }
      this._busEmit('automation.condition.evaluated', { workflowId: wf.id, stepId: step.id, var: cfg.var, actual, op: cfg.op, target, passed, ts: Date.now() });
      return { nextStepId: passed ? (cfg.onTrue || 'next') : (cfg.onFalse || 'next') };
    }

    // §BUILT — James: "network calls... providers map to commands."
    // Real HTTP call against one of NEXUS's own real systems by name —
    // reuses each system's own real, already-listening port (guardian/
    // ollama/copilot/clear-glass) rather than a generic arbitrary-URL
    // fetch; a command step names a REAL system + its real endpoint,
    // the same GET /commands index each system already self-publishes
    // (guardian/lib/command-index-extract.js, ollama/lib/command-
    // index.js) is the real discovery source for what's callable here.
    if (step.type === 'command') {
      const port = SYSTEM_PORTS[cfg.system];
      if (!port) throw new Error(`command step: unknown system "${cfg.system}" (expected one of: ${Object.keys(SYSTEM_PORTS).join(', ')})`);
      const method = (cfg.method || 'GET').toUpperCase();
      const url = `http://127.0.0.1:${port}${cfg.endpoint || '/health'}`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'GET' || !cfg.body ? undefined : cfg.body,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`command step: ${cfg.system}${cfg.endpoint} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
      return null;
    }

    throw new Error(`unknown step type: "${step.type}" (known: trigger, agent, macro, delay, condition, command, notify)`);
  }

  // ── Per-step CRUD — the real Tasker-style step editor's backend ──────
  addStep(workflowId, step) {
    const wf = this.get(workflowId);
    if (!wf) return { ok: false, error: 'no such workflow' };
    const s = { id: randomUUID(), type: step.type, config: step.config || {}, ...(step.enabled === false ? { enabled: false } : {}), ...(step.label ? { label: step.label } : {}) };
    wf.steps.push(s);
    this._persist(wf);
    return { ok: true, workflow: wf, step: s };
  }

  updateStep(workflowId, stepId, patch) {
    const wf = this.get(workflowId);
    if (!wf) return { ok: false, error: 'no such workflow' };
    const s = wf.steps.find(st => st.id === stepId);
    if (!s) return { ok: false, error: 'no such step' };
    if (patch.type !== undefined) s.type = patch.type;
    if (patch.config !== undefined) s.config = patch.config;
    if (patch.enabled !== undefined) { if (patch.enabled) delete s.enabled; else s.enabled = false; }
    if (patch.label !== undefined) { if (patch.label) s.label = patch.label; else delete s.label; }
    if (s.type === 'trigger') delete wf._nextRun;
    this._persist(wf);
    return { ok: true, workflow: wf, step: s };
  }

  removeStep(workflowId, stepId) {
    const wf = this.get(workflowId);
    if (!wf) return { ok: false, error: 'no such workflow' };
    wf.steps = wf.steps.filter(s => s.id !== stepId);
    this._persist(wf);
    return { ok: true, workflow: wf };
  }

  moveStep(workflowId, stepId, dir) {
    const wf = this.get(workflowId);
    if (!wf) return { ok: false, error: 'no such workflow' };
    const i = wf.steps.findIndex(s => s.id === stepId);
    if (i === -1) return { ok: false, error: 'no such step' };
    const ni = i + (dir === 'up' ? -1 : 1);
    if (ni < 0 || ni >= wf.steps.length) return { ok: true, workflow: wf }; // real, honest no-op at either end
    [wf.steps[i], wf.steps[ni]] = [wf.steps[ni], wf.steps[i]];
    this._persist(wf);
    return { ok: true, workflow: wf };
  }
}

module.exports = { AutomationEngine, WORKFLOWS_DIR, TICK_MS, SYSTEM_PORTS, nextScheduled };
