'use strict';
/**
 * contracts/nodes/events.node.js — extracted from contracts/SYSTEM-CONTRACTS.js
 * Real node id: contracts.events.node
 * §EXTRACTED 2026-09-12 — cli/decompose.js --mode=registry, block EVENTS.
 * Verbatim body — this extraction moves the const, it does not re-derive it,
 * so nothing about the taxonomy itself changed, only where it lives.
 */
module.exports = Object.freeze({

  // ── Guardian job lifecycle ─────────────────────────────────────────────────
  GUARDIAN: {
    JOB_QUEUED:            'guardian.job.queued',
    JOB_DISPATCHED:        'guardian.job.dispatched',
    JOB_COMPLETE:          'guardian.job.complete',
    JOB_CONFIRMED:         'guardian.job.confirmed',
    JOB_ERROR:             'guardian.job.error',
    JOB_CHUNK:             'guardian.job.chunk',
    ARTIFACT:              'guardian.artifact',
    ARTIFACTS_WRITTEN:     'guardian.artifacts.written',
    GAPS:                  'guardian.gaps',
    BASELINE_DEVIATION:    'guardian.baseline.deviation',
    DETECTION:             'guardian.detection',
    CORTEX_RESULT:         'guardian.cortex.result',
    CLI_EXEC:              'guardian.cli.exec',
    LEDGER:                'guardian.ledger',
    LEDGER_WRITE:          'guardian.ledger.write',
    PROVIDER_REGISTERED:   'guardian.provider.registered',
    PROVIDER_CONNECTED:    'guardian.provider.connected',
    PROVIDER_DISCONNECTED: 'guardian.provider.disconnected',
    QUEUE_ENQUEUED:        'guardian.queue.enqueued',
    QUEUE_PROGRESS:        'guardian.queue.progress',
    QUEUE_RETRY:           'guardian.queue.retry',
    QUEUE_COMPARTMENT:     'guardian.queue.compartment',
    QUEUE_COMPARTMENT_UPD: 'guardian.queue.compartment.updated',
    SEAM_QUEUE_COMPLETE:   'guardian.seam.queue.complete',
    SEAM_UPDATED:          'guardian.seam.updated',
    SESSION_NAMED:         'guardian.session.named',
    SETTING_UPDATE:        'guardian.setting.update',
    TAB_CLAIMED:           'guardian.tab.claimed',
    TAB_EVENT:             'guardian.tab.event',
    TAB_NEEDED:            'guardian.tab.needed',
    CFR_GAP:               'guardian.cfr.gap',
    GATE_ERROR:            'guardian.gate.error',
    QUEUE_BRIDGE_GATE:     'guardian.queue.bridge_gate',
  },

  // ── SEAM pipeline ──────────────────────────────────────────────────────────
  SEAM: {
    CHUNK_INJECTED: 'seam.chunk.injected',
    CHUNK_STABLE:   'seam.chunk.stable',
    CHUNK_VERIFIED: 'seam.chunk.verified',
    CHUNK_FAILED:   'seam.chunk.failed',
    QUEUE_COMPLETE: 'seam.queue.complete',
    RETRY:          'seam.retry',
    DELIVER:        'seam.deliver',
  },

  // ── Cortex / memory ────────────────────────────────────────────────────────
  CORTEX: {
    GAP_FOUND:       'cortex.gap.found',
    GAP_RESOLVED:    'cortex.gap.resolved',
    MEMORY_UPDATED:  'cortex.memory.updated',
    STORAGE_OPENED:  'cortex.storage.opened',
    EVENT_STORED:    'cortex.event.stored',
    MIRROR_WRITE:    'cortex.mirror.write',
    MIRROR_FAIL:     'cortex.mirror.fail',
    INGEST_OK:       'cortex.ingest.ok',
    INGEST_ERROR:    'cortex.ingest.error',
    TAGS_WRITTEN:    'cortex.tags.written',
    CLI_EXEC:        'cortex.cli.exec',
    CFR_GAP:         'cortex.cfr.gap',
  },

  // ── Contract system ────────────────────────────────────────────────────────
  CONTRACT: {
    OK:               'contract.ok',
    VIOLATION:        'contract.violation',
    STRUCTURAL_FAIL:  'contract.structural.fail',
    BEHAVIORAL_FAIL:  'contract.behavioral.fail',
    TEMPORAL_FAIL:    'contract.temporal.fail',
    AUDIT:            'contract.audit',
    LAW_VIOLATION:    'contract.law_violation',
  },

  // ── RAID contract lifecycle (MCO3c 2026-09-13) ─────────────────────────────
  // §GAP CLOSED — SUBMITTED/ACKNOWLEDGED/REJECTED/PASS/FAIL are NOT new:
  // cortex/core/raid/contract-intake.js's submitContract() (2026-09-02),
  // acknowledge() (RR4/2026-08-30), and reportExternalOutcome() have all
  // been recording these to the real RAID ledger already — verified by
  // grepping the exact literal strings in that file, not assumed from
  // naming convention. They were simply never registered here, an
  // independent documentation gap found this session, not introduced by
  // it. COMPLETE is new — IC5's real, previously-unnamed completion event,
  // added here rather than left implicit.
  //
  // Deliberately namespaced raid.contract.* — NOT under the CONTRACT block
  // above. CONTRACT.* means "did a system's behavior violate its contract"
  // (structural/behavioral/temporal verification, guardian's own real
  // siso.emits list). RAID.CONTRACT.* means "where is this unit of work in
  // its lifecycle" — a different axis entirely. Checked before adding:
  // 'raid.contract.complete' does not collide with anything in the CONTRACT
  // block above or anywhere else in this file (§10.3, one meaning per name).
  RAID: {
    CONTRACT_SUBMITTED:    'raid.contract.submitted',
    CONTRACT_ACKNOWLEDGED: 'raid.contract.acknowledged',
    CONTRACT_REJECTED:     'raid.contract.rejected',
    CONTRACT_PASS:         'raid.contract.pass',
    CONTRACT_FAIL:         'raid.contract.fail',
    CONTRACT_COMPLETE:     'raid.contract.complete',
    CONTRACT_DISPATCHED_CLEARGLASS: 'raid.contract.dispatched.clearglass',
    // §MCO4 2026-09-13 — the 5 real stage-transition events
    // contract-intake.js's new _advanceTo*() functions actually emit,
    // wiring STAGE's remaining dead values. Same raid.contract.* namespace
    // as the six above (lifecycle position, not pass/fail verification).
    CONTRACT_STAGE_INPUT_FOLDER:  'raid.contract.stage.input_folder',
    CONTRACT_STAGE_SYSTEM_QUEUE:  'raid.contract.stage.system_queue',
    CONTRACT_STAGE_PROCESSING:    'raid.contract.stage.processing',
    CONTRACT_STAGE_OUTPUT_FOLDER: 'raid.contract.stage.output_folder',
    CONTRACT_STAGE_QC_PENDING:    'raid.contract.stage.qc_pending',
    // §MCO6/IC9 2026-09-13 — real boot-time reconciliation outcomes.
    CONTRACT_RECONCILED_RESUMED:   'raid.contract.reconciled.resumed',
    CONTRACT_RECONCILED_RETRIED:   'raid.contract.reconciled.retried',
    CONTRACT_RECONCILED_ESCALATED: 'raid.contract.reconciled.escalated',
  },

  // ── Bridge lifecycle ───────────────────────────────────────────────────────
  // ── Orchestrator ───────────────────────────────────────────────────────────
  ORCHESTRATOR: {
    BOOTED:           'orchestrator.booted',
    PULSE:            'orchestrator.pulse',
    SYSTEM_ONLINE:    'orchestrator.system.online',
    SYSTEM_OFFLINE:   'orchestrator.system.offline',
    SYSTEM_STARTING:  'orchestrator.system.starting',
    SYSTEM_FAILED:    'orchestrator.system.failed',
    SYSTEMS_COMPLETE: 'orchestrator.systems.sequence.complete',
    WATCHDOG_TICK:    'orchestrator.watchdog.tick',
    INVARIANTS_SCANNED: 'orchestrator.invariants.scanned',
    LEDGER_WRITE:     'orchestrator.ledger.write',
  },

  // ── Pulse / heartbeat ──────────────────────────────────────────────────────
  PULSE: {
    BEAT:       'heartbeat:pulse',
    MISSED:     'pulse.missed',
    NODE_DEGRADED: 'node:degraded',
    NODE_DEAD:  'node:dead',
    NCP_READY:  'NCP_READY',
    NCP_CLIENT_CONNECTED:    'ncp.client.connected',
    NCP_CLIENT_DISCONNECTED: 'ncp.client.disconnected',
    NCP_CLIENT_EVICTED:      'ncp.client.evicted',
    NCP_MESSAGE_RECEIVED:    'ncp.message.received',
  },

  // ── Self-heal ──────────────────────────────────────────────────────────────
  HEALER: {
    RESOLVED:   'healer.resolved',
    ESCALATED:  'healer.escalated',
    PATCHED:    'self-heal.patched',
  },

  // ── Idearium ───────────────────────────────────────────────────────────────
  IDEARIUM: {
    IDEA_CREATED:  'idearium.idea.created',
    IDEA_UPDATED:  'idearium.idea.updated',
    IDEA_LINKED:   'idearium.idea.linked',
    IDEA_TENSIONED:'idearium.idea.tensioned',
    IDEA_ARCHIVED: 'idearium.idea.archived',
    SPEC_CREATED:  'idearium.spec.created',
    SPEC_UPDATED:  'idearium.spec.updated',
    SPEC_CHECKED:  'idearium.spec.checked',
    GAP_CREATED:   'idearium.gap.created',
    GAP_RESOLVED:  'idearium.gap.resolved',
    SNR_UPDATE:    'idearium.snr.update',
    SNAPSHOT_PUSHED: 'idearium.snapshot.pushed',
    ERROR:         'idearium.error',
  },

  // ── Emerge ─────────────────────────────────────────────────────────────────
  EMERGE: {
    COMPILE_COMPLETE: 'emerge.compile.complete',
    SNR_UPDATE:       'emerge.snr.update',
    GAP_DETECTED:     'emerge.gap.detected',
  },

  // ── CFR field events ───────────────────────────────────────────────────────
  CFR: {
    SIGMA_SPIKE:    'sigma.spike',
    DELTA_TENSION:  'delta.tension',
    CFR_COLLAPSE:   'cfr.collapse',
    REGIME_CHANGE:  'cfr.regime.change',
    FIELD_UPDATE:   'cfr.field.update',
  },

  // ── Compound effects engine ────────────────────────────────────────────────
  COMPOUND: {
    RIPPLE:     'compound.ripple',     // single-hop effect — expected normal flow
    WAVE:       'compound.wave',       // 2-5 downstream events — spreading
    TIDAL:      'compound.tidal',      // 6+ downstream events — compounding cascade
    DOCUMENTED: 'compound.documented', // wave/tidal written to event_log
    REPORT:     'compound.report',     // scan report written to event_log
    ANALYZE:    'compound.analyze',    // analysis triggered on sigma spike
  },

  // ── System lifecycle (cross-system) ────────────────────────────────────────
  SYSTEM: {
    BOOTED:   'system.booted',
    ONLINE:   'system.online',
    OFFLINE:  'system.offline',
    REGISTERED: 'system.registered',
    STEP_COMPLETE: 'system.step.complete',
    STEP_FAILED:   'system.step.failed',
  },
});
