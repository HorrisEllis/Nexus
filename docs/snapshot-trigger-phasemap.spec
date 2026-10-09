spec:
  meta:
    name:        snapshot-trigger-and-diagnostic
    roadmap: 'later — later (declutter 2026-10-09, James: "okay")'
    version:     0.1.0-phasemap
    status: >-
      PHASEMAP 2026-07-30. James: "the replay engine and snapshot
      system — it's working, but I don't know what's triggering the
      snapshots. It's supposed to be event-driven but it's not doing it
      very often. That needs to be part of the diagnostic system."
    uuid:        nexus-snapshot-trigger-v0-0000-2026-0730-001

  diagnosis_verified_2026_07_30:
    symptom:      "Only 2 snapshots on disk, ~4.4h apart. 'Not very often' confirmed."
    root_cause:   "§0.1 — POST /api/snapshots/create (cortex/boot.js:890) is the ONLY
                   snapshot path, plus RAID isolation snapshotting a FAILED decision
                   (raid/index.js:430). There is NO event-driven trigger on state
                   change/drift. So snapshots happen only on manual POST or on a RAID
                   failure — never 'when the system meaningfully changed'. The
                   snapshot LOGIC is sound (hashes all cortex tables → stateHash,
                   dedup-safe); only the TRIGGER is missing."
    signal_available: "cortex/boot.js has a live CFR _field with regime
                   (stable/ordered/chaotic) + computeSigma exists. A drift/regime
                   crossing is the natural event trigger."

  governing_axioms:
    - "§8.6 reuse before build — the snapshot creator + CFR field + sigma all EXIST; wire a trigger, don't rebuild."
    - "§13.4 drift is data — a snapshot SHOULD be taken when drift is significant; that's the event."
    - "§2.1 baseline before diff — snapshot must write BEFORE drift is acted on (already the RAID pattern)."
    - "§1.2 nothing silently fails — a skipped-or-failed auto-snapshot is logged, never silent."
    - "§16.4 — don't snapshot on every tick (noise); snapshot when state MEANINGFULLY changed (earns it)."

  phases:

    SS1_drift_triggered_snapshot:
      does: "Add an event-driven trigger: when sigma/regime crosses a threshold
              (meaningful drift), take a snapshot automatically. Debounced so a
              storm of events doesn't create a snapshot storm (§16.4)."
      reuse: "§8.6 — calls the EXISTING snapshot creator; watches the EXISTING CFR
              field/sigma. New code = the trigger + debounce only."
      gate:  "a meaningful drift event produces a snapshot; trivial churn does not."
      axioms: [§8.6, §13.4, §16.4]
      drift:  "trigger sensitivity — too eager = snapshot storm, too lazy = the
               current bug. The threshold + min-interval are the tuning surface."

    SS2_snapshot_in_diagnostics:
      does: "Surface snapshot health in the diagnostic system (James's ask): when
              was the last snapshot, how long since, is the cadence healthy or has
              it gone quiet (the exact symptom). A stale snapshot age is a finding."
      reuse: "§8.6 — extends OB1 diagnose() + OB2 sweep; adds a snapshot-age check."
      gate:  "diagnostics report last-snapshot age; an over-stale gap (e.g. > the
               expected interval with drift present) is flagged as a finding."
      axioms: [§13.4, §1.2, §17.6]
      drift:  "staleness threshold — what counts as 'gone quiet' is the tuning surface."

  ordering_rationale: >
    SS1 fixes the trigger (the actual bug); SS2 makes the diagnostic system watch
    the trigger so if it ever goes quiet again, NEXUS notices instead of James.
    That's the durable fix — not just 'snapshot more', but 'the system knows when
    it stopped'.

  honest_risks:
    - "Auto-snapshot cadence is a live-tuning question — the threshold/interval prove out on James's booted system, not in sandbox. SS1 exposes them as editable, not hardcoded."
    - "§2.2 — snapshots write to data/** which is NEVER committed; only the trigger CODE is committed."
