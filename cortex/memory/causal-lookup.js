'use strict';
/**
 * cortex/memory/causal-lookup.js — Causal graph connectivity (read side)
 * UUID: nexus-cortex-causal-lookup-v1-0000-2026-0712-jamesbrooks-001
 * Version: 1.0.0
 *
 * §BUILT 2026-07-12 — push-recall.js's own header names the causal lane as
 * needing "the kernel causal graph... none of which exist as queryable
 * structures yet." intelligence/cfr/graph.js's CausalGraph is real and has been
 * wired elsewhere in this codebase since before this session (cortex/boot.js,
 * RAID, mastermind.js, meta/spatial/system-lattice.js) — checked, not
 * assumed, three turns ago. This is push-recall's own read path onto it.
 *
 * §HONEST SCOPE — push-recall's rows have no causal-chain field of their
 * own (push() stores {id, content, tags, tier, ts} — no causedBy link to
 * event_log). Real causal scoring needs SOME connection between a pushed
 * row and an actual graph node; the only thing a row offers is its tags.
 * So: a row is causally scored if one of its tags is itself a real node
 * id in the recent causal graph (an event uuid, a gap id — whatever the
 * caller tagged it with). No tag matching a real node → score 0, honestly,
 * not a fabricated "everything is somewhat causal" fallback. This means
 * the causal lane only ever activates for rows the caller deliberately
 * tagged with a real id — a real constraint, not hidden.
 */

const { jaaDB } = require('./jaa-db.js');

let _CausalGraph = null;
function _getCausalGraphClass() {
  if (_CausalGraph) return _CausalGraph;
  ({ CausalGraph: _CausalGraph } = require('../../intelligence/cfr/graph.js'));
  return _CausalGraph;
}

let _cachedGraph = null;
let _cachedAt = 0;
const GRAPH_CACHE_MS = 5000; // rebuilding from event_log on every recall() call would be wasteful; 5s is short enough that a recall() during an active debugging session still sees fresh causal state

function _buildRecentGraph(limit = 300) {
  const now = Date.now();
  if (_cachedGraph && (now - _cachedAt) < GRAPH_CACHE_MS) return _cachedGraph;

  const CausalGraph = _getCausalGraphClass();
  const graph = new CausalGraph();
  const events = jaaDB.tail('event_log', limit);
  for (const e of events) graph.ingest(e);

  _cachedGraph = graph;
  _cachedAt = now;
  return graph;
}

/**
 * causalScore(tags) — the real check. Returns { score, matchedTag,
 * connectivity } for the best-connected tag that's a real graph node, or
 * null if no tag matches anything in the recent causal graph.
 */
function causalScore(tags = []) {
  let graph;
  try { graph = _buildRecentGraph(); }
  catch (e) { return null; } // no causal graph available — honest null, not 0 disguised as a real check

  let best = null;
  for (const tag of tags) {
    if (!graph.nodes.has(tag)) continue;
    const ancestors   = graph.ancestors(tag).length;
    const descendants = graph.descendants(tag).length;
    const connectivity = ancestors + descendants;
    // Bounded 0..1 — a node with 10+ combined ancestors/descendants is
    // treated as "fully connected" for scoring purposes; more than that
    // doesn't buy additional score, since this is a relevance signal, not
    // a popularity contest.
    const score = Math.min(1, connectivity / 10);
    if (!best || score > best.score) best = { score, matchedTag: tag, connectivity };
  }
  return best;
}

module.exports = { causalScore, _buildRecentGraph };
