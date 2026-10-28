spec:

  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # cos-services.spec — real servers COS can deploy: web server, DNS, firewall, SMTP, TLS, proxy, storage, queue … for test environments
  # and for compartments. Format: emerge's module spec (emerge/SPEC_COMPILER.spec), compiled by emerge/compiler/kg-builder.js at
  # specDepth 1.0, invariants valid, no BLACK node (tests/modules/test-substrate-spec.test.js). If the code is lost, it is rebuilt from here.
  # Phases: docs/2026-10-24-cos-services-phasemap.spec (SV0–SV4; `blocks:` name these modules).
  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        cos-services
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-24T00:00:00Z
    status:      specced
    uuid:        nexus-cos-services-spec-v1-0000-2026-1024-jamesbrooks-001
    origin: >-
      James, 2026-10-24, uploading anonymousservers-nexus-4-12.zip: "look at this for cos" · then, correcting the coder's reading that only
      its kernel patterns were for COS: "im saying for web servers, dns, firewall, email smtp, like integrating into deployable. i want to
      use those engines for test env, web servers, etc all of them" · "this is all the networking backend for anything needed netwroking wise".
      The direction is his; the engines are his upload (anonymousservers.info
      NEXUS 0.1.0: a kernel supervising 27 engines over newline-JSON IPC). The coder read the kernel and wrote these contracts.
    purpose: >-
      Every engine of that platform becomes a service COS can deploy: a stack is one kernel rooted in a compartment's own folder (its conf,
      state, logs), with the engines chosen for it, on ports of its own, its secrets generated fresh for it. Many stacks run side by side
      (one per compartment or test environment) without touching each other or the machine they run on. His scope: Nexus's networking
      backend for anything that needs networking. Where Nexus already has networking of its own (Clear Glass's net posture and transports,
      clear-glass/src/net; the TLS layer, docs/2026-10-16-tls-layer-phasemap.spec; clear-glass/tls-helper), each one moving onto these
      services is its own later phase, mapped against what it replaces; nothing is replaced silently.
    target_runtime: [node]
    language_stack: [javascript]
    paradigm: [vendored-as-is, isolated-per-root, reversible, explainable]
    axioms: ["§0.1 evidence over memory", "§1.2 nothing fails silently", "§0.3 nothing lost", "§3.3 map before build", "§8.6 reuse before build",
      "REVERSIBILITY: a stack is a folder; removing it removes everything it made", "USER_AUTONOMY: what touches his machine or network is his to allow"]
    deps:
      - { name: node, version: ">=18.0.0", required: true, purpose: "the engines use node built-ins only (catalog's app templates aside)" }

    constraints:
      - id: SV-001
        description: "A stack lives entirely under its root: conf, state, logs, its control socket or pipe. Two stacks never share a port, a socket or a file."
        type: hard
        enforced_by: [GATE-SV-ISOLATED]
      - id: SV-002
        description: "Nothing a stack does reaches past its own processes: no machine-wide process kill, no host firewall rule, no router port mapping, unless he allows it for that stack (the engines that do — firewall's sysfw and upnp, tunnel, peer, relay, autodns, registrar, ssh — are off by default)."
        type: hard
        enforced_by: [GATE-SV-CONTAINED]
      - id: SV-003
        description: "No secret is carried in from the upload or committed: every stack's conf (jwt secret, encryption key, DKIM key, peer identity) is written fresh by the engines' own init."
        type: hard
        enforced_by: [GATE-SV-NO-SECRETS]
      - id: SV-004
        description: "No IPC message is run as code: the kernel's db:query/update/delete/upsert built a function from a string in the message; they take a declared filter instead."
        type: hard
        enforced_by: [GATE-SV-NO-EVAL]
      - id: SV-005
        description: "The engines stay as he brought them; every change to his code is named in the module that makes it, with why."
        type: hard
        enforced_by: [GATE-SV-SAID]

  schemas:

    - id: StackSpec
      name: StackSpec
      description: "What a stack is asked to be."
      fields:
        root:      "string — the folder the stack lives in (a compartment's or test environment's)"
        engines:   "string[] — the engines to run (default: the safe set)"
        ports:     "object — engine → port; unset ports are taken from a free high range"
        allow:     "string[] — engines past the safe set he allowed for this stack (firewall, tunnel, ssh …)"
      behavioral_contracts: ["the safe set is every engine that touches nothing outside its root"]
      error_paths: ["an engine not in the platform → refused, naming it"]

    - id: StackStatus
      name: StackStatus
      description: "A stack as it is now."
      fields:
        root:      "string"
        up:        "boolean — its kernel answers on its control socket"
        engines:   "object — name → { alive, pid, ports, restarts, uptime } (the kernel's own status)"
        said:      "string[] — what was refused or could not start, with why"
      behavioral_contracts: ["read from the kernel itself, never assumed"]
      error_paths: ["the kernel does not answer → up false, said"]

  interfaces:

    - id: IF-KERNEL-CLI
      name: kernel-cli
      path: cos/services/anonymous/nexus.js
      description: "The platform's kernel command line, as he brought it: init, up [engines…], stop, restart <name>, status, logs."
      exports: ["node nexus.js init", "node nexus.js up [engine…]", "node nexus.js status", "node nexus.js stop", "node nexus.js restart <name>"]
      behavioral_contracts: ["each engine is its own process, supervised, restarted with backoff (1 s doubling to 30 s)"]
      error_paths: ["an engine file missing → skipped, said in the kernel log"]

    - id: IF-ENGINE-IPC
      name: engine-ipc
      path: cos/services/anonymous/engines/_engine.js
      description: "The engine SDK: newline-JSON over stdin/stdout; ipc.send / on / request; conf; log; claimPort; isInit."
      exports: ["{ ipc, conf, log, claimPort, isInit } = require('./_engine')"]
      behavioral_contracts: ["a throwing handler is logged and the engine keeps serving"]
      error_paths: ["a request to an engine that is not running → route:error naming it"]

    - id: IF-PROCESS-RUNNER
      name: process-runner
      path: cos/compartment/process-runner.js
      description: "COS's process runner for a compartment: spawns, tracks, detects crash loops on the COS bus."
      exports: ["spawn(compartmentId, { name, command, args, cwd, env })", "kill(compartmentId, name)"]
      behavioral_contracts: ["emits COMP.PROCESS_STARTED / EXITED / CRASHED; WATCHDOG.PROCESS_CRASH_LOOP at the limit"]
      error_paths: ["a spawn that fails → COMP.SPAWN_FAILED"]

    - id: IF-TESTENV
      name: testenv
      path: cos/testenv/run-target.js
      description: "The COS test machine (the Debian VM, T1–T7): a repo provisioned and run inside it."
      exports: ["runTarget({ repo, … })"]
      behavioral_contracts: ["the machine's network is cut unless asked"]
      error_paths: ["no QEMU here → said"]

  modules:

    - id: MOD-SV-KERNEL
      name: services-kernel
      uuid: nexus-cos-services-kernel-v1-0000-2026-1024-001
      path: cos/services/anonymous/nexus.js
      phase: SV0_the_engines_in_cos
      description: >-
        His platform's kernel, brought into COS, changed only where a stack must not reach past itself: its root comes from NEXUS_ROOT (the
        variable its engines already read) instead of its own folder; its orphan sweep kills only processes running from its own root (it ran
        `pkill -f engines/` and `pkill -f nexus.js` machine-wide); its Windows control pipe is named by its root (it was one fixed name); and the
        db:* messages take a declared filter ({ field: value }) where they built a function from a string in the message.
      deps: [{ name: engine-ipc }]
      schema_refs: [StackStatus]
      exports: ["the kernel CLI (IF-KERNEL-CLI)", "ROOT from NEXUS_ROOT", "the control socket / pipe under the root"]
      gate_pipeline: ["GATE-SV0-001: root from the environment", "GATE-SV0-002: the sweep scoped to the root", "GATE-SV0-003: db filters declared, never evaluated"]
      behavioral_contracts: ["two kernels with different roots run side by side", "a db:* message carrying a string gate is refused, said"]
      error_paths: ["no NEXUS_ROOT → its own folder, as before (his platform still runs alone)"]
      acceptance: ["two kernels in two temp roots both answer status; stopping one leaves the other running", "a db:query with a string gate is refused"]

    - id: MOD-SV-SDK
      name: services-engine-sdk
      uuid: nexus-cos-services-sdk-v1-0000-2026-1024-001
      path: cos/services/anonymous/engines/_engine.js
      phase: SV0_the_engines_in_cos
      description: "The engine SDK, as he brought it (IF-ENGINE-IPC)."
      deps: [{ name: engine-ipc }]
      exports: ["{ ipc, conf, log, claimPort, isInit }"]
      gate_pipeline: ["GATE-SV0-004: unchanged from the upload (its bytes compared)"]
      behavioral_contracts: ["reads NEXUS_ROOT and NEXUS_ENGINE from the kernel"]
      error_paths: ["stdout gone → the error is dropped (its own comment)"]
      acceptance: ["byte-identical to the upload's engines/_engine.js"]

    - id: MOD-SV-ENGINES
      name: services-engines
      uuid: nexus-cos-services-engines-v1-0000-2026-1024-001
      path: cos/services/anonymous/engines
      phase: SV0_the_engines_in_cos
      description: >-
        The 27 engines (auth, autodns, billing, builder, cache, catalog, ddns, dns, firewall, ftp, glue, monitor, optimizer, peer, provisioner,
        proxy, queue, registrar, relay, signal, smtp, ssh, storage, tls, tunnel, ui, webserver) and their components and panel, as he brought
        them. No conf, state or key from the upload: each stack writes its own (SV-003).
      deps: [{ name: engine-ipc }]
      exports: ["engines/<name>.js — each run by the kernel as NEXUS_ENGINE=<name>"]
      gate_pipeline: ["GATE-SV0-005: every engine file present, unchanged", "GATE-SV0-006: no conf/, state/ or key carried in"]
      behavioral_contracts: ["each engine's own init writes its conf under the root"]
      error_paths: ["catalog's app templates need packages (discord.js, telegraf, node-schedule, puppeteer) only when such an app is installed"]
      acceptance: ["27 engine files, each byte-identical to the upload", "no .key, conf/ or state/ in the tree"]

    - id: MOD-SV-STACK
      name: service-stack
      uuid: nexus-cos-services-stack-v1-0000-2026-1024-001
      path: cos/services/stack.js
      phase: SV1_a_stack_per_root
      description: >-
        A stack per root: create(spec) makes the root, runs the kernel's init for the chosen engines (fresh conf and secrets), writes each
        engine's port into its conf from a free high range, and refuses an engine past the safe set unless spec.allow names it; up / down /
        status / logs drive that root's kernel through its own control socket.
      deps: [{ name: kernel-cli }, { name: engine-ipc }]
      schema_refs: [StackSpec, StackStatus]
      exports: ["create(StackSpec) → { root, engines, ports, said }", "up(root) → StackStatus", "down(root)", "status(root) → StackStatus", "SAFE: string[]", "ALL: string[]"]
      gate_pipeline: ["GATE-SV1-001: engines known; past the safe set only if allowed", "GATE-SV1-002: ports free and not shared", "GATE-SV1-003: up, then status from the kernel"]
      behavioral_contracts: ["two stacks never share a port", "down stops every process the stack started, and only those"]
      error_paths: ["a port taken → the next free one, said", "the kernel does not come up → status says so with its log tail"]
      acceptance: ["a stack with webserver and dns comes up in a temp root; the web server answers HTTP on its port; dns answers a query; down leaves no process"]

    - id: MOD-SV-DEPLOY
      name: service-deploy
      uuid: nexus-cos-services-deploy-v1-0000-2026-1024-001
      path: cos/services/deploy.js
      phase: SV2_into_a_compartment
      description: "A stack into a COS compartment (its kernel spawned through process-runner, so the watchdog sees it) or into the test machine (the VM, where firewall, smtp on 25 and dns on 53 can run for real)."
      deps: [{ name: service-stack }, { name: process-runner }, { name: testenv }]
      schema_refs: [StackSpec]
      exports: ["deploy({ compartmentId | testenv, spec }) → { stack, where }"]
      gate_pipeline: ["GATE-SV2-001: the compartment exists", "GATE-SV2-002: spawned through process-runner"]
      behavioral_contracts: ["a compartment's stack root is inside the compartment's folder"]
      error_paths: ["no VM here → the test-machine path is said, not faked"]
      acceptance: ["a compartment's stack appears in process-runner's list and on the COS bus"]

    - id: MOD-SV-ROUTE
      name: service-route
      uuid: nexus-cos-services-route-v1-0000-2026-1024-001
      path: cos/services/route.js
      phase: SV3_on_the_cos_bus
      description: "A stack's kernel events onto the COS bus, and COS's calls into an engine through the kernel's addressed delivery (route:error when it cannot)."
      deps: [{ name: service-stack }, { name: engine-ipc }]
      exports: ["attach(stack, bus)", "call(stack, engine, type, payload) → reply | route:error"]
      gate_pipeline: ["GATE-SV3-001: only declared message types cross"]
      behavioral_contracts: ["an undeliverable call is said, never dropped"]
      error_paths: ["the kernel restarts → reattached"]
      acceptance: ["a COS call reaches the web server engine and its reply comes back"]

    - id: MOD-SV-DOORS
      name: service-doors
      uuid: nexus-cos-services-doors-v1-0000-2026-1024-001
      path: cos/services/doors.js
      phase: SV4_the_doors
      description: "The doors, in his order of delivery: the routes (create, up, down, status, logs), the `cos services …` commands on the one command table, and the COS screen's Services list with each stack's engines and ports."
      deps: [{ name: service-stack }, { name: service-deploy }]
      schema_refs: [StackSpec, StackStatus]
      exports: ["GET/POST /api/cos/services[/:stack[/up|/down|/logs]]", "cos services list | create | up | down | status | logs"]
      gate_pipeline: ["GATE-SV4-001: every route has its command row", "GATE-SV4-002: the screen reads the routes only"]
      behavioral_contracts: ["an engine past the safe set is offered only with his allow, said on the screen"]
      error_paths: ["COS not running → the command says so"]
      acceptance: ["in Clear Glass, the Services list shows a stack's engines and ports and Down stops it"]

  events:
    services:
      - "service.stack.created { root, engines, ports }"
      - "service.stack.up { root, engines }"
      - "service.stack.down { root }"
      - "service.engine.refused { root, engine, why }"

  enforcement:
    gates:
      - { id: GATE-SV-ISOLATED, name: isolated, severity: fatal, check: "two stacks in two roots share no port, socket or file", on_failure: "suite red" }
      - { id: GATE-SV-CONTAINED, name: contained, severity: fatal, check: "no machine-wide kill; the engines outside the safe set need allow", on_failure: "refused" }
      - { id: GATE-SV-NO-SECRETS, name: no-secrets, severity: fatal, check: "no key, conf or state from the upload in the tree", on_failure: "suite red" }
      - { id: GATE-SV-NO-EVAL, name: no-eval, severity: fatal, check: "the kernel builds no function from an IPC string", on_failure: "suite red" }
      - { id: GATE-SV-SAID, name: said, severity: fatal, check: "every change to his code is named in MOD-SV-KERNEL with why", on_failure: "review" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles in emerge's kg-builder at specDepth 1.0, no BLACK node, invariants valid"
    - "tests/modules/test-cos-services.test.js — the acceptance lines of SV0 and SV1"
