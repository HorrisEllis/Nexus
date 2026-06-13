'use strict';
/**
 * bridge/causal/graph.js — Causal Spine Graph
 * UUID: nexus-bridge-causal-graph-v1-0000-4000-000000000001
 * Status: pre-release
 *
 * Thin adapter. Imports CausalGraph from lib/cfr/graph.js (already exists),
 * wires it to the causal ledger's append stream, and exposes the spine query API.
 *
 * What this adds beyond CausalGraph:
 *   traceSession(sessionId)    — all events in session, ordered, gaps annotated
 *   replayFrom(eventUuid)      — ordered replay of a causal subtree
 *   rootCause(failureUuid)     — walk back to oldest ancestor of a failure
 *   affectedBy(eventUuid)      — all events causally downstream
 *   sessionTimeline(sessionId) — full timeline with stateDiff applied → reconstructed state
 *   missingLinks(sessionId)    — causal gaps from timing anomalies
 *
 * Cross-domain invention — causal gap detection:
 * Between any two events in a causal chain, if
 *   event_B.ts - event_A.ts > 3 × historical_avg_interval_for_this_action_pair
 * that is a causal gap — something that should have happened, didn't.
 * Annotated as MISSING_LINK with a confidence score.
 *
 * §5.7  All inter-module communication via event bus only — no direct deps on services.
 * §2.3  All state observable — graph state can be queried at any time.
 */

'use strict';

const { CausalGraph } = require('../../lib/cfr/graph');

// Historical interval registry — action_pair → [interval_ms[]]
// Used for MISSING_LINK gap detection. In-memory; rebuilt from ledger on open.
const _intervalHistory = new Map(); // 'action_A→action_B' → number[]
const MISSING_LINK_MULTIPLIER = 3;  // 3× historical average = gap

class CausalSpineGraph {
  constructor() {
    this._graph = new CausalGraph();
  }

  /**
   * ingest — add a causal event to the graph.
   * Called by the ledger on every append.
   */
  ingest(event) {
    // Normalise to the shape CausalGraph.ingest() expects
    const entry = {
      uuid:      event.uuid,
      id:        event.uuid,
      ts:        event.ts,
      type:      event.action,     // CausalGraph uses 'type' for type-sequence edges
      system:    event.source,
      source:    event.source,
      sessionId: event.sessionId,
      causedBy:  event.causalEdges?.[0]?.eventId || null,
      // Pass through causal impulse fields if present
      sigma:     event.sigma  || null,
      cfr:       event.cfr    || null,
      delta:     event.delta  || null,
      // Original event preserved
      _raw: event,
    };
    this._graph.ingest(entry);

    // Update interval history for MISSING_LINK detection
    if (event.sessionId) {
      const sessionNodes = this._graph._bySession.get(event.sessionId) || [];
      if (sessionNodes.length >= 2) {
        const prevId    = sessionNodes[sessionNodes.length - 2];
        const prevEntry = this._graph.nodes.get(prevId);
        if (prevEntry) {
          const key      = `${prevEntry.type}→${event.action}`;
          const interval = event.ts - prevEntry.ts;
          if (!_intervalHistory.has(key)) _intervalHistory.set(key, []);
          const arr = _intervalHistory.get(key);
          arr.push(interval);
          if (arr.length > 100) arr.shift(); // rolling window
        }
      }
    }
  }

  /**
   * traceSession — all events in session, ordered oldest→newest, gaps annotated.
   * @returns { events: CausalEvent[], gaps: MissingLink[] }
   */
  traceSession(sessionId) {
    const ids    = this._graph._bySession.get(sessionId) || [];
    const events = ids.map(id => this._graph.nodes.get(id)).filter(Boolean)
                      .map(e => e._raw || e)
                      .sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const gaps   = this.missingLinks(sessionId, events);
    return { events, gaps };
  }

  /**
   * replayFrom — ordered replay of causal subtree rooted at eventUuid.
   * Returns events in causal order (BFS from root).
   */
  replayFrom(eventUuid) {
    const desc = this._graph.descendants(eventUuid, 50);
    const root = this._graph.nodes.get(eventUuid);
    const all  = root ? [root, ...desc] : desc;
    return all.map(e => e._raw || e).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  }

  /**
   * rootCause — walk backward from failureUuid to oldest causal ancestor.
   */
  rootCause(failureUuid) {
    const chain = this._graph.ancestors(failureUuid, 30);
    return chain.map(e => e._raw || e);
  }

  /**
   * affectedBy — all events causally downstream of eventUuid.
   */
  affectedBy(eventUuid) {
    return this._graph.descendants(eventUuid, 50).map(e => e._raw || e);
  }

  /**
   * sessionTimeline — full timeline with stateDiff fields applied forward.
   * Returns { events[], reconstructedState{}, artifacts[], gaps[] }
   */
  sessionTimeline(sessionId) {
    const { events, gaps } = this.traceSession(sessionId);
    const reconstructedState = {};
    const artifacts = [];

    for (const ev of events) {
      // Apply stateDiff forward
      if (ev.stateDiff && typeof ev.stateDiff === 'object') {
        for (const [k, v] of Object.entries(ev.stateDiff)) {
          if (typeof v === 'number' && typeof reconstructedState[k] === 'number') {
            reconstructedState[k] += v;
          } else {
            reconstructedState[k] = v;
          }
        }
      }
      // Collect artifact events
      if (ev.action && ev.action.includes('artifact')) artifacts.push(ev);
    }

    const systems = [...new Set(events.map(e => e.source).filter(Boolean))];
    const duration = events.length >= 2
      ? (events[events.length - 1].ts - events[0].ts)
      : 0;

    return {
      sessionId,
      events,
      reconstructedState,
      artifacts,
      gaps,
      duration,
      systemsInvolved: systems,
    };
  }

  /**
   * missingLinks — detect causal gaps from timing anomalies.
   * Between any two consecutive session events, if the interval is >3× the
   * historical average for that action pair, a MISSING_LINK is annotated.
   */
  missingLinks(sessionId, events = null) {
    if (!events) {
      const ids = this._graph._bySession.get(sessionId) || [];
      events = ids.map(id => this._graph.nodes.get(id)).filter(Boolean)
                  .map(e => e._raw || e)
                  .sort((a, b) => (a.ts || 0) - (b.ts || 0));
    }

    const gaps = [];
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1];
      const curr = events[i];
      const key  = `${prev.action}→${curr.action}`;
      const hist = _intervalHistory.get(key);
      if (!hist || hist.length < 3) continue; // need history to detect anomaly

      const avg      = hist.reduce((a, b) => a + b, 0) / hist.length;
      const actual   = (curr.ts || 0) - (prev.ts || 0);
      const threshold = avg * MISSING_LINK_MULTIPLIER;

      if (actual > threshold) {
        const confidence = Math.min(1, (actual - threshold) / threshold);
        gaps.push({
          type:        'MISSING_LINK',
          between:     [prev.uuid, curr.uuid],
          actionPair:  key,
          sessionId,
          intervalMs:  actual,
          expectedMs:  avg,
          thresholdMs: threshold,
          confidence:  parseFloat(confidence.toFixed(3)),
          ts:          curr.ts,
        });
      }
    }
    return gaps;
  }

  graphStats() {
    return this._graph.stats();
  }
}

module.exports = { CausalSpineGraph };
