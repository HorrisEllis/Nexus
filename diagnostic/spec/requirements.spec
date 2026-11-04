spec:

  # ════════════════════════════════════════════════════════════════════════
  # diagnostic/spec/requirements.spec — every system declares what it needs; Diagnostic checks it and gets it fixed by the owner.
  # Format: emerge's module spec, compiled by lib/emerge/compiler/kg-builder.js at specDepth 1.0, no BLACK node
  # (tests/modules/test-substrate-spec.test.js). Phases: docs/2026-10-30-diagnostic-requirements-phasemap.spec.
  # ════════════════════════════════════════════════════════════════════════

  meta:
    name:        diagnostic-requirements
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-30T00:00:00Z
    status:      specced
    uuid:        nexus-diagnostic-requirements-spec-v1-0000-2026-1030-jamesbrooks-001
    origin: >-
      James, 2026-10-30, reading his own boot log ("[vector-memory] ... Ollama is up but nomic-embed-text is not pulled — run: ollama pull
      nomic-embed-text") and the coder's advice to run that command himself: "diagnostic system should be taking care of things like this."
      The direction is his; the census, the split between detecting and fixing, and the module cut are the coder's.
    purpose: >-
      A missing model, package, binary, port or setting is found by Diagnostic, not by a person reading a log. Each system declares what it
      requires in its own compartment.json, with who can provide it and how. Diagnostic checks every declaration at boot and on a cadence,
      raises a typed gap with the fix attached, and gets the fix done by the system that owns it, through RAID, under a policy he sets
      (off, ask, auto). The fix is checked again before the gap closes.
    target_runtime: [node]
    language_stack: [javascript]
    paradigm: [declared-not-guessed, detect-then-owner-fixes, policy-gated, verified-close]
    axioms: ["§1.2 nothing silently fails", "§5.15 one owner; the owner fixes", "§5.2 routing through RAID", "§12.6 every system has a diagnostic engine",
      "§4.3 security and privacy", "§0.3 nothing lost", "§17.12 recorded in Versionium", "USER_AUTONOMY"]
    deps: []

    census: >-
      Read 2026-10-30. Found the need in three places, owned by none: lib/vector-memory.js logs "is not pulled — run: ollama pull" and has
      status() and recheck(); lib/automation/templates.js has an 'ollama-models' template that every 30 minutes notifies "Run: ollama pull
      {{model}}" (a notification, not a fix, and only if he enables it); ollama/routes/models.js refuses to select a model that is not pulled
      (409) and has no route that pulls one. Diagnostic's active remediation loop (diagnostic/nexus-diagnostic.js remediationScan, every 30 s)
      knows one kind of problem, a system offline: it writes the gap, appends data/diagnostic/remediation.jsonl, posts
      diagnostic.remediation to Cortex and asks for healing; it does not restart processes (the supervisor's job). compartment.json
      (schema nexus.compartment/1, written by lib/system-shape.js) declares dependsOn and sharedLibRequires, nothing a system needs from the
      machine. Also seen in the same log, the same class: vectra not installed (vector-memory's fallback), a 7B model that cannot fit the
      free memory (copilot's adversarial probe deferred 24 times).

    constraints:
      - id: DR-001
        description: "Declared, not guessed: a requirement exists only when its system declares it in its own compartment.json; Diagnostic keeps no list of its own."
        type: hard
        enforced_by: [GATE-DR-DECLARED]
      - id: DR-002
        description: "Diagnostic detects and asks; the owner fixes. A model is pulled by the Ollama bridge's route, never by Diagnostic shelling out."
        type: hard
        enforced_by: [GATE-DR-OWNER]
      - id: DR-003
        description: "A fix runs only under its policy: off (report), ask (a proposal he takes), auto (runs, said). The default for anything that downloads or installs is ask."
        type: hard
        enforced_by: [GATE-DR-POLICY]
      - id: DR-004
        description: "A gap closes only when the requirement is checked again and holds; a fix that ran but did not take stays open, with what was seen."
        type: hard
        enforced_by: [GATE-DR-VERIFIED]

  schemas:

    - id: Requirement
      name: Requirement
      description: "One thing a system needs, declared in its compartment.json under requires[]."
      fields:
        id:        "string — <system>.<kind>.<name>, e.g. cortex.model.nomic-embed-text"
        kind:      "'model'|'package'|'binary'|'port'|'env'|'service'|'memory'"
        name:      "string — what it is (a model tag, a package, a binary, a port number, an env var, a system id, a size)"
        version:   "string|null — a semver range or tag"
        why:       "string — what fails or falls back without it, in words"
        optional:  "bool — a fallback exists (said as degraded, not down)"
        owner:     "string — the system that provides or fixes it (ollama-bridge for models, cos for binaries, core for packages)"
        fix:       "{ route: string|null, command: string|null, downloads: bool, bytes: number|null } — the owner's route or command row; downloads marks a network fetch"
        check:     "{ route: string|null, every: string } — how it is checked, through the owner's route, and how often"
      behavioral_contracts: ["each system writes its own requires[] (lib/system-shape.js role compartment)", "a requirement without an owner is itself a gap"]
      error_paths: ["an unknown kind → refused by the schema, naming it"]

    - id: RequirementCheck
      name: RequirementCheck
      description: "The result of checking one requirement."
      fields:
        requirement: "string — Requirement id"
        held:        "bool"
        seen:        "string — what the check found, e.g. 'installed: qwen2.5-coder:7b' or 'free 4.1 GB, needs 5.2 GB'"
        at:          "number"
        gap:         "string|null — the gap uuid when it does not hold"
        pressure:    "number — 0..1; optional requirements lower, critical systems higher"
        degraded:    "string|null — the fallback in use, e.g. 'TF-IDF instead of embeddings'"
        by:          "string — boot | cadence | recheck | after-fix"
      behavioral_contracts: ["one open gap per requirement (deduped by id, the remediation loop's own rule)"]
      error_paths: ["the owner's check route does not answer → held unknown, said, the gap typed evidential"]

    - id: RemedyPolicy
      name: RemedyPolicy
      description: "What Diagnostic may do about an unmet requirement, per kind, settable by him."
      fields:
        model:    "'off'|'ask'|'auto' — default ask (downloads)"
        package:  "'off'|'ask'|'auto' — default ask (installs)"
        binary:   "'off'|'ask'|'auto' — default off (outside Nexus; a person installs it)"
        port:     "'off'|'ask'|'auto' — default ask (finds the holder; never kills an unknown process)"
        env:      "'off'|'ask' — default off (secrets are his)"
        service:  "'off'|'ask'|'auto' — default auto (asks the supervisor to start a declared system)"
        memory:   "'off'|'ask' — default ask (proposes a smaller model or a later run, never kills)"
        updatedBy: "string"
      behavioral_contracts: ["a change is recorded in Versionium (§17.12)", "the same off/ask/auto shape as COS's update policy (§5.6)"]
      error_paths: ["a value outside its kind's choices → refused by the schema"]

  interfaces:

    - id: IF-COMPARTMENT-JSON
      name: compartment-json
      path: versionium/compartment.json
      description: "Each system's own declaration, nexus.compartment/1, written by lib/system-shape.js; requires[] is added to it."
      exports: ["{ id, name, cos, runtime, data, spec, dependsOn, sharedLibRequires, requires? }"]
      behavioral_contracts: ["the system owns its file"]
      error_paths: ["no compartment.json → the system is listed as undeclared"]

    - id: IF-REMEDIATION-LOOP
      name: remediation-loop
      path: diagnostic/nexus-diagnostic.js
      description: "Diagnostic's active remediation loop (remediationScan, every 30 s): gaps, remediation.jsonl, diagnostic.remediation to Cortex, HEAL_REQUESTED."
      exports: ["remediationScan()", "_logRemediation(entry)", "the /gaps/:uuid/fix route"]
      behavioral_contracts: ["dedupes by gap key", "does not restart processes"]
      error_paths: ["Cortex down → the line is still on disk in remediation.jsonl"]

    - id: IF-OLLAMA-MODELS
      name: ollama-models
      path: ollama/routes/models.js
      description: "The Ollama bridge's model routes: the installed list, and PUT /api/model refusing a model that is not pulled (409)."
      exports: ["GET the installed models", "PUT /api/model"]
      behavioral_contracts: ["the bridge owns everything Ollama"]
      error_paths: ["Ollama not answering → 503 naming it"]

    - id: IF-VECTOR-MEMORY
      name: vector-memory
      path: lib/vector-memory.js
      description: "The semantic memory that needs the embedding model; status() and recheck() say whether it holds."
      exports: ["status() → { ollamaOk, ollamaWhy }", "recheck() → { ollamaOk, why }"]
      behavioral_contracts: ["falls back to TF-IDF and says so"]
      error_paths: ["Ollama down → ollamaOk false with why"]

    - id: IF-RAID-PORT
      name: raid-port
      path: lib/raid-port.js
      description: "RAID through its port: a fix is a routed request, decided and recorded by RAID (§5.2, §9.1)."
      exports: ["decide(request)", "outcome"]
      behavioral_contracts: ["RAID writes the decision before dispatch (§9.2)"]
      error_paths: ["RAID down → the fix waits as a proposal, said"]

  modules:

    - id: MOD-DR-DECLARE
      name: requirements-declared
      uuid: nexus-diagnostic-requirements-declare-v1-0000-2026-1030-001
      path: lib/system-shape.js
      phase: DR1_systems_declare_what_they_need
      description: >-
        compartment.json gains requires[] (Requirement), written by each system's shape; the first declarations are the ones the log showed:
        cortex needs the model nomic-embed-text (owner ollama-bridge; optional, fallback TF-IDF), copilot's adversarial probe needs a model
        that fits free memory (kind memory), cortex's vector memory prefers the package vectra (optional).
      deps: [{ name: compartment-json }]
      schema_refs: [Requirement]
      exports: ["shapeFor(system) → compartment.json with requires[]"]
      gate_pipeline: ["GATE-DR1-001: each requirement valid against Requirement", "GATE-DR1-002: each names an owner"]
      behavioral_contracts: ["a system's file is written only by its own shape"]
      error_paths: ["an invalid requirement → the shape refuses to write and names it"]
      acceptance: ["cortex/compartment.json declares cortex.model.nomic-embed-text with owner ollama-bridge and fix.downloads true"]

    - id: MOD-DR-CHECK
      name: requirements-checker
      uuid: nexus-diagnostic-requirements-check-v1-0000-2026-1030-001
      path: diagnostic/lib/requirements.js
      phase: DR2_diagnostic_checks_them
      description: >-
        Reads every system's requires[] (through each compartment.json, as the census does), checks each through its owner's route at boot
        and on its cadence, and for each that does not hold raises one typed gap in the remediation loop with the fix attached, the fallback
        in use, and the pressure (lower when optional).
      deps: [{ name: requirements-declared }, { name: remediation-loop }]
      schema_refs: [Requirement, RequirementCheck]
      exports: ["checkAll({ by }) → RequirementCheck[]", "check(id) → RequirementCheck", "routes GET /requirements, POST /requirements/:id/check; row `diagnose requirements`"]
      gate_pipeline: ["GATE-DR2-001: declared", "GATE-DR2-002: checked through the owner", "GATE-DR2-003: one gap per requirement"]
      behavioral_contracts: ["a held requirement with an open gap closes it, verified (DR-004)"]
      error_paths: ["the owner's route down → held unknown, an evidential gap, said"]
      acceptance: ["with Ollama up and nomic-embed-text absent: one gap 'cortex.model.nomic-embed-text not installed — semantic memory on TF-IDF', fix attached"]

    - id: MOD-DR-OLLAMA-PULL
      name: ollama-pull
      uuid: nexus-diagnostic-requirements-ollama-pull-v1-0000-2026-1030-001
      path: ollama/routes/models.js
      phase: DR3_the_owner_can_fix_it
      description: >-
        The Ollama bridge, owner of everything Ollama, gains POST /api/model/pull { name }: it pulls through Ollama's own /api/pull,
        streams progress on its events, refuses when the disk cannot hold it, writes the result to its ledger, and records the change.
      deps: [{ name: ollama-models }]
      schema_refs: [Requirement]
      exports: ["POST /api/model/pull → { ok, name, bytes, ms } | { ok:false, error }", "row `ollama pull <name>`"]
      gate_pipeline: ["GATE-DR3-001: name a valid tag", "GATE-DR3-002: disk space", "GATE-DR3-003: ledger"]
      behavioral_contracts: ["one pull of a name at a time", "progress is visible while it runs"]
      error_paths: ["the registry unreachable → refused with Ollama's error", "not enough disk → refused with the numbers"]
      acceptance: ["a pull of a small model completes and the installed list shows it; a second pull while one runs is refused"]

    - id: MOD-DR-REMEDY
      name: remedy
      uuid: nexus-diagnostic-requirements-remedy-v1-0000-2026-1030-001
      path: diagnostic/lib/remedy.js
      phase: DR4_fixed_under_policy
      description: >-
        For a gap with a declared fix: off reports it; ask holds it as a proposal (COS's Proposals page, a notification, the row); auto
        sends it to the owner's route through RAID and says so. After any fix the requirement is checked again (DR-004); vector memory's
        recheck() is called so it leaves its fallback without a restart.
      deps: [{ name: requirements-checker }, { name: ollama-pull }, { name: raid-port }, { name: vector-memory }]
      schema_refs: [RemedyPolicy, RequirementCheck]
      exports: ["policy() / setPolicy(patch, { by })", "propose(gap) → proposal", "apply(gap, { by }) → RequirementCheck", "routes GET|PATCH /remedy/policy, POST /gaps/:uuid/fix (exists, extended); row `diagnose fix <gap>`"]
      gate_pipeline: ["GATE-DR4-001: policy", "GATE-DR4-002: RAID decided", "GATE-DR4-003: owner's route", "GATE-DR4-004: rechecked"]
      behavioral_contracts: ["downloads default to ask", "every fix is in remediation.jsonl, Cortex and Versionium"]
      error_paths: ["the fix fails → the gap stays open with the owner's error and the attempt", "RAID down → stays a proposal, said"]
      acceptance: ["policy ask: a proposal appears; taken, the model is pulled, the gap closes, semantic memory leaves TF-IDF; policy off: only the gap"]

    - id: MOD-DR-SURFACE
      name: requirements-surface
      uuid: nexus-diagnostic-requirements-surface-v1-0000-2026-1030-001
      path: idearium/cli/route-commands.js
      phase: DR5_seen_and_fixed_from_the_screens
      description: >-
        The rows (`diagnose requirements`, `diagnose fix`, `ollama pull`) in the one command table, so Copilot and every agent can check and
        propose; the cockpit's Overview (MG29) lists a system's unmet requirements with a Fix button. lib/automation/templates.js
        'ollama-models' is kept and marked superseded by this (§0.3).
      deps: [{ name: remedy }]
      schema_refs: [RequirementCheck]
      exports: ["rows diagnose requirements, diagnose fix, ollama pull"]
      gate_pipeline: ["GATE-DR5-001: rows over the routes", "GATE-DR5-002: fix is personOnly unless the policy is auto"]
      behavioral_contracts: ["agents see every unmet requirement; taking a download is his act under ask"]
      error_paths: ["Diagnostic down → the rows say so with its address"]
      acceptance: ["`diagnose requirements` prints the nomic-embed-text gap; `diagnose fix` under ask creates the proposal"]

  events:
    diagnostic:
      - "diagnostic.requirement.unmet { id, system, kind, degraded }"
      - "diagnostic.requirement.held { id, by }"
      - "diagnostic.remedy.proposed { id, gap } / diagnostic.remedy.applied { id, ok }"
      - "ollama.model.pulled { name, bytes, ms }"

  enforcement:
    gates:
      - { id: GATE-DR-DECLARED, name: declared, severity: fatal, check: "no requirement Diagnostic did not read from a compartment.json", on_failure: "suite red" }
      - { id: GATE-DR-OWNER, name: owner-fixes, severity: fatal, check: "no fix that is not a call to the owner's route or row", on_failure: "suite red" }
      - { id: GATE-DR-POLICY, name: policy, severity: fatal, check: "downloads and installs default to ask", on_failure: "refused" }
      - { id: GATE-DR-VERIFIED, name: verified-close, severity: error, check: "a gap closes only after a held recheck", on_failure: "stays open" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node; every DR phase names it and its blocks"
    - "per module: its acceptance lines, against a stand-in Ollama (as test-vector-memory-embed-check.test.js already does)"
