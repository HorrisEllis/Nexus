spec:
  meta:
    name:     system-drawbridge
    version:  1.0.0
    date:     2026-10-17
    release:  "0.60.126 (DB1)"
    uuid:     nexus-system-drawbridge-phasemap-v1-0000-2026-1017-jamesbrooks-001
    owner:    "lib (the census and the drawbridge) · every system with a registry-components.js · orchestrator (the handshake) · loom (the self-model)"
    status:   "MAPPED 2026-10-17. DB1 BUILT 0.60.126 (the census and the ratchet). DB9/DB10 PARTLY BUILT 0.60.127. DB13 BUILT, DB14 PARTLY BUILT 0.60.128. DB18 BUILT, DB17 census 0.60.129. P33a (sovereign-node P33) BUILT 0.60.130, P33b 0.60.131. DB0a-DB0c are his to decide; DB2-DB8 OPEN."
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
      status: "DECIDED 2026-10-17 by his axioms (applied by the coder, under his rule \"use the axioms in the docs for each disicio nthat doesn't show my competence\") — D1: lib/ is the kernel, mounted read-only (§5.9, §0.5, §10.1, §5.14); see docs/2026-10-17-decisions-by-the-axioms.spec"
    DB0b_in_process_or_http:
      question: "When two systems run in the same process, does a crossing go over HTTP (the API route) or in-process through
        the same contract?"
      options:
        - "one contract, two transports (coder's recommendation): the drawbridge looks up the capability in the target's
          registry, checks the handshake, logs the crossing on the bus, then calls in-process or over HTTP. The contract and
          the record are the same either way; only the hop differs. HTTP for everything adds a network hop to calls made
          thousands of times a run."
        - "HTTP always: the API route is the only door, as he said ('using the api routes, and cli interface')."
      status: "DECIDED 2026-10-17 by his axioms (applied by the coder, under his rule \"use the axioms in the docs for each disicio nthat doesn't show my competence\") — D2: routes and CLI between systems, in-process within one; one contract (§5.10, §5.11, §5.14); see docs/2026-10-17-decisions-by-the-axioms.spec"
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
      status: "DECIDED 2026-10-17 by his axioms (applied by the coder, under his rule \"use the axioms in the docs for each disicio nthat doesn't show my competence\") — D3: the ratchet (§0.4, §1.2, §3.1); see docs/2026-10-17-decisions-by-the-axioms.spec"

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
      depends_on: [SV7_intelligence_cos_cortex]   # 2026-10-24: cut into SV0–SV7 (docs/2026-10-23-cos-spine-phasemap.spec addendum (b))
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

  # ── ADDENDUM 2026-10-17 (a) — his answers, and what the registry holds ─────
  # Asked about DB0a-DB0c (lib/ a system or the kernel; in-process or HTTP; how it is enforced), he answered:
  # James, 2026-10-17: "shadow and negative space reasoning for debugging. maybe every repo has to generate a component
  # registry. the component registry can also be a dependancy graph?
  # yes, interaction contract and event bus and queue and dependancy and wiring harness and spine and the only way to
  # interact between the systems using the api routes and the cli interface, with a handshake verification for the ui and
  # handoffs for contracts and nodes, etc for tracking, debugging, making the ui disposable, soveriegn.
  # cos is the isolated compartment for each system using the regisry as a drawbridge"
  addendum_a:
    decided:
      - "The registry is all of these at once (his list): the interaction contract, the event bus, the queue, the dependency
        graph, the wiring harness and the spine. The only way between systems is the API routes and the CLI."
      - "A handshake verification for the UI. Handoffs for contracts and nodes. The purpose, in his words: tracking, debugging,
        making the UI disposable, sovereign."
      - "COS is the isolated compartment for each system, with the registry as its drawbridge."
      - "Every repo generates its component registry, and the registry is also its dependency graph (asked as a question;
        the coder's answer: yes, it already is one — loom's wires are require() edges, and idearium/repo/architecture.js
        already derives a repo's registry with components, wires, consumers and orphans)."
      - "Shadow and negative space reasoning for debugging."
    DB0b_reading: >-
      His words, "the only way to interact between the systems using the api routes and the cli interface", answer DB0b as
      routes and CLI. The coder's recommendation (the same contract also called in-process) is NOT his decision. To confirm:
      the coder reads COS compartments as making this physical: a system in its own compartment cannot require() another's
      files, so the routes and the CLI are the only door that remains. The cost, said: calls made thousands of times a run
      become HTTP calls; DB3 must measure that before the large pairs move.
    DB0a_still_open: >-
      If each system is its own COS compartment, lib/ either goes into each compartment (the kernel, copied or mounted
      read-only) or becomes a system behind routes. He has not said which. The coder's recommendation stays: kernel, mounted.
    DB0c_reading: "He did not object to the ratchet; it stays, observing and stopping new drift. Not taken as his decision."
    exists_for_it:
      - "Shadow and negative space are his idea of 2026-09-29 ('What about using shadow and negative space reasoning?'),
        built 0.39.282 as lib/shadow.js for build steps: a step declares what must exist after it (files, events, fields);
        when it settles, each absence becomes a gap (lib/gap-field.js) and a liminal item for intelligence; CK-230 checks it.
        emergence/vendor/rfr2/liminal/negative-space.js is the conversational form (what is circled and avoided)."
      - "A repo's registry is generated already, on request: GET /api/repos/:uuid/architecture (idearium/repo/architecture.js,
        0.39.284 W7 + 0.39.286 RC2, his words there: 'the registry ... is its self the doorway'); POST writes ARCHITECTURE.json
        and its nodes. It is not generated by default, and Nexus's own systems are not read this way."
      - "lib/system-registry.js (his 2026-09-06 'need a system registry.') is the RUNTIME half: each kernel's port, health URL and
        version merged from autopilot, diagnostic and lib/version.js, with drift between them reported. DB5 composes it. (0.60.127
        first overwrote it by reusing the name; restored the same day, and the source half is lib/drawbridge-registry.js.)"
      - "The queue: the archetype's handoff folders (input/ processing/ done/ failed/), docs/seam-queue.spec, lib/queue.js. The
        wiring harness: loom/maps/*. The contract: interaction-contract.json and orchestrator/lib/contract-handshake.js. The
        bus: nexus/nexus-bus.js and the archetype's lib/bus.js. COS compartments: lib/cos-bridge.js, cos/compartment."
  phases_added:
    DB9_every_repo_generates_its_registry:
      status: "PARTLY BUILT 0.60.127 — Nexus's own systems: lib/drawbridge-registry.js registryOf/graph (GET /api/system/registry[/:system], `system registry`). OPEN: a repo's registry generated by default on import or chunk (architecture.js runs only on request)."
      does: >-
        A repo's registry (architecture.js) is generated when it is imported or chunked, not only on request, and kept as
        nodes. Nexus's own systems get the same: each system's generated registry is its dependency graph (what it depends
        on, what it offers, who consumes it), seeded by DB1's crossings. The hand-kept registry-components.js stays as the
        declared half; the generated one is the observed half.
    DB10_shadow_and_negative_space_at_the_drawbridge:
      status: "PARTLY BUILT 0.60.127 — from source: declared routes not served, dangling wires (absent), files reached past the drawbridge (extra); settle → gaps through lib/shadow.js. OPEN: the runtime half (events seen on the bus, handshakes answered, handoff receipts) waits on DB4/DB5. Said: lib/drawbridge-registry.js itself adds one upward crossing (into loom/scanners/capability-map.js), held in the baseline by name; it moves to loom's route when DB3 lands."
      does: >-
        The declared registry is the shadow; what is observed (DB1 crossings, served routes, events seen on the bus,
        handshakes answered, handoffs received) is what is present. The negative space is read as data through lib/shadow.js,
        the same path as build steps: declared but never served or used (a dead route, an event nobody emits, a handoff with
        no receipt), and used but never declared (a crossing, an undeclared event). Each absence is a gap and a liminal item,
        so intelligence (cfr, rfr2, sigma) reasons over what did not happen at a boundary. This is the debugging he asked for.
    DB11_cos_compartment_per_system:
      status: "PARTLY BUILT 0.60.134 — James: \"and you know i mean cos compartment right? make a template for it now that loom holds\". loom/templates/cos-compartment.js: each system's compartment (the nexus-self-<system> his 0.39.261 made) with a checkable intent (end state: sovereign), mounts, drawbridge, stores, and a seal ready only when sovereign; served by loom (/api/compartments). OPEN: moving a sealed system in (its process run inside, its folder read-write) — nexus-healer first."
      does: >-
        Each system runs in its own COS compartment (lib/cos-bridge.js), and its registry is its drawbridge: routes, CLI,
        handoffs. It comes after DB6, because a system cannot be isolated while other systems still require() its files.
        The ratchet's number reaching zero for a system is the proof that it can move into its compartment.
    DB12_the_ui_handshake:
      status: OPEN
      does: >-
        A UI declares the routes and events it uses; at load it shakes hands with the system's registry, and a call to
        anything the registry does not declare is refused and shown. The UI holds no state and no logic of its own, so it can
        be thrown away and rebuilt (disposable); the system runs without it (sovereign).
  build_order_a: [DB9 (Nexus's systems first, from DB1), DB10, DB2, DB6 (debugging systems), DB3, DB4, DB5, DB12, DB7, DB11]

  # ── ADDENDUM 2026-10-17 (b) — sovereign systems; his system-registry.js is the tunnel ──
  # Context: the coder had counted 12 systems with a registry and 17 without, and asked whether to draft the missing ones.
  # James, 2026-10-17: "okay each system needs one right?" · then: "each system is soveriegn and self contained. use the
  # compartments to isolated each system, integrate the system-registry.js as the tunnel or drawbridge? then through that
  # access the command line interface, and routes in the api and toasts, the heartbeat system for status of the system using
  # routes?"
  addendum_b:
    decided:
      - "Each system needs a registry (his 'each system needs one right?', answered yes by the coder)."
      - "Each system is sovereign and self-contained, isolated in its own COS compartment (DB11, now his decision)."
      - "lib/system-registry.js (his 2026-09-06 module) is the tunnel: the one place a system is reached. Through it: the CLI,
        the API routes, the toasts, and the heartbeat, with status read over routes."
    reading_to_confirm: >-
      The coder reads 'the tunnel or drawbridge' as: lib/system-registry.js stays the one answer to 'where is system X and
      how do I reach it' (it already merges port, health URL, phase, data dir and version for 14 systems), and is extended with
      what each system offers (its routes from registry-components.js, the commands that reach it, the toasts it declares)
      and how it is (its heartbeat, read from its health route). lib/drawbridge-registry.js (0.60.127) stays the source-side
      check that feeds it (declared vs what the source holds). Two modules, one registry: the runtime face and the source face.
    exists_for_it:
      - "lib/system-registry.js build/get/list: 14 systems, each { name, port, healthUrl, healthPath, phase, critical,
        optional, onDemand, dataDir, label, version, sources }, from autopilot ALL_KERNELS, diagnostic SYSTEMS and
        VERSION.services, read from source text so nothing is started; drift between the three reported."
      - "Heartbeat: lib/heartbeat.js (beats, BPM, 3 missed = degraded, 10 = dead) and lib/pulse-watch.js."
      - "Toasts: idearium/ui/js/app.js decides which event names toast, in the UI's own code; no system declares its toasts."
      - "Compartments: lib/cos-bridge.js createCompartment / mountPath / listCompartments / tree."
  phases_added_b:
    DB13_the_tunnel:
      status: "BUILT 0.60.128 (read side)"
      does: >-
        lib/system-registry.js gains tunnel(name): the system's runtime entry plus what it offers — its declared routes
        (registry-components.js), the command rows that reach those routes (idearium/cli/route-commands.js), and its toasts
        (DB15) — and heartbeat(name): its health route called, with status (up, degraded, down), latency and why. GET
        /api/system/tunnel[/:name], `system tunnel [<name>]`. The read side only: a call THROUGH the tunnel is DB3.
    DB14_heartbeat_over_routes:
      status: "PARTLY BUILT 0.60.128 — one probe per call through its health route. OPEN: lib/heartbeat.js beating every
        system from the registry, its degraded/dead events on the bus, kept across restarts."
    DB15_toasts_declared:
      status: OPEN
      does: >-
        A system declares in its registry which of its events a person should see (toasts: [{ event, level, text }]). The UI
        toasts what the registry says instead of a list in app.js, so the UI holds no knowledge of its own (disposable).
    DB16_a_registry_for_each_system:
      status: OPEN
      does: >-
        A registry drafted for every system that has none (cos, nexus, warp, orchestrator, meta, siso, cli, cockpit,
        diagnostic, auth, mesh; then remote-desktop, emergence, jaa, erosmancer, sentinel, security) from its source: the
        routes it serves, its commands and events (idearium/repo/architecture.js readers), and the files other systems reach
        into today (DB1) as its first capabilities. Drafts are proposals, his to accept.
      open_question: "Which folders are systems. The coder's reading: contracts, hooks, service, components and
        architecture-spec are parts of other systems; ui and tablet are faces on routes; lib is DB0a."
  build_order_b: [DB13, DB14, DB16 (cos first), DB15, DB11, DB3, DB12]

  # ── ADDENDUM 2026-10-17 (c) — files stay with their system; nodes in relation to their system ──
  # Context: 0.60.128 had just made his lib/system-registry.js the tunnel, and the coder had listed what comes next.
  # James, 2026-10-17: "all system relevant files should stay with the system.
  # the data nodes should reflect guardians nodes but in relation to the system they are for."
  addendum_c:
    decided:
      - "A file that serves one system lives in that system's folder (his words: 'all system relevant files should stay with
        the system'). It follows from his 'sovereign and self contained' (addendum b): a compartment can only hold what is in
        its folder."
      - "Each system's data nodes are in Guardian's shape (data/nodes/<type>/<id>.<type>, lib/node-export.js's envelope) and
        carry their relation to the system they are for."
    exists_for_it:
      - "lib/system-nodes.js (0.39.271 X1-X3, his 'exactly like gaurdian where all data, commands, etc are physical node
        types') already writes every system's capability, command and system nodes into <system>/data/nodes, regenerated at
        boot by the orchestrator. What was missing: every node said system: null, and no node held the system's relations."
    reading_to_confirm: >-
      'In relation to the system they are for' is read by the coder as: each node names its system, and the system's
      dependencies are nodes too (one .wire per system it depends on, with the file edges behind it; the .system node says
      what it depends on and who consumes it). Another reading: each node names the other systems IT touches (a command
      node naming the systems its handler reaches). Only the first is built; the second needs DB4's bus. To confirm.
  phases_added_c:
    DB17_files_stay_with_their_system:
      status: "PARTLY BUILT 0.60.129 — the census: lib/system-boundary.js homes(), GET /api/system/homes, `system homes
        [<system>]`. OPEN: the moves, one system at a time, each a proposal: the file moves into its system and leaves a
        one-line re-export at the old path, so nothing that requires it breaks, then the re-export goes when the ratchet
        shows no one uses it."
      measured: "0.60.129: 495 files in the shared folders (lib, hooks, service, contracts, components, architecture-spec,
        seams). 93 belong to one system: used only by it, or named for it in hooks/ or service/ (idearium 34, copilot 14,
        guardian 9, cortex 9, nexus 5, clear-glass 4, orchestrator 4, cli 3, others 1-2). 58 are required by nothing through a
        static path. Those are not dead without a check:
        tools and entry scripts are loaded by name."
    DB18_nodes_in_relation_to_their_system:
      status: "BUILT 0.60.129 — lib/system-nodes.js: meta.system on every node; .wire nodes (GENERATED_TYPES + wire) from
        DB1; the .system node holds depends_on and consumed_by. A wire that stops holding is archived, not deleted.
        Regenerated at boot (orchestrator), so the nodes on his machine update on the next start; data/** is not committed."
  found_c:
    - "DB1's pattern missed `_require(...)`: idearium reaches other systems through createRequire, and \\brequire needs a word
      boundary that `_require` lacks. 22 crossings had always been there and were unseen (idearium to cos 6, cortex 5, ollama
      3, intelligence 3, loom 2, others 1 each). They were added to the baseline as seen_late, with that reason; they are not
      new drift. Found because homes() said lib/system-registry.js is used only by cli, while idearium's API uses it."
  build_order_c: [DB17 moves (hooks/ and service/ first: 12 files named per system), DB16, DB15, DB14, DB11]

  # ── ADDENDUM 2026-10-17 (d) — each system reads, writes and manages its nodes; this is phased already ──
  # James, 2026-10-17: "each system, reads, writes, and manages its nodes. each system has a database for each index of nodes
  # with all the history. listener, schemas for all the  node types, the database. nodes for all persistant data. look at the
  # node taxonomy in lib, as a baseline. using nodes as a way to make the system explicit. look at the architecture spec in
  # idearium.
  # thats the point of using the component registry as the spine that way its easy to move them around and use it as a map.
  # look at all of the specs for nodes, each tool, command and route has its events. expand capabilities through the nodes.
  # all of this and more is phased already."
  addendum_d:
    decided:
      - "Each system reads, writes and manages its own nodes, with a database per node index holding all the history, a
        listener, and schemas for every node type. All persistent data is nodes. Nodes make the system explicit."
      - "The registry is the spine BECAUSE it lets components move and serves as the map."
      - "Each tool, command and route has its events. Capabilities expand through nodes."
      - "His instruction: this is phased already, so the existing phases are the plan, not this map."
    owned_by_existing_phases:
      - "docs/2026-09-11-sovereign-node-architecture-phasemap.spec (addendum 2026-10-10): P33 every system runs its node
        registry; P36 an event ledger per registry (= DB4 here); P37 the UI floats on the registry (= DB7/DB12); P38 every
        graph has its route, command and node; P35 Copilot reads, edits and creates nodes; P3 schemas; P8 per-system
        registry (= DB16); P13 handshake (= DB5)."
      - "docs/2026-09-29-nex-node-store-phasemap.spec: invariants I0-I9 (everything that persists is a node; one store per
        system); N6 time/history; N8 one writer per system; N17 data moves to its owning system (= DB17); N24 YAML node types."
      - "docs/2026-10-05-build-from-the-spec-phasemap.spec: SB20 each system owns its own; SB22 capability → command → events
        as nodes."
      - "docs/architecture-spec/architecture-spec.spec addendum 2026-10-10: NODE_SYSTEM, STORE_IS_A_NODE, THE_STACK (UI →
        contract → registry by module → bus → event ledger per registry → node registry → own store); its census: node
        registry running in 1 of 16 systems."
      - "idearium/spec-engine/templates/architecture-spec.template.yaml and cos/archetype/nexus-system: the target shape,
        built once as a template, used by no existing system."
      - "NODE-TAXONOMY.md (repo root, not lib/ — the coder's correction of 'in lib'): 39 slots; per-system
        <system>/spec/<system>.node-taxonomy.md in 13 systems."
    this_map_from_here: "DB phases that duplicate an owning phase above are carried by it; DB13/DB17/DB18 stay (built here).
      New work names the owning phase id first."
    found_d:
      - "guardian/jaa-store.js is the shared store (cortex, idearium, clear-glass, intelligence, copilot, versionium and cli
        require it) living inside guardian: a kernel file in one system's folder, the inverse of DB17. 0.60.130 moves it to
        lib/jaa-store.js, with guardian/jaa-store.js left as a one-line re-export."
      - "The adapter JaaStore → node-index (query aliased to all) is written three times: intelligence/lib/domain-nodes.js,
        copilot/lib/inject-config.js, versionium/lib/store.js. lib/node-registry.js holds it once; the three stay until each
        moves onto it (reported, not removed: §0.3)."
      - "guardian/lib/node-registry.js, the one live registry, indexes into the CENTRAL cortex store, not guardian's own."
      - "74 files under */data/node-index are tracked in git with no writer in the tree (an old run's state)."
  P33_slices:
    P33a_a_registry_for_any_system:
      status: "BUILT 0.60.130"
      does: >-
        lib/node-registry.js createNodeRegistry({ system }): Guardian's proven per-file logic (parse, type check, schema
        check, ledger line, index, bus event) as an instance any system can run over <system>/data/nodes, indexed into the
        system's OWN store <system>/data/node-index (lib/jaa-store.js): a nodes_<type> table per index and a
        nodes_<type>_ledger with all the history. scan() indexes now; start() adds the listener (fs.watch per type folder).
        lib/system-nodes.js sync() scans each system it writes into that system's own store (not guardian, which runs its
        own registry). GET /api/system/nodes/:system[?type&id], `system nodes <system> [<type> [<id>]]`.
    P33b_each_system_runs_its_listener:
      status: "BUILT 0.60.131 — James: \"do it. what other systems?\" 12 systems start their listener at boot; guardian on the shared registry and its own store; one writer per database (N8)"
      does: "Each system's own server starts its registry's listener at boot, so the system manages its nodes in its own
        process (sovereign). Guardian moves onto the factory, indexed into guardian's own store."

  # ── ADDENDUM 2026-10-17 (e) — diagnostic and the healer, one system ──────────────
  # James, 2026-10-17: "diagnostic and nexus healer should be one system."
  # His decision. The coder's reading of how, by the axioms: the healer joins diagnostic (diagnostic runs, under autopilot at
  # :7825, and holds the heal loop; nexus-healer never ran). The name "diagnostic" is a reading, to confirm. Built 0.60.136:
  # nexus-healer moved under diagnostic/ (healer/api, healer/cli, schemas, spec, registry), served under /healer, its data in
  # diagnostic's own store; diagnostic gains its first registry (healer rows + its contract's routes, read from the contract).
  # Effect on this map: there is one fewer system; DB16's list loses nexus-healer and diagnostic now has a registry.
  merged:
    nexus_healer_into_diagnostic: { date: 2026-10-17, release: 0.60.136, his_words: "diagnostic and nexus healer should be one system.", archive: _archive/2026-10-17-nexus-healer-into-diagnostic/ }

  # ── ADDENDUM 2026-10-18 (c) — DB3 and DB5's first instance: the compartment terminal ─────────────────────────────────
  # James, 2026-10-18: "Use the component registry as a tunnel into the CLI interface for the terminal in Linux. As an
  # interaction contract with handshake verification." Mapped in docs/2026-10-18-compartment-environment-phasemap.spec: CE3
  # builds DB3's cross() and DB5's handshake for one capability (a compartment's shell), end to end; COS gets its own route
  # (CE1a, DB11's sovereignty applied to COS). DB3/DB5 stay open for every other system.

  # ── ADDENDUM 2026-10-21 (f) — a fork of genesis: sealed in a sandbox, the registry the drawbridge, three tunnels ───────
  # Context: he asked "how does genisis work? is it valuable?"; the coder answered from the code (genesis is the template every
  # new system spec starts from and the shape `system shape` checks; 1 of 12 systems matches it). Then, James, 2026-10-21:
  # "can you add to a fork of genesis spec, its contained in a isolated sandbox using the component registry as a drawbridge, and
  # tunnel into the compartment, the bridge, and interaction contract."
  addendum_f:
    decided:
      - "His: a fork of genesis (genesis itself unchanged) for a system contained in an isolated sandbox, the component registry
        its drawbridge, and tunnels into three places: the compartment, the bridge, and the interaction contract."
      - "Decided by his axioms (§8.6 reuse, §0.3, and the working agreement's 'divergent copies of a spec are two contracts'): the
        fork is a delta file, fork_of genesis 1.5.0, holding only what it adds; idearium/spec-engine/templates.js readSeed gives
        a fork its base first, so a spec started from it carries both. A test fails when genesis moves past the named version."
    reading_to_confirm: >-
      "the bridge" is read as the system-to-system bridge: genesis's lib/handoff.js and the Bridge's request lifecycle
      (handshake, created → accepted → complete | rejected | expired). The other reading, lib/cos-bridge.js (the bridge into
      COS), is the far end of the compartment tunnel, so it is covered either way.
    stands_on:
      - "DB13/DB14 tunnel(name) and heartbeat(name), lib/system-registry.js: the tunnel's outside end."
      - "genesis 1.5.0 REGISTRY_IS_THE_DRAWBRIDGE, SOVEREIGN_FOLDER; lib/drawbridge-registry.js (declared vs source; 'extra' is a way past the drawbridge)."
      - "lib/cos-bridge.js (the one entry into COS); cos/compartment/qemu-runtime.js ephemeral 'windows-sandbox'."
      - "genesis's lib/handoff.js, contracts/handshake.js, interaction-contract.json + GET /contract, lib/commands.js."
  phases_added_f:
    DB19_genesis_sandboxed_fork:
      status: "PARKED — built 2026-10-21 as a delta (fork_of genesis 1.5.0), test-genesis-sandboxed GSB-01..04 passing; he then said \"i asked for a fork\": a full copy or this delta is his to confirm, and he turned to Idearium building any project"
      depends_on: [DB13_the_tunnel]
      files: [idearium/spec-engine/templates/genesis-sandboxed.spec, idearium/spec-engine/templates.js]
      does: >-
        The fork: six axioms (SEALED_SANDBOX, DRAWBRIDGE_IS_THE_ONLY_CROSSING, THREE_TUNNELS, TUNNEL_IS_DECLARED,
        HANDSHAKE_AT_THE_GATE, SANDBOX_IS_DISPOSABLE), domains sandbox / drawbridge / tunnel, three spine bindings, and a
        six-file catalog (sandbox.json, lib/drawbridge.js, lib/tunnel.js, their two component nodes, tests/sandbox.test.js).
        Registered as template 'genesis-sandboxed'; seeded as genesis + fork.
      proof: "manifest check clean (6 files, 5 layers); GSB-01..04"
    DB20_sealed_archetype:
      status: OPEN
      depends_on: [DB19_genesis_sandboxed_fork]
      files: [cos/archetype/nexus-system.js, cos/archetype/genesis-catalog.js]
      does: >-
        The six files as a sealed COS archetype (nexus-system-sealed), so a system scaffolded from the fork gets them, not only
        the spec: lib/drawbridge.js over the system's own registry-components.js and contracts/handshake.js, lib/tunnel.js with
        the three tunnels, sandbox.json read by COS at create. The catalog regenerated from it, as genesis's is.
      proof: "a system scaffolded from the fork refuses an undeclared crossing with a receipt and crosses each tunnel after the handshake (tests/sandbox.test.js in the skeleton passes)"

  # ── ADDENDUM 2026-10-24 (g) — one registry at every level of recursion; COS agnostic; autopilot to the orchestrator ──
  # Context: RF2 had just put every folder inside one of the 15 systems, and the census showed 2 of 14 sovereign. The coder was
  # reporting how Nexus now starts (npm run start:all → lib/nexus/autopilot.js) when he wrote:
  # James, 2026-10-24: "what about moving autopilot ot the porchastrator folder?
  # remember that nexus uses a component registry for each incremement. so nexus root, then each system, as the event bus interaction
  # contract component registry as the spine for wiring each level of recursion.
  # then cos will use the same registry, same with the ui floating on top, with handshake verification and an event ledger.
  # that makes each system, able to be load balanced, throttled, paused, rewound, despawned, build, created,etc. immense leverage. cos
  # is agnostic"
  # Before it, his own words this extends: addendum (a) 2026-10-17 "interaction contract and event bus and queue and dependancy and
  # wiring harness and spine … cos is the isolated compartment for each system using the regisry as a drawbridge"; DB7 "ui floats ontop".
  addendum_g:
    decided:
      - "One registry shape at every level of recursion: Nexus root → each system → its components. At each level the registry is
        the event bus, the interaction contract and the component registry together, and it is the spine that wires that level to the
        one below (his words)."
      - "COS uses the same registry and nothing else, so COS is agnostic: it knows a registry, not a system (his words)."
      - "The UI floats on top of the same registry, with handshake verification and an event ledger (his words; DB7, DB12)."
      - "What it buys, in his words: each system can be load balanced, throttled, paused, rewound, despawned, built and created."
    reading_to_confirm: >-
      The coder's reading, to confirm: "for each incremement" = for each level of nesting (root, system, component), one schema for
      all of them, so the same code reads any level. "build, created" = COS scaffolds a new system from the registry template
      (DB11/DB20) and builds it, the same as any other.
    autopilot_reading: >-
      "what about moving autopilot ot the porchastrator folder?" was asked as a question; the coder's recommendation is yes, as
      orchestrator/autopilot.js. Autopilot is the supervisor that starts and restarts every system, which is orchestration. One
      constraint: autopilot also restarts the orchestrator's server, so it stays its own process. A folder is not a process: it moves
      in the tree, and still runs beside the server, not inside it. COS keeps finding old releases (lib/nexus/autopilot.js,
      nexus/autopilot.js) through runtime.js entryOf. To confirm.
    found_2026_10_24:
      registries: "11 of the 15 systems have registry-components.js (architect, clear-glass, copilot, cortex, diagnostic, guardian,
        idearium, intelligence, loom, ollama, versionium). None for orchestrator, components, cos, core (lib), and none for Nexus's root."
      merged_view: "lib/system-registry.js merges autopilot's ALL_KERNELS, diagnostic's SYSTEMS and version.js modules (read-only);
        lib/drawbridge-registry.js registryOf/graph reads each system's registry (DB9)."
      lifecycle: "cos/spec/cos-spine.spec: spawn/despawn/balance of compartments (process-runner), pause/resume/checkpoint/rewind
        (cos/workspace/vm-control.js), 'a person's acts or a rule he set; an agent may read and propose'. Not found: throttle,
        load balancing beyond the spec's spawn-and-balance."
  phases_added_g:
    DB21_one_registry_schema_every_level:
      status: OPEN
      depends_on: [DB16_a_registry_for_each_system, DB9_every_repo_generates_its_registry]
      files: [loom/templates/registry-level.spec, lib/registry-level.js, tests/modules/test-registry-level.test.js]
      does: >-
        One schema for a registry at any level: level (root | system | component), id, its children (each a registry of the next
        level), the events it emits and accepts (the bus), the routes and commands it offers (the contract), its components and their
        wires (the registry), and its lifecycle (which verbs it supports). lib/registry-level.js reads and validates any level and walks
        the tree. The existing registry-components.js files are read as the system level unchanged (§8.6).
      proof: "the 11 existing system registries validate as level 'system'; a component registry validates as 'component'; one walk from the root reaches every system"
    DB22_the_root_and_the_missing_four:
      status: OPEN
      depends_on: [DB21_one_registry_schema_every_level]
      files: [registry-components.js, orchestrator/registry-components.js, components/registry-components.js, cos/registry-components.js, lib/registry-components.js]
      does: "Nexus's root registry (its children are the 15 systems) and registries for orchestrator, components, cos and core, written from what each does today (§0.1)."
      proof: "the walk from the root reaches all 15; each new registry's routes are served (loom's declared ≠ served scanners)"
    DB23_autopilot_to_the_orchestrator:
      status: OPEN
      depends_on: []
      files: [orchestrator/autopilot.js, lib/nexus/autopilot.js, package.json, cos/app/runtime.js, lib/nexus-self/systems.js]
      does: >-
        lib/nexus/autopilot.js → orchestrator/autopilot.js through the refactor tool (lib/architecture-apply.js), still its own
        process. package.json scripts and COS's entryOf learn the new path, keeping the old ones for installed releases.
      proof: "npm run start:all boots every system from orchestrator/autopilot.js; a COS release with the old path still starts"
    DB24_cos_reads_only_the_registry:
      status: OPEN
      depends_on: [DB22_the_root_and_the_missing_four, DB11_cos_compartment_per_system]
      files: [cos/manager.js, cos/kernel.js, cos/compartment/process-runner.js]
      does: >-
        COS learns what to run from the registry walk alone (no list of Nexus's systems in COS): each system-level registry is a
        compartment, its lifecycle verbs are what COS may do to it. A registry COS has never seen runs the same way (agnostic).
      proof: "a fixture registry tree with a fake system COS has never seen is spawned, health-checked and despawned"
    DB25_the_lifecycle_verbs:
      status: OPEN
      depends_on: [DB24_cos_reads_only_the_registry]
      files: [cos/manager.js, cos/workspace/vm-control.js, cos/compartment/process-runner.js, idearium/cli/route-commands.js]
      does: >-
        Each verb a registry declares, for any system, through one route and one command row: create, build, spawn, despawn, pause,
        resume, rewind (vm-control's checkpoints), throttle (a rate cap on its routes at the drawbridge) and balance (more than one
        instance behind its registry). Each act is a person's or a rule he set (cos-spine.spec), on the event ledger.
      proof: "each verb on a fixture system: the act, its ledger row, and the state after; an agent's call is a proposal, not the act"
    DB26_the_ui_floats_on_the_registry:
      status: OPEN
      depends_on: [DB25_the_lifecycle_verbs, DB12_the_ui_handshake]
      files: [idearium/ui/desktop.html, idearium/ui/js/registry-view.js]
      does: "A view built only from the registry walk and the event ledger: every level, its state, its verbs. It shakes hands first (DB12)."
      proof: "driven in Clear Glass: the tree shows; a verb runs and its ledger row appears; an undeclared call is refused and shown"
  build_order_g: [DB23, DB21, DB22, DB24, DB25, DB26]

# ── The addenda below were written on brave-cori (claude/brave-cori-eczug1) and ported to main at 0.60.247 (BCR2, his "Port it
# phase-by-phase"), unchanged (§0.3). Their version numbers are that line's. RF2 on main did its own folds, so where they describe folds,
# docs/2026-10-24-fifteen-systems-migration-phasemap.spec says what main did. Their DB16 drafts arrive with the DB16 port.
## ADDENDUM 2026-10-24 (0.60.229) — DB16 drafted; the way to sovereign, measured
James, 2026-10-24: "then we need to resume the component registery for each system, get the mall sovereign, then cos phases to migrate." · to
the choice "1 registries per system (DB16), COS first … 2 specs via local models": "1"
- **Built:** lib/registry-draft.js draft / missing / text. Each draft comes from the tree only: the routes its interaction-contract.json
  declares (lib/route-contract-check.js holds those to the code), its event-taxonomy.js pointed at (the one truth for its event names, ET1),
  the literal event names it emits and handles, the files other systems reach into today (DB1: each is a capability that needs a route,
  DB6), and its own way out by blocker (data, primitive, capability). Written for all 16 systems with none as
  <system>/registry-components.draft.json. GET /api/system/registry-drafts, GET /api/system/registry/:system/draft, `system drafts`.
- **Decided by the axioms (REVERSIBILITY, USER_AUTONOMY: drafts are his to accept):** a draft is JSON under its own name. lib/system-registry.js,
  lib/system-nodes.js and others take any <system>/registry-components.js as declared, so a draft under that name would have been in force
  before he accepted it (the first try did that, caught before commit). JSON because siso is an ES module package and a CommonJS draft broke
  there. Accepting one: it becomes the system's registry-components.js and the system goes onto loom's SYSTEMS list.
- **Measured (sovereignty census, lib/system-boundary.js):** no system is sovereign today. With no way out at all (their own registry, bus,
  handshake and compartment are what is left): auth, erosmancer, jaa, mesh, remote-desktop, security, sentinel, siso. COS: 5 ways out (1 data,
  cos/manager.js → cortex/memory/jaa-db.js; 4 primitives into siso/warp), 39 of its files reached into by others (cos/host/index.js by four
  systems). Orchestrator 38 ways out, cli 20, meta 12, emergence 9, nexus 8.
- **No screen yet:** the drafts are on a route and a command; the UI is deferred, said.
- **Found, not this change's:** test-system-boundary SB-06/SB-08 fail on the committed tree too — three crossings not in the baseline
  (idearium/repo/roadmap-import.js → loom/scanners/phasemap-map.js since 0.60.199; lib/phase-dag.js → the same; lib/verify-first.js →
  cos/testenv/run-target.js). Reported.

## ADDENDUM 2026-10-24 (0.60.230) — his decision: eight folders are not systems
James, 2026-10-24, reading the coder's "auth, erosmancer, jaa, mesh, remote-desktop, security, sentinel and siso already reach into no other
system" (0.60.229's report, which counted them as the systems closest to sovereign): "Aren't systems. They should have been dealt with already"
- **His decision:** those eight are not systems. His axiom §5.9 already said so ("a primitive with none of these [state, lifecycle,
  persistence, execution] is not a system", docs/2026-10-17-decisions-by-the-axioms.spec); the census (lib/system-boundary.js) never
  applied it, and DB16 drafted registries for them. That cost: eight drafts and a wrong "closest to sovereign" list in 0.60.229.
- **What it changed:** lib/system-boundary.js FOLDED, each one's home read from who uses it — auth → orchestrator (its only user,
  orchestrator/orchestrator.js), mesh → guardian (guardian/routes/mesh.js), jaa → guardian (its schema is "Guardian v8 — Schema"), siso → the
  kernel (a primitive cos, emerge and idearium use; PRIMITIVES already said so); erosmancer, remote-desktop, security, sentinel → parked
  (nothing requires them; a use of one is reported as parkedUses, never hidden). Their files count as their home's; they are never listed
  as systems; their eight drafts were withdrawn (generated output, regenerable: nothing lost).
