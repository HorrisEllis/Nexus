// ═══════════════════════════════════════════════════
// NEXUS — Automation Variable Resolver
// automation/variable-resolver.js
//
// Resolves {{template.vars}} in automation step
// payloads against the system variable namespace.
//
// SYSTEM NAMESPACE (spec §7):
//   {{system.wall}}                  current timestamp ms
//   {{system.tick}}                  current kernel tick
//   {{agent.<id>.status}}            live from agent registry
//   {{agent.<id>.gatePassRate}}      from agent_signatures
//   {{agent.<id>.hallucinationRate}}
//   {{jaa.gaps.openCount}}           from JaaDB
//   {{jaa.failures.unresolvedCount}}
//   {{schedule.lastRunAt}}           from run context
//   {{step-<id>.result}}             from step results map
//   {{step-<id>.status}}
//   {{trigger.payload.*}}            from triggering event
//   {{memory.ring.tail(10)}}         last N ring events
//   {{memory.failures.recent(5)}}    N most recent open failures
//   {{crystalball.crystals.count}}
//   {{crystalball.bep.topPatterns(3)}}
//
// RESOLUTION ORDER:
//   1. Run-context variables (trigger, step results)
//   2. Live system variables (wall, tick, agent.*)
//   3. JaaDB queries (jaa.*, memory.*)
//   4. CrystalBall (crystalball.*)
//
// ZERO EXTERNAL DEPENDENCIES.
// ═══════════════════════════════════════════════════

'use strict';

const TEMPLATE_RE = /\{\{([^}]+)\}\}/g;

class VariableResolver {
  constructor({ jaaDB, nexusKernel, agentMemory, crystalball }) {
    this._jaa = jaaDB;
    this._nk  = nexusKernel;
    this._ase = agentMemory;
    this._cb  = crystalball;
  }

  // ── Resolve all {{...}} in an object (deep) ───────
  async resolveObject(obj, ctx) {
    if (typeof obj === 'string') return this.resolveString(obj, ctx);
    if (Array.isArray(obj))     return Promise.all(obj.map(v => this.resolveObject(v, ctx)));
    if (obj && typeof obj === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        out[k] = await this.resolveObject(v, ctx);
      }
      return out;
    }
    return obj;
  }

  // ── Resolve all {{...}} in a string ──────────────
  async resolveString(str, ctx) {
    if (typeof str !== 'string' || !str.includes('{{')) return str;

    // Collect all template vars in one pass
    const matches = [...str.matchAll(TEMPLATE_RE)];
    if (!matches.length) return str;

    // Resolve each in parallel
    const resolved = await Promise.all(
      matches.map(([, path]) => this._resolvePath(path.trim(), ctx))
    );

    // Substitute
    let result = str;
    matches.forEach(([full], i) => {
      const val = resolved[i];
      result = result.replace(full, val == null ? '' : String(val));
    });
    return result;
  }

  // ── Build the evaluation context for condition-evaluator ──
  async buildEvalContext(ctx) {
    const wall   = Date.now();
    const tick   = this._nk.ring.length;

    // Flatten step results into context
    const stepCtx = {};
    for (const [id, result] of Object.entries(ctx.stepResults ?? {})) {
      // key: step_s1 → { result, status }
      stepCtx[`step_${id.replace(/-/g, '_')}`] = result;
    }

    return {
      trigger: ctx.trigger ?? {},
      system:  { wall, tick },
      schedule: { lastRunAt: ctx.lastRunAt ?? null },
      ...stepCtx,
    };
  }

  // ── Path resolver ─────────────────────────────────
  async _resolvePath(path, ctx) {
    const parts = path.split('.');

    // trigger.* — from triggering event
    if (parts[0] === 'trigger') {
      return dotGet(ctx.trigger ?? {}, parts.slice(1));
    }

    // step-<id>.* — from step results
    if (parts[0].startsWith('step-') || parts[0].startsWith('step_')) {
      const stepId = parts[0].replace(/^step[-_]/, '').replace(/_/g, '-');
      const result = ctx.stepResults?.[`s${stepId}`] ?? ctx.stepResults?.[stepId] ?? {};
      return dotGet(result, parts.slice(1));
    }

    // system.*
    if (parts[0] === 'system') {
      const sub = parts[1];
      if (sub === 'wall') return Date.now();
      if (sub === 'tick') return this._nk.ring.length;
      return undefined;
    }

    // schedule.*
    if (parts[0] === 'schedule') {
      return dotGet(ctx.schedule ?? {}, parts.slice(1));
    }

    // agent.<id>.*
    if (parts[0] === 'agent' && parts.length >= 3) {
      const agentId = parts[1];
      const axis    = parts[2];
      const sig     = this._ase?.signature(agentId);
      if (!sig) return undefined;
      // status → live from agent registry
      if (axis === 'status') {
        const agents = require('../agents');
        return agents.AGENTS?.[agentId]?.status ?? 'unknown';
      }
      return sig.core[axis] ?? undefined;
    }

    // jaa.gaps.openCount
    if (parts[0] === 'jaa' && parts[1] === 'gaps' && parts[2] === 'openCount') {
      return this._jaa.query('gaps', r => r.status === 'open').then(r => r.length);
    }

    // jaa.failures.unresolvedCount
    if (parts[0] === 'jaa' && parts[1] === 'failures' && parts[2] === 'unresolvedCount') {
      return this._jaa.query('fix_map', r => r.status === 'open').then(r => r.length);
    }

    // memory.ring.tail(N)
    if (parts[0] === 'memory' && parts[1] === 'ring') {
      const n = extractN(parts[2], 10);
      return this._nk.snapshot(n);
    }

    // memory.failures.recent(N)
    if (parts[0] === 'memory' && parts[1] === 'failures') {
      const n = extractN(parts[2], 5);
      return this._jaa.query('fix_map', r => r.status === 'open', n);
    }

    // crystalball.crystals.count
    if (parts[0] === 'crystalball' && parts[1] === 'crystals' && parts[2] === 'count') {
      return this._cb?.mcl?.crystalCount ?? 0;
    }

    // crystalball.bep.topPatterns(N)
    if (parts[0] === 'crystalball' && parts[1] === 'bep') {
      const n = extractN(parts[2], 3);
      return this._cb?.bep?.topPatterns?.slice(0, n) ?? [];
    }

    return undefined;
  }
}

// ── Utilities ──────────────────────────────────────
function dotGet(obj, parts) {
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function extractN(segment, def) {
  if (!segment) return def;
  const m = segment.match(/\((\d+)\)/);
  return m ? parseInt(m[1], 10) : def;
}

module.exports = { VariableResolver };
