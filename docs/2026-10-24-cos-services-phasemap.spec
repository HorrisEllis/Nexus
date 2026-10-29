# docs/2026-10-24-cos-services-phasemap.spec
# His engines in COS: web servers, DNS, firewall, SMTP, TLS, proxy … every one, deployable into a compartment or a test environment, and the
# networking backend for anything in Nexus that needs networking. Spec: cos/spec/cos-services.spec (compiles at full depth).
# MAPPED 2026-10-24, before building (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec. Context and his correction:
# docs/2026-10-23-cos-spine-phasemap.spec, its 2026-10-24 addenda.

origin:
  date: 2026-10-24
  james: '"look at this for cos" · "im saying for web servers, dns, firewall, email smtp, like integrating into deployable. i want to use those engines for test env, web servers, etc all of them" · "this is all the networking backend for anything needed netwroking wise"'
  context: >-
    He uploaded anonymousservers-nexus-4-12.zip (anonymousservers.info NEXUS 0.1.0: a kernel supervising 27 engines over newline-JSON IPC).
    The coder first read only its kernel patterns as being "for cos"; he corrected it: the engines themselves, all of them. The design is
    his; the spec, the phase cut and the isolation rules (decided by his axioms) are the coder's.

phases:

  SV0_the_engines_in_cos:
    layer: foundation
    status: DONE 0.60.235 — test-cos-services 4/4
    depends_on: []
    files: [cos/services/anonymous/nexus.js, cos/services/anonymous/engines/_engine.js, cos/services/anonymous/README.md, tests/modules/test-cos-services.test.js]
    spec: cos/spec/cos-services.spec
    blocks: [MOD-SV-KERNEL, MOD-SV-SDK, MOD-SV-ENGINES]
    does: >-
      His platform's kernel and its 27 engines brought into cos/services/anonymous/, the engines byte-identical; the kernel changed only so a
      stack stays inside its root (root from NEXUS_ROOT, the orphan sweep scoped to its root, the Windows pipe named by its root) and so no
      IPC string is run as code (db:* take a declared filter). No conf, state or key from the upload.
    proof: "two kernels in two temp roots both answer status; stopping one leaves the other; a string gate is refused; 27 engines byte-identical; no key in the tree"

  SV1_a_stack_per_root:
    layer: backend
    status: OPEN
    depends_on: [SV0_the_engines_in_cos]
    files: [cos/services/stack.js, tests/modules/test-cos-services.test.js]
    spec: cos/spec/cos-services.spec
    blocks: [MOD-SV-STACK]
    does: "create / up / down / status / logs for a stack in any root: fresh conf and secrets by the engines' own init, its own free ports, the safe set by default."
    proof: "a stack with webserver and dns comes up in a temp root; HTTP answers on its port; dns answers; down leaves no process"

  SV2_into_a_compartment:
    layer: integration
    status: OPEN
    depends_on: [SV1_a_stack_per_root]
    files: [cos/services/deploy.js, cos/compartment/process-runner.js]
    spec: cos/spec/cos-services.spec
    blocks: [MOD-SV-DEPLOY]
    does: "A stack into a COS compartment (through process-runner, so the watchdog sees it) or into the test machine, where firewall, smtp on 25 and dns on 53 run for real."
    proof: "a compartment's stack is in process-runner's list and on the COS bus"

  SV3_on_the_cos_bus:
    layer: integration
    status: OPEN
    depends_on: [SV1_a_stack_per_root, CS3_the_registry_is_the_bridge]
    files: [cos/services/route.js]
    spec: cos/spec/cos-services.spec
    blocks: [MOD-SV-ROUTE]
    does: "A stack's events onto the COS bus; COS calls an engine through the kernel's addressed delivery, and an undeliverable call is said (route:error)."
    proof: "a COS call reaches the web server engine and its reply comes back"

  SV4_the_doors:
    layer: ui
    status: OPEN
    depends_on: [SV1_a_stack_per_root, SV2_into_a_compartment]
    files: [cos/services/doors.js, idearium/cli/route-commands.js, cos/app/desktop/spine.js]
    spec: cos/spec/cos-services.spec
    blocks: [MOD-SV-DOORS]
    does: "Routes, the `cos services` commands, and the COS screen's Services list (his order: backend, route, command, UI)."
    proof: "in Clear Glass, the Services list shows a stack's engines and ports and Down stops it"


## ADDENDUM 2026-10-24 (0.60.235) — SV0 built
James, 2026-10-24: "Continue"
- cos/services/anonymous/: his kernel and 27 engines; engines, SDK and upstream files byte-identical (UPSTREAM.sha256); only nexus.js changed,
  each change marked COS: (root from SERVICES_ROOT, not NEXUS_ROOT, which Nexus itself uses; per-root control pipe/socket; the sweep kills
  only this root's recorded processes, checked by command line; db gates parsed by a strict grammar). His machine-wide sweep kept, unused.
- Found, worse than the map said: the engines build gates from request input (auth.js `r => r.handle === '${handle}'` on login), and the
  kernel ran them with new Function — a login's handle could run code in the kernel. The grammar reads exactly the 16 shapes the engines send
  (SV-01 compares each with real JS) and refuses the rest. One upstream gate (auth.js:135, an arrow returning a template string) was already
  broken: it is refused, so that API-key check fails closed; the engine is left as he wrote it, said here.
- No conf, state, logs or key from the upload; defaults/ holds the vhost templates and the default site (what init does not make).

# ── ADDENDUM 2026-10-29 — categories and cos.exe as the full compartment manager (his) ──
# James, 2026-10-29: "catagories using either the architypes or the templates, with a full manager and editor, with the schemas, then catagories
# which can be managed, including systems which would then list each system compartment. also really need cos.exe to be a fully compartment
# manager with controls for the rewind engine, diagnostic tools, versions, data browser and tools. cli access. index.html/ui for the
# thumbnail. look at all of the cos phases, and add all of this to them." · and: "yes, clear glass macros and settings too."
# Mapped in full in docs/2026-10-24-cos-manager-phasemap.spec (addendum 2026-10-29: MG10 categories, MG11 the category manager UI, MG12 the
# exe is the compartment manager, MG13 CLI in the exe, MG14 live thumbnails).
# Here: each service compartment (SV2) is a member of the category of its template (MG10), and gets MG12's tabs. Its health route is what the
# Diagnostics tab reads.
