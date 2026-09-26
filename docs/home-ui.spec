spec:
  meta:
    name:        home-ui
    version:     1.4.0
    uuid:        nexus-home-ui-v1-1000-2026-0617-jamesbrooks-001
    file:        ui/home/index.html   # markup only since 1.4.0 -- JS/CSS in ui/home/areas/ (one JS + one CSS per area), ui/home/core/, ui/home/home.css (shared)
    serves:      http://127.0.0.1:9000/
    purpose: >
      The NEXUS home screen. Sovereign OS overview surface.
      Always opens on the tile grid (Overview channel).
      Mode selector is a non-blocking overlay, opened by user intent only.
      All system tiles pulse on health poll. Forge Shell tile links to build surface.
      Agent tile opens mode selector and reflects active mode.

  phases:
    1:
      name:    Overlay boot fix
      status:  complete
      desc:    mode-overlay starts display:none, opens only with .open class. Never blocks boot.
    2:
      name:    Silent mode restore
      status:  complete
      desc:    selectMode(mode, goToSuite=false) on init — applies mode to body/badge/tiles
               without navigating away from Overview. goToSuite=true only on user selection.
      broken_until: '1.4.0 (v0.39.228)'
      found: >
        Recorded complete, but whenever a mode WAS stored this restore crashed the page:
        selectMode -> _logToData touched _uiLog, declared later in the same inline script,
        in its temporal dead zone. The throw halted the rest of the script -- pollHealth,
        connectSSE and every interval never started. Found by the 1.4.0 equivalence probe,
        not by a user report. Fixed by loading core/logging.js first; guarded by
        test-home-ui-files HF-04 and tests/probe/home-split-equivalence.py.
    3:
      name:    Forge Shell tile
      status:  complete
      desc:    Tile 7 in sys-grid. Heartbeat pulse animation on icon. Opens forge-shell.html
               in new tab. Shows open gap count from cortex. Phase progress metric.
    4:
      name:    Agent mode tile
      status:  complete
      desc:    Tile 8. Opens mode selector overlay. Reflects active mode name/color/badge.
               Updates on every health poll cycle.
    5:
      name:    Heartbeat CSS
      status:  complete
      desc:    forge-pulse keyframe on forge tile icon. Tile border glow on hover.
    6:
      name:    Cortex event logging
      status:  complete
      desc:    ui.mode.selected event on every mode change.
               ui.navigation event when forge shell opened.
               Both fire-and-forget POST to cortex :3748/api/event.
    7:
      name:    Polling hook
      status:  complete
      desc:    updateForgeTile() runs every 10s alongside pollHealth.
               Updates forge gap count and agent tile state from live data.
    8:
      name:    One JS + one CSS file per area
      status:  complete
      version: 1.4.0
      desc: >
        index.html is markup only. 20 areas (ui/home/areas/<area>.js + .css), 6 non-UI
        modules in ui/home/core/ (logging, config, keys, sse, ui-state, boot), and a shared
        home.css (tokens, reset, shared keyframes, components used by several channels).
        Cut as contiguous ranges of the old inline script, in order; proven equivalent
        in headless Chromium (tests/probe/home-split-equivalence.py). Enforced by
        tests/modules/test-home-ui-files.test.js.
      load_order: >
        core/logging.js loads FIRST (see phase 2, found). The other files keep the
        monolith's source order, so a later file may reference an earlier one at load,
        never the reverse.
      not_done: >
        Ownership refinements that are not pure cuts (tuneById lives in agent-suite.js,
        keyboard shortcuts in core/keys.js reference several areas). The iframe cut-over
        DECOMP.md describes (Phase 3) is NOT started: nexus-home.html references 11 channel
        documents and only 4 exist (causal, conversations, idearium, log), so that shell
        cannot serve 7 of its channels.

  version_history:
    1.4.0: 'v0.39.228 -- split into one JS + one CSS file per area; stored-mode boot crash fixed (phase 2 found)'
    1.3.0: 'pre-git (before 2026-09-17) -- what 1.3.0 changed is not recorded anywhere this pass could find'

  channels:
    0: Overview     (tile grid — always the landing)
    1: Guardian     (:7820)
    2: Cortex       (:3748)
    3: Idearium     (:4800)
    4: Bridge       (:9999)
    5: Log          (SSE stream)
    6: Diagnose     (health checks + CFR + gaps)
    7: Blueprint    (descriptor + phase map)
    suite: Agent Suite (injected dynamically when mode is selected)

  tiles:
    tile-orch:   Orchestrator  :9000
    tile-gd:     Guardian      :7820
    tile-cx:     Cortex        :3748
    tile-idr:    Idearium      :4800
    tile-br:     Bridge        :9999
    tile-dg:     Diagnose      system
    tile-forge:  Forge Shell   ui/forge-shell.html  (new v1.1)
    tile-agent:  Agent Mode    overlay              (new v1.1)

  cortex_events:
    ui.mode.selected:
      payload: { mode, provider, ts }
      source:  home-ui
    ui.navigation:
      payload: { target, ts }
      source:  home-ui

  quick_notes:
    status: backend_built
    phase: 35
    description: >
      Sticky-notes box synced across every panel via orchestrator's
      existing /events SSE — the same channel nexus-cli.js already uses
      for live grammar rebuild, deliberately not a new channel (see the
      NCP/Bridge/SSE unification discussion this session: these are
      different failure-mode problems, but local-push-to-trusted-client
      already had exactly one answer and this reuses it).
    built:
      module: "lib/quick-notes.js"
      routes: "GET/POST /api/notes, DELETE /api/notes/:uuid — wired into orchestrator.js"
      tag_to_idea: "POST /api/idearium/ideas (verified real, pre-existing proxy respecting Phase 23.5's orchestrator-as-sole-gateway lockdown) — fires only when a note has tags, failure never undoes the saved note"
      tests: "7/7 PASSING (tests/modules/quick-notes.test.js)"
    not_built: "Frontend — the 300ms debounce, the actual sticky-notes UI panel, and wiring the panel to listen on /events for notes.created/notes.deleted. Backend is real and tested; nothing renders it yet."
    grammar: "'note <text>' → KNOWLEDGE_CAPTURE intent — not yet registered into component-registry. Same template as cli/nexus-repl-descriptors.js (Phase 36) once wanted."
    unlocks: "Phase 37 (Userscript Rebuild) — needs this landed alongside Phase 36 first"

  axioms:
    - §1.2 nothing silent — all UI events logged to cortex
    - §3.1 bottom-up — overview loads first, mode is a layer above
    - mode selector never blocks the OS view
    - forge shell opens in new tab — does not replace the TV shell
    - all tiles pulse on successful health poll (existing pulseCard behavior)
