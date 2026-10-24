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
    status: OPEN
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

