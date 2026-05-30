// ═══════════════════════════════════════════════════
// NEXUS — Healer
// healer/index.js
//
// gap.found → fix spec → manifest.ready (loops back)
// Recursive, bounded by maxDepth.
// Exhaustion detection prevents infinite loops.
// Escalator surfaces to human when all options fail.
// ═══════════════════════════════════════════════════

'use strict';

const { kernel }    = require('../foundation/kernel');
const { raid }      = require('../core/raid');
const { getAgent }  = require('../agents');

const MAX_DEPTH = 5; // spec-defined

class Healer {
  constructor() {
    this._active  = new Map();  // gapId → { depth, attempts, lastFix }
    this._history = [];

    // Subscribe to gap.found — this is the healer's trigger
    kernel.on('gap.found', e => this._onGap(e));
  }

  async _onGap(gapEvent) {
    const gap = gapEvent.payload;
    const id  = `${gap.path}::${gap.type}`;

    // Check if already handling this gap
    const state = this._active.get(id) || { depth: 0, attempts: 0 };
    if (state.depth >= MAX_DEPTH) {
      kernel.emit('healer.exhausted', {
        gapId:   id,
        gap,
        depth:   state.depth,
        message: `Healer exhausted after ${MAX_DEPTH} attempts — escalating to human`,
      }, { causedBy: gapEvent.id });
      this._escalate(gap, state);
      return;
    }

    this._active.set(id, { ...state, depth: state.depth + 1, attempts: state.attempts + 1 });
    kernel.emit('healer.started', {
      gapId: id,
      gap,
      depth: state.depth + 1,
      maxDepth: MAX_DEPTH,
    }, { causedBy: gapEvent.id });

    try {
      await this._heal(gap, gapEvent.id, state.depth + 1);
      this._active.delete(id);

      this._history.push({ id, gap, success: true, depth: state.depth + 1, ts: Date.now() });
      kernel.emit('healer.resolved', { gapId: id, gap, depth: state.depth + 1 }, { causedBy: gapEvent.id });

    } catch (e) {
      this._history.push({ id, gap, success: false, error: e.message, ts: Date.now() });
      kernel.emit('healer.failed', { gapId: id, error: e.message }, { causedBy: gapEvent.id });
    }
  }

  async _heal(gap, parentEventId, depth) {
    // Build repair task
    const repairTask = buildRepairTask(gap);

    kernel.emit('healer.fix-spec.generating', {
      gap,
      repairTask,
      depth,
    }, { causedBy: parentEventId });

    // Route to best agent for fix
    const decision = await raid.decide({
      type:    gap.severity === 'high' ? 'code' : 'quick_fix',
      tokens:  800,
      context: { gap, repairTask },
      _eventId: parentEventId,
    });

    const agent  = getAgent(decision.agent);
    const prompt = buildHealerPrompt(gap, repairTask);
    const fix    = await agent.complete({ prompt, temperature: 0.1, taskType: 'healer' });

    if (!fix || fix.trim().length < 10) {
      throw new Error(`Healer got empty fix from ${decision.agent}`);
    }

    // Emit fix as a spec patch event — manifist generator picks this up
    kernel.emit('healer.fix.ready', {
      gap,
      fix,
      agent: decision.agent,
      depth,
    }, { causedBy: parentEventId });

    // Trigger manifest re-generation with fix context
    // This creates the manifest.ready → loop back event
    kernel.emit('manifest.patch.requested', {
      gap,
      fix,
      depth,
    }, { causedBy: parentEventId });
  }

  _escalate(gap, state) {
    this._active.delete(`${gap.path}::${gap.type}`);
    kernel.emit('healer.escalated', {
      gap,
      attempts: state.attempts,
      message:  'Human intervention required',
      severity: gap.severity,
    });
    // In admin UI: this appears as a frozen red node
    // requiring manual reroute or spec edit
  }

  get history()  { return this._history; }
  get active()   { return Object.fromEntries(this._active); }
  get activeCount() { return this._active.size; }
}

function buildRepairTask(gap) {
  const actions = {
    missing: `Create the missing ${gap.path}. Provide a complete, minimal implementation.`,
    broken:  `Fix the broken reference at ${gap.path}. ${gap.body}`,
    shadow:  `Reconcile shadow field at ${gap.path}. Add to schema or remove from payload.`,
    weak:    `Strengthen the weak assumption at ${gap.path}. Add validation, types, or explicit constraint.`,
  };
  return actions[gap.type] || `Fix gap at ${gap.path}: ${gap.body}`;
}

function buildHealerPrompt(gap, repairTask) {
  return `You are NEXUS healer. Fix this structural gap in the build pipeline.

Gap type: ${gap.type}
Path: ${gap.path}
Description: ${gap.body}
Severity: ${gap.severity || 'unknown'}

Task: ${repairTask}

Output: the minimal fix needed. If code, output only the code block. If schema patch, output only the JSON patch. No explanation.`;
}

const healer = new Healer();
module.exports = { Healer, healer };
