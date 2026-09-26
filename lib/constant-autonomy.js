'use strict';
/**
 * lib/constant-autonomy.js — co-pilot runs CONSTANTLY (agnostic; §CA7)
 * UUID: nexus-constant-autonomy-v1-0000-2026-0808-001
 *
 * James: "running things CONSTANTLY — what-ifs forming connections with
 * intelligence, cortex data, components, polling, diagnosing."
 *
 * §8.6 — built on CA1's scheduler for the interval mechanism (an "always-on
 * loop" IS an everyMs task; no second interval primitive invented), and on
 * lib/autonomous-loop.run() (already existed: classify → case-library-check →
 * spawn → execute, single-pass) for the execution half. This file is the
 * missing piece between them: WHAT to propose each cycle, and the extra
 * RAID gate the phasemap's gate line requires ("every action RAID-gated,
 * halting on ambiguity") — autonomous-loop's own case-library block is a
 * different check (a learned "don't repeat this," not a live permission
 * check), so this adds governAction on top of it, not instead of it.
 *
 * DEFAULT PROPOSAL SOURCE (real, not a stub poll): each cycle looks at two
 * already-live signals —
 *   lib/tool-index.list({withEdgeCases:true})  — tools with recorded
 *     failures/misses worth investigating.
 *   lib/ledger-fanin.coverage(expectedSystems) — a system that stopped
 *     emitting (a real detection gap, per that function's own docblock).
 * If neither has anything, the cycle proposes NOTHING and halts cleanly —
 * that is success, not failure (§user_wellbeing: autonomy halts on
 * ambiguity/absence, it does not invent work to look busy).
 *
 * Every cycle — proposed or empty, allowed or denied, executed or errored —
 * is logged to the fan-in as its own event (§15.2 — every iteration
 * traceable, not a hidden loop).
 */

const scheduler = require('./scheduler');
const TASK_NAME = 'constant-autonomy';

function _fanin() { try { return require('./ledger-fanin'); } catch (_) { return null; } }
function _toolIndex() { try { return require('./tool-index'); } catch (_) { return null; } }

async function _govern(intent, target) {
  let allowed = true, reason = null;
  try {
    const sm = require('../copilot/lib/self-model');
    if (sm.governAction) { const g = sm.governAction({ action: intent, target }, {}); if (g && g.allowed === false) { allowed = false; reason = g.reason; } }
  } catch (_) {}
  return { allowed, reason };
}

function _log(type, fields) {
  try { const f = _fanin(); f && f.emit && f.emit({ type, source: 'constant-autonomy', ts: Date.now(), cycle: _cycleCount, ...fields }); } catch (_) {}
}

/**
 * defaultPropose(opts) — real signal sources, no fabricated "always find
 * something" pressure. Returns a proposal or null (null = nothing to do).
 */
