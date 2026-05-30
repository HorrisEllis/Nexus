// ═══════════════════════════════════════════════════
// NEXUS — NodeInspector
// canvas/spec-a/node-inspector.js
// UUID: nexus-canvas-inspector-4000-000000000001
//
// Click a pipeline node → inspect panel.
// Shows: causal chain, entropy/fidelity history,
//        BEP matches, image signal, last events.
//
// Pure data layer. No DOM construction here.
// Caller receives an InspectionResult and renders it.
// (Admin page owns the DOM — §5.7 — this emits events.)
//
// §2.3 — all state observable: every inspection emits
//         canvas.node.inspected on the kernel bus.
// §5.7 — zero direct module calls; queries via MQL API.
// ═══════════════════════════════════════════════════
'use strict';

const { kernel } = require('../../foundation/kernel');

class NodeInspector {
  /**
   * @param {object} opts
   * @param {object} opts.nexusKernel  — ALKKernel instance
   * @param {object} opts.jaaDB        — JaaDB instance
   * @param {object} opts.mql          — MemoryQueryLayer (optional; enriches results)
   * @param {object} opts.nodeRegistry — Map<id, NodeState> from pipeline canvas
   */
  constructor({ nexusKernel, jaaDB, mql = null, nodeRegistry }) {
    this._nk  = nexusKernel;
    this._jaa = jaaDB;
    this._mql = mql;
    this._reg = nodeRegistry;
    this._history = new Map(); // nodeId → [{ts, entropy, fidelity}] (capped at 200)
    this._imageSignals = new Map(); // nodeId → latest NodeSignal from image-analyzer

    // Track entropy/fidelity changes from bus
    nexusKernel.on('crystalball.cfr.updated', e => this._trackHistory(e.payload));
  }

  // ── Public API ─────────────────────────────────

  /**
   * Inspect a node by id. Returns InspectionResult immediately with
   * synchronously available data. Async MQL enrichment fires separately
   * via canvas.node.inspected.enriched event.
   *
   * @param {string} nodeId
   * @returns {InspectionResult}
   */
  inspect(nodeId) {
    const node    = this._reg.get(nodeId);
    const history = this._history.get(nodeId) ?? [];
    const imgSig  = this._imageSignals.get(nodeId) ?? null;

    // Recent ring events causally linked to this node
    const causalEvents = this._nk.ring
      .filter(e =>
        e.causedBy === nodeId ||
        e.relatedTo?.includes(nodeId) ||
        e.payload?.nodeId === nodeId ||
        e.payload?.gapId  === nodeId ||
        e.payload?.agentId === nodeId
      )
      .slice(-30);

    const result = {
      nodeId,
      node:          node ? { ...node } : null,
      causalChain:   this._nk.ancestors(nodeId, 10),
      causalEvents,
      entropyHistory: history.map(h => ({ ts: h.ts, entropy: h.entropy })),
      fidelityHistory:history.map(h => ({ ts: h.ts, fidelity: h.fidelity })),
      entropyTrend:  this._trend(history.map(h => h.entropy)),
      fidelityTrend: this._trend(history.map(h => h.fidelity)),
      imageSignal:   imgSig,
      bepMatches:    [],    // filled async
      relatedCrystals: [],  // filled async
      inspectedAt:   Date.now(),
    };

    kernel.emit('canvas.node.inspected', {
      nodeId,
      entropy:  node?.entropy  ?? null,
      fidelity: node?.fidelity ?? null,
      historyLen: history.length,
    });

    // Async MQL enrichment — fire and forget; result arrives as a separate event
    if (this._mql) {
      this._enrichAsync(nodeId, result).catch(err => {
        kernel.emit('canvas.node.inspect.enrich.failed', {
          nodeId, error: err.message,
        });
      });
    }

    return result;
  }

  /**
   * Record an image signal for a node (fed from image-analyzer).
   */
  recordImageSignal(nodeId, signal) {
    this._imageSignals.set(nodeId, { ...signal, ts: Date.now() });
  }

  /**
   * Clear inspection state for a node (e.g. on manifest reset).
   */
  reset(nodeId) {
    this._history.delete(nodeId);
    this._imageSignals.delete(nodeId);
  }

  resetAll() {
    this._history.clear();
    this._imageSignals.clear();
  }

  // ── Internal ───────────────────────────────────

  _trackHistory({ nodeId, entropy, fidelity }) {
    if (!nodeId) return;
    if (!this._history.has(nodeId)) this._history.set(nodeId, []);
    const h = this._history.get(nodeId);
    h.push({ ts: Date.now(), entropy, fidelity });
    if (h.length > 200) h.shift(); // ring cap
  }

  // OLS linear trend over last N values → { slope, direction }
  _trend(values) {
    const n = Math.min(values.length, 20);
    if (n < 2) return { slope: 0, direction: 'flat' };
    const slice = values.slice(-n);
    const xMean = (n - 1) / 2;
    const yMean = slice.reduce((s, v) => s + v, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (slice[i] - yMean);
      den += (i - xMean) ** 2;
    }
    const slope = den > 0 ? num / den : 0;
    return {
      slope: Math.round(slope * 10000) / 10000,
      direction: slope > 0.002 ? 'rising' : slope < -0.002 ? 'falling' : 'flat',
    };
  }

  async _enrichAsync(nodeId, baseResult) {
    if (!this._mql) return;

    // MQL 5-lane recall for this node's context
    const recall = await this._mql.query(
      `node:${nodeId} entropy fidelity gap healer`, nodeId
    );

    const bepMatches    = recall?.bep_patterns   ?? [];
    const crystals      = recall?.causal_thread   ?? [];

    kernel.emit('canvas.node.inspected.enriched', {
      nodeId,
      bepMatches:      bepMatches.slice(0, 5),
      relatedCrystals: crystals.slice(0, 3),
      recallTraceId:   recall?.recall_trace_id ?? null,
    });
  }
}

module.exports = { NodeInspector };
