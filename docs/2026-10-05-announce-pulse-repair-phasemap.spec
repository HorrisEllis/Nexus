spec:
  meta:
    name:     announce-pulse-repair
    roadmap: 'later — later (declutter 2026-10-09, James: "okay")'
    version:  1.1.0
    date:     2026-10-05
    release:  0.39.327 (base)
    uuid:     nexus-announce-pulse-repair-phasemap-v1-0000-2026-1005-jamesbrooks-001
    owner:    orchestrator · diagnostic · nexus/autopilot · warp · lib
    status:   "MAPPED 2026-10-05; PR1–PR3 built (0.39.342); PR4, PR5 open"
    voice: >
      The ideas, the direction and the calls are James's. Each phase's `james:` is his, verbatim. `does:` is the coder's
      reading of it, his to correct. `found:` is what the coder read in the code. `pushback:` is where the coder thinks
      the plan as said has a hole — his to decide, not the coder's.
    axioms:   docs/AXIOMS-v3.1.md — §3.3 map before build, §8.6 reuse before build, §1.1 nothing pretends, §1.2 nothing
              silently fails, §10.3 one source of truth.
    origin: >
      James, 2026-10-05: "i though we switched to heartbeat and pulse system" · "remove the polling then. need the
      systems to anounce themselves. that way i can add new systems automatically. also optimizes performance. like the
      runtime behavior, deviation needs to report to the diagnostic system, and have that raise the bpm. have the
      diagnostic system. use negative space reasoning for missed heartbeats. we need to make that a real system, with
      the ability to actual repair nexus."

  found:
    - >-
      Announcing exists: every system's createPulse (orchestrator/lib/pulse.js) POSTs /api/heartbeat every 10 s and is
      entered in orchestrator's SYSTEM_REGISTRY, which scores a BPM health (regularity, steadiness, latency, missed).
      Orchestrator already turns missed pulses into negative space: three in a row → pulse.missed (bus, ledger, SSE).
      Its /sse stream broadcasts every pulse with the whole registry's health, and every pulse.missed.
    - >-
      The diagnostic (diagnostic/nexus-diagnostic.js, 2715 lines) ignores that stream. It holds its own hard-coded
      SYSTEMS list (ports, health paths) and polls every system over HTTP every 15 s (pollAll), consulting the registry
      only to overrule a missed probe. A system not on that list is never watched — a new system cannot be added
      without editing the diagnostic.
    - >-
      Repair today: nexus/autopilot.js restarts a CRASHED process (backoff, circuit breaker) and exposes POST
      /spawn/:name on :7799 — but nothing restarts a process that is alive and stuck, and orchestrator has no restart.
      diagnostic/nexus-heal-loop.js runs gap → classify → blueprint → forge (an LLM patch through Guardian) →
      Versionium; severity < critical only, MAX_AUTO_ATTEMPTS, dry-run flag.
    - >-
      Deviation exists in pieces: per-system baselines (the diagnostic's monitors[name].observe), deltas and sigmas
      (intelligence/cfr sigma/delta) — but no system reports its own deviation in its pulse, and the pulse interval is
      fixed.

  pushback:
    - >-
      Announcing alone cannot see a system that never started — it never announces, so there is nothing to miss.
      Negative space needs an expectation. The coder's proposal: the expected set is what autopilot started (its kernel
      list — it already exists), plus every system that has announced once. Nothing hard-coded in the diagnostic.
    - >-
      A pulse proves the process is alive and can reach orchestrator; not that its own server answers. Usually they fail
      together (one event loop). The coder keeps one probe for a system that has gone silent, before a repair — never
      as the routine check.
    - >-
      "Actually repair nexus" has two very different meanings. Restarting a stuck or dead process is mechanical and safe
      to do automatically. Changing code is not: the coder's proposal is that code repair goes only through the shadow
      space (lib/shadow-space.js) — written in a copy, merged only when its tests pass, every attempt in the ledger —
      and never silently. His call.
    - >-
      Raising the BPM costs: a faster pulse is more traffic. Bounded: 10 s normal, never faster than 2 s, back down as
      the deviation settles.

  phases:
    PR1_the_announced_registry_is_the_list:
      layer: library
      status: "DONE (0.39.342) — lib/pulse-watch.js announce/expect; the diagnostic adopts a system that announces itself (SYSTEMS gains it and a baseline monitor, no file edited). Expected: the diagnostic's declared non-optional systems — autopilot's kernel list (lib/nexus-self/systems.js) is the better source, not yet read."
      james: '"need the systems to anounce themselves. that way i can add new systems automatically."'
      depends_on: []
      files: [orchestrator/orchestrator.js, nexus/autopilot.js, lib/expected-systems.js]
      does: >-
        The list of systems is what has announced (orchestrator's registry: id, port, interval, health) plus what
        autopilot started (the expected set). A new system that calls createPulse is watched from its first beat, with
        no file edited anywhere else.
      proof: "a fixture system that only calls createPulse appears in the diagnostic's watched set; one autopilot started that never announces is expected and missing"

    PR2_the_diagnostic_listens_not_polls:
      layer: library
      status: "DONE (0.39.342) — the diagnostic listens to orchestrator's /sse and reads the registry once (start, and after a lost stream); the /health probe and the per-system registry checks are gone; /pulse shows what it sees. clear-glass pulses as nexus-wire (pulseAs), forge-shell as orchestrator. End to end: the real diagnostic against a stand-in orchestrator — a new system adopted from its first beat, a silent one a gap 14 s after its window, zero requests to the silent system's port."
      james: '"remove the polling then." · "also optimizes performance."'
      depends_on: [PR1_the_announced_registry_is_the_list]
      files: [diagnostic/nexus-diagnostic.js, lib/pulse-listener.js]
      does: >-
        The diagnostic subscribes to orchestrator's /sse (orchestrator.pulse, pulse.missed, register) and reads the
        registry once at start and on reconnect. The 15 s HTTP poll of every system goes; the hard-coded SYSTEMS list
        keeps only what the registry cannot know (a data dir that is not data/<system>). Losing the stream is itself
        orchestrator's missed pulse.
      proof: "the diagnostic makes no HTTP request to a system that is pulsing; a fixture pulse stream drives its online/offline state"

    PR3_negative_space_for_missed_heartbeats:
      layer: library
      status: "DONE (0.39.342) — each beat a WARP 2 link expecting the next within interval × 1.5; a broken expectation is a gap naming the system and its last beat; a late beat recovers it; never-announced after a 60 s boot grace; the ledger rotated past 20000 entries. Found end to end and fixed: what broke during another system's beat was dropped."
      james: '"have the diagnostic system. use negative space reasoning for missed heartbeats."'
      depends_on: [PR2_the_diagnostic_listens_not_polls]
      files: [lib/pulse-listener.js, warp/core/Engine.js]
      does: >-
        Each beat is a WARP 2 link; each beat declares the next as an expectation (within the system's own interval
        plus grace). A broken expectation is a gap naming the system, its last beat and its last known state — the
        cause. One mechanism: the same expectations EM2 built.
      proof: "a fixture system that stops beating becomes a gap naming it and its last beat within one interval plus grace; a late beat clears it"

    PR4_deviation_raises_the_bpm:
      layer: library
      status: OPEN
      james: '"like the runtime behavior, deviation needs to report to the diagnostic system, and have that raise the bpm."'
      depends_on: [PR3_negative_space_for_missed_heartbeats]
      files: [orchestrator/lib/pulse.js, orchestrator/orchestrator.js]
      does: >-
        A system measures its own runtime against its baseline (deltas and sigmas) and sends the deviation in its pulse.
        Past a threshold its pulse quickens (10 s → down to 2 s, bounded), so the diagnostic sees it closer; it slows
        again as the deviation settles. The diagnostic records the deviation and the quickened beat.
      proof: "a fixture deviation past its threshold quickens the beat to the bound and back as it settles; the diagnostic records it"

    PR5_repair_for_real:
      layer: api
      status: OPEN
      james: '"we need to make that a real system, with the ability to actual repair nexus."'
      depends_on: [PR3_negative_space_for_missed_heartbeats]
      files: [nexus/autopilot.js, diagnostic/nexus-heal-loop.js, lib/shadow-space.js]
      does: >-
        A gap from a missed heartbeat is repaired: (1) probe once; (2) restart through autopilot (a new POST
        /restart/:name — kill and respawn, under its circuit breaker); (3) the repair is proven only by the system's next
        beat closing the gap. Code repair, if he chooses it (see pushback): through the shadow space only, merged when its
        tests pass. Every attempt in the ledger; nothing silent.
      proof: "a fixture system that hangs is restarted through autopilot and its next beat closes the gap; a restart that does not bring it back is escalated, not repeated past the breaker"
