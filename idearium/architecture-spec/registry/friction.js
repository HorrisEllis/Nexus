'use strict';
/**
 * .architecture/registry/friction.js — per-system self-diagnostic score,
 * computed live from the system's own registry state. Direct
 * generalization of loom's real GET /api/friction and GET /api/tension
 * (loom/registry-components.js) — same two numbers, computed from THIS
 * system's own lattice and gaps instead of proxied from a shared
 * diagnostic kernel.
 *
 * friction = current structural strain: how many hooks don't resolve
 *            right now, plus how many gaps are open right now. A
 *            snapshot, not a trend.
 * tension  = friction + gap accumulation: whether strain is building or
 *            easing. Two systems can have identical friction today and
 *            wildly different tension — one is closing gaps faster than
 *            it opens them, the other isn't.
 */
const fs = require('fs');

function _daysAgo(iso, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(iso).getTime() >= cutoff;
}

/**
 * computeFriction({ lattice, gaps }) -> { friction, orphanCount, openGapCount, breakdown }
 * lattice: the object compileLattice() returns (has .orphans)
 * gaps: the parsed `spec.gaps.entries` array from this system's own .spec
 *       file — each entry has at least { id, opened, closed? }
 */
function computeFriction({ lattice, gaps = [] }) {
  const orphanCount = (lattice && lattice.orphans) ? lattice.orphans.length : 0;
  const openGapCount = gaps.filter(g => !g.closed).length;
  return {
    friction: orphanCount + openGapCount,
    orphanCount,
    openGapCount,
    breakdown: { orphans: lattice ? lattice.orphans : [], openGaps: gaps.filter(g => !g.closed).map(g => g.id) },
  };
}

/**
 * computeTension({ lattice, gaps, windowDays }) -> { tension, friction, accumulation, opened, closed }
 * accumulation = gaps opened in the window minus gaps closed in the window.
 * Positive accumulation = strain building faster than it's resolved.
 * Negative accumulation = the system is closing gaps faster than opening them.
 */
function computeTension({ lattice, gaps = [], windowDays = 30 }) {
  const { friction, orphanCount, openGapCount } = computeFriction({ lattice, gaps });
  const opened = gaps.filter(g => g.opened && _daysAgo(g.opened, windowDays)).length;
  const closed = gaps.filter(g => g.closed && _daysAgo(g.closed, windowDays)).length;
  const accumulation = opened - closed;
  return {
    tension: friction + accumulation,
    friction, orphanCount, openGapCount,
    windowDays, opened, closed, accumulation,
  };
}

/** Convenience: read a system's own .spec file's gaps.entries directly. */
function gapsFromSpecFile(specPath) {
  const raw = fs.readFileSync(specPath, 'utf8');
  const yaml = require('js-yaml'); // caller's project must provide a yaml parser — not bundled here
  const doc = yaml.load(raw);
  return (doc && doc.spec && doc.spec.gaps && doc.spec.gaps.entries) || [];
}

module.exports = { computeFriction, computeTension, gapsFromSpecFile };
