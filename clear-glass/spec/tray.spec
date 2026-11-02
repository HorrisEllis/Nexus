spec:

  # clear-glass/spec/tray.spec — Clear Glass in the tray (CA1 of docs/2026-11-02-cos-the-application-phasemap.spec). Format: emerge's module spec,
  # compiled by lib/emerge/compiler/kg-builder.js at specDepth 1.0, no BLACK node (tests/modules/test-substrate-spec.test.js SS-01, compile only).

  meta:
    name:        clear-glass-tray
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-11-02T00:00:00Z
    status:      specced
    uuid:        nexus-clear-glass-tray-spec-v1-0000-2026-1102-jamesbrooks-001
    origin: >-
      James, 2026-11-02: "clearglass needs a setting for automatically minimizing to tray after a period of time." The ask is his; the reading
      ("a period of time" = with no keyboard or mouse input; nothing hides while something is playing or running) is the coder's, to confirm.
    purpose: >-
      Clear Glass goes to the tray by itself after a period he sets with no input, and comes back from a visible tray icon. Nothing he is
      watching or that is working is hidden.
    target_runtime: [electron]
    language_stack: [javascript]
    paradigm: [off-by-default, read-the-os, never-hide-work]
    axioms: ["USER_AUTONOMY: off by default, his period", "§0.0: the OS's own idle time, not a guess", "§1.2: a tray icon that can be seen, so a hidden window can come back"]
    deps:
      - { name: electron, version: ">=28", required: true, purpose: "powerMonitor.getSystemIdleTime, Tray" }

    constraints:
      - id: CGT-001
        description: "Clear Glass never hides itself while a window plays sound or an automation (a macro, a workflow) is running."
        type: hard
        enforced_by: [GATE-CGT-NEVER-HIDE-WORK]

  schemas:

    - id: TrayIdleOption
      name: TrayIdleOption
      description: "How long with no input before Clear Glass goes to the tray."
      fields:
        trayAfterIdleMin: "number — 0 (off, the default), 5, 15, 30 or 60 minutes"
      behavioral_contracts: ["any other value is refused, the current one kept"]
      error_paths: ["an invalid value → off"]

  interfaces:

    - id: IF-NEXUS-OPTIONS
      name: nexus-options
      path: clear-glass/src/options/store.js
      description: "Clear Glass's options (window behaviour, start page, downloads), persisted, set from the settings page."
      exports: ["get() → options", "set(patch)"]
      behavioral_contracts: ["unknown keys kept as given; simple keys replaced"]
      error_paths: ["a write that fails → the old value stays"]

  modules:

    - id: MOD-CGT-IDLE-TRAY
      name: idle-tray
      uuid: nexus-clear-glass-idle-tray-v1-0000-2026-1102-001
      path: clear-glass/src/main/idle-tray.js
      phase: CA1_clear_glass_to_the_tray
      description: >-
        decide({ minutes, idleSec, audible, activeRuns, anyVisible }) → { hide, why }: hide only when minutes > 0, something is visible, the OS
        reports at least minutes × 60 s with no input, no window is audible and no automation run is active. start({ every, read, hide }) checks
        every 30 s and hides once per idle stretch (input resets it). The tray gets a real icon (clear-glass/assets/tray.png): an empty one is
        invisible on Windows, and a window hidden to it could not come back.
      deps: [{ name: nexus-options }]
      schema_refs: [TrayIdleOption]
      exports: ["decide(state) → { hide, why }", "start({ everyMs, read, hide }) → { stop }", "MINUTES"]
      gate_pipeline: ["GATE-CA1-001: off unless he set a period", "GATE-CA1-002: never while audible or running", "GATE-CA1-003: once per idle stretch"]
      behavioral_contracts: ["off by default", "the tray icon is a real image"]
      error_paths: ["the idle time cannot be read → nothing hidden"]
      acceptance: ["decide hides only past the period with nothing playing or running; start hides once per idle stretch; the setting on the General page"]

  events:
    tray:
      - "clear-glass.window.hidden-idle { minutes }"

  enforcement:
    gates:
      - { id: GATE-CGT-NEVER-HIDE-WORK, name: never-hide-work, severity: fatal, check: "decide refuses while audible or running", on_failure: "suite red" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — compiles at specDepth 1.0, no BLACK node"
    - "tests/modules/test-cg-idle-tray.test.js — the module's acceptance"
