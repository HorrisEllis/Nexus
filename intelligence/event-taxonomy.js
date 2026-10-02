'use strict';
// intelligence/event-taxonomy.js — every event intelligence emits, in the ET1 shape (lib/event-taxonomy-pattern.js).
// component_id: intelligence.event-taxonomy
// Map: docs/2026-10-02-emerge-field-memory-build-phasemap.spec (EV0, invariant E14)
//
// Written from the code: each entry is an event a file under intelligence/ emits today — the topo kernel and its SNR
// gate, the telemetry codec (tc.*), causal anomaly and compound analysis, the CFR contract verifier, the liminal
// space, pattern crystallisation and the server's system stream — its payloadShape the fields at the emit site.
// The contract verifier's events go out through its onViolation callback as { type, system, severity, message,
// details }; `contract.ok` is its positive twin (_emitPositive), declared though the reader does not see that call.
// `nexus contracts check --system=intelligence` holds it to the code.

module.exports = Object.freeze({
  // ── the topo kernel (topo-kernel/) ───────────────────────────────────────────────────────────────────────────
  SYSTEM_BOOT: { description: 'The topo kernel is booting.', payloadShape: ['version', 'ts'], severity: 'info' },
  SYSTEM_READY: { description: 'The topo kernel is ready.', payloadShape: ['ts'], severity: 'info' },
  SYSTEM_ERROR: { description: 'A gate on the topo kernel\'s bus threw while handling an event.', payloadShape: ['gateId', 'error', 'eventId'], severity: 'failure' },
  SIGNAL_RAW: { description: 'A raw signal entered the SNR gate.', payloadShape: ['signal'], severity: 'info' },
  SIGNAL_PASSED: { description: 'A signal passed the SNR gate: its SNR, gate scores, posterior and composite.', payloadShape: ['signal', 'snr', 'gateScores', 'posterior', 'composite'], severity: 'info' },
  SIGNAL_DROPPED: { description: 'A signal was dropped by the SNR gate, and why.', payloadShape: ['signal', 'reason', 'snr', 'gateScores', 'posterior', 'composite'], severity: 'info' },

  // ── the telemetry codec (telemetry-codec/) ───────────────────────────────────────────────────────────────────
  TC_METRIC_RAW: { description: 'A raw metric reading from a service.', payloadShape: ['serviceId', 'metric', 'value', 'raw', 'ts'], severity: 'info' },
  TC_METRIC_SLOPE: { description: 'A metric\'s slope over its window.', payloadShape: ['serviceId', 'metric', 'result', 'ts'], severity: 'info' },
  TC_METRIC_STABILITY: { description: 'A metric\'s stability over its window.', payloadShape: ['serviceId', 'metric', 'result', 'ts'], severity: 'info' },
  TC_METRIC_OSCILLATION: { description: 'A metric is oscillating.', payloadShape: ['serviceId', 'metric', 'result', 'ts'], severity: 'notable' },
  TC_COHERENCE_UPDATE: { description: 'A service\'s metrics agree or disagree; how many are dissonant and by how much.', payloadShape: ['serviceId', 'dissonant', 'dissonanceCount', 'magnitude', 'ts'], severity: 'info' },
  TC_DRIFT_CALIBRATED: { description: 'The drift engine has its baseline for a service.', payloadShape: ['serviceId', 'ts'], severity: 'info' },
  TC_DRIFT_SIGNAL: { description: 'A service is drifting from its baseline: the signal, its confidence and evidence.', payloadShape: ['serviceId', 'signal', 'confidence', 'evidence', 'ts'], severity: 'notable' },
  TC_DRIFT_CLUSTER: { description: 'Several drift signals on one service at once.', payloadShape: ['serviceId', 'signals', 'count', 'magnitude', 'ts'], severity: 'warning' },
  TC_LATENT_UPDATE: { description: 'A service\'s latent state was updated.', payloadShape: ['serviceId', 'state', 'frame', 'ts'], severity: 'info' },
  TC_LATENT_SHIFT: { description: 'A service\'s latent state shifted.', payloadShape: ['serviceId', 'shifts', 'state', 'frame', 'ts'], severity: 'notable' },
  TC_TOPOLOGY_COMPOSITE: { description: 'A service\'s composite topology reading: its label, score and confidence.', payloadShape: ['serviceId', 'label', 'score', 'confidence', 'ts'], severity: 'info' },
  TC_TOPOLOGY_TRANSITION: { description: 'A service\'s topology moved from one label to another.', payloadShape: ['serviceId', 'from', 'to', 'score', 'ts'], severity: 'notable' },
  TC_TOPOLOGY_PULSE: { description: 'A service\'s topology pulse: the dominant label and the active signals.', payloadShape: ['serviceId', 'dominant', 'active', 'signals', 'frame', 'ts'], severity: 'info' },

  // ── causal (causal/) ─────────────────────────────────────────────────────────────────────────────────────────
  ANOMALY_DETECTED: { description: 'An anomaly was detected and recorded.', payloadShape: ['anomalyUuid', 'type', 'severity', 'sessionId'], severity: 'warning' },
  COMPOUND_ANALYZE: { description: 'A compound analysis was asked for from a root ledger entry.', payloadShape: ['rootEntry', 'resolve', 'reject'], severity: 'info' },
  COMPOUND_DESCENDANTS_FOUND: { description: 'The root entry\'s descendants were found.', payloadShape: ['rootEntry', 'descendants', 'resolve', 'reject'], severity: 'info' },
  COMPOUND_CLASSIFIED: { description: 'The compound was classified: its spread, depth, class and sigma progression.', payloadShape: ['rootEntry', 'descendants', 'spread', 'depth', 'compoundClass', 'sigmaProgression'], severity: 'info' },
  COMPOUND_DOCUMENTED: { description: 'The compound\'s record was written.', payloadShape: ['record', 'compoundClass'], severity: 'notable' },

  // ── the CFR contract verifier (cfr/contract-verifier.js) — delivered through onViolation ─────────────────────
  CONTRACT_STRUCTURAL_FAIL: { description: 'A system emitted an event its contract does not declare.', payloadShape: ['type', 'system', 'severity', 'message', 'details'], severity: 'warning' },
  CONTRACT_BEHAVIORAL_FAIL: { description: 'A system broke a behavioural rule: an expected follow-up took too long or never came.', payloadShape: ['type', 'system', 'severity', 'message', 'details'], severity: 'warning' },
  CONTRACT_TEMPORAL_FAIL: { description: 'A system went silent past its limit, or emitted an error under CFR collapse.', payloadShape: ['type', 'system', 'severity', 'message', 'details'], severity: 'warning' },
  CONTRACT_OK: { description: 'A behavioural rule was met in time.', payloadShape: ['type', 'system', 'severity', 'message', 'details'], severity: 'info' },

  // ── the liminal space (liminal-space/) ───────────────────────────────────────────────────────────────────────
  LIMINAL_ITEM_HELD: { description: 'An item was held in the liminal space, undecided, at its focal point.', payloadShape: ['focalPoint', 'uuid', 'type', 'source'], severity: 'info' },
  LIMINAL_ITEM_RESOLVED: { description: 'A held item was decided.', payloadShape: ['focalPoint', 'uuid', 'decision', 'source'], severity: 'info' },
  LIMINAL_ITEM_DISSOLVED: { description: 'A held item dissolved without a decision, and why.', payloadShape: ['uuid', 'reason'], severity: 'info' },
  LIMINAL_CRYSTALLISED: { description: 'Held items at one focal point crystallised into a pattern.', payloadShape: ['focalPoint', 'type', 'path', 'crystal'], severity: 'notable' },
  LIMINAL_FORWARD_INFERENCE: { description: 'A crystal matched a known precursor: what is likely coming, and its known fix.', payloadShape: ['focalPoint', 'type', 'crystal', 'precursor', 'knownFix', 'message'], severity: 'notable' },
  LIMINAL_VELOCITY_RUNAWAY: { description: 'Items are arriving at a focal point faster than they resolve.', payloadShape: ['focalPoint', 'velocity', 'message'], severity: 'warning' },

  // ── patterns and the system stream (index.js, server.js) ─────────────────────────────────────────────────────
  CORTEX_INTELLIGENCE_PATTERN_CRYSTALLISED: { description: 'A pattern crystallised, with its enrichment — sent on the shared nexus bus.', payloadShape: ['pattern', 'enrichment'], severity: 'notable' },
  INTELLIGENCE_PATTERN_CRYSTALLISED: { description: 'The nexus bus\'s pattern crystallisation, relayed into intelligence\'s own system stream.', payloadShape: ['pattern', 'enrichment'], severity: 'info' },
  INTELLIGENCE_CFR_GAP: { description: 'The CFR ledger found a gap (a sigma spike), relayed into the system stream.', payloadShape: ['type', 'severity', 'entry', 'message'], severity: 'notable' },
  INTELLIGENCE_FRAMEWORK_CREATED: { description: 'A framework skeleton was written to intelligence/output/.', payloadShape: ['ok', 'outPath', 'tagsPath', 'uuid'], severity: 'info' },
});
