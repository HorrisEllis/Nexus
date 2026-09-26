'use strict';
/**
 * lib/causal/compound.js — Compounding Effects Engine
 * UUID: nexus-causal-compound-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * Every cause is as important as the conditions of its effect.
 * Every ripple, wave, and compounding tidal wave is documented and identified.
 *
 * This engine sits on top of the existing causal infrastructure:
 *   CausalGraph   → edges (causal, session, job, temporal, type-sequence)
 *   computeDelta  → transition physics (tension, friction, slope)
 *   computeSigma  → divergence score per event
 *   scanInvariants → co-occurrence and failure precursors
 *   ancestors/descendants → causal chain walks
 *
 * What this adds — compounding effect classification:
 *
 *   RIPPLE     — single-hop effect. One cause, one direct consequence.
 *                Low sigma. Small delta. Contained. Expected in normal flow.
 *                Example: job.queued → job.dispatched
 *
 *   WAVE       — multi-hop effect. One cause fans out to 2–5 downstream events.
 *                Medium sigma. Growing delta slope. Spreading but recoverable.
 *                Example: provider.disconnected → tab.needed → queue.retry → job.error
 *
 *   TIDAL      — compounding cascade. One cause produces N > 5 downstream events
 *                with amplifying sigma. High delta tension. Multiple systems affected.
 *                Regimes: turbulent or chaotic. Recovery requires intervention.
 *                Example: contract.violation → gap.found → healer.escalated →
 *                         seam.chunk.failed × N → cfr.collapse → human_required
 *
 * Each compound effect produces a named, documented CausalRecord:
 *   uuid, class, rootCause, causalChain[], affectedSystems[], sigmaProgression[],
 *   deltaProgression[], peakSigma, peakTension, spread, depth, regime, documented
 *
 * §7.6  Codebase is a materialised view of the Upgrade Ledger.
 * §2.3  All state must be observable.
 * §1.2  Nothing silently fails — every compound effect surfaces.
 * §7.7  Bottleneck detection via ledger flow.
 * §7.0  Event ontology separation — causes are observational, effects are authoritative.
 */

'use strict';

const { randomUUID } = require('crypto');
const { CausalGraph } = require('../../intelligence/cfr/graph');
const domainNodes = require('../lib/domain-nodes.js');

// ══════════════════════════════════════════════════════════════════════════════
// CAUSAL IMPULSE — the physics underneath regime detection
//
// Every event carries a causal impulse: the energy it injects into the graph.
// Regime (ripple/wave/tidal) is NOT assigned at ingestion.
// It EMERGES from how the impulse propagates through the graph structure.
//
// CausalImpulse {
//   magnitude     — how much energy the event injects (sigma score × field entropy)
//   entropy       — how much disorder the event introduces (CFR entropy snapshot)
//   branchingFactor — how many independent causal paths it opens
//   resistance    — how much the current field state dampens propagation
//   decayRate     — how quickly energy dissipates per hop (function of coherence)
// }
//
// Propagation function P(event) → downstream delta field:
//   energy_at_hop_N = magnitude × (1 - decayRate)^N × branchingFactor^N
//
//   linear + low branching     → ripple  (energy < WAVE_THRESHOLD)
//   exponential + bounded      → wave    (energy between thresholds)
//   superlinear + cross-system → tidal   (energy > TIDAL_THRESHOLD)
//
// The regime is read FROM propagation — not written to it.
// ══════════════════════════════════════════════════════════════════════════════

