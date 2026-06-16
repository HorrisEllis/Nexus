spec:
  meta:
    name:        compartment-os
    version:     1.5.0
    uuid:        nexus-cos-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Compartment OS (COS). An earlier sovereign OS prototype.
      Predates NEXUS by several months. 10,289 lines.
      SISO as the architectural spine. 17 enforced axioms. 157+ passing tests.
      Contains conceptual DNA that became NEXUS — compartment isolation,
      process supervision, axiom enforcement, event-driven state.
      Currently coexists with NEXUS. Not integrated but referenced.

  status:
    current: "standalone — not integrated into NEXUS services"
    relationship_to_nexus: >
      COS was the proving ground. NEXUS inherited:
      the axiom enforcement model (17 axioms → NEXUS axiom set)
      the SISO architecture ("DOM as State, Events as Transformation")
      the bottom-up build philosophy
      the idea that the OS should be sovereign — no external dependencies
    future: "may be merged as a compartment/sandboxing layer in NEXUS v0.7+"

  core_concepts:
    compartments:
      description: "Isolated execution units with typed interfaces"
      archetypes: [web-server, exe-runner, containment, ai-agent, sandbox-browser]

    pipe_system:
      description: "Typed data channels between compartments"

    blueprints:
      description: "Declarative compartment definitions"

    versionium:
      description: "Version tracking system — git-like for compartments"

    nex_snapshots:
      description: ".nex environment snapshots — portable compartment state"

    watchdog:
      description: "Process supervision — restart on failure"

  modules:
    - "compartment kernel — isolation and lifecycle"
    - "host shell — manages compartment fleet"
    - "pipe system — typed inter-compartment channels"
    - "blueprint loader — declarative compartment init"
    - "versionium — version tracking"
    - "Windows service integration"
    - "git/SSH integration"

  tests:
    count: 157
    status: "157/157 passing (standalone)"
