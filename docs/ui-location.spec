spec:
  meta:
    name:     ui-location
    version:  1.0.0
    uuid:     nexus-ui-location-v1-0000-2026-0627-jamesbrooks-001
    status:   active
    purpose: >
      Defines where each system's UI lives, who serves it, and
      why there is currently one source of truth and one mirror.
      This spec resolves the dual-location problem and defines
      ERAVOS as a sovereign system.

  principle: >
    Each system owns its own UI. The UI lives WITH the system.
    The orchestrator serves UIs from each system's own folder directly.
    No sync step. No mirrors. Edit once, it's live.
    The UI is the most disposable layer (L5). It reads the contract.
    It renders. It does not own state.

  current_problem:
    two_locations:
      system/ui/index.html:   canonical (edit here)
      ui/system/index.html:   mirror (served from here)
      sync:                   manual — npm run sync-ui
      result:                 edit in wrong place = nothing updates

    orphans:
      guardian/ui/index.html: 3677-line old Forge IDE — not served, not current
      ui/guardian/index.html: 254-line stub — served but thin

    eravos_location:
      current:  ui/eravos/    — inside the UI folder
      problem:  not a sovereign system, no port, no registration
      fix:      move to eravos/ as a peer system with its own port

  target_structure:
    # Each system serves its own UI directly
    # Orchestrator proxies /ui/<system>/* → <system>:<port>/ui/*
    # No file copying. No sync step. No mirrors.

    guardian/
      ui/
        index.html          # Guardian console — served at :7820/ui/
        agents/             # Agent consoles — each provider
          claude/index.html
          chatgpt/index.html
          mistral/index.html
          gemini/index.html
          perplexity/index.html
      server.js             # serves guardian/ui/ as static files

    cortex/
      ui/
        index.html          # Cortex console — gaps, memory, CFR, self-heal
      boot.js               # serves cortex/ui/ as static files

    idearium/
      ui/
        index.html          # Idearium console — ideas, specs, lattice
      index.js              # serves idearium/ui/ as static files

    architect/
      ui/
        index.html          # Architect console — hook registry, blueprint, canvas
      service.js            # serves architect/ui/ as static files

    emerge/
      ui/
        index.html          # Emerge IDE — spec editor, compiler, hot-load
      server.js             # serves emerge/ui/ as static files

    bridge/
      ui/
        index.html          # Bridge console — relay nodes, trust, circuit states
      server.js

    eravos/                 # SOVEREIGN SYSTEM — not ui/eravos/
      port:     3751
      ui/
        index.html          # Canvas — organisms, wires, transport
        kernel/
        runtime/
        organisms/
        catalog/
        pack/
        bridge/
        specs/
      server.js             # HTTP server :3751, SSE, organism-queue, health
      boot.js               # registers with orchestrator
      registry-components.js

    nexus-home/             # OR stays at ui/home/ — the TV shell
      index.html            # thin shell, reads /api/components
      shell.js
      shell.css

  orchestrator_routing:
    # Instead of serving from root ui/<system>/
    # Proxy each system's UI from its own server
    routes:
      /ui/guardian/*:    proxy → guardian:7820/ui/*
      /ui/cortex/*:      proxy → cortex:3748/ui/*
      /ui/idearium/*:    proxy → idearium:4800/ui/*
      /ui/architect/*:   proxy → architect:3747/ui/*
      /ui/emerge/*:      proxy → emerge:4242/ui/*
      /ui/bridge/*:      proxy → bridge:9999/ui/*
      /ui/eravos/*:      proxy → eravos:3751/ui/*
      /ui/home/*:        serve from nexus-home/ locally (home is an orchestrator concern)
      /ui/forge-shell/*: serve from nexus-home/forge-shell/ locally

    benefit: >
      Edit guardian/ui/index.html → it's live immediately at /ui/guardian/.
      No sync. No copy. Each system owns and serves its own UI.
      Orchestrator is a gateway, not a file server for other systems.

  eravos_as_sovereign_system:
    why: >
      ERAVOS has its own kernel, runtime, organism registry, audio engine,
      wire system, catalog, pack loader, and nexus bridge.
      It's a complete system that happens to render in a canvas.
      It needs a port so other systems can send it organisms.
      It needs to register so RAID can route 'compose' or 'visualize' intents to it.
      It needs a health endpoint so the orchestrator knows it's alive.
      It needs registry-components.js so its capabilities appear in the CLI.

    port:  3751

    components:
      - eravos.canvas          # the main canvas surface
      - eravos.organism.spawn  # spawn an organism by id
      - eravos.organism.list   # list all mounted organisms
      - eravos.wire.connect    # connect two organism hooks
      - eravos.catalog.list    # list available organisms
      - eravos.pack.install    # install a .zip organism pack
      - eravos.transport.play  # start playback
      - eravos.transport.stop  # stop playback
      - eravos.transport.bpm   # set BPM

    events:
      emits:
        - eravos.booted
        - eravos.organism.spawned
        - eravos.organism.removed
        - eravos.wire.connected
        - eravos.wire.disconnected
        - eravos.pack.installed
        - eravos.transport.started
        - eravos.transport.stopped
      handles:
        - guardian.organism-queue.push   # NEXUS built something → install it
        - raid.dispatch.eravos           # RAID routes a compose intent here
        - orchestrator.shutdown

    routes:
      GET  /health                       → status, organisms mounted, wire count
      GET  /ui/*                         → serves eravos/ui/ static files
      GET  /api/organisms                → list mounted organisms
      POST /api/organisms                → spawn organism by id
      DELETE /api/organisms/:id          → remove organism
      POST /api/wires                    → connect hookId → hookId
      GET  /api/catalog                  → available organisms from registry
      POST /api/pack/install             → install .zip pack
      GET  /api/transport                → playback state
      POST /api/transport/play
      POST /api/transport/stop
      POST /api/transport/bpm
      GET  /events                       → SSE — all eravos events

  migration_steps:
    step_1_eravos:
      action: move ui/eravos/ → eravos/ui/
      create: eravos/server.js  (HTTP :3751, serves eravos/ui/, SSE, organism-queue)
      create: eravos/boot.js    (registers with orchestrator, declares components)
      create: eravos/registry-components.js
      update: orchestrator.js   (add eravos to SYSTEMS, proxy /ui/eravos/*)
      update: nexus-connect.js  (add eravos health check)
      update: ui/home/index.html (eravos channel → iframe to :3751/ui/)

    step_2_ui_colocate:
      # Move each system's UI to live with the system
      # Update each system's server to serve its own ui/ folder
      # Update orchestrator to proxy instead of serve

      guardian:
        canonical: guardian/ui/index.html  (already exists, 3677 lines — needs update)
        served_at: :7820/ui/
        delete:    ui/guardian/index.html  (stub)

      cortex:
        canonical: cortex/ui/index.html    (396 lines — current)
        served_at: :3748/ui/
        delete:    ui/cortex/index.html    (mirror)

      idearium:
        canonical: idearium/ui/index.html  (2327 lines — current)
        served_at: :4800/ui/
        delete:    ui/idearium/index.html  (identical mirror)

      architect:
        canonical: architect/src/ui/       (exists, needs index.html)
        served_at: :3747/ui/

      emerge:
        canonical: emerge/ui/index.html    (move from ui/emerge-ide.html)
        served_at: :4242/ui/

    step_3_home:
      # ui/home/index.html stays at ui/home/ — home is orchestrator-level
      # forge-shell stays at ui/forge-shell/ — same reason
      # Both served directly by orchestrator, not proxied
      # These are meta-UIs about the whole system, not one system's UI

  what_gets_deleted:
    - ui/guardian/index.html     (stub — guardian/ui/ is canonical)
    - ui/cortex/index.html       (mirror — cortex/ui/ is canonical)
    - ui/idearium/index.html     (mirror — idearium/ui/ is canonical)
    - ui/eravos/                 (moves to eravos/ui/)
    - guardian/ui/index.html     (old Forge IDE — superseded, not served)

  what_stays:
    - ui/home/                   (orchestrator-level TV shell)
    - ui/forge-shell/            (orchestrator-level build surface)
    - ui/agents/                 (agent consoles — move to guardian/ui/agents/ later)
    - ui/blueprint-builder/      (move to architect/ui/ later)

