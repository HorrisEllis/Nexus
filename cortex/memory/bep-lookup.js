'use strict';
/**
 * cortex/memory/bep-lookup.js — BEP pattern matching (read side)
 * UUID: nexus-cortex-bep-lookup-v1-0000-2026-0712-jamesbrooks-001
 * Version: 1.0.0
 *
 * §BUILT 2026-07-12 — push-recall.js's own header names the bep lane as
 * needing "the bep_patterns table... none of which exist as queryable
 * structures yet." The table now has a real writer (mastermind.js's
 * _crystallizeBEPPatterns, built earlier this session). This is the
 * reader half: matches a row's content against recorded pattern
 * sequences by token overlap — same method fix-map.js already uses for
 * failure signatures, reused via its exported helpers rather than a
 * second copy of the same two functions.
 *
 * §HONEST SCOPE — a bep_pattern's `sequence` field is a chain of event
 * TYPES ("ollama.offline → guardian.retry → gap.opened"), not prose.
 * Token overlap against arbitrary pushed content is a real but coarse
 * signal: a row that literally mentions "ollama offline" and "guardian
 * retry" scores well; a row describing the same situation in different
 * words scores 0, honestly, rather than a fabricated semantic match.
 * Real semantic matching here would need the same LLM-based approach
 * cos/kernel.js's axiom check now uses — not built here, since nothing
 * yet needs it enough to justify the latency on every recall() call.
 */

const { jaaDB } = require('./jaa-db.js');
const { _tokenize, _tokenOverlap } = require('./fix-map.js');

function lookupBEPMatch(content, limit = 1) {
  const rows = jaaDB.query('bep_patterns', {}).filter(r => !r._evicted);
  if (!rows.length) return [];

  const contentTokens = _tokenize(content);
  const scored = rows.map(row => {
    const overlap = _tokenOverlap(contentTokens, _tokenize(row.sequence));
    // occurrenceCount is unbounded in principle; compress it into a 0..1
    // confidence-like factor rather than letting a pattern seen 50 times
    // dominate a fresh recall() call disproportionately.
    const strength = Math.min(1, (row.occurrenceCount || 1) / 10);
    return { ...row, matchScore: overlap, strength, rankScore: overlap * (0.5 + 0.5 * strength) };
  }).filter(r => r.matchScore > 0);

  scored.sort((a, b) => b.rankScore - a.rankScore);
  return scored.slice(0, limit).map(r => ({
    sequence: r.sequence, matchScore: r.matchScore, strength: r.strength,
    occurrenceCount: r.occurrenceCount, selfSimilarity: r.selfSimilarity,
  }));
}

module.exports = { lookupBEPMatch };
