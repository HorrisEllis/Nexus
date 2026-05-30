// ═══════════════════════════════════════════════════
// NEXUS — Automation Engine
// automation/engine.js
//
// Scheduler + workflow runner for all 6 trigger types.
//
// TRIGGERS (spec §7):
//   cron        — standard 5-field cron expression
//   interval    — every N ms with drift correction
//   event       — bus channel subscription + filter
//   condition   — polling at checkEvery ms, leading edge
//   chain       — fires after another schedule completes
//   manual      — trigger only via CLI or admin UI
//
// DESIGN:
//   No cron library. Cron is parsed via a hand-rolled
//   field matcher (6 fields max, ranges, step syntax).
//   Drift correction: interval tracks wall clock,
//   subtracts execution time from next sleep.
//
//   Workflows persist runs to JaaDB 'workflow_runs'
//   and 'schedules'. Every trigger is a bus event —
//   the admin UI subscribes and shows live status.
//
// ZERO EXTERNAL DEPENDENCIES.
// ═══════════════════════════════════════════════════

'use strict';

const { uid }           = require('../memory/jaa-db');
const { evaluateSafe }  = require('./condition-evaluator');
const { VariableResolver } = require('./variable-resolver');
const { StepExecutor }  = require('./step-executor');

// ══════════════════════════════════════════════════
// Cron parser (5-field: min hour dom month dow)
// ══════════════════════════════════════════════════
function parseCronField(field, min, max) {
  if (field === '*') return null; // matches all
  const values = new Set();
  for (const part of field.split(',')) {
    if (part.includes('/')) {
      const [range, step] = part.split('/');
      const s = parseInt(step, 10);
      const [lo, hi] = range === '*'
        ? [min, max]
        : range.split('-').map(Number);
      for (let i = lo; i <= hi; i += s) values.add(i);
    } else if (part.includes('-')) {
      const [lo, hi] = part.split('-').map(Number);
      for (let i = lo; i <= hi; i++) values.add(i);
    } else {
      values.add(parseInt(part, 10));
    }
  }
  return values;
}

function parseCron(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) throw new Error(`Invalid cron: '${expr}'`);
  return {
    min:   parseCronField(parts[0], 0, 59),
    hour:  parseCronField(parts[1], 0, 23),
    dom:   parseCronField(parts[2], 1, 31),
    month: parseCronField(parts[3], 1, 12),
    dow:   parseCronField(parts[4], 0, 6),
  };
}

function cronMatches(cron, d) {
  const matches = (set, val) => set === null || set.has(val);
  return matches(cron.min,   d.getMinutes())
      && matches(cron.hour,  d.getHours())
      && matches(cron.dom,   d.getDate())
      && matches(cron.month, d.getMonth() + 1)
      && matches(cron.dow,   d.getDay());
}

// ── Next cron fire (brute-force minute scan, max 1yr) ─
function nextCronFire(expr) {
  const cron = parseCron(expr);
  const now  = new Date();
  const d    = new Date(now);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1); // start next minute
  const limit = new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000);
  while (d < limit) {
    if (cronMatches(cron, d)) return d.getTime();
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}

// ══════════════════════════════════════════════════
// Schedule record
// ══════════════════════════════════════════════════
class Schedule {
  constructor(def, workflowDef) {
    this.uuid        = def.uuid ?? uid();
    this.name        = def.name ?? workflowDef.name ?? 'unnamed';
    this.trigger     = workflowDef.trigger;
    this.steps       = workflowDef.steps ?? [];
    this.enabled     = def.enabled !== false;
    this.lastRunAt   = def.lastRunAt   ?? null;
    this.lastStatus  = def.lastStatus  ?? null;
    this.runCount    = def.runCount    ?? 0;
    this._timer      = null;
    this._cleanup    = null;
  }
}

// ══════════════════════════════════════════════════
// AutomationEngine
// ══════════════════════════════════════════════════
class AutomationEngine {
  constructor({ jaaDB, nexusKernel, agentMemory, crystalball }) {
    this._jaa       = jaaDB;
    this._nk        = nexusKernel;
    this._schedules = new Map(); // uuid → Schedule
    this._running   = new Map(); // uuid → Promise
    this._vr        = new VariableResolver({ jaaDB, nexusKernel, agentMemory, crystalball });
    this._sx        = new StepExecutor({ nexusKernel, jaaDB, variableResolver: this._vr, agentMemory });
  }

