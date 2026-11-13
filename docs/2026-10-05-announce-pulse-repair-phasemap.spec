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
      files: [orchestrator/orchestrator.js, lib/nexus/autopilot.js, lib/expected-systems.js]
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
      files: [lib/pulse-listener.js, lib/warp/core/Engine.js, orchestrator/orchestrator.js]
      expanded_2026_11_10: >-
        (0.60.488) The Orchestrator's own negative-space watch (orchestrator.js _armPulseWatch, 2026-09-20) asks COS, before it declares
        a miss, whether COS stopped the system idle (on-demand, 0.60.482). Asleep by COS's rule is said once as pulse.asleep and is not
        a miss; the watch rests until the next real beat. Anything else, COS unreachable included, stays a miss.
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
      # ── EXPANDED 2026-11-10 — James, 2026-11-10: "cos needs to replace polling completely with the heartbeat from each system." · "just needs to listen for the heartbeat. maybe deltas to establish a baseline." · "sigmas and deltas are domain agnostic."
      # The baseline is learned from each system's own beats: the delta between beats, and its sigma. A deviation is measured against it (CIE7's
      # observer already computes a z-score of each delta against a rolling baseline, T4).

    PR5_repair_for_real:
      layer: api
      status: OPEN
      james: '"we need to make that a real system, with the ability to actual repair nexus."'
      depends_on: [PR3_negative_space_for_missed_heartbeats]
      files: [lib/nexus/autopilot.js, diagnostic/nexus-heal-loop.js, lib/shadow-space.js]
      does: >-
        A gap from a missed heartbeat is repaired: (1) probe once; (2) restart through autopilot (a new POST
        /restart/:name — kill and respawn, under its circuit breaker); (3) the repair is proven only by the system's next
        beat closing the gap. Code repair, if he chooses it (see pushback): through the shadow space only, merged when its
        tests pass. Every attempt in the ledger; nothing silent.
      proof: "a fixture system that hangs is restarted through autopilot and its next beat closes the gap; a restart that does not bring it back is escalated, not repeated past the breaker"
    PR6_cos_listens_never_polls:
      layer: system
      status: "SLICE A BUILT 0.60.504 (beats to COS; up at the first beat; missed beat said; usage streamed). Open: the rest of the beaters, the other pages' timers, SW5"
      james: 'cos needs to replace polling completely with the heartbeat from each system." · "just needs to listen for the heartbeat. maybe deltas to establish a baseline. · "the health check is redundant. also the main page keeps refreshing." · "cos is going to be the entire meta system for nexus."'
      depends_on: [PR3_negative_space_for_missed_heartbeats, PR4_deviation_raises_the_bpm]
      files: [cos/manager/supervisor.js, cos/manager/server.js, cos/archetype/nexus-system/lib/heartbeat.js, cos/archetype/nexus-system.js, cos/archetype/registry.js, cos/ui/shell/page.js, cos/ui/overview/page.js, cos/ui/hub/page.js, cos/ui/deployments/page.js, lib/pulse-watch.js]
      requires: [node]
      prerequisites: ["his reading of which page refreshes (to confirm)"]
      does: >-
        COS stops polling. Today: the supervisor probes each system's /health every 250 ms until it is up, at boot and spawn; its pages poll
        /api/cos/systems and refresh every 5 s; the archetype declares an httpHealthCheck that nothing runs; and the heartbeat each system already
        sends (archetype heartbeat.js) is heard only by the diagnostic (lib/pulse-watch.js). After: a system is up at its first beat; a missed beat
        (PR3's negative space) is the only "down"; COS's pages take state from COS's event stream (server.js already streams, with its own 15 s
        keep-alive) instead of a timer; the httpHealthCheck declarations are removed as the redundant check. The watchdog's resource sampling (CPU,
        memory) stays: it reads the OS, not a system.
      readings_to_confirm: >-
        "the main page keeps refreshing" read as COS's shell page (it polls /api/cos/systems and refreshes its top every 5 s); another page is
        possible, his to say. "the health check is redundant" read as the boot probes and the unrun httpHealthCheck beside the heartbeat.
      proof: "a system marked up on its first beat with no /health request; a stopped beat marks it down within the negative-space window; no setInterval left in COS's pages for state; test-cos-* unchanged"

