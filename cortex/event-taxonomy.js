'use strict';
// cortex/event-taxonomy.js — every event cortex emits, in the ET1 shape (lib/event-taxonomy-pattern.js).
// component_id: cortex.event-taxonomy
// Map: docs/2026-10-02-emerge-field-memory-build-phasemap.spec (EV0, invariant E14)
//
// Written from the code: each entry is an event a file under cortex/ emits today — the gap finder, ORION, RAID (its
// decision and its router) and self-heal with its escalation — its payloadShape the fields at the emit site.
// `nexus contracts check --system=cortex` holds it to the code.

module.exports = Object.freeze({
  // ── gaps and classification ──────────────────────────────────────────────────────────────────────────────────
  CORTEX_GAP_FOUND: { description: 'Cortex found a gap and recorded it.', payloadShape: ['gap'], severity: 'notable' },
  CORTEX_ORION_CLASSIFIED: { description: 'ORION classified an anomaly or sigma event into a fault class with its CFR regime and cause.', payloadShape: ['faultClass', 'intent', 'context', 'source', 'reason', 'ts'], severity: 'info' },

  // ── RAID ─────────────────────────────────────────────────────────────────────────────────────────────────────
  CORTEX_RAID_DECIDED: { description: 'RAID decided what to do about a fault, and what caused it.', payloadShape: ['decision', 'faultClass', 'causedBy'], severity: 'notable' },
  RAID_ROUTE_REQUEST: { description: 'A request envelope entered RAID\'s router.', payloadShape: ['envelope'], severity: 'info' },
  RAID_ROUTE_DECIDED: { description: 'The router chose the capability that will handle the envelope.', payloadShape: ['envelope', 'capability'], severity: 'info' },
  RAID_ROUTE_NO_ROUTE: { description: 'No capability can handle the envelope.', payloadShape: ['envelope'], severity: 'warning' },
  RAID_ROUTE_FULFILLED: { description: 'The routed envelope was fulfilled; its trail is stamped and kept.', payloadShape: ['envelope'], severity: 'info' },
  RAID_ROUTE_FAILED: { description: 'The routed envelope failed; its trail is stamped and kept.', payloadShape: ['envelope'], severity: 'failure' },

  // ── self-heal ────────────────────────────────────────────────────────────────────────────────────────────────
  CORTEX_SELF_HEAL_FIX_STAGED: { description: 'Self-heal staged a candidate fix for a gap (not applied).', payloadShape: ['gapType', 'gapUuid', 'level', 'candidate'], severity: 'notable' },
  CORTEX_SELF_HEAL_REMEDIATION_REQUESTED: { description: 'Self-heal asked for a remediation of a known pattern in a module.', payloadShape: ['gapType', 'gapUuid', 'level', 'pattern', 'modulePath', 'message'], severity: 'notable' },
  CORTEX_SELF_HEAL_FIX_PROPOSED: { description: 'Self-heal proposed a fix for a gap, for review.', payloadShape: ['gapType', 'gapUuid', 'level', 'proposal'], severity: 'notable' },
  CORTEX_SELF_HEAL_DEEP_SCAN_FINDINGS: { description: 'A deep scan of a gap found what it found: level, criticality and composite score.', payloadShape: ['gapType', 'gapUuid', 'level', 'critical', 'composite'], severity: 'info' },
  CORTEX_SELF_HEAL_FAILURE_MODE: { description: 'A gap was recorded as a failure mode: self-heal could not fix it.', payloadShape: ['gapType', 'gapUuid', 'level', 'message'], severity: 'warning' },
  CORTEX_SELF_HEAL_SKIPPED: { description: 'Self-heal skipped a gap, and why.', payloadShape: ['gapType', 'gapUuid', 'reason'], severity: 'info' },
  CORTEX_SELF_HEAL_EMERGENCY_GC: { description: 'Self-heal forced a garbage collection under memory pressure, and how much it freed.', payloadShape: ['faultClass', 'freedBytes', 'ts'], severity: 'warning' },
  ESCALATION_FRICTION_INCREASED: { description: 'A fault class recurred: its friction rose, possibly into a higher band.', payloadShape: ['faultClass', 'newFric', 'band', 'cause', 'count'], severity: 'warning' },
  ESCALATION_FAILURE_MODE: { description: 'A fault class\'s friction reached the failure-mode band: it is now a recorded failure mode.', payloadShape: ['faultClass', 'friction', 'cause', 'gapUuid', 'message'], severity: 'failure' },
});
