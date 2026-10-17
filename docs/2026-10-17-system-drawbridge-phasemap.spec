spec:
  meta:
    name:     system-drawbridge
    version:  1.0.0
    date:     2026-10-17
    release:  "0.60.126 (DB1)"
    uuid:     nexus-system-drawbridge-phasemap-v1-0000-2026-1017-jamesbrooks-001
    owner:    "lib (the census and the drawbridge) · every system with a registry-components.js · orchestrator (the handshake) · loom (the self-model)"
    status:   "MAPPED 2026-10-17. DB1 BUILT 0.60.126 (the census and the ratchet). DB9/DB10 PARTLY BUILT 0.60.127. DB13 BUILT, DB14 PARTLY BUILT 0.60.128. DB18 BUILT, DB17 census 0.60.129. P33a (sovereign-node P33) BUILT 0.60.130. DB0a-DB0c are his to decide; DB2-DB8 OPEN."
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
      status: OPEN
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
      status: OPEN
      does: "Each system's own server starts its registry's listener at boot, so the system manages its nodes in its own
        process (sovereign). Guardian moves onto the factory, indexed into guardian's own store."
