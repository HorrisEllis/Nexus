// ═══════════════════════════════════════════════════
// NEXUS — Memory Crystallization Layer
// crystalball/mcl.js
// UUID: nexus-cb-mcl-0000-4000-0000-000000000030
//
// Selection pressure on stored events.
// Prevents log inflation from destroying cognition.
//
// Four states: RAW EVENT → ACTIVE TRACE → CANDIDATE → STABLE CRYSTAL
// Only Stable Crystals receive priority retrieval weighting.
// Contradictions reduce stability — they don't delete.
//
// ZERO EXTERNAL DEPENDENCIES.
// ═══════════════════════════════════════════════════

'use strict';

const { uid } = require('../memory/jaa-db');

// ── Type weights (failures teach most) ─────────────
const TYPE_WEIGHTS = {
  'failures':          1.50,
  'fix_map':           1.40,
  'bep_patterns':      1.35,
  'agent_calls':       1.20,
  'gap.found':         1.15,
  'gate.failed':       1.30,
  'alignment.scanned': 1.10,
  'manifest.ready':    1.05,
  'healer.exhausted':  1.45,
  'healer.resolved':   1.25,
  'gate.passed':       0.90,
  'bridge_message':    0.70,
  'event_log':         0.60,
};

class MemoryCrystallizationLayer {
  constructor({ jaaDB, nexusKernel, latticeBridge }) {
    this._jaa          = jaaDB;
    this._nk           = nexusKernel;
    this._lb           = latticeBridge;
    this._activeTraces = new Map();  // traceId → trace
    this._crystals     = new Map();  // crystalId → crystal
    this._accessLog    = new Map();  // traceId → { lanes: Set, count }
  }

  // ── Main entry — called on every significant event ─
  async process(event, context = {}) {
    const score = this._signalScore(event, context);

    // Below threshold → archive without tracing
    if (score < 0.30) {
      return { state: 'archived', eventId: event.id, score };
    }

    const trace = await this._toActiveTrace(event, score);

    // Enrich trace with cluster data
    const cluster = this._buildCluster(trace, event);

    if (this._isCandidate(cluster)) {
      const crystal = await this._formCandidateCrystal(cluster, event);
      if (this._isStable(crystal)) {
        await this._promoteToStable(crystal);
        this._nk.emit('crystalball.crystal.formed', {
          crystalId:  crystal.uuid,
          stability:  crystal.stabilityScore,
          fields:     Object.keys(crystal.fields),
          eventId:    event.id,
          eventType:  event.type,
        });
        return { state: 'crystallized', crystalId: crystal.uuid, score };
      }
      return { state: 'candidate', crystalId: crystal.uuid, score };
    }

    return { state: 'trace', traceId: trace.uuid, score };
  }

  // ── Promotion sweep (scheduled or manual) ─────────
  async sweep() {
    let promoted = 0;
    for (const [, crystal] of this._crystals) {
      if (crystal.state === 'candidate' && this._isStable(crystal)) {
        await this._promoteToStable(crystal);
        promoted++;
      }
    }
    this._nk.emit('crystalball.mcl.sweep.complete', {
      promoted, total: this._crystals.size,
      stable:    this.stableCrystals.length,
      candidate: this.candidateCrystals.length,
    });
    return promoted;
  }

  // ── Candidate conditions: any 2 of 5 ──────────────
  _isCandidate(cluster) {
    let n = 0;
    if ((cluster.accessCount  ?? 0) >= 3)              n++;
    if ((cluster.laneCount    ?? 0) >= 2)              n++;
    if ((cluster.feedbackScore?? 0)  > 7)              n++;
    if (cluster.inCausalLoop)                          n++;
    if ((cluster.bepSuccessRate ?? 0) > 0.75
      && (cluster.bepUseCount ?? 0) > 5)              n++;
    return n >= 2;
  }

  // ── Stability: all 3 required ─────────────────────
  _isStable(crystal) {
    return crystal.stabilityScore    > 0.85
      && (crystal.recurrenceHalfLife ?? 0) > 86_400_000  // 24h
      && (crystal.crossLaneCount     ?? 0) >= 2;
  }

  // ── Stability score formula ───────────────────────
  _computeStability(cluster) {
    const recur  = Math.min((cluster.accessCount  ?? 0) / 10, 1);
    const causal = cluster.causalIntegration  ?? 0;
    const cross  = (cluster.laneCount ?? 0) >= 2 ? 1 : (cluster.laneCount ?? 0) / 2;
    const feed   = Math.min((cluster.feedbackScore ?? 5) / 10, 1);
    const bep    = cluster.bepSuccessHistory ?? 0;
    const contra = cluster.contradictionScore ?? 0;
    return (recur  * 0.25)
         + (causal * 0.25)
         + (cross  * 0.20)
         + (feed   * 0.20)
         + (bep    * 0.10)
         - (contra * 0.15);
  }

  // ── Active trace ──────────────────────────────────
  async _toActiveTrace(event, score) {
    const trace = {
      uuid:        `trace-${event.id}`,
      eventId:     event.id,
      eventType:   event.type,
      signalScore: score,
      accessCount: 0,
      laneCount:   0,
      createdAt:   Date.now(),
      wall:        event.wall ?? Date.now(),
    };
    this._activeTraces.set(trace.uuid, trace);
    await this._jaa.insert('active_traces', trace).catch(e => this._nk.emit('crystalball.mcl.write.error', { op: 'trace.insert', traceId: trace.uuid, error: e.message }));
    return trace;
  }

