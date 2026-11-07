spec:

  # wiring-harness.spec — the wiring harness: each system's spec is its compartment file, its metadata and its door; CIE-EG is the engine
  # inside the door; components are dumb; rewiring is a spec edit. A template (Idearium's, beside genesis.spec): every system builds its own
  # harness from it and owns it (§5.16, his "Each system is sovereign. Each is responsible for their own door"). Format: Emerge's module spec,
  # compiled by kg-builder at specDepth 1.0. New code is .eg (AXIOMS §17.13). Map: docs/2026-11-07-wiring-harness-phasemap.spec.

  meta:
    name:        wiring-harness
    version:     0.1.0
    author:      james-brooks
    created_at:  2026-11-07T00:00:00Z
    status:      specced
    uuid:        nexus-wiring-harness-spec-v1-0000-2026-1107-jamesbrooks-001
    origin: >-
      James, 2026-11-07: "The wiring harness" · "spec it. then lets continue emerge". Before it, the same day: ".spec as the compressed system.
      Spec as the meta data, and also the door?" · "That makes the spec the compartment file for cos and idearium. The spine for architect and
      thn the components can be dumb since the door is the event bus to route. Reduces complexity and adds modularity and using the architect
      in idearium can edit the architecture" · "The door is the interaction contract, also called the draw bridge. Cie-eg is meant to slot in
      to it. It's the foundation." · "Each system is sovereign. Each is responsible for their own door". And 2026-09-27 (Q0732): "use the
      component registry as the wiring harness like loom does for nexus, that way it makes the registry a map and event bus, so chunks can
      have minial context." · "it's meant to make small llms capable of building entire codebases regardless of the size."
    purpose: >-
      One harness per system, declared in that system's spec: what the system is (metadata), what it offers and accepts (its connectors: routes,
      commands, events, each with its contract), who may call it (the handshake). The system's server.js serves only what the harness declares,
      through CIE-EG's registry, gate and ledger; COS passes between systems only what both harnesses declare; Architect draws and edits the
      harness; an agent building a component reads only that component's connector. Nothing is described twice, so nothing drifts.
    readings_to_confirm:
      - "\"slot in to it\": the door is the socket each system exposes; CIE-EG is the engine behind it, not a layer beside it."
      - "the harness is a section of the system's own .spec (harness:), not a separate file; the .cos node and the image carry a copy, checked by hash."
      - "whether interaction-contract.json, registry-components.js and handshake.js become generated views of the harness or are retired (his, open)."
    invariants:
      - "INV-WH-1: a capability not declared in the harness does not exist: the door refuses it before any component sees it, and records the refusal."
      - "INV-WH-2: a component names no other component and no other system; it takes its input and returns its output (his PL_D9, dumb components)."
      - "INV-WH-3: rewiring (which connector feeds which) changes only the harness; no component's code changes."
      - "INV-WH-4: each system's harness is its own; shared are only this template and the entry schema (PIC_D3, PL_D9)."
      - "INV-WH-5: every change to a harness is gated and recorded in Versionium, before and after (§17.12)."
      - "INV-WH-6: a system is reconstructible from its spec only when its implementation can be regenerated, its dependencies and generation environment are declared, the regenerated system meets the same contracts, its tests pass, and its build is reproducible; specification coverage and verified reconstruction coverage are kept apart."

  schemas:

    - id: HarnessEntry
      name: HarnessEntry
      description: "One connector of a harness: one thing a system offers or accepts, at any level (system or component), with its contract."
      fields:
        id:          "string — <system>.<component>.<name>, [A-Za-z0-9_] segments joined by '.' (cie-eg P-ident)"
        level:       "'system'|'component'"
        kind:        "'route'|'command'|'event_out'|'event_in'"
        route:       "{ method: string, path: string }|null — for kind route"
        command:     "string|null — the CLI grammar, for kind command"
        event:       "string|null — the event name, for kinds event_out and event_in"
        component:   "string — the dumb component that answers it, by id in the registry"
        contract:    "{ in: schema-ref, out: schema-ref, errors: [string] } — what goes in, what comes out, how it fails"
        permission:  "[string] — who may call: person | rule:<id> | system:<name> | agent; checked by the handshake"
        intent:      "string — one line, why it exists (the agent's whole context for it)"
      behavioral_contracts: ["an entry's id is unique in its harness", "every route, command and event the system serves has exactly one entry"]
      error_paths: ["a malformed id → refused with the rule it breaks", "a contract naming an unknown schema → refused, named"]

    - id: Harness
      name: Harness
      description: "A system's door: its metadata, its entries, its handshake; the harness: section of its .spec."
      fields:
        system:      "string — the system's name"
        version:     "string — semver of the harness"
        hash:        "string — sha256 of the canonical form (cie-eg contract_hash), the id the .cos node and the image carry"
        metadata:    "{ purpose: string, owner: string, runtime: { process: string, port: number|null } }"
        entries:     "[HarnessEntry]"
        wires:       "[{ from: entry-id, to: entry-id }] — which event_out feeds which event_in, inside the system; rewiring edits only this"
        handshake:   "{ accepts: [string], verify: 'contract_hash' } — a caller presents the hash of the harness it was built against"
      behavioral_contracts: ["the same harness gives the same hash", "a wire joins an event_out to an event_in whose contracts match"]
      error_paths: ["a wire between mismatched contracts → refused with both schemas named", "an entry with no component → refused"]

    - id: ConformanceReport
      name: ConformanceReport
      description: "One run of the four-part test against one system's door."
      fields:
        system:      "string"
        harnessHash: "string"
        parts:       "{ register: bool, contract: bool, gate: bool, ledger: bool } — each part's check passed"
        refusals:    "[{ probe: string, refused: bool, recorded: bool }] — undeclared calls sent, each must be refused and recorded"
        at:          "string — ISO time"
      behavioral_contracts: ["a report is evidence only with all four parts and every probe refused and recorded"]
      error_paths: ["the door does not answer → report with every part false, and why"]

    - id: ReconstructionResult
      name: ReconstructionResult
      description: "One module regenerated from its spec alone and judged by its contracts."
      fields:
        module:      "string — the spec module id"
        specHash:    "string"
        generator:   "string — what wrote it: deterministic | model:<id>"
        builder:     "string — the compiler and its version (emerge BUILD.json)"
        tests:       "{ passed: number, failed: number }"
        verified:    "bool — every contract test passed"
      behavioral_contracts: ["verified reconstruction coverage = verified modules / modules, per system; never mixed with specification coverage"]
      error_paths: ["the module cannot be generated → verified false, with the step that failed"]

  interfaces:

    - id: IF-CIE-WORLD
      name: cie-world
      path: emerge/emerge/lang/cie/world.eg
      description: "CIE-EG's runtime: the component registry, the roads, the gate and the event ledger."
      exports: ["declare(spec)", "connect(from, to, line)", "roads(line)", "send_in(comp, hook, payload)", "emit_out(hook, payload)", "signal(name, payload)", "listen(signal, run)", "open_gap(message, pressure, gtype, line, file)", "unrouted()", "entries()", "verify()"]
      behavioral_contracts: ["a registration is a register entry on the ledger", "an unrouted send is recorded, never dropped silently"]
      error_paths: ["a duplicate component id → refused with a gap (AT-10)"]

    - id: IF-CIE-CONTRACT
      name: cie-contract
      path: emerge/emerge/lang/cie/contract.eg
      description: "CIE-EG's contract block: parse, normalize and hash a contract."
      exports: ["parse_contract(text)", "normalize(r)", "canonical(v)", "contract_hash(c)"]
      behavioral_contracts: ["the same contract gives the same hash"]
      error_paths: ["a malformed contract → raises with its line"]

    - id: IF-CIE-LEDGER
      name: cie-ledger
      path: emerge/emerge/lang/cie/ledger.eg
      description: "CIE-EG's ledger: canonical form, entry hashes, Merkle proofs, verification."
      exports: ["ecf(v)", "hash_entry(e)", "merkle_root(hashes)", "merkle_proof(hashes, index)", "verify(entries)"]
      behavioral_contracts: ["verification re-hashes every entry"]
      error_paths: ["a tampered entry → verify names it"]

    - id: IF-ARCHITECT-COMPILE
      name: architect-compile
      path: architect/compile-route.js
      description: "Architect's canvas → spec compiler (one direction today)."
      exports: ["the compile route: canvas JSON → compiled spec"]
      behavioral_contracts: ["a canvas compiles to a spec the spec compiler accepts"]
      error_paths: ["an invalid canvas → the compiler's errors, named"]

    - id: IF-VERSIONIUM-RECORD
      name: versionium-record
      path: lib/versionium-record.js
      description: "The one recorder of changes and versions (§17.12)."
      exports: ["record({ kind, system, message, change, causedBy, by, version })", "objectChange(before, after)"]
      behavioral_contracts: ["a record waits in the buffer when Versionium is down; never dropped"]
      error_paths: ["Versionium unreachable → buffered, said"]

  modules:

    - id: MOD-HARNESS-READER
      name: harness-reader
      uuid: nexus-wiring-harness-reader-v1-0000-2026-1107-001
      path: idearium/spec-engine/templates/harness/harness.eg
      phase: DB21_one_registry_schema_every_level
      description: "Reads a system's harness: section from its .spec into a Harness, at any level, checks it against HarnessEntry and Harness, and hashes it with cie-contract. Copied into each system from the template (genesis's way); each copy is the system's own."
      deps: [{ name: cie-contract }]
      schema_refs: [Harness, HarnessEntry]
      exports: ["read_harness(spec_text) → Harness", "check_harness(h) → [refusal]", "harness_hash(h) → string", "entry_for(h, id) → HarnessEntry|null"]
      gate_pipeline: ["GATE-WH-001: every entry valid against HarnessEntry, or the harness is refused whole", "GATE-WH-002: every wire joins matching contracts"]
      behavioral_contracts: ["the same spec text gives the same Harness and the same hash", "a system's existing routes read in unchanged as entries (§8.6)"]
      error_paths: ["no harness: section → refused, named", "an invalid entry → the entry id and the rule"]
      acceptance: ["the harness of Emerge's spec reads, checks and hashes; a planted bad entry is refused by name"]

    - id: MOD-EMERGE-DOOR
      name: emerge-door
      uuid: nexus-wiring-harness-emerge-door-v1-0000-2026-1107-001
      path: emerge/emerge/door.eg
      phase: CIE10_the_door_in_emerge
      description: "The first door on CIE-EG: Emerge's server serves only what its harness declares. Each entry is declared to cie-world, each wire connected as a road; a request or command not in the harness is refused at the gate before any component sees it, and the refusal is on the ledger."
      deps: [{ name: harness-reader }, { name: cie-world }, { name: cie-ledger }]
      schema_refs: [Harness, HarnessEntry]
      exports: ["serve(harness, port) — the door on :4900 for the routes and the CLI", "admit(request) → { entry, refusal }"]
      gate_pipeline: ["GATE-WH-010: the handshake: the caller's harness hash accepted", "GATE-WH-011: the entry exists and the caller holds its permission", "GATE-WH-012: the input meets the entry's contract.in"]
      behavioral_contracts: ["INV-WH-1: undeclared → refused and recorded", "INV-WH-2: components are reached only by entry id", "the door's ledger verifies (cie-ledger verify)"]
      error_paths: ["undeclared → 404 with the refusal's ledger entry", "no permission → 403, named", "contract.in not met → 422 with the field"]
      acceptance: ["lang-door and test-emerge-in-nexus green against the .eg door; an undeclared probe refused and recorded"]

    - id: MOD-HARNESS-CONFORMANCE
      name: harness-conformance
      uuid: nexus-wiring-harness-conformance-v1-0000-2026-1107-001
      path: idearium/spec-engine/templates/harness/conformance.eg
      phase: WH1_the_conformance_test
      description: "The one test every system runs against its own door: register (each entry answers), contract (each answer meets contract.out), gate (undeclared probes refused), ledger (every call and refusal recorded and verified). Written once in the template; run by each system, by itself."
      deps: [{ name: harness-reader }, { name: cie-ledger }]
      schema_refs: [ConformanceReport, Harness]
      exports: ["conform(harness, door_url) → ConformanceReport"]
      gate_pipeline: ["GATE-WH-020: all four parts true and every probe refused and recorded, or the system's door does not conform"]
      behavioral_contracts: ["the same test, unchanged, for every system (T8's prediction)", "probes are generated from the harness: ids not in it"]
      error_paths: ["the door does not answer → every part false, with why"]
      acceptance: ["Emerge's door conforms; a door with a hand-written route outside its harness fails the gate part"]

    - id: MOD-COS-BRIDGE
      name: cos-bridge
      uuid: nexus-wiring-harness-cos-bridge-v1-0000-2026-1107-001
      path: cos/spine/bridge.eg
      phase: CS3_the_registry_is_the_bridge
      description: "COS between systems: a call passes only when the caller's harness declares it out and the callee's harness declares it in, with matching contracts and the callee's handshake hash; COS reads each harness through that system's own door, never its files."
      deps: [{ name: harness-reader }]
      schema_refs: [Harness]
      exports: ["link(from, to) → { ok, hash }", "call(from, to, entry_id, input) → output|refusal"]
      gate_pipeline: ["GATE-WH-030: both harnesses declare it", "GATE-WH-031: the callee's hash matches the one the caller was built against"]
      behavioral_contracts: ["a server.js system and a machine compartment are bridged the same way", "each refusal names the harness and its hash"]
      error_paths: ["undeclared → refused before sending", "hash mismatch → refused, both hashes named"]
      acceptance: ["a declared call passes; an undeclared one is refused before sending, naming the harness and its hash"]

    - id: MOD-ARCHITECT-HARNESS
      name: architect-harness
      uuid: nexus-wiring-harness-architect-v1-0000-2026-1107-001
      path: architect/harness-canvas.eg
      phase: IN5_architect_mirrors_the_registry
      description: "Architect opens any system's harness as a canvas (entries as ports, wires as edges) and saves the canvas back to the harness: the direction architect-compile lacks. A save is a change to the system's spec, made through that system's door, gated, and recorded in Versionium."
      deps: [{ name: harness-reader }, { name: architect-compile }, { name: versionium-record }]
      schema_refs: [Harness]
      exports: ["to_canvas(harness) → canvas", "from_canvas(canvas, harness) → harness", "save(system, harness) → { ok, version }"]
      gate_pipeline: ["GATE-WH-040: the new harness passes harness-reader's checks", "GATE-WH-041: an agent's edit is a proposal, a person's or a rule's is applied"]
      behavioral_contracts: ["INV-WH-3: a rewiring saved from the canvas changes only the harness", "INV-WH-5: every save recorded before and after", "to_canvas then from_canvas gives back the same harness hash"]
      error_paths: ["a wire between mismatched contracts → refused on the canvas, beside the wire", "the system's door refuses the save → nothing changed, said"]
      acceptance: ["one rewiring in Architect changes the running Emerge with 0 lines of component code changed (T8's prediction)"]

    - id: MOD-RECONSTRUCTION
      name: reconstruction
      uuid: nexus-wiring-harness-reconstruction-v1-0000-2026-1107-001
      path: idearium/spec-engine/reconstruction.eg
      phase: WH2_verified_reconstruction_coverage
      description: "Measures verified reconstruction coverage: each module regenerated from its spec alone (its harness entries, its contract, its spec module), built, and judged by its contract tests; reported apart from specification coverage."
      deps: [{ name: harness-reader }, { name: harness-conformance }, { name: versionium-record }]
      schema_refs: [ReconstructionResult]
      exports: ["regenerate(module_id) → ReconstructionResult", "coverage(system) → { specification: number, verified: number }"]
      gate_pipeline: ["GATE-WH-050: a module counts only when every contract test passes", "GATE-WH-051: the prediction is registered before the run (T7's rule)"]
      behavioral_contracts: ["INV-WH-6", "each regenerated module recorded in Versionium with its spec hash and its builder"]
      error_paths: ["generation fails → verified false with the step", "no contract tests for a module → not counted, said"]
      acceptance: ["Emerge's verified reconstruction coverage reported beside its specification coverage, with the run registered first"]
