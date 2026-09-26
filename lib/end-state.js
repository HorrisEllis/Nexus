'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// lib/end-state.js — declared goals an agent must actually reach
// UUID: nexus-end-state-v1-0000-2026-0818-001
// Version: 1.0.0
// Component: lib.end-state
// Hook: lib.end-state:v1:p0001
//
// James: "Giving each agent an end-state with conditions. So it has to improve
// until it can reach the end-state. If you can't solve the problem, innovate
// the solution." + "copy nexus to a compartment for the agents to use as a
// sandbox for learning?"
//
// This is the piece lib/agent-chat.js's iterate() was missing. It had a STOP
// condition (the gate passed) but no GOAL — nothing declared up front, so
// nothing to measure partial progress against and no way to say which of many
// attempts got closer.
//
// ── THE FAILURE MODE THIS IS SHAPED AROUND ──────────────────────────────────
//
// "Iterate until you reach the end-state" plus "if you can't solve it, innovate
// the solution" is, to an optimiser, an instruction to change what counts as
// solved. That is not cynicism about models; it is the most reliably observed
// behaviour of goal-directed loops. Given a condition it cannot meet and
// permission to innovate, the cheapest available innovation is always to
// reinterpret the condition.
//
// So the module draws one hard line:
//
//     CONDITIONS ARE FROZEN.  STRATEGY IS FREE.
//
// "Innovate the solution" is exactly right, and it means change the APPROACH —
// a different algorithm, a different decomposition, a different tool. It does
// not mean change the acceptance criteria. Conditions are Object.freeze'd at
// declaration, evaluated by evaluators the agent does not supply, and
// unamendable from inside a run. An agent CAN propose an amendment — a
// condition really can be wrong — but proposals go to a review queue and only a
// user accepts them (§IP-5, the same rule as the person-model's review surface
// and agent-chat's verification channel).
//
// ── THE SECOND FAILURE MODE ─────────────────────────────────────────────────
//
// "Improve until you reach it" is an unbounded loop wearing a justification.
// An unreachable end-state will consume every round available and report
// failure at the end, having learned nothing that the second round didn't
// already show. So progress is measured per round, and a run that stops
// improving is HALTED as stuck rather than allowed to spin — and "stuck" is
// reported as a distinct outcome from "failed", because they call for opposite
// responses. Failure means try harder. Stuck usually means the end-state is
// wrong, and that is information worth more than another twelve rounds.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const MODULE_ID = 'end-state';
const VERSION   = '1.0.0';
const COMP_ID   = 'lib.end-state';
const HOOK_ID   = 'lib.end-state:v1:p0001';

const OUTCOME = Object.freeze({
  REACHED:      'REACHED',       // every condition met
  FAILED:       'FAILED',        // rounds exhausted, still improving when it stopped
  STUCK:        'STUCK',         // no measurable progress — the goal is likely wrong
  UNVERIFIABLE: 'UNVERIFIABLE',  // an evaluator could not run; NEVER a pass
  ABANDONED:    'ABANDONED',     // halted by a caller or a guard
});

// A run that stops improving for this many consecutive rounds is stuck.
const STUCK_ROUNDS = +(process.env.END_STATE_STUCK_ROUNDS || 3);

// ── Declaring an end-state ───────────────────────────────────────────────────
/**
 * declare({ id, goal, conditions, sandbox }) — a frozen target.
 *
 * Each condition is { id, describe, evaluate } where evaluate(artifact, ctx)
 * returns { met:boolean, progress?:0..1, detail? }. `progress` is what makes
 * partial credit possible and is the only reason stuck-detection can work at
 * all — without it, every unmet condition looks identical round after round.
 */
function declare({ id = null, goal, conditions, sandbox = false, owner = 'user' }) {
  if (!goal) throw new Error(`[${MODULE_ID}] §1.1 an end-state needs a goal stated in words`);
  if (!Array.isArray(conditions) || !conditions.length) {
    throw new Error(`[${MODULE_ID}] §1.1 an end-state with no conditions is a wish, not a target — it can never be shown to be reached`);
  }
  for (const c of conditions) {
    if (!c || !c.id || typeof c.evaluate !== 'function') {
      throw new Error(`[${MODULE_ID}] §1.1 condition needs { id, evaluate } — a condition nothing can check is decoration`);
    }
    if (!c.describe) throw new Error(`[${MODULE_ID}] §1.1 condition '${c.id}' has no describe — an agent cannot aim at an unstated target`);
  }

  const state = {
    uuid: crypto.randomUUID(),
    id: id || `es-${Date.now()}`,
    goal, owner,
    declaredAt: Date.now(),
    sandbox: !!sandbox,
    // Frozen so a run cannot edit what counts as success from inside itself.
    conditions: Object.freeze(conditions.map(c => Object.freeze({ ...c }))),
  };
  return Object.freeze(state);
}

