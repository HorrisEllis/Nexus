nexus:
  spec:
    id:          session-2026-08-18-axioms-governed-phasemap
    version:     1.0.0-phasemap
    status:      ACTIVE — living record, extend in place, no new fragments
    created:     2026-08-18
    checkout: >-
      "current-expanded" (nexus_-_current.zip lineage, 340+ real commits at time of writing)
    governing_law: docs/AXIOMS-v3.1.md — read in full before this phase of work began; every item below cites the specific §.

  # ── real, done, verified this session in this checkout ───────────────────
  done:
    - what: "GA3/GA6/GA9 — guardian tool-index bridge, architecture-template-as-compartment, compartment list/delete chat triggers"
      commits: [0392abc, d064bac, 4a15ef1]
    - what: "6 real staleness bugs (query() vs tail()) found and fixed across cortex/intelligence — including the pattern engine's own core state"
      commits: [0eb5008, d21107e, 54b3fa1]
    - what: "error-capture dedup — the real, direct fix for the 383MB/day log files"
      commits: [62e5d21]
    - what: "unbounded copilot _sessions Map fixed — the likely real cause of 'RAM plummets after asking a question'"
      commits: [3b6ab6a]
    - what: "guardian _activeQueues staleness sweep — same class as the sessions fix"
      commits: [2b12e94]
    - what: "docs/ncp.spec written — closes a real spec.missing gap for a system this session directly modified"
      commits: [72e8943]
    - what: "self_repair — real propose/test/promote pipeline with a real safety gate, verified end to end including a genuine process spawn"
      commits: [cba5488]
    - what: "co-pilot's real chat path (/api/prompt/stream) given real, opt-in tool access — default set plus self_repair with a confirmation gate on the actual live-write step"
      commits: [9013b36, e4f347c]
    - what: "real, bidirectional guardian-agent <-> ollama conversation bridge (guardian/ask.js)"
      commits: [2bc85e4]
    - what: "co-pilot is a real, forged, swappable hat — any guardian agent can wear it (allowedAgents override, previously validated but never consulted)"
      commits: [93384d2]
    - what: "real 'hey nexus' handshake — genuine highest-priority queue jump (ollama's queue had zero priority support before this), real 30s sliding-window decay"
      commits: [1a7d486]
    - what: "RAID's real agent chain fixed to genuinely match its own already-declared LAW_III and the person's explicit preference (free agents before claude, gemini added — was completely absent)"
      commits: [6323e35]
    - what: >
        Grammar engine <-> cortex closed feedback loop. Real, precise,
        two-part gap: the low-confidence case was captured then silently
        discarded at every call site (recordMisfire never fired for
        co-pilot's conversational path); and even fixing that alone isn't
        a closed loop, since the tracker's own streak resets after
        escalating — the only permanent signal lives in event_log's
        never-deleted grammar.misfire_escalated events. Built the real
        consultation side: a cached, bounded index of historical
        escalations, consulted before the confidence-floor comparison —
        a genuine demotion, not a log line next to an unaffected result.
        8 real, brutal tests (§12.1), all passing; the 6 pre-existing
        tests it extends still pass.
      commits: [ab389fb]
    - what: >
        Real live-NEXUS-context injection into whichever agent is
        currently wearing the co-pilot hat, triggered by an active
        handshake OR a genuine detected task. Found and fixed the real,
        foundational gap underneath this while building it: the main
        chat handler never once consulted the currently-worn agent —
        "co-pilot is a hat" had zero actual effect on real dispatch
        before this. Fixed the branch to guardian when a non-ollama
        agent is worn. Two further real bugs caught by testing before
        shipping: the confidence-threshold check on task-detection was
        wrong (harmonic-mean confidence, not a flat verb-match signal —
        a correctly-matched real verb scored 0.824, below the wrong
        0.85 bar); and James's own literal example ("create a feedback
        loop") wasn't caught at all. Attempted to widen the SHARED,
        system-wide classifier's own build-verb pattern first, caught a
        real, serious over-match by testing ("i will create some time
        for this" incorrectly tagged FORGE-risk), reverted clean, built
        a safer, local, narrow fix instead per §16.6.
      commits: [d3922c5]

  # ── real housekeeping this session, per §17 (nothing in silence) ─────────
  housekeeping:
    - "6 real, foundational files found genuinely unregistered in loom under any id — cortex/core/raid/index.js, copilot/lib/self-model.js, copilot/lib/grammar-router.js, copilot/lifeline.js, ollama/server.js, lib/intent-classifier.js. Registered."
    - "docs/ncp.spec written for a real spec.missing gap this session directly caused work to close."
    - "This phasemap itself — no prior living session record existed in this specific checkout lineage; created once, extend in place from here."

  # ── real, honest, NOT done — named plainly, not glossed over ─────────────
  open_honest_gaps:
    - "The full agent-naming/ID system (unique names, stable backend IDs independent of name, per-agent jobs/rolls, rotation, contract assignment) — not started."
    - "Per-agent evolving capability/token/constraint tracking that updates over time — not started; tool-index's real usage depth (this session, earlier) is the closest real building block."
    - "The data-pipeline vision (parse data -> co-pilot asks what to do -> lens/capability menu -> request a missing capability -> spin up an input/tool/output compartment -> drag-drop UI) — not started, real and substantial, deserves its own focused pass."
