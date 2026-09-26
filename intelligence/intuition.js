'use strict';
/**
 * cortex/intelligence/intuition.js — INTUITION faculty
 * UUID: nexus-cortex-intuition-v1-0000-2026-0706-jamesbrooks-001
 * Spec: docs/cortex-dual-cognition.spec (path this file fulfills, was
 * listed there under NEEDS_WIRING before this split — the logic was
 * already real, just living as an inline function in cortex/boot.js
 * instead of its own file).
 *
 * "Fast, associative, pattern-first. No model. Source: what's
 * crystallised." — answers the question "what does this resemble?",
 * not "what follows from this?" (that's Mastermind's job, the other
 * faculty, deliberately kept in a separate file and separate memory
 * reads — this file never touches the causal graph).
 *
 * Dependency-injected rather than reaching for module-level globals —
 * `_field` and jaaDB live in cortex/boot.js, the composition root; this
 * file takes them as explicit deps so it's independently requirable
 * and testable without boot.js's server-binding side effect.
 */

function createIntuition({ jaaDB, getField, getTaxonomy, getSystemLattice, buildPatterns }) {
  function answer(prompt) {
    const p = String(prompt || '').toLowerCase();
    const _field = getField();

    if (p.includes('health') || p.includes('status')) {
      return {
        ok: true,
        text: `System coherence: ${_field.coherence.toFixed(2)}, friction: ${_field.friction.toFixed(2)}, regime: ${_field.regime}.`,
        intent: 'status', confidence: 0.82, modelUsed: 'cortex.intuition',
      };
    }

    if (p.includes('gap') || p.includes('open issue')) {
      const openGaps = jaaDB.query('gaps', { status: 'open' }, { limit: 200 });
      const taxonomy = getTaxonomy();
      if (taxonomy && openGaps.length) {
        const tally = {};
        for (const g of openGaps) {
          const { loop_type } = taxonomy.classify(g);
          tally[loop_type] = (tally[loop_type] || 0) + 1;
        }
        const breakdown = Object.entries(tally)
          .sort((a, b) => b[1] - a[1])
          .map(([type, n]) => `${n} ${type}`)
          .join(', ');
        return {
          ok: true,
          text: `There are ${openGaps.length} open gaps: ${breakdown}.`,
          intent: 'gaps', confidence: 0.90, modelUsed: 'cortex.intuition',
          breakdown: tally,
        };
      }
      return {
        ok: true,
        text: `There are currently ${openGaps.length} open gaps in the system.`,
        intent: 'gaps', confidence: 0.90, modelUsed: 'cortex.intuition',
        breakdown: {},
      };
    }

    if (p.includes('relate') || p.includes('connect') || p.includes('between') || p.includes('depends on')) {
      const lattice = getSystemLattice();
      if (lattice) {
        const known = lattice.query({}).map(r => r.node.id);
        const mentioned = known.filter(id => p.includes(id.toLowerCase()));
        if (mentioned.length) {
          const subject = mentioned[0];
          const neighbors = lattice.neighbors(subject);
          const text = neighbors.length
            ? `${subject} is connected to: ${neighbors.map(n => `${n.node.id} (${n.weight.toFixed(2)})`).join(', ')}.`
            : `${subject} is known but has no strong connections yet.`;
          return {
            ok: true, text, intent: 'relationship', confidence: neighbors.length ? 0.85 : 0.5,
            modelUsed: 'cortex.intuition', subject, neighbors,
          };
        }
      }
    }

    if (p.includes('pattern') || p.includes('most common')) {
      const top = buildPatterns(3).map(pt => `${pt.type}(${pt.count})`).join(', ');
      return {
        ok: true,
        text: `Top event patterns: ${top || 'insufficient data'}.`,
        intent: 'patterns', confidence: 0.78, modelUsed: 'cortex.intuition',
      };
    }

    // Not a fast-path — caller should use mastermind/Ollama.
    return { ok: true, text: null, confidence: 0, modelUsed: 'cortex.intuition' };
  }

  return { answer };
}

module.exports = { createIntuition };
