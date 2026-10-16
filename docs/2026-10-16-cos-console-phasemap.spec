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

# ADDENDUM 2026-10-16 (a): the door is the autopilot and the floating-menu CLI, not Idearium. Supersedes CON1, CON3 and CON8 below; the earlier text stays.
addendum_a:
  james: >-
    "no, not idearium. all of nexus, like the floating menu button cli. like the autopilot"
  context: "Said in reply to the coder's reading that the console is a front-end on Idearium's command table (80 rows) and that 'the server.js' meant going through each system's server. He corrects both: the scope is the whole of Nexus, and the model is two things that already exist."
  grounded:
    autopilot: "nexus/autopilot.js on :7799 supervises every kernel: GET /status, /ledger, /graph, /tables, /warp; POST /spawn/:name, /control/:name/restart|stop|start (0.39.372 NC2), /touch/:name, /run-tests/:name. It has its own ledger, so it works when everything else is down. `--cli` starts lib/nexus-cli-interface.js (132 lines: help, what can you do, rundown, what's wrong, who am i, switch to <agent>), which composes copilot/lib/capabilities, nexus-awareness, self-model, grammar-router."
    floating_menu: "ui/tv-shell/menu.js (window.NexusMenu): the floating button's CLI. Typing goes through co-pilot (:3750/api/prompt); /backend and /agent are real commands, so typing does exactly what clicking does, one event-driven path (his 2026-09-08 words in that file's header)."
  reading: >-
    To confirm. The COS console is that same CLI, made a proper terminal in the COS window: the floating menu's command-and-natural-language style, with the autopilot's authority over every kernel. Idearium becomes one of the 16 systems it controls, not its door. COS and the autopilot are the two layers that stay up when the rest is down, so the console depends on neither Idearium nor Guardian.
  changes:
    CON1_one_door_client: "Becomes two clients behind one interface. (1) autopilot client (:7799): status, spawn, control, ledger, graph, run-tests for ALL kernels; when :7799 is unreachable it falls back to COS's own verbs (start/stop/switch/rollback/logs). (2) co-pilot client (:3750 /api/prompt, the same path the menu uses) for natural language and the /commands. The Idearium command table becomes a third, optional, source for the verbs only Idearium has (repo, phasemap, notes)."
    CON3_system_controls: "`system <name> ...` goes to the autopilot's /control and /status, so it covers every kernel, not only Idearium's compartments. The VM-style pause/checkpoint/rewind (COSA10) stay for the nodes that have them."
    CON8_nexus_server_hook: "Retired as written. The 'minimum control surface per server.js' already exists in one place, the autopilot; no per-server work. What each server adds is only its /health, which the autopilot already polls."
  gaps_found:
    - "The autopilot's /control supports only restart|stop|start. There is no pause/resume, checkpoint, or rewind for a kernel. To confirm whether he wants those added to the autopilot (small, and it is where 'controls for the entire system' would live) or left to COSA10's VM layer."
    - "POST /control and /spawn have no token on loopback: any local process can stop a kernel. The console must not widen that, and CON4's person-only gate needs a token the autopilot checks. Not built; flagged."
    - "The floating menu and the --cli interface are two separate implementations of the same idea (menu.js and nexus-cli-interface.js). The console should be a third front-end on one shared command layer, not a third copy. Whether to extract that layer first is the main design call."
  question: "Do you want the shared command layer extracted first (one place the floating menu, --cli and the COS console all call), or the COS console built on the autopilot and co-pilot now and the others joined later? I recommend extracting first: it is the thing that stops a third copy."