// ── Evaluating ───────────────────────────────────────────────────────────────
/**
 * evaluate(endState, artifact, ctx) — how far along is this artifact?
 *
 * Every condition is run, even after one fails: a caller needs the whole
 * picture to know whether an attempt improved. An evaluator that throws is
 * recorded as UNVERIFIABLE, never as unmet — "could not check" and "checked and
 * failed" are different facts, and collapsing them lets a broken evaluator
 * masquerade as an agent that keeps failing.
 */
function evaluate(endState, artifact, ctx = {}) {
  const results = [];
  let unverifiable = 0;

  for (const c of endState.conditions) {
    try {
      const r = c.evaluate(artifact, ctx) || {};
      const met = r.met === true;
      results.push({
        id: c.id, describe: c.describe, met,
        progress: typeof r.progress === 'number'
          ? Math.max(0, Math.min(1, r.progress))
          : (met ? 1 : 0),
        detail: r.detail || null, verifiable: true,
      });
    } catch (e) {
      unverifiable++;
      results.push({ id: c.id, describe: c.describe, met: false, progress: null,
        verifiable: false, error: e.message,
        note: 'evaluator threw — UNVERIFIABLE, not unmet. A broken check must not read as a failing agent.' });
    }
  }

  const checkable = results.filter(r => r.verifiable);
  const metCount  = checkable.filter(r => r.met).length;
  // Unverifiable conditions score 0 toward progress but are NOT counted as
  // checked — so a run where half the evaluators are broken cannot report 50%.
  const progress = checkable.length
    ? checkable.reduce((a, r) => a + (r.progress || 0), 0) / endState.conditions.length
    : 0;

  return {
    reached: unverifiable === 0 && metCount === endState.conditions.length,
    unverifiable, progress: +progress.toFixed(4),
    met: metCount, total: endState.conditions.length,
    conditions: results,
    unmet: results.filter(r => r.verifiable && !r.met).map(r => ({ id: r.id, describe: r.describe, detail: r.detail })),
    note: unverifiable
      ? `${unverifiable} condition(s) UNVERIFIABLE — this result cannot be a pass, whatever the others say`
      : null,
  };
}

// ── Pursuing ─────────────────────────────────────────────────────────────────
/**
 * pursue({ endState, attempt, maxRounds, onRound }) — iterate toward the goal.
 *
 * `attempt(feedback, round)` produces an artifact. The feedback it receives is
 * the SPECIFIC unmet conditions and the progress delta — never "try again", and
 * never the agent's own view of its work.
 *
 * Stops on: reached · stuck (no progress for STUCK_ROUNDS) · rounds exhausted ·
 * unverifiable. Every stop states which, because the right next move is
 * different for each and a single "failed" hides that entirely.
 */