- **The same mistake one level down, decided by the axioms (§5.9; DB16's open question, the coder's reading, to confirm):** the parts of
  other systems (contracts, hooks, service, components, architecture-spec, seams) and the faces (ui, tablet) were listed as "sovereign".
  lib/system-boundary.js PARTS: still scanned (crossings into hooks/ are real edges), never in the sovereignty list. lib/registry-draft.js
  reads the same lists (one truth).
- **"They should have been dealt with already" — what is left, to confirm:** the table only counts them right. Dealing with them means
  moving each into its home (DB17: auth/ into orchestrator/, mesh/ and jaa/ into guardian/, siso/ beside the kernel) and archiving the parked
  four (§0.3: archive, not delete). The coder's reading is that he wants that done; erosmancer (231 files, its own OS spec) may be his own
  project rather than parked code — his to say.
- **Found and fixed on the way:** 0.60.229 put the drafts' route case between `case 'system.registry':` and `case 'system.registry.one':`,
  so GET /api/system/registry answered with the drafts instead of the dependency graph (test-drawbridge-registry SR-07). Moved; guarded.
- **Measured now:** 20 systems; none sovereign. Fewest ways out: cockpit 1 (data), warp 1, emerge 4, cos 4 (1 data, 3 primitive into warp/core).

## ADDENDUM 2026-10-24 (0.60.231) — the systems are Idearium's 15
James, 2026-10-24, after 0.60.230 counted 20 systems: "15 systems. only the ones with a .spec in the directory. all the systems in idearium"
- **His decision:** the systems are exactly Idearium's list, lib/nexus-self/systems.js SYSTEMS: orchestrator, cortex, guardian, idearium,
  architect, diagnostic, intelligence, ollama-bridge (ollama/), versionium, copilot, loom, clear-glass, components, cos, core (the kernel,
  lib/). It supersedes 0.60.230's count of 20, and the coder's reading that put components among the parts (both kept here, §0.3).