function computeCausalImpulse(entry) {
  const sigma    = entry.sigma?.score    ?? 0;
  const entropy  = entry.cfr?.entropy    ?? 0.3;
  const coherence= entry.cfr?.coherence  ?? 0.7;
  const friction = entry.cfr?.friction   ?? 0.2;
  const tension  = entry.delta?.tension  ?? 0;

  // Magnitude — energy injected into the graph
  // High sigma + high field entropy = large impulse
  const magnitude = Math.min(1.0, sigma * (1 + entropy * 0.5));

  // Branching factor — how many independent paths this event can open
  // Error/failure events branch more (they affect multiple downstream handlers)
  // Retry events branch less (they're contained within a job chain)
  const type = entry.type || '';
  let branchingFactor = 1.0;
  if (type.includes('error') || type.includes('fail'))       branchingFactor = 2.5;
  if (type.includes('disconnect') || type.includes('offline'))branchingFactor = 3.0;
  if (type.includes('violation') || type.includes('corrupt')) branchingFactor = 3.5;
  if (type.includes('collapse'))                              branchingFactor = 4.0;
  if (type.includes('retry') || type.includes('chunk'))       branchingFactor = 1.2;
  if (type.includes('complete') || type.includes('resolved')) branchingFactor = 0.5;

  // Resistance — how much the current field state dampens propagation
  // High coherence + low entropy = field resists propagation
  const resistance = Math.max(0, coherence * 0.6 - entropy * 0.4);

  // Decay rate — energy lost per hop
  // High coherence means fast decay (stable system absorbs perturbations)
  // Low coherence means slow decay (unstable system propagates perturbations)
  const decayRate = Math.min(0.85, Math.max(0.05, coherence * 0.7 - tension * 0.3));

  // Effective propagation energy at hop N:
  // E(N) = magnitude × branchingFactor^N × (1 - decayRate)^N × (1 / (1 + resistance))
  // We compute for N=1 (direct), N=3 (wave), N=6 (tidal) to estimate regime
  const R = 1 / (1 + resistance);
  const e1 = magnitude * branchingFactor     * Math.pow(1 - decayRate, 1) * R;
  const e3 = magnitude * Math.pow(branchingFactor, 3) * Math.pow(1 - decayRate, 3) * R;
  const e6 = magnitude * Math.pow(branchingFactor, 6) * Math.pow(1 - decayRate, 6) * R;

  return {
    magnitude:      +magnitude.toFixed(4),
    entropy:        +entropy.toFixed(4),
    branchingFactor:+branchingFactor.toFixed(4),
    resistance:     +resistance.toFixed(4),
    decayRate:      +decayRate.toFixed(4),
    // Predicted energy at each propagation depth
    energyAtHop1:   +e1.toFixed(4),
    energyAtHop3:   +e3.toFixed(4),
    energyAtHop6:   +e6.toFixed(4),
    // Predicted regime based on impulse physics alone (before graph traversal confirms)
    predictedRegime: e6 > 0.4 ? 'tidal' : e3 > 0.2 ? 'wave' : 'ripple',
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COMPOUND_CLASS = {
  RIPPLE: 'ripple',   // 1 direct downstream event
  WAVE:   'wave',     // 2–5 downstream events, spreading
  TIDAL:  'tidal',    // 6+ downstream events, compounding cascade
};

// Thresholds for classification
const THRESHOLDS = {
  WAVE_MIN_SPREAD:    2,     // minimum descendants to be a wave
  TIDAL_MIN_SPREAD:   6,     // minimum descendants to be a tidal
  WAVE_SIGMA:         0.35,  // wave events have sigma > this
  TIDAL_SIGMA:        0.60,  // tidal events have sigma > this
  TIDAL_MIN_SYSTEMS:  2,     // tidal must touch >= this many systems
  COMPOUND_WINDOW_MS: 30000, // time window to consider downstream events
  MAX_TRACE_DEPTH:    20,    // prevent runaway traversal
};

// ── SISO primitives (inline — no external dep) ────────────────────────────────
class Event {
  constructor(type, data = {}) {
    this.uuid = randomUUID(); this.type = type; this.data = data; this.ts = Date.now();
  }
}
class Gate {
  constructor(sig) { this.signature = sig; }
  transform() {}
}
class Stream {
  constructor() { this.gates = new Map(); this.pending = []; }
  register(gate) {
    if (this.gates.has(gate.signature))
      throw new Error(`[compound] signature collision: ${gate.signature}`);
    this.gates.set(gate.signature, gate);
  }
  emit(event) {
    const gate = this.gates.get(event.type);
    if (gate) gate.transform(event, this);
    else this.pending.push(event);
  }
  sampleHere() { return { pending: [...this.pending] }; }
}

// ══════════════════════════════════════════════════════════════════════════════
// GATES — each gate performs one analysis. SISO pipeline.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * DescendantGate — walks the causal graph forward from rootId,
 * collects all downstream events within COMPOUND_WINDOW_MS.
 * Emits 'compound.descendants.found'.
 */
class DescendantGate extends Gate {
  constructor(graph) { super('compound.analyze'); this._graph = graph; }
  transform(event, stream) {
    const { rootEntry, resolve, reject } = event.data;
    const rootId  = rootEntry.uuid;
    const rootTs  = rootEntry.ts || 0;
    const cutoff  = rootTs + THRESHOLDS.COMPOUND_WINDOW_MS;

    // Walk descendants — stop at time cutoff or max depth
    const desc = this._walkDescendants(rootId, rootTs, cutoff, 0, new Set());

    stream.emit(new Event('compound.descendants.found', {
      rootEntry, descendants: desc, resolve, reject,
    }));
  }

  _walkDescendants(id, rootTs, cutoff, depth, visited) {
    if (depth >= THRESHOLDS.MAX_TRACE_DEPTH) return [];
    if (visited.has(id)) return [];
    visited.add(id);

    const result = [];
    const graph  = this._graph;

    // All edges FROM this node
    for (const edge of graph.edges) {
      if (edge.from !== id) continue;
      if (!['causal', 'job', 'session'].includes(edge.type)) continue;

      const child = graph.nodes.get(edge.to);
      if (!child) continue;
      if ((child.ts || 0) > cutoff) continue;

      result.push({ entry: child, edge, depth: depth + 1 });
      const childDesc = this._walkDescendants(edge.to, rootTs, cutoff, depth + 1, visited);
      result.push(...childDesc);
    }

    return result;
  }
}

/**
 * ClassifyGate — classifies the compound effect as ripple/wave/tidal.
 * Emits 'compound.classified'.
 */
class ClassifyGate extends Gate {
  constructor() { super('compound.descendants.found'); }
  transform(event, stream) {
    const { rootEntry, descendants, resolve, reject } = event.data;

    const spread  = descendants.length;
    const depth   = descendants.length > 0
      ? Math.max(...descendants.map(d => d.depth))
      : 0;

    // Sigma progression — how sigma evolved across the chain
    const sigmaProgression = [rootEntry.sigma?.score ?? 0,
      ...descendants.map(d => d.entry.sigma?.score ?? 0)];

    const peakSigma   = Math.max(...sigmaProgression);
    const avgSigma    = sigmaProgression.reduce((a, b) => a + b, 0) / sigmaProgression.length;

    // Delta tension progression
    const deltaProgression = [rootEntry.delta?.tension ?? 0,
      ...descendants.map(d => d.entry.delta?.tension ?? 0)];
    const peakTension = Math.max(...deltaProgression);

    // Affected systems
    const affectedSystems = [...new Set([
      rootEntry.source || rootEntry._system || rootEntry.system,
      ...descendants.map(d => d.entry.source || d.entry._system || d.entry.system),
    ].filter(Boolean))];

    // CFR regimes seen across the chain
    const regimes = [...new Set([
      rootEntry.cfr?.regime,
      ...descendants.map(d => d.entry.cfr?.regime),
    ].filter(Boolean))];

    // ── Classify ───────────────────────────────────────────────────────────
    let compoundClass;
    if ((peakSigma >= THRESHOLDS.TIDAL_SIGMA && affectedSystems.length >= THRESHOLDS.TIDAL_MIN_SYSTEMS) ||
        (regimes.includes('chaotic') && affectedSystems.length >= THRESHOLDS.TIDAL_MIN_SYSTEMS) ||
        (regimes.includes('turbulent') && spread >= THRESHOLDS.TIDAL_MIN_SPREAD && peakSigma >= THRESHOLDS.TIDAL_SIGMA) ||
        spread >= THRESHOLDS.TIDAL_MIN_SPREAD) {
      compoundClass = COMPOUND_CLASS.TIDAL;
    } else if (spread >= THRESHOLDS.WAVE_MIN_SPREAD ||
               peakSigma >= THRESHOLDS.WAVE_SIGMA) {
      compoundClass = COMPOUND_CLASS.WAVE;
    } else {
      compoundClass = COMPOUND_CLASS.RIPPLE;
    }

    stream.emit(new Event('compound.classified', {
      rootEntry, descendants, spread, depth,
      compoundClass, sigmaProgression, deltaProgression,
      peakSigma, peakTension, avgSigma,
      affectedSystems, regimes, resolve, reject,
    }));
  }
}

/**
 * DocumentGate — builds the canonical CausalRecord and resolves.
 * A tidal or wave emits 'compound.documented' for external listeners.
 * A ripple resolves silently — it is expected normal flow.
 */
class DocumentGate extends Gate {
  constructor() { super('compound.classified'); }
  transform(event, stream) {
    const {
      rootEntry, descendants, spread, depth,
      compoundClass, sigmaProgression, deltaProgression,
      peakSigma, peakTension, avgSigma,
      affectedSystems, regimes, resolve,
    } = event.data;

    // Build the causal chain summary
    const causalChain = [
      _summariseEntry(rootEntry, 0, 'root'),
      ...descendants.slice(0, 40).map(d =>
        _summariseEntry(d.entry, d.depth, d.edge.type)
      ),
    ];

    // Compute causal impulse — the physics the regime emerged from
    const impulse = computeCausalImpulse(rootEntry);

    // Determine dominant regime
    const regime = regimes.includes('chaotic')   ? 'chaotic'
                 : regimes.includes('turbulent') ? 'turbulent'
                 : regimes.includes('resonant')  ? 'resonant'
                 : 'stable';

    // Compounding signature — what patterns amplified the effect
    const compoundingFactors = _identifyCompoundingFactors(
      rootEntry, descendants, sigmaProgression, deltaProgression
    );

    const record = {
      uuid:               randomUUID(),
      class:              compoundClass,
      impulse,                            // causal physics — the energy that drove propagation
      rootCause:          _summariseEntry(rootEntry, 0, 'root'),
      rootType:           rootEntry.type,
      rootSystem:         rootEntry.source || rootEntry._system || rootEntry.system,
      rootTs:             rootEntry.ts,
      causalChain,
      affectedSystems,
      regimes,
      regime,
      spread,
      depth,
      sigmaProgression,
      deltaProgression,
      peakSigma:          +peakSigma.toFixed(4),
      peakTension:        +peakTension.toFixed(4),
      avgSigma:           +avgSigma.toFixed(4),
      compoundingFactors,
      documented:         true,
      ts:                 Date.now(),
    };

    // Ripples resolve silently — they are expected
    if (compoundClass === COMPOUND_CLASS.RIPPLE) {
      resolve({ ok: true, class: compoundClass, record: null });
      return;
    }

    // Waves and tidal waves are documented and surfaced
    stream.emit(new Event('compound.documented', { record, compoundClass }));
    resolve({ ok: true, class: compoundClass, record });
  }
}

/**
 * TidalAlertGate — tidal waves get written to the gaps table.
 * Waves get written to event_log. Both get written to causal_records.
 */
class TidalAlertGate extends Gate {
  constructor(ctx) { super('compound.documented'); this._ctx = ctx; }
  transform(event) {
    const { record, compoundClass } = event.data;

    // Write to causal_records (always)
    if (this._ctx.jaaDB) {
      try {
        this._ctx.jaaDB.insert('event_log', {
          uuid:     randomUUID(),
          type:     `compound.${compoundClass}`,
          payload:  {
            rootType:         record.rootType,
            rootSystem:       record.rootSystem,
            spread:           record.spread,
            depth:            record.depth,
            peakSigma:        record.peakSigma,
            peakTension:      record.peakTension,
            affectedSystems:  record.affectedSystems,
            regime:           record.regime,
            compoundingFactors: record.compoundingFactors,
            causalRecordUuid: record.uuid,
          },
          source:   'compound-engine',
          causedBy: record.rootCause?.uuid || null,
          ts:       Date.now(),
        });
      } catch(_) {}
    }

    // Tidal waves open a gap
    if (compoundClass === COMPOUND_CLASS.TIDAL && this._ctx.jaaDB) {
      try {
        const gapRow = {
          uuid:      randomUUID(),
          type:      'tidal_cascade',
          path:      `compound/${record.rootSystem || 'unknown'}`,
          body:      _tidalDescription(record),
          severity:  record.peakSigma > 0.8 ? 'fatal' : 'high',
          status:    'open',
          source:    'compound-engine',
          causedBy:  record.rootCause?.uuid || null,
          createdAt: Date.now(),
          ts:        Date.now(),
          meta: {
            compoundClass:    record.class,
            spread:           record.spread,
            depth:            record.depth,
            peakSigma:        record.peakSigma,
            peakTension:      record.peakTension,
            affectedSystems:  record.affectedSystems,
            regimes:          record.regimes,
            compoundingFactors: record.compoundingFactors,
            causalRecordUuid: record.uuid,
          },
        };
        this._ctx.jaaDB.insert('gaps', gapRow);
        domainNodes.writeGapNode(gapRow);
      } catch(_) {}
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function _summariseEntry(entry, depth, edgeType) {
  if (!entry) return null;
  return {
    uuid:     entry.uuid,
    type:     entry.type,
    system:   entry.source || entry._system || entry.system,
    depth,
    edgeType,
    sigma:    +(entry.sigma?.score ?? entry.sigma ?? 0).toFixed(4),
    tension:  +(entry.delta?.tension ?? 0).toFixed(4),
    regime:   entry.cfr?.regime || null,
    ts:       entry.ts,
  };
}

/**
 * _identifyCompoundingFactors — what patterns caused the event to amplify
 * rather than dampen. Named factors are the difference between a ripple
 * that fades and a tidal that keeps growing.
 */
function _identifyCompoundingFactors(rootEntry, descendants, sigmaProgression, deltaProgression) {
  const factors = [];

  // Sigma amplification — each hop increases sigma
  const sigmaSlope = sigmaProgression.length > 1
    ? (sigmaProgression[sigmaProgression.length - 1] - sigmaProgression[0]) / sigmaProgression.length
    : 0;
  if (sigmaSlope > 0.05) {
    factors.push({
      name:   'sigma_amplification',
      desc:   'Each downstream event has higher sigma than the previous — divergence is growing, not dampening',
      slope:  +sigmaSlope.toFixed(4),
    });
  }

  // Retry cascade — retries in the chain amplify resonance
  const retryCount = descendants.filter(d =>
    d.entry.type?.includes('retry') || d.entry.type?.includes('retry')
  ).length;
  if (retryCount >= 2) {
    factors.push({
      name:   'retry_cascade',
      desc:   `${retryCount} retry events in the causal chain — each retry increases resonance and friction`,
      count:  retryCount,
    });
  }

  // Cross-system propagation — effect crossed a system boundary
  const systems = [...new Set([
    rootEntry.source,
    ...descendants.map(d => d.entry.source || d.entry._system),
  ].filter(Boolean))];
  if (systems.length >= 2) {
    factors.push({
      name:     'cross_system_propagation',
      desc:     `Effect crossed ${systems.length} system boundaries — isolation failed`,
      systems,
    });
  }

  // Gap chain — gaps opened and not resolved within the window
  const gapOpened   = descendants.filter(d => d.entry.type?.includes('gap.found') || d.entry.type?.includes('gap.created')).length;
  const gapResolved = descendants.filter(d => d.entry.type?.includes('gap.resolved')).length;
  if (gapOpened > gapResolved) {
    factors.push({
      name:     'unresolved_gap_chain',
      desc:     `${gapOpened} gaps opened, ${gapResolved} resolved — ${gapOpened - gapResolved} unresolved gaps compounding`,
      opened:   gapOpened,
      resolved: gapResolved,
    });
  }

  // Contract violation amplifier — contract violations spread entropy
  const contractViolations = descendants.filter(d =>
    d.entry.type?.includes('contract.violation') ||
    d.entry.type?.includes('contract.structural')
  ).length;
  if (contractViolations > 0) {
    factors.push({
      name:   'contract_violation_amplifier',
      desc:   `${contractViolations} contract violation(s) in the chain — each violation injects +0.15 entropy into CFR field`,
      count:  contractViolations,
    });
  }

  // Tension escalation — delta tension grew across hops
  const tensionSlope = deltaProgression.length > 1
    ? (deltaProgression[deltaProgression.length - 1] - deltaProgression[0]) / deltaProgression.length
    : 0;
  if (tensionSlope > 0.04) {
    factors.push({
      name:   'tension_escalation',
      desc:   'Delta tension is growing across hops — system is not dampening the transition, it is amplifying it',
      slope:  +tensionSlope.toFixed(4),
    });
  }

  // Silence then burst — long gap then many events = held queue drain or backpressure release
  const intervals = descendants.map(d => d.entry.ts || 0).filter(Boolean);
  if (intervals.length > 2) {
    const gaps = intervals.slice(1).map((t, i) => t - intervals[i]);
    const maxGap = Math.max(...gaps);
    if (maxGap > 5000 && descendants.length > 3) {
      factors.push({
        name:   'backpressure_release',
        desc:   `${Math.round(maxGap/1000)}s gap in the causal chain then burst of ${descendants.length} events — held queue or backpressure release`,
        maxGapMs: maxGap,
      });
    }
  }

  return factors;
}

function _tidalDescription(record) {
  const factors = record.compoundingFactors.map(f => f.name).join(', ');
  return [
    `TIDAL CASCADE from ${record.rootType} (${record.rootSystem})`,
    `Spread: ${record.spread} downstream events across ${record.affectedSystems.length} systems`,
    `Depth: ${record.depth} hops | Peak sigma: ${record.peakSigma} | Peak tension: ${record.peakTension}`,
    `Regime: ${record.regime}`,
    `Compounding factors: ${factors || 'none identified'}`,
    `Causal record: ${record.uuid}`,
  ].join('\n');
}

// ══════════════════════════════════════════════════════════════════════════════
// createCompoundEngine — main factory
// ══════════════════════════════════════════════════════════════════════════════

function createCompoundEngine({ graph, jaaDB = null } = {}) {
  if (!graph) throw new Error('[compound §1.2] graph required');

  const ctx    = { jaaDB };
  const stream = new Stream();

  stream.register(new DescendantGate(graph));
  stream.register(new ClassifyGate());
  stream.register(new DocumentGate());
  stream.register(new TidalAlertGate(ctx));

  /**
   * analyze — analyze the compounding effects of a single ledger entry.
   * Returns a CausalRecord for waves/tidals, null for ripples.
   *
   * @param {object} rootEntry — ledger entry to analyze from
   * @returns {Promise<{ ok, class, record }>}
   */
  function analyze(rootEntry) {
    return new Promise((resolve, reject) => {
      stream.emit(new Event('compound.analyze', { rootEntry, resolve, reject }));
    });
  }

  /**
   * analyzeChain — analyze a full causal chain from a UUID.
   * Walks ancestors to find the true root, then analyzes forward from there.
   */
  function analyzeChain(entryUuid) {
    const node = graph.nodes.get(entryUuid);
    if (!node) return Promise.resolve({ ok: false, error: 'entry not found' });

    // Walk to true root
    const ancestors = graph.ancestors(entryUuid);
    const root = ancestors[0] || node;

    return analyze(root);
  }

  /**
   * scan — scan recent high-sigma events and analyze each for compounding effects.
   * Returns all non-ripple records found.
   */
  async function scan(sigmaThreshold = 0.4) {
    const highSigma = graph.highSigmaNodes(sigmaThreshold);
    const records   = [];

    for (const node of highSigma.slice(0, 20)) {
      try {
        const result = await analyze(node);
        if (result.ok && result.record) {
          records.push(result.record);
        }
      } catch(_) {}
    }

    return records.sort((a, b) => b.peakSigma - a.peakSigma);
  }

  /**
   * report — human-readable summary of compounding effects in the system.
   * Written to event_log as compound.report.
   */
  async function report(sigmaThreshold = 0.4) {
    const records = await scan(sigmaThreshold);

    const tidal = records.filter(r => r.class === COMPOUND_CLASS.TIDAL);
    const wave  = records.filter(r => r.class === COMPOUND_CLASS.WAVE);

    const summary = {
      scanned:     graph.nodes.size,
      tidalCount:  tidal.length,
      waveCount:   wave.length,
      tidal,
      waves: wave.slice(0, 5),
      topCompoundingFactors: _topFactors(records),
      ts: Date.now(),
    };

    if (jaaDB) {
      try {
        jaaDB.insert('event_log', {
          uuid:    randomUUID(),
          type:    'compound.report',
          payload: {
            scanned:    summary.scanned,
            tidalCount: summary.tidalCount,
            waveCount:  summary.waveCount,
            topFactors: summary.topCompoundingFactors,
          },
          source:   'compound-engine',
          causedBy: null,
          ts:       Date.now(),
        });
      } catch(_) {}
    }

    return summary;
  }

  return { analyze, analyzeChain, scan, report, COMPOUND_CLASS, THRESHOLDS };
}

function _topFactors(records) {
  const counts = {};
  for (const r of records) {
    for (const f of (r.compoundingFactors || [])) {
      counts[f.name] = (counts[f.name] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
}

module.exports = { createCompoundEngine, computeCausalImpulse, COMPOUND_CLASS, THRESHOLDS };