## ADDENDUM 2026-11-10 — PR3 expanded: asleep by COS's rule is not a missed pulse (0.60.488)
# James, 2026-11-10: "idearium is choking" · asked whether to fix the pulse monitor counting sleeping on-demand systems as missing: "Yes, fix it"
# His log: "[orchestrator][pulse] 'versionium' missed 112 consecutive pulses" and "cfr.collapse: CFR coherence collapsed to 0.00", 22:43 to
# 23:10, while Versionium was stopped idle by COS (0.60.482) and started again when asked. A true absence, a false fault.
# Side by side: (a) the Orchestrator asks COS at the moment it would declare a miss; (b) COS tells the Orchestrator when it stops a system idle
# (a new route on the Orchestrator, COS depending on it); (c) the stopping system says goodbye (COS stops it with a kill, which on Windows
# gives the process no turn to speak). (a) taken, by his axioms: §0.1 evidence at the moment of deciding, §5.10 through COS's contract (GET
# /api/cos/systems/:name, already served), §5.15 COS down breaks nothing (the miss stands as before), §1.2 said once and never silent,
# §16.4 the smallest change. It asks once per would-be miss; it is not a poll, and PR6 (COS itself the listener) replaces it when built.
# Only COS's idle stop counts as asleep. A system a person stopped in COS still reads as missing: whether that is a fault is his to say.
# Proof: _asleepByCos run from the file against 7 stand-in answers and the live COS (Versionium up, nexus-wire unknown to COS), 9/9. No test
# file: orchestrator.js is a server with no exports, and his rule is no new JavaScript; the check and its result are in the changelog.
# Not yet seen on a real idle stop: the Orchestrator must be restarted, then Versionium left idle for 10 minutes.
# Left: the diagnostic's watch (lib/pulse-listener.js, "missed its heartbeat") and the watchdog's OFFLINE line still fire for a sleeping system.

## ADDENDUM 2026-11-13 — PR6 slice a: beats go to COS; a beating system is up at its first beat; COS's pages listen (mapped before code)
# James, 2026-11-13: "okay can you replace the polling and decouple what systems you can. thats one reason for the perfoamnce, because theyre
# coupled so too many need to run also. like imagine they can access each other also without a node process. get the heartbeat done and
# polling disabled" · "orchastrator needs to migrate to the superviser" · "the heartbeat optimizes nexus since when systems arent needed they
# dont need to be polled."
# Read the same day: lib/pulse.js posts every beat (10 s) to the Orchestrator (:9000 /api/heartbeat) and /api/register; the systems that beat:
# architect, clear-glass (its wire), cortex, guardian, idearium, loom, ollama, orchestrator; not yet: copilot, diagnostic, versionium,
# intelligence. COS's supervisor waits for each start by asking /health every 250 ms (cos/manager/supervisor.js, two loops); COS's pages
# re-read state on timers (shell 5 s and its systems poll, overview 5 s, hub 10 s, deployments 4 s, logs 2 s, the engine page).
# The coupling he names: COS cannot hear a beat until the Orchestrator is up, and the Orchestrator is one of the systems COS starts.
# Slice a (the coder's cut, by §16.4 smallest change, §5.15 one system down breaks no other, SW_D1 the Orchestrator into the supervisor):
#   - lib/pulse.js sends each beat and the registration to COS (COS_MANAGER_PORT, default 7799: POST /api/cos/heartbeat, /api/cos/register),
#     whatever orchPort a caller passes; no system's code changes. COS is up before any system it starts.
#   - COS answers the beat at once and passes it on to the Orchestrator (fire and forget), so the diagnostic and the Orchestrator's own watch
#     keep working unchanged until SW5 moves them in; the Orchestrator down breaks nothing in COS.
#   - the supervisor: a system whose declaration says `heartbeat` is up at its first beat (no /health request); each beat expects the next
#     within interval × 1.5 + 5 s; a beat that does not come is said once as pulse-missed (negative space, PR3's rule), and a later beat
#     clears it. A system COS stopped idle is asleep, not missed (his: not needed, not polled). A system that does not beat yet keeps the
#     old start check, named in the ledger as not beating.
#   - COS's shell and overview pages take systems' state from COS's event stream (GET /api/cos/events) instead of their timers.
# Not in slice a, said: PR4 (the beat quickens on deviation); copilot, diagnostic, versionium and intelligence beating; the other pages'
# timers (hub, deployments, logs, engine); the Orchestrator's watch and /api/heartbeat retired (SW5).
# "access each other without a node process" (his): the reading, to confirm, is that a sleeping system is answered from what it keeps on
# disk (its own map, SW1, and its nodes) without being started; mapped in SW1 slice b, not built here.
# BUILT 0.60.504 as mapped above. Proof: tests/modules/test-cos-heartbeat.test.js HB-01..07 7/7. Not proven in Clear Glass (its host exits under
# this machine's memory). Not live until COS and the systems restart.
