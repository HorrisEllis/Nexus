'use strict';
/**
 * lib/emergence.js — minimal conditions for an acceptable artifact:
 * axioms (must hold) + end-state (the goal), iteratively attempted,
 * verified for real, and if the same method keeps failing, the method
 * itself is what gets asked to change — not just the next guess.
 * comp_id: nexus.lib.emergence
 * UUID: nexus-emergence-v1-0000-2026-0813-001
 * Version: 1.0.0
 *
 * WHY (James, 2026-08-13): "using cos for creating conditions for
 * emergence. minimal conditions for an acceptable artifact. say you set
 * axioms, end-state, and have the system try to solve the problem, or
 * bridge the gap. if it can't innovate the problem, innovate the method."
 *
 * §BUILT ON WHAT ALREADY EXISTS, NOT A NEW ISOLATION MECHANISM —
 * lib/safe-apply.js already does exactly "propose a real change, verify
 * it for real in an isolated COS branch, never touch the real target
 * until it passes." Emergence is that loop run repeatedly, with an agent
 * (via copilot/tool-runtime.js's runViaAgent — not a new dispatch path)
 * proposing each candidate, and lib/fault-log.js's real fault history
 * deciding when repeated failure of the SAME approach means the approach
 * itself, not just the attempt, should change.
 *
 * §THE ACTUAL DISTINCTION, MADE REAL —
 *   "innovate the problem" = try a different candidate SOLUTION within
 *     the same general method. Most attempts are this.
 *   "innovate the method"  = after pivotAfter consecutive real failures
 *     of the same method (tracked via a real history array, not an
 *     in-memory guess that resets), the next prompt to the agent
 *     explicitly says the method itself has failed repeatedly and asks
 *     for a genuinely different approach, not another refinement.
 * This is a real, structural difference in what's ASKED, not a vague
 * instruction to "be creative" — the prompt itself changes shape.
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function _jaa() {
  try { return require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB; }
  catch (_) { return null; }
}

/**
 * attempt(compartment, spec, opts) —
 *   spec.axioms: string[] — real, plain-language constraints that MUST
 *     hold (checked by opts.checkFn against each candidate).
 *   spec.endState: string — what "acceptable" means, in plain language.
 *   spec.files: object — the starting real files this attempt scopes to.
 *   opts.proposeCandidate(context) => Promise<{ files, method }> —
 *     required. Asks a real agent (via runViaAgent) for a candidate.
 *     `method` is a short label the agent gives its own approach — used
 *     to detect "same method, still failing" honestly, from what the
 *     agent itself said it was doing, not guessed.
 *   opts.checkFn(compartment, branchFiles) => Promise<{ passed, why }> —
 *     required. The real axiom+end-state check.
 */
async function attempt(compartment, spec, opts = {}) {
  if (!opts.proposeCandidate || !opts.checkFn) throw new Error('emergence: opts.proposeCandidate and opts.checkFn are both required');
  const maxIterations = opts.maxIterations || 6;
  const pivotAfter = opts.pivotAfter || 3;

  const history = [];
  let lastMethod = null;
  let consecutiveSameMethodFailures = 0;

  for (let i = 0; i < maxIterations; i++) {
    const mustPivot = consecutiveSameMethodFailures >= pivotAfter;
    const context = {
      axioms: spec.axioms, endState: spec.endState, files: spec.files,
      priorAttempts: history.map(h => ({ method: h.method, why: h.why })),
      instruction: mustPivot
        ? `The method "${lastMethod}" has failed ${consecutiveSameMethodFailures} times in a row. Do not refine it further — propose a genuinely DIFFERENT approach.`
        : (lastMethod ? `Your last attempt ("${lastMethod}") did not pass: ${history[history.length - 1]?.why}. Refine it, or propose something different if you believe that's better.` : 'Propose a first candidate.'),
    };

    const candidate = await opts.proposeCandidate(context);
    const check = await opts.checkFn(compartment, candidate.files);

    const record = { iteration: i, method: candidate.method || 'unspecified', passed: !!check.passed, why: check.why || null, ts: Date.now() };
    history.push(record);

    if (check.passed) {
      try { const jaa = _jaa(); if (jaa) jaa.insert('emergence_sessions', { compartmentId: compartment.id, spec, history, outcome: 'passed', ts: Date.now() }); } catch (_) {}
      return { ok: true, iterations: i + 1, method: candidate.method, files: candidate.files, history };
    }

    try {
      require(path.join(ROOT, 'lib/fault-log.js')).logFault({
        system: 'emergence', component: `emergence.${compartment.id}`, faultClass: null,
        status: 'failed', intent: candidate.method, meta: { why: check.why, iteration: i },
      });
    } catch (_) {}

    if (candidate.method === lastMethod) consecutiveSameMethodFailures++;
    else { consecutiveSameMethodFailures = 1; lastMethod = candidate.method; }
  }

  try { const jaa = _jaa(); if (jaa) jaa.insert('emergence_sessions', { compartmentId: compartment.id, spec, history, outcome: 'exhausted', ts: Date.now() }); } catch (_) {}
  return { ok: false, iterations: maxIterations, reason: 'exhausted maxIterations without a passing candidate', history };
}

module.exports = { attempt, MODULE_ID: 'emergence', VERSION: '1.0.0' };