- **What it changed:** lib/system-boundary.js realSystems() reads that list; the sovereignty census lists only those 14 folders (core is the
  kernel) and names every other folder with code as unhomed, with who uses it: warp, nexus, meta, emerge, hooks, cockpit, cli,
  architecture-spec, contracts, emergence, seams, service, tablet, ui. The scan itself is unchanged (a require into warp/ is still a real edge,
  and the ratchet's baseline still holds it). lib/registry-draft.js drafts only for those 15: orchestrator, cos, components; the six drafts
  for cli, cockpit, emergence, meta, nexus, warp withdrawn (generated, regenerable).
- **His ".spec in the directory", checked:** 13 of the 15 have one in their folder (<system>/spec/*.spec). components has none; core has no
  folder of its own (lib/; docs/lib.spec exists). Said, not decided: components is on his list without a spec.
- **What is left for the unhomed:** each needs a home (moved into the system that uses it, DB17) or to be archived; the census lists their
  users, so the home is read from the evidence, as 0.60.230 did for the eight. warp is used by ten folders (it is the primitive the
  census's PRIMITIVES already names), nexus by eleven.

## ADDENDUM 2026-10-24 (0.60.232) — "Archive."
James, 2026-10-24: "Archive." — his answer to the coder's "1. Home or archive the unhomed folders … Your erosmancer question is still open."
- **The coder's reading (to confirm):** archive what is not a system and is not needed. By the axioms (REVERSIBILITY, §1.2 nothing fails
  silently), a folder that live code still uses cannot be archived without breaking it; it needs a home instead. Each candidate was checked
  for requires, paths named by name (spawned, served, read), workspaces and tests.
- **Archived** to _archive/2026-10-24-not-systems/ (git mv; a README says why and how to restore): remote-desktop, security (the top-level
  e2e-channel and signaling-envelope), emergence (with its own suites; tests/modules/test-emergence-and-warp-suites.test.js keeps WARP's).
- **Not archived, his to decide:** erosmancer (Clear Glass starts ErosmancerOS from erosmancer/erosmancer-os, his "erosmanceros to start
  with clearglass"; an npm workspace) and sentinel (cli/sentinel.js and two tests use it). **Kept, live:** service (the Idearium UI tells him
  to start node service/idearium-service.js), tablet (two tests read its pages), seams (tests/brutal.test.js requires it), ui (served), and
  the used unhomed folders (warp, nexus, meta, emerge, cli, cockpit, hooks, contracts, architecture-spec): each needs a home, not the archive.
- **A regression of 0.60.230, found and fixed:** test-cos-compartment-template CT-03/CT-04 used sentinel as the sovereign example; 0.60.230
  made sentinel not a system and the test was not run then (it passed at 0.60.229). The example is now components (of his 15, the one that
  requires nothing in another system). CT-07 fails as it did at 0.60.229 (the ratchet's three crossings).

## ADDENDUM 2026-10-24 (0.60.233) — erosmancer moved into Clear Glass
James, 2026-10-24: "move erosmancer to either clearglass or guardian"
- **Which, decided by the evidence (§0.1):** Clear Glass. It starts ErosmancerOS (clear-glass/src/eros/supervisor.js), wires it
  (clear-glass/wire/nexus-wire.js), drives its input and runs its workbench; no Guardian file uses it.
- **Moved (git mv):** erosmancer/erosmancer-os → clear-glass/erosmancer-os; erosmancer/spec/erosmancer.spec → clear-glass/erosmancer-os/spec/.
  Every live path updated (the supervisor, the wire, the macro tool, five tests, two loom maps, the npm workspace and lock, the README,
  the atlases, the spec registry); history (CHANGELOGs, version lines, older maps) left as written. lib/system-boundary.js FOLDED no longer
  needs an entry for it. Clear Glass's electron-builder config excludes it from the app.
- **Left:** sentinel, still parked (its CLI and two tests).

## ADDENDUM 2026-10-24 (0.60.234) — Sentinel archived
James, 2026-10-24: "I'm not sure what Sentinel is, dude. Is that, like, tell me, I don't think that got mixed in to this project." The coder
read docs/nexus-sentinel.spec and its history: his 2026-07-24 plan (quoted three times in it) to merge four diagnostic surfaces into one
diagnostic-and-repair authority; only S1 was built (a contract whose routes were declared and never served, and cli/sentinel.js); its job is
the diagnostic system's now (one of his 15; the healer joined it in 0.60.136). The coder recommended archiving it. He: "Yeah archive it."
- Archived (git mv) to _archive/2026-10-24-not-systems/sentinel/: the folder, cli/sentinel.js, tests/modules/test-sentinel-cli.js (out of
  both run-all lists, said there), and test-adversarial-sim's AS-004..AS-006 (they tested that CLI). The spec stays in docs/, addended.
- Found: test-sovereign-systems SV-08 used sentinel as its sovereign example; 0.60.230 broke it and it was not run then (the second test
  that change broke, after CT-03/04). Now components. Every test touching the census is being run (CHANGELOG-0.60.234.md).

## ADDENDUM 2026-10-24 (0.60.236) — sovereign: components, ollama, cos (DB6 begun)
James, 2026-10-24: "We need the systems sovereign."
- **warp counts with the kernel** (lib/system-boundary.js FOLDED warp: 'lib'), as siso does: nine systems use warp/core, so inside idearium or
  guardian (his earlier "warp would probably be idearium or guardian") every one would depend on that system and none could be sovereign.
  Decided by his axioms for his goal; to confirm. The folder has not moved.
- **The pulse moved to the kernel** (DB17): orchestrator/lib/pulse.js → lib/pulse.js (node built-ins only), the old path a one-line
  re-export; cortex/boot.js, idearium/api, clear-glass/wire/nexus-wire.js, nexus/nexus-connect.js and orchestrator.js require lib/pulse.js.
  Cortex, idearium and Clear Glass no longer reach into orchestrator for a heartbeat.
- **ollama sovereign:** its one way out was nexus/nexus-connect.js startHeartbeat, which only handed off to the pulse; it takes the pulse
  from the kernel.
- **cos sovereign:** its one way out was cortex/memory/jaa-db.js's JaaDB class (a compartment's own store). CompartmentManager takes
  openStore(dir) from whoever boots it, as it already takes jaaDB; without one it says so and uses the shared store (it fell back silently).
- **Measured now:** sovereign components, ollama, cos. Next fewest ways out: loom 5 (3 data — cortex's jaa-db; 1 primitive — nexus-connect;
  1 capability — ollama-client), architect 6, clear-glass 9. The two files most systems still reach for: cortex/memory/jaa-db.js (data) and
  nexus/nexus-connect.js (it is not a pure primitive: it lazily requires intelligence/lattice; moving it into the kernel as it stands would
  be an upward crossing, so it needs its lattice use cut first).