  // ── Lifecycle ─────────────────────────────────────
  attach() {
    // Reload schedules from JaaDB on boot
    this._jaa.query('schedules', () => true).then(rows => {
      for (const row of rows) {
        if (row.enabled && row.trigger && row.steps) {
          this.register(row, { name: row.name, trigger: row.trigger, steps: row.steps });
        }
      }
    }).catch(e => this._nk.emit('automation.jaa.read.error', { op: 'schedules.load', error: e.message }));

    // CLI / admin trigger
    this._nk.on('automation.trigger.manual', e => {
      const sched = this._schedules.get(e.payload.uuid);
      if (sched) this._run(sched, { trigger: e, manual: true });
    });

    this._nk.on('automation.schedule.enable',  e => this._setEnabled(e.payload.uuid, true));
    this._nk.on('automation.schedule.disable', e => this._setEnabled(e.payload.uuid, false));
    this._nk.on('automation.schedule.delete',  e => this.unregister(e.payload.uuid));

    this._nk.emit('automation.ready', {
      schedules: this._schedules.size,
    });
  }

  // ── Register a workflow definition ───────────────
  register(def, workflowDef) {
    const sched = new Schedule(def, workflowDef);
    this._schedules.set(sched.uuid, sched);

    if (sched.enabled) this._arm(sched);

    this._jaa.insert('schedules', {
      uuid:        sched.uuid,
      name:        sched.name,
      trigger:     sched.trigger,
      steps:       sched.steps,
      enabled:     sched.enabled,
      runCount:    sched.runCount,
      lastRunAt:   sched.lastRunAt,
      lastStatus:  sched.lastStatus,
    }).catch(e => this._nk.emit('automation.jaa.write.error', { op: 'schedule.register', uuid: sched.uuid, error: e.message }));

    this._nk.emit('automation.schedule.registered', {
      uuid: sched.uuid,
      name: sched.name,
      type: sched.trigger?.type,
    });

    return sched.uuid;
  }

  unregister(uuid) {
    const sched = this._schedules.get(uuid);
    if (!sched) return;
    this._disarm(sched);
    this._schedules.delete(uuid);
    this._nk.emit('automation.schedule.deleted', { uuid });
  }

  // ── Arm: set up trigger ───────────────────────────
  _arm(sched) {
    const t = sched.trigger;
    if (!t) return;

    switch (t.type) {

      case 'cron': {
        const tick = () => {
          const nextMs = nextCronFire(t.expression);
          if (!nextMs) return;
          const waitMs = nextMs - Date.now();
          sched._timer = setTimeout(async () => {
            await this._run(sched, { trigger: null });
            tick(); // re-arm for next fire
          }, Math.max(0, waitMs));
        };
        tick();
        break;
      }

      case 'interval': {
        let lastFire = Date.now();
        const fire = async () => {
          const elapsed = Date.now() - lastFire;
          await this._run(sched, { trigger: null });
          lastFire = Date.now();
          // Drift correction: subtract execution time
          const drift = Date.now() - lastFire;
          sched._timer = setTimeout(fire, Math.max(0, (t.every ?? 60000) - drift));
        };
        sched._timer = setTimeout(fire, t.every ?? 60000);
        break;
      }

      case 'event': {
        const handler = async (ev) => {
          if (t.filter) {
            // Build eval context from event
            const evalCtx = { trigger: ev, trigger_payload: ev.payload ?? {} };
            // Normalise: "payload.severity === 'high'" → evalCtx.payload.*
            const augCtx  = { ...evalCtx, payload: ev.payload ?? {} };
            if (!evaluateSafe(t.filter, augCtx)) return;
          }
          await this._run(sched, { trigger: ev });
        };
        this._nk.on(t.channel, handler);
        sched._cleanup = () => {}; // nk.on doesn't expose off() — rely on engine teardown
        break;
      }

      case 'condition': {
        const poll = async () => {
          let lastValue = false;
          const check = async () => {
            const evalCtx = await this._vr.buildEvalContext({ stepResults: {}, schedule: sched });
            const current = evaluateSafe(t.check, evalCtx);
            // Leading edge only: false → true
            if (current && !lastValue) {
              await this._run(sched, { trigger: null });
            }
            lastValue = current;
            sched._timer = setTimeout(check, t.checkEvery ?? 5000);
          };
          await check();
        };
        poll();
        break;
      }

      case 'chain': {
        const target = t.after; // uuid of schedule to watch
        this._nk.on('automation.workflow.complete', async (ev) => {
          if (ev.payload.uuid !== target) return;
          const statusMatch =
            (!t.onStatus) ||
            (Array.isArray(t.onStatus) ? t.onStatus.includes(ev.payload.status) : t.onStatus === ev.payload.status);
          if (statusMatch) await this._run(sched, { trigger: ev });
        });
        break;
      }

      case 'manual':
        break; // armed only via automation.trigger.manual event
    }
  }

