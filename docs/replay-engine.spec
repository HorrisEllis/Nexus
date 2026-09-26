spec:
  meta:
    name:        replay-engine
    version:     1.1.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-replay-engine-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Full observability and replay for every system decision.
      Control-Z for the entire system.
      Snapshot before every decision — no decision without rollback.
      Every input, output, choice, alternative, cost, outcome logged.
      Replay from any point. Sandbox. Compare. Merge or discard.
      Every replay is training data for the pattern engine.

  snapshot_trigger:
    before_every:
      - "RAID routing decision"
      - "forge patch application"
      - "healer prescription execution"
      - "autonomous loop iteration"
      - "hot module integration"
      - "constitutional AI decision"
      - "any write to deterministic zone"
    note: "No decision without a snapshot. No exceptions."

  snapshot_contains:
    - "full JAA state at that moment"
    - "active liminal items (all 5 spaces)"
    - "open gaps and friction scores"
    - "intelligence crystallised pattern index"
    - "user model hypotheses (with confidence)"
    - "current request context and requestId"
    - "RAID weight table"
    - "behavioral boundary state"

  event_schema:
    every_event_carries:
      requestId:    "traces back to origin request"
      ts:           "exact timestamp"
      actor:        "which system/organ made this choice"
      input:        "exactly what came in"
      output:       "exactly what went out"
      decision:     "why this path was chosen"
      alternatives: "what other paths existed and why not chosen"
      cost:         "{ tokens, timeMs, compute, complexity }"
      outcome:      "what happened after"
      satisfaction: "user signal — positive / negative / none"
      snapshotId:   "snapshot taken before this decision"

  replay_engine:
    description: >
      Pick any requestId or timestamp.
      Reconstruct full system state at that moment from snapshot.
      Replay forward from that point.
      Compare replay outcome to original.
      Divergence = something changed between then and now.
    modes:
      sandbox: "never touches live system — isolated replay environment"
      live:    "merge replay outcome back if better — explicit confirm required"
    control_z:
      rewind:  "restore snapshot before any decision"
      reroute: "apply different RAID decision"
      represcribe: "apply different healer prescription"
      compare: "run both paths, see which outcome is better"
      merge:   "if replay is better, merge back"
      discard: "if not, discard — live system unchanged"

  training_loop:
    description: >
      Every replay is training data for the pattern engine.
      Successful replays reinforce the alternative path.
      Failed replays reinforce avoidance of that path.
      User satisfaction signal logged on every output.
      Unsatisfied → friction increases → gap stays open →
      tension builds → pattern engine trains on failure.
      Satisfied → friction reduces → pattern crystallises.

  intelligence_raid_integration:
    description: >
      RAID queries intelligence before every routing decision.
      Intelligence reads crystallised patterns, failure precursors,
      user model hypotheses, active liminal items.
      Decision weighted by intelligence evidence.
      Outcome fed back after execution.
      Pattern engine updates weights.
      Next similar request is smarter.
    feedback_loop:
      - "request → RAID (intelligence-informed) → execute"
      - "outcome → user signal → pattern engine"
      - "updated weights → smarter routing → loop"

  gaps_as_open_loops:
    description: >
      Gaps are open loops. Tension accumulates while open.
      User unsatisfied → friction logged with reason why.
      Every output prompts pattern engine.
      Crystallisation on verified resolution — not just repetition.
      The gap shape is both the diagnostic signal and the fix target.

  phase: "8.6 — between Phase 8 and Phase 9"
