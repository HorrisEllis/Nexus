'use strict';
/**
 * cortex/memory/fix-map.js — Failure → Fix mapping
 * UUID: nexus-cortex-fix-map-v1-0000-2026-0712-jamesbrooks-001
 * Version: 1.0.0
 *
 * §BUILT 2026-07-12 — cortex/push-recall.js's own header has said since
 * before this session: "causal/failure/bep lanes need the kernel causal
 * graph, fix_map, and bep_patterns table respectively, none of which
 * exist as queryable structures yet." bep_patterns got built earlier this
 * session (mastermind.js). This is fix_map — the specific, named,
 * already-blocking-something gap, not a guess at unscoped future work.
 *
 * §HONEST SCOPE — what this is and isn't. It is a real store with a real
 * lookup: signatures are recorded, matched by token overlap (same
 * approach push-recall.js already uses for its lexical lane, reused here
 * rather than inventing a second scoring method), confidence tracked by
 * successCount/failureCount. It is NOT an automatic failure→fix learner —
 * it does not infer from event_log that a retry succeeded and therefore
 * some prior action was "the fix." That inference is a real, separate,
 * much larger piece of work (would need to correlate a failure event with
 * a later success event for the same causal chain — exactly the kind of
 * thing meta/cfr/graph.js's causal graph could eventually drive, but
 * doesn't yet). Recording a fix here is an explicit write, same as
 * crystallization already is elsewhere in this codebase — not fabricated
 * as more automatic than it is.
 */

const { jaaDB } = require('./jaa-db.js');

const MODULE_ID = 'cortex.memory.fix-map';

function _tokenize(text) {
  return String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [];
}

function _tokenOverlap(a, b) {
  const setA = new Set(a), setB = new Set(b);
  if (!setA.size || !setB.size) return 0;
  let shared = 0;
  for (const t of setA) if (setB.has(t)) shared++;
  return shared / Math.max(setA.size, setB.size); // Jaccard-ish, bounded 0..1
}

/**
 * recordFix(signature, fix, opts) — explicit write. A signature that
 * already exists gets its successCount incremented (or failureCount, if
 * opts.outcome === 'failed' — the same fix tried again and not working
 * this time is real information, not something to hide by only ever
 * incrementing successes).
 */
function recordFix(signature, fix, opts = {}) {
  if (!signature || !fix) throw new Error('[fix-map] recordFix requires both signature and fix');
  const existing = jaaDB.get('fix_map', { signature });
  const now = Date.now();

  if (existing) {
    const successCount = existing.successCount + (opts.outcome === 'failed' ? 0 : 1);
    const failureCount = existing.failureCount + (opts.outcome === 'failed' ? 1 : 0);
    return jaaDB.update('fix_map', { signature }, {
      fix, successCount, failureCount, lastAppliedAt: now,
    });
  }

  return jaaDB.insert('fix_map', {
    signature, fix, ts: now, lastAppliedAt: now,
    successCount: opts.outcome === 'failed' ? 0 : 1,
    failureCount: opts.outcome === 'failed' ? 1 : 0,
  });
}

/**
 * lookupFix(errorText, limit) — real token-overlap ranking against every
 * recorded signature, weighted by recorded confidence (successCount vs
 * failureCount). Honest empty: no recorded fixes yet returns [], not a
 * fabricated suggestion.
 */
function lookupFix(errorText, limit = 5) {
  const rows = jaaDB.query('fix_map', {}).filter(r => !r._evicted);
  if (!rows.length) return [];

  const queryTokens = _tokenize(errorText);
  const scored = rows.map(row => {
    const overlap = _tokenOverlap(queryTokens, _tokenize(row.signature));
    const total = row.successCount + row.failureCount;
    const confidence = total > 0 ? row.successCount / total : 0.5; // unproven fix: neutral prior
    return { ...row, matchScore: overlap, confidence, rankScore: overlap * (0.5 + 0.5 * confidence) };
  }).filter(r => r.matchScore > 0);

  scored.sort((a, b) => b.rankScore - a.rankScore);
  return scored.slice(0, limit).map(r => ({
    signature: r.signature, fix: r.fix, matchScore: r.matchScore,
    confidence: r.confidence, successCount: r.successCount, failureCount: r.failureCount,
  }));
}

module.exports = { recordFix, lookupFix, _tokenize, _tokenOverlap, MODULE_ID };
