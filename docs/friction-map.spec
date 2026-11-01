spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # friction-map.spec — the friction and tension map between functions and primitives. Every function is placed against his eight primitives
  # (input, event, gate, process, delta, state, sigma, output); every function-to-function joint and function-to-primitive role carries a
  # friction (how often it fails, measured) and a tension (how much pulls on it, measured); a traversal answers "what fits" by least friction.
  # Format: emerge's module spec, compiled by lib/emerge/compiler/kg-builder.js at specDepth 1.0 (tests/modules/test-substrate-spec.test.js).
  # Phases: docs/2026-11-01-friction-map-phasemap.spec.
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        friction-map
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-11-01T00:00:00Z
    status:      specced
    uuid:        nexus-friction-map-spec-v1-0000-2026-1101-jamesbrooks-001
    origin: >-
      James, 2026-11-01: "cfr and rfr2 for friction also looms friction and tension which was supposed to be the intelligence system. to map
      compatability between primitives. the traversal. nexus is supposed to, when asked" · "move that to the intelligence system.." (done,
      CI6) · "the friction and tension mapping, between functions and primitives." His eight primitives (2026-11-01): "state process event delta
      sigma gate input output". The idea is his; the measures, the joins and the contracts are the coder's.
    purpose: >-
      Nexus can say, for any function, which primitives it plays (it takes input, it gates, it changes state …), how well each joint holds
      (friction: measured failures at that joint), and how much strain sits on it (tension: open gaps, causal pressure, churn, fan-in). When
      asked to compose, it walks this map and offers the functions that fit the needed chain of primitives with the least friction — reuse by
      compatibility, before anything new is written.
    target_runtime: [node]
    language_stack: [javascript]
    paradigm: [SISO, evidence-first, measured, deterministic]
    axioms: ["§0.1 evidence over memory", "§1.2 nothing fails silently", "§10.3 one truth layer: friction means one thing (CI6)",
      "§8.6 reuse before build", "§5.9 sovereignty: every source through its route", "NC0: every edge says where it came from; unknown stays unknown"]
    deps:
      - { name: js-yaml, version: ">=4.1.0", required: true, purpose: "spec and node files" }

    constraints:
      - id: FX-001
        description: "A primitive role is assigned only from what the function's code shows (its reads, calls, writes, returns), each role naming its evidence; no role is guessed, and a function with no evidence is 'unplaced'."
        type: hard
        enforced_by: [GATE-FT-ROLES-FROM-CODE]
      - id: FX-002
        description: "Friction and tension are computed only from measured records (faults, gaps, causal edges, versions, Loom wires); a joint with no record has null friction, never 0."
        type: hard
        enforced_by: [GATE-FT-MEASURED]
      - id: FX-003
        description: "Every source is reached through its system's route (Intelligence, Loom, Versionium, Idearium); the map holds no copy of their stores."
        type: hard
        enforced_by: [GATE-FT-DOORS]
      - id: FX-004
        description: "The map is Intelligence's (friction and tension mean one thing, CI6); Loom keeps components, hooks and wires; code intelligence keeps the functions."
        type: hard
        enforced_by: [GATE-FT-OWNER]

  schemas:

    - id: FunctionNode
      name: FunctionNode
      description: "One function, as code intelligence declares it."
      fields:
        id:        "string — <file>#<name>"
        file:      "string"
        name:      "string"
        line:      "number"
        exported:  "boolean"
        component: "string|null — the Loom component that owns the file"
        system:    "string — the system that owns the file"
      behavioral_contracts: ["the same file + name is the same node"]
      error_paths: ["a file code intelligence cannot read → its functions are not in the map, said"]

    - id: PrimitiveRole
      name: PrimitiveRole
      description: "A primitive a function plays, with the code that shows it."
      fields:
        fn:        "string — FunctionNode.id"
        primitive: "string — input | event | gate | process | delta | state | sigma | output"
        evidence:  "object[] — { line, text, rule } the lines and the rule that matched (e.g. rule 'emits' for bus.emit / emit(...))"
        confidence: "number — share of the role's rules that matched, 0..1"
      behavioral_contracts: ["rules are a table in the spec's module (MOD-FT-ROLES), the same every run"]
      error_paths: ["no rule matched → no role; the function is unplaced, listed"]

    - id: Joint
      name: Joint
      description: "Two functions joined (one calls or imports the other), or a function joined to a primitive slot it fills."
      fields:
        from:      "string — FunctionNode.id"
        to:        "string — FunctionNode.id or primitive:<name>"
        kind:      "string — calls | imports | fills"
        source:    "string — discovered by (which reader) or declared by (Loom wire)"
        friction:  "number|null — failed / total at this joint over the window, from fault records naming either end; null with no record"
        tension:   "number|null — the joint's TensionParts combined; null with none"
        parts:     "object — FrictionParts and TensionParts"
      behavioral_contracts: ["every number names the records it rests on"]
      error_paths: ["an end that no longer exists → the joint is kept as stale, said"]

    - id: FrictionParts
      name: FrictionParts
      description: "What friction at a joint is made of (measured)."
      fields:
        faults:    "number — fault-log and phase-fault rows naming either end's file in the window"
        runs:      "number — runs that touched either end's file"
        shape:     "number|null — port mismatches where a shape is declared (Emerge's shapeMismatches, Loom's contracts)"
        crossings: "number — new boundary crossings at the joint (the drawbridge census)"
      behavioral_contracts: ["friction = faults / max(runs, 1), plus 0.25 per shape mismatch and per crossing, capped at 1; each term listed"]
      error_paths: ["runs 0 and faults 0 → null, not 0"]

    - id: TensionParts
      name: TensionParts
      description: "What pulls on a joint (measured)."
      fields:
        openGaps:  "number — open gaps naming either end (Intelligence's synthesis)"
        causal:    "number — failing events whose RFR2 trace passes through either end, in the window"
        churn:     "number — Versionium versions of either end's file in the window"
        fanIn:     "number — Loom impact: components that depend on the 'to' end"
      behavioral_contracts: ["tension = 1 − Π(1 − normalised part), each part normalised by the map's own 95th percentile; each listed"]
      error_paths: ["a source down → its part null, said, the rest still combined"]

    - id: FitAnswer
      name: FitAnswer
      description: "The answer to 'what fits': functions for a chain of primitives, least friction first."
      fields:
        asked:     "string[] — the chain of primitives asked for (e.g. [input, gate, state, output])"
        offers:    "object[] — { path: FunctionNode.id[], friction, tension, roles, why }"
        unplaced:  "number — functions the map could not place"
        cut:       "object|null — the traversal's cut when its budget ran out"
      behavioral_contracts: ["offers ordered by friction, then tension, then shortest path"]
      error_paths: ["no function plays a primitive in the chain → that step is said as a gap: 'nothing here plays <primitive>'"]

  interfaces:

    - id: IF-CODE-INTEL
      name: code-intel
      path: lib/code-intel/chunker.js
      description: "Code intelligence: the functions a file defines and the names it exports (chunker definesOf, exportedNames); cards with import bindings (cards.js importBindings)."
      exports: ["definesOf(text, language) → [{ name, line }]", "exportedNames(text) → string[]", "importBindings(text) (cards.js)"]
      behavioral_contracts: ["deterministic; no model"]
      error_paths: ["a language it cannot parse → nothing, said"]

    - id: IF-FAULTS
      name: phase-faults
      path: lib/phase-faults.js
      description: "Each failed attempt's mode (timeout, wrote-nothing, missed-files, tool-errors …) and the fault log it writes."
      exports: ["modeOf(row)", "faultsOf(row)", "log(row)"]
      behavioral_contracts: ["one row per failed attempt, naming its files where known"]
      error_paths: ["a row with no files → counted for its run, not a joint"]

    - id: IF-INTEL-FRICTION
      name: intelligence-friction
      path: intelligence/routes.js
      description: "Intelligence's friction and tension (CI6), its gap synthesis (GET /api/intelligence/synthesis), RFR2 traces (GET /api/intelligence/rfr2/trace, /query)."
      exports: ["GET /api/intelligence/friction", "GET /api/intelligence/synthesis", "GET /api/intelligence/rfr2/trace", "GET /api/intelligence/rfr2/query"]
      behavioral_contracts: ["reached through its routes"]
      error_paths: ["a route down → the part it feeds is null, said"]

    - id: IF-LOOM
      name: loom
      path: loom/server.js
      description: "Loom's components, hooks and wires; GET /api/impact/:id (who depends on a component)."
      exports: ["GET /api/impact/:id", "GET /api/context-graph"]
      behavioral_contracts: ["wires are real require/consumer edges"]
      error_paths: ["an unknown id → 404"]

    - id: IF-VERSIONIUM-FILES
      name: versionium-files
      path: versionium/routes/files.js
      description: "Versionium: GET /api/versionium/files/versions?path= — every commit that wrote a path."
      exports: ["GET /api/versionium/files/versions?path=<p> → [{ commit, at, sha256 }]"]
      behavioral_contracts: ["reached through its route"]
      error_paths: ["Versionium down → churn null, said"]

    - id: IF-TRAVERSE-WALK
      name: traverse
      path: lib/core/traverse.js
      description: "docs/substrate.spec MOD-TRAVERSE — the one deterministic, budgeted walk (TV1, specced, not built)."
      exports: ["walk({ view, start, direction, relations, depth, budget, order }) → WalkResult", "path(view, from, to, opts)"]
      behavioral_contracts: ["a cut names what was not visited"]
      error_paths: ["not built yet — FT4 waits on TV1"]

  modules:

    - id: MOD-FT-ROLES
      name: primitive-roles
      uuid: nexus-friction-map-roles-v1-0000-2026-1101-001
      path: intelligence/friction-map/roles.js
      phase: FT1_functions_placed
      description: >-
        roles(file, text) → { functions: FunctionNode[], roles: PrimitiveRole[], unplaced }. Functions from code intelligence; each function's body
        read against a fixed rule table, one row per primitive: input (reads req/body/argv/params, its own parameters from outside), event
        (emit, bus.emit, on(…)), gate (a check that returns or throws early: validate, if … return { ok:false }, assert), process (computes
        from its inputs without writing), delta (builds a change: diff, patch, { before, after }), state (writes a store: insert, writeFile, set),
        sigma (sigma, baseline, deviation, slope), output (res.end/json, return to a caller across a module boundary, write to output/). Each
        role carries the lines that matched.
      deps: [{ name: code-intel }]
      schema_refs: [FunctionNode, PrimitiveRole]
      exports: ["roles(file, text, { language }) → { functions, roles, unplaced }", "RULES"]
      gate_pipeline: ["GATE-FT1-001: functions from code-intel", "GATE-FT1-002: each body against RULES; matches kept with lines", "GATE-FT1-003: no match → unplaced"]
      behavioral_contracts: ["deterministic: the same text gives the same roles", "a role without evidence is not written (FX-001)"]
      error_paths: ["an unreadable file → skipped, listed"]
      acceptance: ["over intelligence/routes.js: handle plays input, gate and output, each with its lines; a pure helper is process only; nothing is placed without a line"]

    - id: MOD-FT-JOINTS
      name: joints
      uuid: nexus-friction-map-joints-v1-0000-2026-1101-001
      path: intelligence/friction-map/joints.js
      phase: FT2_joints_measured
      description: >-
        joints(scope) → Joint[]. Calls and imports between functions (code intelligence's import bindings plus a call scan of each body),
        function-to-primitive fills from MOD-FT-ROLES, Loom's wires as declared joints. Friction from phase faults and the fault log naming
        either end's file over the window, port shape mismatches where a shape is declared, and new crossings at the joint.
      deps: [{ name: code-intel }, { name: phase-faults }, { name: loom }]
      schema_refs: [Joint, FrictionParts]
      exports: ["joints(scope, { window }) → Joint[]"]
      gate_pipeline: ["GATE-FT2-001: joints from imports, calls, fills, wires (each with its source)", "GATE-FT2-002: FrictionParts from records", "GATE-FT2-003: friction by the rule; null with no records"]
      behavioral_contracts: ["a joint says whether it was discovered (which reader) or declared (Loom)", "no record → null friction (FX-002)"]
      error_paths: ["a source down → its term null, said"]
      acceptance: ["a fixture repo where b() failed 3 of 4 runs after a(): the a→b joint's friction 0.75 with its three fault rows named"]

    - id: MOD-FT-TENSION
      name: tension
      uuid: nexus-friction-map-tension-v1-0000-2026-1101-001
      path: intelligence/friction-map/tension.js
      phase: FT3_tension_measured
      description: >-
        tension(joints) → Joint[] with TensionParts: open gaps naming either end (Intelligence's synthesis), failing events whose RFR2 trace
        passes through either end, Versionium versions of either end's file in the window (churn), and Loom impact of the 'to' end (fan-in).
      deps: [{ name: intelligence-friction }, { name: versionium-files }, { name: loom }]
      schema_refs: [Joint, TensionParts]
      exports: ["tension(joints, { window }) → Joint[]"]
      gate_pipeline: ["GATE-FT3-001: each part from its route", "GATE-FT3-002: normalise by the map's 95th percentile", "GATE-FT3-003: combine; list each part"]
      behavioral_contracts: ["a part whose source is down is null and said; the rest still combine"]
      error_paths: ["every source down → tension null for all, said once"]
      acceptance: ["a fixture function with two open gaps and high churn ranks above a quiet one; each part shown"]

    - id: MOD-FT-FIT
      name: what-fits
      uuid: nexus-friction-map-fit-v1-0000-2026-1101-001
      path: intelligence/friction-map/fit.js
      phase: FT4_what_fits
      description: >-
        fit(chain, opts) → FitAnswer. Given a chain of primitives (from a spec module's gate pipeline, or asked directly: "input → gate → state
        → output"), walks the map with the one traversal (lib/core/traverse.js) over joints, following only functions whose roles match the
        next primitive, ordering paths by summed friction, then tension, then length. A step nothing plays is said as a gap. This is how Nexus,
        when asked to build, offers what already fits before anything new is written (§8.6).
      deps: [{ name: traverse }]
      schema_refs: [FitAnswer, Joint, PrimitiveRole]
      exports: ["fit(chain, { scope, budget, limit }) → FitAnswer"]
      gate_pipeline: ["GATE-FT4-001: chain → primitives", "GATE-FT4-002: walk with the role filter, budgeted", "GATE-FT4-003: order; gaps named; the cut kept"]
      behavioral_contracts: ["deterministic for the same map version", "a gap is said, never filled with a guess"]
      error_paths: ["traverse not built → refused naming TV1"]
      acceptance: ["asked input → gate → state over a fixture: the existing validate-then-insert path is offered first, with its friction; a chain with no 'sigma' function says so"]

    - id: MOD-FT-DOOR
      name: friction-map-door
      uuid: nexus-friction-map-door-v1-0000-2026-1101-001
      path: intelligence/routes.js
      phase: FT5_asked_and_seen
      description: >-
        Intelligence's routes GET /api/intelligence/friction-map?scope= (functions, roles, joints), POST /api/intelligence/fit { chain }; command
        rows `intelligence fit <primitive …>` and `intelligence friction-map <scope>`; the map drawn on the Emergence page and channel (a function
        graph, joints coloured by friction, sized by tension) and offered to Idearium's build before a phase writes code (its context).
      deps: [{ name: intelligence-friction }]
      schema_refs: [FitAnswer, Joint]
      exports: ["GET /api/intelligence/friction-map", "POST /api/intelligence/fit"]
      gate_pipeline: ["GATE-FT5-001: route → module", "GATE-FT5-002: rows build the same calls", "GATE-FT5-003: the view reads only the routes"]
      behavioral_contracts: ["agents get the same rows (nexus.command)", "Idearium's build context names the offers it was given"]
      error_paths: ["no map yet → 404 'not built for <scope>', said"]
      acceptance: ["in Clear Glass: the map for a scope, a joint's parts on hover, a fit answer for a chain"]

  events:
    friction_map:
      - "friction_map.built { scope, functions, joints, unplaced }"
      - "friction_map.fit { chain, offers, gaps }"

  enforcement:
    gates:
      - { id: GATE-FT-ROLES-FROM-CODE, name: roles-from-code, severity: fatal, check: "every PrimitiveRole has ≥ 1 evidence line", on_failure: "role refused" }
      - { id: GATE-FT-MEASURED, name: measured, severity: fatal, check: "every non-null friction/tension lists the records it rests on", on_failure: "map refused" }
      - { id: GATE-FT-DOORS, name: doors, severity: fatal, check: "no module requires loom/, versionium/ or idearium/ files; routes only", on_failure: "build failure" }
      - { id: GATE-FT-OWNER, name: owner, severity: fatal, check: "the map's modules live in intelligence/", on_failure: "build failure" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node, invariants valid"
    - "per module: its acceptance lines, each a named test in the phase that builds it"
