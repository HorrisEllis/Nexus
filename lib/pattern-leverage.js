'use strict';
/**
 * lib/pattern-leverage.js — OB8 of the observability/tablet phasemap
 * UUID: nexus-pattern-leverage-v1-0000-2026-0730-001
 *
 * §PHASEMAP OB8 (docs/nexus-observability-tablet-phasemap.spec). Patterns get a
 * LEVERAGE RATIO so we know which ones matter (James). A pattern that occurs
 * rarely but causes large impact is HIGH leverage; one that occurs constantly
 * with tiny impact is LOW leverage. leverage = impact / frequency (blast-radius-
 * weighted), so importance ≠ raw frequency. High-leverage patterns surface;
 * low-leverage ones stay quiet. §16.4 — this earns its existence by telling you
 * WHICH patterns to act on. §13.4 — the formula is versioned so its definition
 * drift is tracked. Ties into OB10's `leverage` sigma role. Pure (§14.2).
 */

const FORMULA_VERSION = '1.0.0';

/**
 * leverage(pattern) — score a single pattern's leverage.
 * @param pattern { occurrenceCount|frequency, impact|blastRadius, sigma? }
 * @returns { leverage, tier, why }
 *
 * impact  — the pattern's effect size (blast radius, sigma weight, or explicit).
 * freq    — how often it occurs (occurrenceCount).
 * leverage = impact / sqrt(freq)  — sqrt dampens frequency so a very common
 *            pattern isn't penalized to zero, but rarity still amplifies impact.
 */
function leverage(pattern = {}) {
  const freq = Math.max(1, pattern.occurrenceCount || pattern.frequency || 1);
  // impact: explicit impact, else blast radius, else sigma score as a proxy.
  const impact = pattern.impact != null ? pattern.impact
    : pattern.blastRadius != null ? pattern.blastRadius
    : pattern.sigma != null ? pattern.sigma
    : 0.5;
  const lev = impact / Math.sqrt(freq);
  const tier = lev >= 0.6 ? 'high' : lev >= 0.3 ? 'medium' : 'low';
  const why = `impact ${impact.toFixed(2)} over √${freq} occurrences → leverage ${lev.toFixed(2)}`;
  return { leverage: +lev.toFixed(3), tier, impact, frequency: freq, why, formulaVersion: FORMULA_VERSION };
}

/**
 * rankPatterns(patterns) — score + sort patterns by leverage, high-leverage
 * first. This is what surfaces "important" patterns over merely frequent ones.
 * Returns [{ ...pattern, leverage, tier }].
 */
function rankPatterns(patterns = []) {
  return (patterns || [])
    .map(p => ({ ...p, ...leverage(p) }))
    .sort((a, b) => b.leverage - a.leverage);
}

/**
 * important(patterns, minTier='high') — just the patterns worth acting on.
 */
function important(patterns = [], minTier = 'high') {
  const order = { low: 0, medium: 1, high: 2 };
  const floor = order[minTier] ?? 2;
  return rankPatterns(patterns).filter(p => (order[p.tier] ?? 0) >= floor);
}

module.exports = { leverage, rankPatterns, important, FORMULA_VERSION, MODULE_ID: 'pattern-leverage', VERSION: '1.0.0' };