async function pursue({ endState, attempt, maxRounds = 5, onRound = null, ctx = {} }) {
  if (!endState || !endState.conditions) throw new Error(`[${MODULE_ID}] pursue needs a declared end-state`);
  if (typeof attempt !== 'function') throw new Error(`[${MODULE_ID}] pursue needs an attempt(feedback, round) function`);

  const rounds = [];
  let best = { progress: -1, artifact: null, round: 0 };
  let noProgress = 0;
  let feedback = { round: 0, goal: endState.goal,
    conditions: endState.conditions.map(c => ({ id: c.id, describe: c.describe })),
    note: 'first attempt — all conditions are open' };

  for (let n = 1; n <= maxRounds; n++) {
    let artifact;
    try { artifact = await attempt(feedback, n); }
    catch (e) {
      rounds.push({ round: n, error: e.message, progress: null });
      return _finish(OUTCOME.ABANDONED, rounds, best, endState,
        `attempt threw on round ${n}: ${e.message}`);
    }

    const ev = evaluate(endState, artifact, ctx);
    const delta = +(ev.progress - Math.max(0, best.progress)).toFixed(4);
    rounds.push({ round: n, progress: ev.progress, delta, met: ev.met, total: ev.total,
                  unmet: ev.unmet, unverifiable: ev.unverifiable });
    if (onRound) { try { onRound({ round: n, artifact, evaluation: ev, delta }); } catch (_) {} }

    if (ev.unverifiable > 0) {
      return _finish(OUTCOME.UNVERIFIABLE, rounds, best, endState,
        `${ev.unverifiable} condition(s) could not be checked — halting rather than iterating toward a target that cannot be measured`);
    }

    if (ev.progress > best.progress) { best = { progress: ev.progress, artifact, round: n }; noProgress = 0; }
    else noProgress++;

    if (ev.reached) {
      best = { progress: ev.progress, artifact, round: n };
      return _finish(OUTCOME.REACHED, rounds, best, endState, `all ${ev.total} condition(s) met on round ${n}`);
    }

    if (noProgress >= STUCK_ROUNDS) {
      // The distinction that saves the most time. Rounds that do not move are
      // not effort, they are evidence about the goal.
      return _finish(OUTCOME.STUCK, rounds, best, endState,
        `no progress for ${noProgress} consecutive round(s), stalled at ${(best.progress * 100).toFixed(0)}%. ` +
        `Repeated identical failure usually means the end-state is wrong, not the agent. ` +
        `Stuck on: ${ev.unmet.map(u => u.id).join(', ')}`);
    }

    // Feedback = the specific gap, plus whether the last change helped. An agent
    // told only "not yet" cannot tell an improvement from a regression.
    feedback = {
      round: n + 1, goal: endState.goal,
      progress: ev.progress, delta,
      met: ev.conditions.filter(c => c.met).map(c => c.id),
      unmet: ev.unmet,
      direction: delta > 0 ? 'the last change IMPROVED things — continue in that direction'
               : delta < 0 ? 'the last change REGRESSED — revert that approach and try another'
               : 'the last change made NO measurable difference — a different approach is needed, not a refinement of that one',
      // Stated on every round, because the pressure to reinterpret grows with
      // each failure and this is exactly when it must be least available.
      constraint: 'You may change your APPROACH freely — a different algorithm, decomposition or tool. ' +
                  'You may NOT change what counts as success. The conditions are frozen. ' +
                  'If you believe a condition is genuinely wrong, say so explicitly and stop; ' +
                  'a human decides that, not this loop.',
    };
  }

  return _finish(OUTCOME.FAILED, rounds, best, endState,
    `${maxRounds} round(s) without reaching the goal, best ${(best.progress * 100).toFixed(0)}% on round ${best.round}. ` +
    `Still improving when it stopped — more rounds may genuinely help.`);
}

function _finish(outcome, rounds, best, endState, reason) {
  return {
    outcome, reached: outcome === OUTCOME.REACHED, reason,
    rounds, roundsUsed: rounds.length,
    bestProgress: Math.max(0, best.progress), bestRound: best.round, artifact: best.artifact,
    endState: { id: endState.id, goal: endState.goal },
    actionable: _actionable(outcome, best),
  };
}

function _actionable(outcome, best) {
  switch (outcome) {
    case OUTCOME.REACHED:      return null;
    case OUTCOME.STUCK:        return 'review the end-state before spending more rounds — a stalled run is evidence about the goal, not the agent';
    case OUTCOME.FAILED:       return best.progress > 0 ? 'progress was still being made; raising maxRounds is reasonable here' : 'zero progress across all rounds — check the conditions are reachable at all';
    case OUTCOME.UNVERIFIABLE: return 'fix the evaluators first; a target that cannot be measured cannot be pursued';
    default:                   return 'the attempt function itself failed — this is not an agent result';
  }
}

// ── Amendment: the only way a condition changes ──────────────────────────────
/**
 * proposeAmendment(endState, { conditionId, reason, by }) — an agent's route.
 *
 * A condition really can be wrong, and a loop with no way to say so just fails
 * for as long as you let it. But the agent that is failing a condition is the
 * least reliable judge of whether the condition is unfair, so this only ever
 * produces a PROPOSAL. amend() refuses any caller that is not a user (§IP-5).
 */
