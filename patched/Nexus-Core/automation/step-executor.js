// ═══════════════════════════════════════════════════
// NEXUS — Automation Step Executor
// automation/step-executor.js
//
// Executes a single workflow step.
// All 9 step types (spec §7):
//   emit · agent_call · loop · condition
//   store · memory · delay · notify · cli
//
// Each executor is a pure function:
//   (step, ctx) → { status, result, error? }
//
// RETRY: agent_call steps support maxRetries.
// TIMEOUT: all steps have configurable ms timeout.
// RESULT CAPTURE: every result stored in
//   ctx.stepResults[step.id] for {{step-<id>.result}}
//
// ZERO EXTERNAL DEPENDENCIES.
// ═══════════════════════════════════════════════════

'use strict';

const { evaluateSafe } = require('./condition-evaluator');

const DEFAULT_TIMEOUT = 60_000; // 1 minute

class StepExecutor {
  constructor({ nexusKernel, jaaDB, variableResolver, agentMemory }) {
    this._nk  = nexusKernel;
    this._jaa = jaaDB;
    this._vr  = variableResolver;
    this._ase = agentMemory;
  }

  // ── Execute a single step ─────────────────────────
  async execute(step, ctx) {
    const timeoutMs = step.timeout ?? DEFAULT_TIMEOUT;
    const t0        = Date.now();

    this._nk.emit('automation.step.started', {
      stepId:     step.id,
      type:       step.type,
      workflowId: ctx.workflowId,
    });

    let result;
    try {
      result = await Promise.race([
        this._dispatch(step, ctx),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error(`Step ${step.id} timeout after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);

      ctx.stepResults[step.id] = { result, status: 'pass', latencyMs: Date.now() - t0 };

      this._nk.emit('automation.step.passed', {
        stepId:     step.id,
        type:       step.type,
        latencyMs:  Date.now() - t0,
        workflowId: ctx.workflowId,
      });

      return { status: 'pass', result };

    } catch (err) {
      ctx.stepResults[step.id] = { error: err.message, status: 'fail', latencyMs: Date.now() - t0 };

      this._nk.emit('automation.step.failed', {
        stepId:     step.id,
        type:       step.type,
        error:      err.message,
        latencyMs:  Date.now() - t0,
        workflowId: ctx.workflowId,
      });

      return { status: 'fail', error: err.message };
    }
  }

  async _dispatch(step, ctx) {
    const resolved = await this._vr.resolveObject(step.payload ?? {}, ctx);

    switch (step.type) {

      // ── emit: kernel.emit + optional waitFor ─────
      case 'emit': {
        const channel = step.channel ?? resolved.channel;
        if (!channel) throw new Error('emit step missing channel');
        const ev = this._nk.emit(channel, resolved, { causedBy: ctx.triggerEventId });

        if (step.waitFor) {
          await this._waitForEvent(step.waitFor, step.waitTimeout ?? 30_000);
        }
        return { emitted: channel, eventId: ev.id };
      }

      // ── agent_call: build ContextPacket → RAID → agent ──
      case 'agent_call': {
        const { agentId, mode, maxRetries = 0 } = step;
        let lastErr;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const { raid }    = require('../core/raid');
            const { getAgent } = require('../agents');
            const decision    = await raid.decide({
              type:   mode ?? 'code',
              tokens: step.tokens ?? 2000,
              context: { agentId, resolved },
            });
            const agent  = getAgent(decision.agent);
            const prompt = step.prompt
              ? await this._vr.resolveString(step.prompt, ctx)
              : JSON.stringify(resolved);
            const content = await agent.complete({
              prompt,
              temperature: step.temperature ?? 0,
              taskType:    mode,
            });
            return { content, agentId: decision.agent, attempt };
          } catch (e) {
            lastErr = e;
            if (attempt < maxRetries) {
              // Exponential backoff: 1s, 2s, 4s …
              await delay(Math.min(1000 * 2 ** attempt, 8000));
            }
          }
        }
        throw lastErr;
      }

      // ── loop: iterate array, run nested steps ────
      case 'loop': {
        const { over, as, steps: loopSteps } = step;
        const arr = await this._vr._resolvePath(over, ctx);
        if (!Array.isArray(arr)) throw new Error(`loop.over '${over}' is not an array`);
        const results = [];
        for (const item of arr) {
          const loopCtx = { ...ctx, stepResults: { ...ctx.stepResults, [as ?? 'item']: item } };
          for (const sub of (loopSteps ?? [])) {
            const r = await this.execute(sub, loopCtx);
            if (r.status === 'fail' && !step.continueOnFail) throw new Error(r.error);
          }
          results.push(loopCtx.stepResults);
        }
        return { looped: arr.length, results };
      }

      // ── condition: branch to onTrue / onFalse ───
      case 'condition': {
        const evalCtx = await this._vr.buildEvalContext(ctx);
        const check   = await this._vr.resolveString(step.check ?? 'false', ctx);
        const branch  = evaluateSafe(check, evalCtx) ? step.onTrue : step.onFalse;
        if (!branch) return { check, branch: null };
        const r = await this.execute({ ...branch, id: `${step.id}-branch` }, ctx);
        return { check, branch: evaluateSafe(check, evalCtx) ? 'true' : 'false', result: r };
      }

      // ── store: write record to JaaDB ─────────────
      case 'store': {
        const { table } = step;
        if (!table) throw new Error('store step missing table');
        const { uid } = require('../memory/jaa-db');
        const record  = { uuid: uid(), ...resolved, _automationStep: step.id, wall: Date.now() };
        await this._jaa.insert(table, record);
        return { table, uuid: record.uuid };
      }

      // ── memory: run MQL query ─────────────────────
      case 'memory': {
        const { query } = resolved;
        if (!query) throw new Error('memory step missing query');
        // Emit recall request and wait for response
        const result = await new Promise((resolve, rej) => {
          const reqEv = this._nk.emit('crystalball.memory.recall', {
            query,
            sessionId: ctx.sessionId,
          });
          const timeout = setTimeout(() => rej(new Error('memory recall timeout')), 15_000);
          this._nk.on('crystalball.memory.recall.result', e => {
            if (e.payload.queryId === reqEv.id) {
              clearTimeout(timeout);
              resolve(e.payload);
            }
          });
        });
        return result;
      }

      // ── delay: wait N ms ──────────────────────────
      case 'delay': {
        const ms = resolved.ms ?? step.ms ?? 1000;
        await delay(ms);
        return { delayed: ms };
      }

      // ── notify: broadcast to admin bridge ────────
      case 'notify': {
        this._nk.emit('automation.notify', {
          message:    resolved.message ?? '',
          level:      resolved.level   ?? 'info',
          workflowId: ctx.workflowId,
          stepId:     step.id,
        });
        return { notified: true };
      }

      // ── cli: emit CLI event ───────────────────────
      case 'cli': {
        const cmd = resolved.command ?? step.command;
        if (!cmd) throw new Error('cli step missing command');
        this._nk.emit('cli.command', { command: cmd, args: resolved.args ?? [], source: 'automation' });
        return { command: cmd };
      }

      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  // ── Wait for a specific bus event ─────────────────
  _waitForEvent(channel, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`waitFor '${channel}' timed out`)), timeout);
      this._nk.on(channel, (ev) => {
        clearTimeout(timer);
        resolve(ev);
      });
    });
  }
}

const delay = ms => new Promise(r => setTimeout(r, ms));

module.exports = { StepExecutor };