  _disarm(sched) {
    clearTimeout(sched._timer);
    sched._timer = null;
    sched._cleanup?.();
  }

  // ── Run workflow ──────────────────────────────────
  async _run(sched, { trigger, manual = false } = {}) {
    if (!sched.enabled) return;

    const runId = uid();
    const t0    = Date.now();

    this._nk.emit('automation.workflow.started', {
      runId,
      uuid:     sched.uuid,
      name:     sched.name,
      manual,
    });

    const ctx = {
      workflowId:     sched.uuid,
      runId,
      trigger:        trigger ?? {},
      triggerEventId: trigger?.id ?? null,
      stepResults:    {},
      lastRunAt:      sched.lastRunAt,
      sessionId:      runId,
      schedule:       sched,
    };

    let status = 'pass';
    try {
      for (const step of sched.steps) {
        // Skip disabled steps
        if (step.skip) continue;

        const result = await this._sx.execute(step, ctx);

        if (result.status === 'fail' && !step.continueOnFail) {
          status = 'fail';
          break;
        }
      }
    } catch (err) {
      status = 'error';
      this._nk.emit('automation.workflow.error', {
        runId, uuid: sched.uuid, error: err.message,
      });
    }

    const latencyMs = Date.now() - t0;
    sched.runCount++;
    sched.lastRunAt  = Date.now();
    sched.lastStatus = status;

    await this._jaa.insert('workflow_runs', {
      uuid:      runId,
      scheduleUuid: sched.uuid,
      name:      sched.name,
      status,
      latencyMs,
      stepResults: ctx.stepResults,
      triggerType: sched.trigger?.type,
      wall:      Date.now(),
    }).catch(e => this._nk.emit('automation.jaa.write.error', { op: 'run.log', runId, error: e.message }));

    // Update persisted schedule
    await this._jaa.update('schedules', sched.uuid, {
      runCount:   sched.runCount,
      lastRunAt:  sched.lastRunAt,
      lastStatus: sched.lastStatus,
    }).catch(e => this._nk.emit('automation.jaa.write.error', { op: 'schedule.update', uuid: sched.uuid, error: e.message }));

    this._nk.emit('automation.workflow.complete', {
      runId, uuid: sched.uuid, name: sched.name, status, latencyMs,
    });

    return { runId, status, latencyMs };
  }

  _setEnabled(uuid, enabled) {
    const sched = this._schedules.get(uuid);
    if (!sched) return;
    sched.enabled = enabled;
    if (enabled) this._arm(sched);
    else this._disarm(sched);
    this._jaa.update('schedules', uuid, { enabled }).catch(e => this._nk.emit('automation.jaa.write.error', { op: 'schedule.toggle', uuid, error: e.message }));
    this._nk.emit('automation.schedule.toggled', { uuid, enabled });
  }

  // ── Admin / CLI accessors ──────────────────────────
  get scheduleList() {
    return [...this._schedules.values()].map(s => ({
      uuid:       s.uuid,
      name:       s.name,
      trigger:    s.trigger,
      enabled:    s.enabled,
      runCount:   s.runCount,
      lastRunAt:  s.lastRunAt,
      lastStatus: s.lastStatus,
      stepCount:  s.steps.length,
    }));
  }

  async runHistory(limit = 20) {
    return this._jaa.query('workflow_runs', () => true, limit);
  }
}

module.exports = { AutomationEngine, parseCron, cronMatches, nextCronFire };