function defaultPropose(opts = {}) {
  // §2026-08-09 — gap-field checked FIRST: it's the most direct "something
  // is currently wrong" signal in NEXUS (system anomalies + user-model
  // ambiguity, unified). A constant-autonomy loop that polls tool-index and
  // fan-in coverage but never looks at the actual open-gap table was missing
  // the most concrete thing worth investigating — found while testing
  // whether this loop can genuinely detect-and-fix, not by inspection alone.
  try {
    const gapField = opts.gapField || require('./gap-field');
    const gaps = gapField.openGaps({ limit: 10 });
    if (gaps.length) {
      // Prefer the highest-severity, least-investigated (fewest occurrences
      // seen so far isn't the signal — recency is: the most RECENTLY seen
      // open gap is the one still actively happening).
      const worst = gaps.slice().sort((a, b) => {
        const sevRank = { high: 2, critical: 2, medium: 1, low: 0 };
        const sd = (sevRank[b.severity] || 0) - (sevRank[a.severity] || 0);
        return sd !== 0 ? sd : (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
      })[0];
      return { kind: 'investigate-gap', text: `investigate ${worst.domain || 'system'} gap "${worst.type}" from ${worst.source}`, subject: worst.uuid, detail: worst };
    }
  } catch (_) { /* gap-field unavailable — fall through to the other sources */ }

  const ti = _toolIndex();
  if (ti && ti.list) {
    const withEdgeCases = ti.list({ withEdgeCases: true });
    if (withEdgeCases.length) {
      const worst = withEdgeCases[0];
      return { kind: 'investigate-edge-case', text: `investigate edge case in tool "${worst.id}"`, subject: worst.id, detail: worst.edgeCases[worst.edgeCases.length - 1] };
    }
  }
  const fanin = _fanin();
  if (fanin && fanin.coverage) {
    const cov = fanin.coverage(opts.expectedSystems || []);
    if (cov.missing && cov.missing.length) {
      return { kind: 'coverage-gap', text: `system "${cov.missing[0]}" is expected but not feeding the fan-in`, subject: cov.missing[0] };
    }
  }
  return null;   // nothing ambiguous or worth acting on — a clean, healthy cycle
}

let _cycleCount = 0;
let _lastResult = null;

/**
 * _cycle(opts) — one pass: propose → (halt if nothing/ambiguous) → govern →
 * (halt if denied) → autonomous-loop.run() with a real executor.
 */
async function _cycle(opts = {}) {
  _cycleCount++;
  const propose = opts.propose || defaultPropose;
  let proposal;
  try { proposal = propose(opts); } catch (e) { _log('cycle.propose.error', { error: e.message }); _lastResult = { cycle: _cycleCount, stage: 'propose-error', error: e.message }; return _lastResult; }

  if (!proposal) {
    _log('cycle.empty', {});
    _lastResult = { cycle: _cycleCount, stage: 'no-proposal', ran: false };
    return _lastResult;
  }

  const { allowed, reason } = await _govern('constant-autonomy.act', proposal);
  _log(allowed ? 'cycle.proposed' : 'cycle.denied', { proposal, allowed, reason });
  if (!allowed) { _lastResult = { cycle: _cycleCount, stage: 'denied', proposal, reason }; return _lastResult; }

  const autonomousLoop = require('./autonomous-loop');
  const executor = opts.executor || (async (workingMemory, constraintFrame) => ({ investigated: proposal.subject, kind: proposal.kind, workingMemory, constraintFrame }));

  try {
    const result = await autonomousLoop.run({
      req: { text: proposal.text, source: 'constant-autonomy', autonomous: true },
      executor,
      budget: opts.budget, boundary: opts.boundary,
    });
    _log(result.ran ? 'cycle.executed' : 'cycle.halted', { proposal, stage: result.stage });
    _lastResult = { cycle: _cycleCount, stage: result.stage, proposal, loopResult: result };
  } catch (e) {
    // §1.2 — a failing cycle is loud and specific, never crashes the loop.
    _log('cycle.error', { proposal, error: e.message });
    _lastResult = { cycle: _cycleCount, stage: 'error', proposal, error: e.message };
  }
  return _lastResult;
}

/**
 * start(opts) — arm the constant-autonomy interval on CA1's scheduler.
 * opts: { everyMs (default 60000), propose?, executor?, expectedSystems?,
 *         budget?, boundary?, maxRuns? (default Infinity) }
 */
function start(opts = {}) {
  scheduler.cancel(TASK_NAME);   // idempotent — re-starting replaces, not duplicates
  const r = scheduler.schedule({
    id: TASK_NAME, name: TASK_NAME,
    everyMs: opts.everyMs || 60000,
    maxRuns: opts.maxRuns != null ? opts.maxRuns : Infinity,
    fn: async () => _cycle(opts),
    intent: 'constant-autonomy.cycle',
  });
  return r;
}

function stop() { scheduler.cancel(TASK_NAME); }
function status() { const task = scheduler.get(TASK_NAME); return { running: !!(task && task.status === 'scheduled'), cycles: _cycleCount, lastResult: _lastResult, task }; }
function _resetForTest() { stop(); _cycleCount = 0; _lastResult = null; }

module.exports = { start, stop, status, defaultPropose, _cycle, _resetForTest, MODULE_ID: 'constant-autonomy', VERSION: '1.0.0' };
