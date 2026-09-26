'use strict';
/**
 * lib/chunk-build-orchestrator.js — if a chunk fails to build, switch agents
 * UUID: nexus-chunk-build-orchestrator-v1-0000-2026-0811-001
 *
 * James: "need to try them all, unless it's a system failure... don't just
 * go along with this, you're my partner in this."
 *
 * §THE ACTUAL DESIGN, arrived at by disagreeing productively, not by
 * deferring: exhaust every agent before giving up (stronger evidence for a
 * real "needs human review" than any partial attempt), but a rate-limit or
 * timeout is a TURN THAT NEVER HAPPENED, not a failed attempt — it doesn't
 * count against the exhaustion, and it isn't recorded as evidence the chunk
 * is hard. Only a genuine output (build succeeded enough to reach verify, or
 * build itself rejected the content, not just timed out reaching it) counts.
 *
 * §8.6 — composes what exists, builds nothing twice:
 *   lib/execution-pipeline.js  — the real build/verify/compare/promote loop.
 *   lib/agent-router.js        — DEFAULT_FALLBACK as the starting order.
 *   lib/agent-build-learning.js — Bayesian re-ordering from real outcomes.
 *   lib/gap-field.js           — where full exhaustion gets reported, so it
 *                                 reaches the same "what's open right now"
 *                                 view as everything else, not a silent log.
 *
 * §ERROR CLASSIFICATION — the one real judgment call in this file. A build-
 * stage failure whose error text looks like infrastructure (timeout,
 * connection refused, rate limit, 5xx) is skipped without counting; anything
 * else, at ANY stage (build content rejected, branch/sandbox verify failed,
 * compare-to-golden failed), is a real attempt against that agent — whether
 * the failure is "this agent's output was wrong" or "the spec itself is
 * wrong" can't be told apart from ONE agent's failure, which is exactly why
 * ALL agents get tried before concluding it's the spec, not the agent.
 */

const INFRA_PATTERNS = /timeout|timed out|ECONNREFUSED|ECONNRESET|ETIMEDOUT|rate.?limit|429|502|503|504|unreachable|network error/i;

function _isInfraFailure(stage, error) {
  return stage === 'build' && INFRA_PATTERNS.test(String(error || ''));
}

function _fanin() { try { return require('./ledger-fanin'); } catch (_) { return null; } }

/**
 * buildWithFallback(spec, opts) — try agents in learned order until one
 * succeeds or all genuinely fail.
 * @param spec { specPath, outputDir, testCommand, chunkId }
 * @param opts { agents?, maxInfraRetries? (default 1 retry per agent before
 *              moving on), pipeline? (injectable for tests) }
 * @returns { ok, agent?, result?, attempts:[{agent,outcome,stage,error}], exhausted? }
 */
async function buildWithFallback(spec = {}, opts = {}) {
  const learning = opts.learning || require('./agent-build-learning');
  const pipeline = opts.pipeline || require('./execution-pipeline');
  const fanin = _fanin();

  const roster = learning.orderedAgents(opts.agents);
  const attempts = [];

  for (const agent of roster) {
    let infraRetries = 0;
    const maxInfraRetries = opts.maxInfraRetries != null ? opts.maxInfraRetries : 1;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      let outcome;
      try {
        outcome = await pipeline.runPipeline({ specPath: spec.specPath, outputDir: spec.outputDir, provider: agent, testCommand: spec.testCommand }, {});
      } catch (e) {
        outcome = { ok: false, stage: 'build', error: e.message };
      }

      if (outcome && outcome.ok) {
        // Success — real evidence this agent works, recorded.
        learning.recordOutcome(agent, 'confirmed');
        attempts.push({ agent, outcome: 'success', stage: outcome.stage || 'complete' });
        try { fanin && fanin.emit({ type: 'chunk-build.succeeded', agent, chunkId: spec.chunkId, attempts: attempts.length, ts: Date.now() }); } catch (_) {}
        return { ok: true, agent, result: outcome, attempts };
      }

      const stage = outcome.stage || 'build';
      const error = outcome.error || 'unknown failure';

      if (_isInfraFailure(stage, error) && infraRetries < maxInfraRetries) {
        infraRetries++;
        attempts.push({ agent, outcome: 'infra-retry', stage, error });
        continue;   // same agent, one more try — a timeout doesn't indict the agent yet
      }
      if (_isInfraFailure(stage, error)) {
        // Exhausted infra retries for this agent — skip it, not a real attempt against it.
        attempts.push({ agent, outcome: 'infra-skip', stage, error });
        break;
      }

      // A genuine failure — this agent really tried and it didn't work.
      learning.recordOutcome(agent, 'rejected');
      attempts.push({ agent, outcome: 'failed', stage, error });
      try { fanin && fanin.emit({ type: 'chunk-build.agent-failed', agent, chunkId: spec.chunkId, stage, ts: Date.now() }); } catch (_) {}
      break;
    }
  }

  // Every agent either genuinely failed or was infra-unreachable — real exhaustion.
  const realFailures = attempts.filter(a => a.outcome === 'failed');
  const allInfra = realFailures.length === 0 && attempts.length > 0;
  try {
    const gapField = opts.gapField || require('./gap-field');
    gapField.report({
      type: allInfra ? 'chunk-build.all-agents-unreachable' : 'chunk-build.exhausted',
      body: allInfra
        ? `Every agent was unreachable for chunk ${spec.chunkId || spec.specPath} — infrastructure, not a spec problem.`
        : `${realFailures.length} agent(s) genuinely failed to build ${spec.chunkId || spec.specPath} — likely needs a human look at the spec, not another retry.`,
      source: spec.chunkId || spec.specPath || 'chunk-build-orchestrator',
      domain: 'system', severity: allInfra ? 'medium' : 'high',
      meta: { attempts, specPath: spec.specPath, outputDir: spec.outputDir, testCommand: spec.testCommand, chunkId: spec.chunkId },
    });
  } catch (_) {}

  return { ok: false, exhausted: true, allInfra, attempts };
}

module.exports = { buildWithFallback, _isInfraFailure, MODULE_ID: 'chunk-build-orchestrator', VERSION: '1.0.0' };