function proposeAmendment(endState, { conditionId, reason, by = 'agent' }) {
  if (!reason) throw new Error(`[${MODULE_ID}] §1.1 an amendment proposal requires a reason`);
  const c = endState.conditions.find(x => x.id === conditionId);
  if (!c) throw new Error(`[${MODULE_ID}] no condition '${conditionId}' on end-state '${endState.id}'`);
  return {
    uuid: crypto.randomUUID(), endStateId: endState.id, conditionId,
    reason, proposedBy: by, status: 'pending', ts: Date.now(),
    note: 'a proposal, not a change. The end-state is unmodified. Only a user may amend it.',
  };
}

/** amend(endState, proposal, { by }) — USER ONLY. Returns a NEW frozen end-state. */
function amend(endState, proposal, { by, replacement } = {}) {
  if (by !== 'user') {
    throw new Error(`[${MODULE_ID}] §IP-5 REFUSED — only a user may change what counts as success. ` +
      `An agent that can amend its own acceptance criteria has no acceptance criteria.`);
  }
  if (!replacement || typeof replacement.evaluate !== 'function') {
    throw new Error(`[${MODULE_ID}] amend requires a replacement condition with an evaluate()`);
  }
  return declare({
    id: `${endState.id}+amended`, goal: endState.goal, sandbox: endState.sandbox, owner: endState.owner,
    conditions: endState.conditions.map(c => c.id === proposal.conditionId ? replacement : c),
  });
}

// ── Sandbox ──────────────────────────────────────────────────────────────────
/**
 * sandbox({ id }) — an isolated NEXUS state for an agent to learn in.
 *
 * NOT a copy of the tree. The code is shared read-only on purpose: a copied
 * tree drifts from production within a day and then the agent is learning
 * against a system that no longer exists. What has to be isolated is STATE —
 * the JAA store and the ledger — and that is now possible because
 * cortex/memory/jaa-db.js honours JAA_DATA_DIR as of 2026-08-18 (before that it
 * was hardcoded, which is why this could not be built).
 *
 * seed:true copies the current store in, so the agent learns against real
 * shapes rather than an empty world. Nothing it does propagates back.
 */
function sandbox({ id = null, seed = false, from = null } = {}) {
  const sid = id || `sbx-${crypto.randomUUID().slice(0, 8)}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `nexus-${sid}-`));
  const source = from || path.join(__dirname, '..', 'data', 'cortex', 'memory');

  let seeded = 0, seedError = null;
  if (seed) {
    try {
      for (const f of fs.readdirSync(source)) {
        if (!f.endsWith('.json')) continue;
        fs.copyFileSync(path.join(source, f), path.join(dir, f));
        seeded++;
      }
    } catch (e) {
      // §1.2 — an unseeded sandbox is still usable, but the caller must know it
      // is empty by accident rather than by design.
      seedError = e.message;
    }
  }

  return {
    id: sid, dir, seeded, seedError,
    env: { JAA_DATA_DIR: dir },
    /** Run fn with the store pointed at the sandbox; always restored. */
    async run(fn) {
      const prev = process.env.JAA_DATA_DIR;
      process.env.JAA_DATA_DIR = dir;
      // The module caches its store at first require, so a live process must
      // drop it or it will keep writing to wherever it first resolved.
      const key = require.resolve('../cortex/memory/jaa-db');
      delete require.cache[key];
      try { return await fn(require('../cortex/memory/jaa-db')); }
      finally {
        if (prev) process.env.JAA_DATA_DIR = prev; else delete process.env.JAA_DATA_DIR;
        delete require.cache[key];
      }
    },
    destroy() { try { fs.rmSync(dir, { recursive: true, force: true }); return true; } catch (_) { return false; } },
    note: seedError
      ? `sandbox created but NOT seeded (${seedError}) — it is empty by accident, not by design`
      : `isolated store at ${dir}${seed ? ` — seeded with ${seeded} table(s)` : ' — empty'}`,
  };
}

module.exports = { declare, evaluate, pursue, proposeAmendment, amend, sandbox,
  OUTCOME, STUCK_ROUNDS, MODULE_ID, VERSION, COMP_ID, HOOK_ID };
