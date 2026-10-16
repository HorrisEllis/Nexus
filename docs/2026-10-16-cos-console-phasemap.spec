# docs/2026-10-16-cos-console-phasemap.spec — the COS console: a Nexus-specific terminal that replaces PowerShell, with controls for the whole system
# MAPPED, NOTHING BUILT. Parent: docs/2026-10-15-cos-app-phasemap.spec (COSA6 built, COSA9-11 open).
meta:
  name: 2026-10-16-cos-console-phasemap
  version: 1.0.0
  origin: >-
    James, 2026-10-16: "then the controls can hook into the server.js. a fully built, nexus optimized, cli interface, for cos, to replace powershell. full nexus specific with controls for the entire system. enterprise grade,  code, and ui."
    Context: said right after the compartment window (COSA10) and Idearium's nested containers (COSA11) were mapped.
  readings_to_confirm:
    server_js: >-
      "the server.js" is not one file: guardian, loom, ollama, intelligence, emergence, eravos, versionium, copilot and clear-glass/src/sse each have a server.js. Coder's reading: the controls hook into each system's own server through the one door already in front of them (Idearium's nexus.command rows and each kernel's /health), not by editing every server.js. To confirm, in case he means one particular server.
    replace_powershell: >-
      Coder's reading: a console pane inside COS in which he never has to open PowerShell to run, watch, fix or switch Nexus. It is a Nexus-aware terminal, not a general shell. A real shell stays one click away (escape hatch), because "replace" for everything Windows does is not achievable and not wanted.
grounded:
  reuse:
    - "idearium/cli/route-commands.js: 80 command rows, the one table (nexus.command, nexus_* MCP tools). The console is a front-end on it."
    - "cli/nexus-repl.js (1233 lines, readline REPL, grammar-engine driven), cli/nexus.js, cli/nexus-repl-descriptors.js, docs/grammar-engine.spec: the grammar, completion and descriptors the console must use rather than reinvent."
    - "cos/app/cli.js and controller.js (switch, rollback, start, stop, logs, import): the COS verbs."
    - "autopilot kernels and each kernel's /health (lib/nexus-self/systems.js lists them)."
    - "Idearium /api/repos/:uuid/run/:op and /desktop/:op (pause, play, rewind, checkpoint)."
  not_reused_because: "A second command table. Two tables are two contracts (CLAUDE.md rule 4)."
  coder_opinion: >-
    The risk is not the terminal widget (xterm.js in the Electron window is solved). The risk is building a second command language. The leverage is that every command already exists as a row, so the console is mostly completion, safe execution, and presentation of what the rows return. Build the thin part well.
phase:
  CON1_one_door_client:
    status: OPEN
    does: "cos/app/console/client.js: calls Idearium's command table over loopback with a token, falls back to the local COS verbs when Idearium is down (start/stop/switch/rollback/logs still work with nothing running). Every call gets a UUID and an activity record (the REPL already does this)."
    proof: "with Idearium off, `switch`, `rollback`, `logs` and `status` work; with it on, any of the 80 rows run and return the same result as nexus.command."
  CON2_grammar_and_completion:
    status: OPEN
    depends_on: [CON1_one_door_client]
    does: "Verbs and arguments from the live table (route-commands.js SPEC) plus the grammar engine; completion for system names (systems.js), project, version, repo uuid; `help <verb>` from the row's own description. No hand-kept list."
    proof: "a row added to route-commands.js completes with no console change."
  CON3_system_controls:
    status: OPEN
    depends_on: [CON1_one_door_client, COSA11_nested_tree]
    does: "`system <name> status|start|stop|restart|logs|health|pause|checkpoint|rewind` for each of the 16 systems, per kind (process, VM, logical) with the same honesty rule as COSA10: a control a node cannot honour is absent and says why."
    proof: "every system in systems.js answers `status`; a logical node refuses `pause` with the reason."
  CON4_safety_gate:
    status: OPEN
    depends_on: [CON1_one_door_client]
    does: "Person-initiated only. Commands marked personOnly in the table (as chat-crawl start/stop are) run from the console and never from an agent through it. Destructive verbs (remove, rewind, restore data, stop all) show what they will change and need a typed confirmation. Everything is journalled before it runs (REVERSIBILITY)."
    proof: "an agent token cannot run a personOnly row via the console; rewind shows the snapshot it took first."
  CON5_pane:
    status: OPEN
    depends_on: [CON2_grammar_and_completion]
    does: "xterm.js pane in the COS window: scrollback, search, copy, history that survives restart, tab per system, live log tail per system, structured results rendered as tables not text. Failures in red with the cause and the next command to try."
    proof: "UI tested in Clear Glass, never Playwright (docs/CLAUDE.md)."
  CON6_shell_escape:
    status: OPEN
    does: "One tab that is a real shell (PowerShell/cmd) for what is not Nexus. Optional, off by default? to confirm. Runs as the user, no elevation."
  CON7_enterprise_bar:
    status: OPEN
    does: "Defined, then tested, not asserted: audit trail of every command (who, when, argv, result, duration) append-only; secrets never echoed or journalled; timeouts and cancel (Ctrl+C reaches the process tree); no command blocks the UI; works offline; accessible (keyboard only, screen reader labels, high contrast); error messages that name cause and fix; documented exit codes; scripting mode (`cos run script.cos`, `--json`) so CI can use what people use."
    proof: "each item has a test id; the list in this phase is the checklist, nothing outside it is called enterprise-grade."
  CON8_nexus_server_hook:
    status: OPEN
    depends_on: [CON1_one_door_client]
    does: "Each system's server exposes the same minimum control surface (health, status, pause/resume where it can) so the console does not special-case; systems missing it are listed by `system gaps`, not papered over."
failure_modes:
  - "Second command table (drift): forbidden, the console reads the table."
  - "Agents gain a side door through the console: CON4 closes it."
  - "Console depends on what it supervises: CON1 fallback to local COS verbs."
  - "Windows: tree kill, process suspend, ConPTY behaviour unverified until a Windows run."
  - "'Enterprise grade' as a label: CON7 turns it into a checklist."
decisions_needed:
  - "Which server.js (see readings_to_confirm)."
  - "Is a real-shell tab wanted (CON6)?"
  - "Order: I recommend CON1 -> CON3 -> CON4 -> CON2 -> CON5, CLI/backend first, pane last, per his order of delivery."
