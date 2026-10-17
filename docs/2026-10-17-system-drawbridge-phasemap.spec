spec:
  meta:
    name:     system-drawbridge
    version:  1.0.0
    date:     2026-10-17
    release:  "0.60.126 (DB1)"
    uuid:     nexus-system-drawbridge-phasemap-v1-0000-2026-1017-jamesbrooks-001
    owner:    "lib (the census and the drawbridge) · every system with a registry-components.js · orchestrator (the handshake) · loom (the self-model)"
    status:   "MAPPED 2026-10-17. DB1 BUILT 0.60.126 (the census and the ratchet). DB0a-DB0c are his to decide; DB2-DB8 OPEN."
    voice: >-
      The ideas, the direction and the calls are James's. `james:` is his, verbatim. `does:` is the coder's reading, his to
      correct. `pushback:` is where the coder thinks the plan as said has a hole — his to decide.
    origin: >-
      James, 2026-10-17: "lets work on wiring everything together. i want to eventually have the component registry for each
      system be the interaction contract and event bus, with handshake verification. basically the spine of each system,
      like looms component registry but as the drawbridge for each compartment for each system, the only way to interact
      between systems. using the api routes, and cli interface. ui floats ontop"
      · just before, on the debugging systems: "need the debugging, intelligence,cos and debugging system, cfr and rfr2, sigma
      deviation and tensino and frictoin system for debugging. should be soome phases recentlty"
    axioms: docs/AXIOMS-v3.1.md — §3.3 map before build, §8.6 reuse before build, §1.1 nothing pretends to work, §1.2 nothing silently fails, §5.2 the contract is the bridge

  # ── What exists (read 2026-10-17, before mapping) ───────────────────────────
  exists:
    - "His design is already written, once, in the COS archetype (cos/archetype/nexus-system): registry-components.js is
      'the spine. Every component connects only to this'; lib/bus.js is 'the one way an event moves' (ledger first, undeclared
      events marked); lib/handoff.js is 'the drawbridge' and quotes him — 'each system hands the file off to the target
      system, using the registry and handshake verification to tag the progress and success or failure of the handoff and
      why'; interaction-contract.json names POST /handoff 'the drawbridge'. Every new system made from the archetype has it."
    - "No existing system was made from the archetype (build-from-the-spec found_1_10_0 said the same of genesis). 13 systems
      have a registry-components.js (cortex, idearium, guardian, loom, ollama, intelligence, clear-glass, emerge, versionium,
      architect, copilot, nexus-healer, clear-glass/seam), but there it is a ROUTE list (id, route, params, permissions,
      hooks): no consumers, no wires, no events emitted or heard. Read: intelligence 61 rows, cortex 24, loom 25, ollama 9 —
      0 with wires."
    - "orchestrator/lib/contract-handshake.js already verifies a system over HTTP: it fetches /api/contract, checks the id,
      the routes and a schema hash, and holds a trust state (UNVERIFIED, VERIFIED, DEGRADED, MISMATCH, UNREACHABLE). It
      covers systems that boot as services, not code that one system requires from another."
    - "contracts/nexus-interaction-contract.js, contracts/SYSTEM-CONTRACTS.js, contracts/event-contract-baseline.json (a
      ratchet already used for events), seams/seam-contracts.js, docs/seam-component-registry.spec (comp_id, compartment),
      idearium/event-taxonomy.cjs and cortex/core/raid/event-taxonomy.js, loom/maps/* and loom's registry."
    - "Measured 2026-10-17 by the coder (a scratch census, which DB1 makes the real one): 1,314 JS files across 22 top-level
      systems; 1,547 relative require()s cross a system boundary, over 133 system pairs. Of these, 184 go system to system
      without lib/ on either end (idearium -> cortex 30, orchestrator -> cortex 29, idearium -> cos 23, copilot -> cortex 22,
      lib -> cortex 89 and lib -> cos 82 run the other way: the shared library reaching up into systems)."

  # ── His decisions, open ─────────────────────────────────────────────────────
  decisions:
    DB0a_is_lib_a_system:
      question: "Is lib/ a system behind its own drawbridge, or the shared kernel that any system may require directly?"
      options:
        - "kernel (coder's recommendation): lib/ holds primitives (atomic write, node envelope, zip, step gates). A system may
          require it directly; the drawbridge governs system to system. lib/ requiring UP into a system (lib -> cortex 89,
          lib -> cos 82) is then a defect: those modules belong to the system they reach into, or the call goes through the
          drawbridge."
        - "system: everything crosses the drawbridge, lib/ included. 1,547 calls to move, most of them for no gain."
      status: OPEN
    DB0b_in_process_or_http:
      question: "When two systems run in the same process, does a crossing go over HTTP (the API route) or in-process through
        the same contract?"
      options:
        - "one contract, two transports (coder's recommendation): the drawbridge looks up the capability in the target's
          registry, checks the handshake, logs the crossing on the bus, then calls in-process or over HTTP. The contract and
          the record are the same either way; only the hop differs. HTTP for everything adds a network hop to calls made
          thousands of times a run."
        - "HTTP always: the API route is the only door, as he said ('using the api routes, and cli interface')."
      status: OPEN
      pushback: "His words name the API routes and the CLI as the way. The coder reads that as 'the contract IS the routes and
        commands', not 'every call must be an HTTP request'. To confirm."
    DB0c_how_it_is_enforced:
      question: "How does 'the only way to interact between systems' become true without breaking 1,547 calls at once?"
      options:
        - "a ratchet (coder's recommendation; DB1 built it): today's crossings are a baseline; a NEW crossing outside the
          drawbridge fails a test; each migration lowers the baseline and the baseline can never rise. The same pattern
          contracts/event-contract-baseline.json already uses for events."
        - "observe only: count and show, enforce later."
        - "refuse now: any crossing outside the drawbridge throws. Breaks Nexus today."
      status: OPEN (the ratchet is built because it observes and stops new drift without changing any call; he can turn it off)

  # ── Phases, bottom-up ───────────────────────────────────────────────────────
  phases:
    DB1_the_census_and_the_ratchet:
      status: "BUILT 0.60.126"
      does: >-
        lib/system-boundary.js reads every system's source and lists each require() that crosses from one system into another
        (from file, to file, the pair). census() gives the totals per pair; check() compares against
        contracts/drawbridge-baseline.json and reports new crossings (drift) and closed ones (progress). GET /api/system/drawbridge,
        command `system drawbridge [--new]`, loom wires (loom/maps/run-state-map.js). The test fails if a new crossing appears
        between systems (lib/ excluded until DB0a is decided).
      stands_on: "the scratch census of 2026-10-17; the ratchet pattern of contracts/event-contract-baseline.json; loom's
        scanner idea (declared ≠ served) applied to system boundaries."
      ui: "deferred to DB7, said: today the numbers are on the command and the route."
    DB2_the_registry_says_what_it_offers:
      status: OPEN
      does: >-
        Each system's registry-components.js gains, beside its route rows, what it offers other systems (capabilities: name,
        the file and export that serve it, the route and command that reach it), the events it emits and the events it hears.
        Seeded from DB1: every crossing today names a target file and export, which is a capability the target is already
        giving away undeclared. Loom reads it, so the registry is wired, not a list.
    DB3_the_drawbridge:
      status: OPEN
      does: >-
        lib/drawbridge.js: cross(from, to, capability, args). Looks the capability up in the target's registry (DB2), checks
        the handshake (DB5), records the crossing on the bus (DB4), then calls it (in-process or HTTP, per DB0b). A capability
        not declared is refused and said why. The archetype's lib/handoff.js is the file-moving form of the same door, for
        work that should be tangible (his words in it); cross() is the call form. Both write the same record.
    DB4_one_bus_per_system:
      status: OPEN
      does: >-
        Every crossing and every system event goes through the system's bus, archetype-style: ledger first, an undeclared
        event delivered but marked. Reuses idearium/event-taxonomy.cjs and cortex/core/raid/event-taxonomy.js as the declared
        events; nexus/nexus-bus.js carries them between systems.
    DB5_the_handshake_for_every_system:
      status: OPEN
      does: >-
        orchestrator/lib/contract-handshake.js extended from HTTP services to every system in the registry: its contract is
        its registry (routes, capabilities, events), hashed; the trust state is checked at boot and on change, and a crossing
        into a MISMATCH or UNREACHABLE system is refused with why.
    DB6_move_the_crossings:
      status: OPEN
      does: >-
        The crossings move to the drawbridge one system pair at a time, largest first, each move lowering the DB1 baseline.
        The debugging systems go first, because he asked for them: intelligence (cfr, rfr2, sigma) and diagnostic (friction,
        tension) are offered as capabilities with routes and commands — this is GW23 (wire what exists) of
        docs/2026-10-15-gate-held-work-phasemap.spec, done through the drawbridge.
    DB7_the_ui_floats_on_top:
      status: OPEN
      james: "ui floats ontop"
      does: >-
        A drawbridge view reads only the routes: each system, its gate (trust state), what it offers, the crossings today and
        the ratchet's number going down. No logic in the UI.
    DB8_agents_have_it:
      status: OPEN
      does: "Every drawbridge route has a command row, so copilot and every agent reach it through nexus.command."

  build_order: [DB1, DB2, DB6 (debugging systems), DB3, DB4, DB5, DB7, DB8]