  // ── Cluster build (aggregate related traces) ───────
  _buildCluster(trace, event) {
    // Check if related events give this trace more weight
    const neighborhood = this._lb.neighborhood(event.id, { depth: 3 });
    const causalDepth  = neighborhood.filter(n => n?.causedBy).length;

    // Check for causal loops (A→B→A)
    const ancestors = this._lb.causalChain(event.id, 5);
    const inCausalLoop = ancestors.some(a => a?.id && this._lb.causalDescendants(a.id, 2)
      .some(d => d?.id === event.id));

    return {
      ...trace,
      causalIntegration:  Math.min(causalDepth / 10, 1),
      inCausalLoop,
      bepSuccessRate:     0,
      bepUseCount:        0,
      bepSuccessHistory:  0,
      contradictionScore: 0,
      feedbackScore:      5, // neutral prior
    };
  }

  // ── Crystal formation ─────────────────────────────
  async _formCandidateCrystal(cluster, event) {
    const stability = this._computeStability(cluster);
    const causalChain = this._lb.causalChain(event.id, 3).map(n => n?.id).filter(Boolean);

    const crystal = {
      uuid:               `crystal-${event.id}`,
      state:              'candidate',
      coreEventId:        event.id,
      coreEventType:      event.type,
      stabilityScore:     stability,
      crossLaneCount:     cluster.laneCount ?? 0,
      recurrenceHalfLife: 0,  // grows with each reinforcement sweep
      accessCount:        cluster.accessCount ?? 0,
      feedbackAlignment:  Math.min((cluster.feedbackScore ?? 5) / 10, 1),
      causalIntegration:  cluster.causalIntegration ?? 0,
      contradictionScore: cluster.contradictionScore ?? 0,

      // Five crystal fields (multi-dimensional positioning)
      fields: {
        causal:     causalChain,
        semantic:   [],   // populated by MQL lane A hits
        behavioral: [],   // BEP links added on gate.passed
        temporal:   { createdAt: Date.now(), firstAccessAt: null, lastAccessAt: null },
        relational: this._lb.related(event.id, 10),
      },
      createdAt: Date.now(),
    };

    this._crystals.set(crystal.uuid, crystal);
    return crystal;
  }

  async _promoteToStable(crystal) {
    crystal.state          = 'stable';
    crystal.promotedAt     = Date.now();
    crystal.stabilityScore = this._computeStability(crystal);
    // Recurrence half-life: grow by 6h per promotion cycle
    crystal.recurrenceHalfLife = (crystal.recurrenceHalfLife ?? 0) + 6 * 3_600_000;
    await this._jaa.insert('crystals', crystal);
    this._crystals.set(crystal.uuid, crystal);
  }

  // ── Signal score ──────────────────────────────────
  _signalScore(ev, ctx) {
    const tw     = TYPE_WEIGHTS[ev.type] ?? TYPE_WEIGHTS[ev._sourceTable] ?? 0.60;
    const ageH   = (Date.now() - (ev.wall ?? Date.now())) / 3_600_000;
    const recency = Math.exp(-0.1 * ageH);
    const feed   = ctx.feedbackScore != null ? Math.min(ctx.feedbackScore / 10, 1) : 0.5;
    const causal = Math.min((ctx.causalDepth ?? 0) / 10, 1);
    return tw * recency * (0.4 + 0.2 * feed + 0.2 * causal);
  }

  // ── Feedback reinforcement ────────────────────────
  // Called when user rates a generation (HITL)
  reinforceTrace(traceId, feedbackScore) {
    const trace = this._activeTraces.get(traceId);
    if (!trace) return;
    trace.feedbackScore = feedbackScore;
    trace.accessCount   = (trace.accessCount ?? 0) + 1;

    // Check if trace now qualifies as candidate
    const cluster = { ...trace, causalIntegration: 0, inCausalLoop: false, bepSuccessRate: 0, bepUseCount: 0, bepSuccessHistory: 0, contradictionScore: 0 };
    if (this._isCandidate(cluster)) {
      // Async promote — non-blocking
      this._formCandidateCrystal(cluster, { id: trace.eventId, type: trace.eventType, wall: trace.wall })
        .then(crystal => {
          if (this._isStable(crystal)) return this._promoteToStable(crystal);
        })
        .catch(e => this._nk.emit('crystalball.mcl.write.error', { op: 'crystal.promote', error: e.message }));
    }
  }

  // ── Lane access tracking (for MQL) ───────────────
  recordLaneAccess(traceId, lane) {
    const entry = this._accessLog.get(traceId) ?? { lanes: new Set(), count: 0 };
    entry.lanes.add(lane);
    entry.count++;
    this._accessLog.set(traceId, entry);

    const trace = this._activeTraces.get(traceId);
    if (trace) {
      trace.laneCount   = entry.lanes.size;
      trace.accessCount = entry.count;
    }
  }

  // ── Accessors ─────────────────────────────────────
  get stableCrystals()    { return [...this._crystals.values()].filter(c => c.state === 'stable'); }
  get candidateCrystals() { return [...this._crystals.values()].filter(c => c.state === 'candidate'); }
  get crystalCount()      { return this._crystals.size; }
}

module.exports = { MemoryCrystallizationLayer, TYPE_WEIGHTS };
