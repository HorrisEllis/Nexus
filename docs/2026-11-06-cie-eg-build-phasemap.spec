# docs/2026-11-06-cie-eg-build-phasemap.spec — building CIE-EG's modules (emerge/emerge/spec/cie-eg.spec), one phase per module.
# The decisions are James's (cie-eg.spec section 12, D1–D10, all decided 2026-11-06); the cut into phases and the order are the coder's.
# Spec: emerge/emerge/spec/cie-eg.spec. Each module's own build: entry there says what is built; a phase here says when and with what proof.

origin: >-
  James, 2026-11-06, the focus: "Emerge first then fiverr maybe? I’m struggling. Emerge is the highest leverage." · on the contract (D7):
  "New contract block" · offered the contract block as the next step: "Next".

status: "CIE1 BUILT 0.60.423. CIE2 BUILT 0.60.424. CIE3 BUILT 0.60.425 (the format; writing moves to CIE4). CIE4–CIE12 MAPPED 2026-11-06 (his CIE_D1: \"Start the JS removal now\")."

decisions:
  CIE_D1_remove_the_javascript_now:
    status: "DECIDED 2026-11-06 (his)"
    james: '"Remove the last of the JavaScript" · "When is it good enough to call it a full coding language" · asked what comes next, chose: "Start the JS removal now"'
    context: >-
      Measured before he chose: 23,525 lines of JavaScript in 119 files under emerge/emerge (lang 8,338 with its tests; compiler 6,197; tests
      5,335; top level 2,645 with server.js; lib, observe, core, siso 2,333), against 8,420 lines of .eg. The native compiler already rebuilds
      itself without Node on Linux (selfhost 16/16), but components, roads, the gate, the ledger and the contract run only on the JavaScript
      interpreter, the tools are JavaScript, and there is no Windows build. Offered: start now; Pillar's schema and PIL2 first; the
      interpreter only; map it first. The coder's answer to his question, said to him: by the usual bar (a compiler written in itself that
      builds itself) Emerge is a language now; by CIE-EG 0's own bar it is one when emerge.exe rebuilds itself on Windows with no JavaScript.
    chosen: "the removal starts now, in CIE-EG's order (native system, native tools, Windows); Pillar's schema and PIL2 wait (MOD-STORE stays in this map)"
  CIE_D2_the_door_in_emerge:
    status: "DECIDED 2026-11-06 (his)"
    james: '"Door in Emerge too" (asked what happens to server.js, the door COS runs and Nexus reaches on :4900, when the JavaScript goes)'
    context: "Offered: the door in .eg, served by emerge.exe; keep a thin JS adapter outside the language (CIE-005); decide later."
    chosen: "server.js is rewritten in Emerge and emerge.exe serves the door; COS runs emerge.exe in place of node server.js (CIE10, CIE11)"
    open: >-
      To bring to him when CIE10 is reached (not settled by the axioms): on Windows a socket needs ws2_32.dll, and CIE-EG 0 allows only
      kernel32 and the OS crypto library ("Nothing else is borrowed"). On Linux sockets are plain syscalls and the conflict does not arise.
  CIE_D3_sha256_from_the_cpu:
    status: "DECIDED 2026-11-06 by his spec and axioms (CIE-004, 10.2, §0.1, §1.2)"
    context: >-
      CIE-004 (his, decided): "No invented cryptography: SHA-256 and AES-256-GCM from the OS or CPU." Checked in the container on 2026-11-06:
      the kernel refuses AF_ALG (errno 97, the Linux OS crypto interface), the CPU has sha_ni. The CPU's SHA-256 instructions are the same on
      Linux and Windows (no import, no allowlist question) and can be proved here (§0.1). A CPU without them is refused with a gap that names
      it (§1.2), never a software fallback (CIE-004); the OS library (Windows bcrypt, Linux AF_ALG) is added with the Windows target as the
      second source.
    cost_to_say: "Intel desktop CPUs before Ice Lake / Rocket Lake (e.g. 8th–10th generation Core) have no SHA-NI; on those the native ledger refuses until the OS source is added (CIE12)."
    chosen: "SHA-NI first (CIE2), the OS library second (CIE12)"

phases:

  CIE1_the_contract_block:
    status: BUILT 0.60.423
    # James, 2026-11-06 (CIE-EG D7): "New contract block". 2026-11-06, after PIL1 was merged: "Next" (the coder had offered the contract block as
    # the next step in the focus, before Pillar's contracts, PIL2, which are written in it).
    depends_on: [EAS4_callers_through_the_door]
    spec: emerge/emerge/spec/cie-eg.spec
    blocks: [MOD-CONTRACT]
    files: [emerge/emerge/lang/parser.js, emerge/emerge/lang/contract.js, emerge/emerge/lang/index.js, emerge/emerge/lang/runtime.js, emerge/emerge/lang/interpreter.js, emerge/emerge/lang/checker.js, emerge/emerge/lang/emitter.js, emerge/emerge/lang/cie/contract.eg, emerge/emerge/lang/test/contract.test.js, emerge/emerge/spec/cie-eg.spec, emerge/emerge.cos]
    requires: [node]
    prerequisites: ["CIE-EG D7 decided (2026-11-06)", "Emerge's lock retaken after the change (scripts/emerge-lock.js --write)"]
    does: >-
      The contract block in the language (CIE-EG 6.1): contract <name> { version, text { }, gate { block_at max_steps checkpoint_every }, road A.h -> B.h }.
      Validated at parse (a road end not an identifier, an unknown setting, a second contract: refused). Defaults are the primitives' own values. Its
      contract_hash (SHA-256 over the canonical form, ECF) goes into the genesis entry and every checkpoint; its gate settings replace the
      primitives' for that run (max_steps the storm limit, checkpoint_every, block_at for observe); each road runs as a wire (a wire is a road).
      The same parse and hash written again in Emerge (lang/cie/contract.eg: parse_contract, contract_hash, roads_from), checked against the
      scaffold byte for byte. Not in this phase: emerge.exe's own parser (native front.eg) learning the block, with MOD-NATIVE-LANG; the gate's
      use of block_at to close a road (MOD-GATE).
    proof: "contract.test.js: the block parses and runs its roads; each refusal; the hash is in genesis and every checkpoint; changing the contract changes the hash; contract.eg gives the same hash as the scaffold; lang suites unchanged"

  CIE2_native_sha256:
    status: BUILT 0.60.424
    depends_on: [CIE_D1_remove_the_javascript_now, CIE_D3_sha256_from_the_cpu]
    spec: emerge/emerge/spec/cie-eg.spec
    blocks: [MOD-NATIVE-SYSTEM]
    files: [emerge/emerge/lang/native/x64.eg, emerge/emerge/lang/native/codegen.eg, emerge/emerge/lang/native/rt.eg, emerge/emerge/lang/native/rt_text.eg, emerge/emerge/lang/test/native.test.js, emerge/emerge/lang/native/bin/emerge]
    requires: [node, "an x86-64 CPU with SHA-NI (CPUID leaf 7, EBX bit 29)"]
    prerequisites: ["selfhost green before and after (stage 1 == stage 2)"]
    does: "sha256(text or bytes) natively: CPUID check, padding in .eg, one SHA-NI compression per 64-byte block (an intrinsic); a CPU without it is refused by name"
    proof: "known-answer vectors (FIPS 180-4: empty, abc, the 448-bit and 896-bit messages, a million a's) equal to the interpreter's sha256; selfhost byte-identical"

  CIE3_native_ledger:
    status: BUILT 0.60.425
    depends_on: [CIE2_native_sha256]
    spec: emerge/emerge/spec/cie-eg.spec
    blocks: [MOD-NATIVE-SYSTEM]
    files: [emerge/emerge/lang/cie/ledger.eg, emerge/emerge/lang/ledger.js, emerge/emerge/lang/test/ledger.test.js, emerge/emerge/lang/test/native.test.js, emerge/emerge/spec/cie-eg.spec]   # expanded 2026-11-06 from rt.eg/codegen.eg: the format is an Emerge module, not the raw runtime
    requires: [node]
    prerequisites: []
    does: "ECF, the entry hash (domain tag, prev, seq, kind, body), genesis, checkpoints with the Merkle root, natively: the same bytes as lang/ledger.js"
    proof: "a program's ledger from emerge equals the interpreter's hash for hash (differential); ledger.test's known answers natively"
    # ── BUILT 0.60.425, its scope said: the ledger's format in Emerge (lang/cie/ledger.eg), the same bytes as lang/ledger.js interpreted and
    # native, and D5's text subset in both (decided by the axioms after his "no idea what that means"). A native program does not write its
    # own ledger yet: that needs the world natively (components, the gate), so it moves into CIE4, expanded the same day.

  CIE4_native_components:
    status: OPEN
    depends_on: [CIE3_native_ledger, CIE1_the_contract_block]
    spec: emerge/emerge/spec/cie-eg.spec
    blocks: [MOD-NATIVE-SYSTEM]
    # files: world.eg and its fixtures added 2026-11-06 (slice a); lower.eg, the embedded world and the rebuilt compiler (slice b)
    files: [emerge/emerge/lang/cie/world.eg, emerge/emerge/lang/test/world/counter.eg, emerge/emerge/lang/test/world/counter.world.eg, emerge/emerge/lang/native/front.eg, emerge/emerge/lang/native/lower.eg, emerge/emerge/lang/native/emerge.eg, emerge/emerge/lang/native/world_text.eg, emerge/emerge/lang/native/ledger_text.eg, emerge/emerge/lang/native/bin/emerge, emerge/emerge/lang/test/world/counter_ledger.eg, emerge/emerge/lang/native/codegen.eg, emerge/emerge/lang/native/rt.eg, emerge/emerge/lang/test/native.test.js]
    requires: [node]
    prerequisites: []
    does: "compartments, constraints, signals, components, hooks, wires, the contract block and the gate (FIFO, storm limit) natively"
    proof: "the components examples and contract.test's programs give the same output and ledger natively as interpreted"
    # ── EXPANDED 2026-11-06 (from CIE3): the native world writes its ledger with lang/cie/ledger.eg (genesis with the contract hash, every
    # entry, checkpoints), and the proof becomes "a native run's ledger equals the interpreter's, hash for hash".

  CIE5_native_test:
    status: OPEN
    depends_on: [CIE4_native_components]
    spec: emerge/emerge/spec/cie-eg.spec
    blocks: [MOD-NATIVE-SYSTEM]
    files: [emerge/emerge/lang/native/front.eg, emerge/emerge/lang/native/codegen.eg, emerge/emerge/lang/native/emerge.eg, emerge/emerge/lang/test/native.test.js]
    requires: [node]
    prerequisites: []
    does: "test blocks and expect natively; emerge test replaces eg test"
    proof: "every .eg test in the repository passes under emerge test with the same counts as eg test"

  CIE6_native_check:
    status: OPEN
    depends_on: [CIE5_native_test]
    spec: emerge/emerge/spec/cie-eg.spec
    blocks: [MOD-NATIVE-TOOLS]
    files: [emerge/emerge/lang/native/check.eg, emerge/emerge/lang/native/emerge.eg, emerge/emerge/lang/checker.js]
    requires: [node]
    prerequisites: []
    does: "the checker in .eg (lang/checker.js, 563 lines): emerge check"
    proof: "lang.test's check cases give the same diagnostics from emerge check as from eg check"

  CIE7_native_observe:
    status: OPEN
    depends_on: [CIE3_native_ledger]
    spec: emerge/emerge/spec/cie-eg.spec
    blocks: [MOD-NATIVE-TOOLS]
    files: [emerge/emerge/observe/index.js, emerge/emerge/observe/gaps.js, emerge/emerge/observe/debug.js, emerge/emerge/lang/native/observe.eg]
    requires: [node]
    prerequisites: []
    does: "observe and debug (observe/*.js, 728 lines) in .eg"
    proof: "observe.test and debug.test answers equal from the .eg"

  CIE8_spec_compiler_in_emerge:
    status: OPEN
    depends_on: [CIE6_native_check]
    spec: emerge/emerge/spec/cie-eg.spec
    blocks: [MOD-NATIVE-TOOLS]
    files: [emerge/emerge/compiler/kg-builder.js, emerge/emerge/compiler/pipeline.js, emerge/emerge/compiler/tier-contract.js, emerge/emerge/compiler/target.js, emerge/emerge/compiler/*.eg]
    requires: [node]
    prerequisites: ["a YAML reader in .eg (the specs are YAML)"]
    does: "the spec compiler (compiler/*.js, 6,197 lines) ported to .eg: emerge build-spec, emerge check-spec"
    proof: "check-spec gives the same report from the .eg on every registered spec (test-substrate-spec's list)"

  CIE9_tests_in_emerge:
    status: OPEN
    depends_on: [CIE5_native_test, CIE8_spec_compiler_in_emerge]
    spec: emerge/emerge/spec/cie-eg.spec
    blocks: [MOD-NATIVE-TOOLS]
    files: [emerge/emerge/lang/test/*.js, emerge/emerge/test/*.js, emerge/emerge/tests/*.js]
    requires: [node]
    prerequisites: []
    does: "the test harnesses (5,335 lines of JavaScript) rewritten as .eg tests run by emerge test"
    proof: "the same cases, the same counts; a planted fault fails each"

  CIE10_the_door_in_emerge:
    status: OPEN
    depends_on: [CIE_D2_the_door_in_emerge, CIE5_native_test, CIE8_spec_compiler_in_emerge]
    spec: emerge/emerge/spec/cie-eg.spec
    blocks: [MOD-NATIVE-TOOLS]
    files: [emerge/emerge/server.js, emerge/emerge/door.eg, emerge/emerge/lang/native/rt.eg, emerge/compartment.json]
    requires: [node, "sockets: Linux syscalls; Windows: CIE_D2's open question first"]
    prerequisites: ["his answer to CIE_D2.open before the Windows door"]
    does: "the door on :4900 (POST /compiler/*, /lang/*, the CLI) served by emerge.exe; COS runs emerge.exe in place of node server.js"
    proof: "lang-door and test-emerge-in-nexus green against the .eg door; Nexus's callers unchanged"

  CIE11_retire_the_interpreter:
    status: OPEN
    depends_on: [CIE6_native_check, CIE7_native_observe, CIE9_tests_in_emerge, CIE10_the_door_in_emerge]
    spec: emerge/emerge/spec/cie-eg.spec
    blocks: [MOD-NATIVE-TOOLS]
    files: [emerge/emerge/lang/*.js, emerge/emerge/lib/*.js, emerge/emerge/core/*.js, emerge/emerge/siso/*.js, emerge/emerge/*.js, _archive/emerge-js]
    requires: [node]
    prerequisites: ["nothing in Nexus requires emerge/emerge JavaScript (the census)"]
    does: "the JavaScript is archived, not deleted (§0.3): emerge/ holds .eg only; the stage-0 scaffold kept in the archive"
    proof: "git ls-files 'emerge/emerge/*.js' outside the archive is empty; every suite green"

  CIE13_native_system_primitives:
    status: OPEN
    depends_on: [CIE_D1_remove_the_javascript_now, PIL2_contracts, CIE5_native_test]
    spec: emerge/emerge/spec/cie-eg.spec
    files: [emerge/emerge/lang/native/rt.eg, emerge/emerge/lang/native/codegen.eg, emerge/emerge/lang/native/sys_process.eg, emerge/emerge/lang/native/sys_clock.eg,
            emerge/emerge/lang/native/sys_file.eg, emerge/emerge/lang/test/native-sys.test.js, emerge/emerge/spec/cie-eg.spec]
    requires: [node, "Linux syscalls (fork/execve/wait4/kill, clock_gettime, nanosleep/timerfd, getdents64/stat/inotify); Windows in CIE12 through kernel32 (CreateProcess, QueryPerformanceCounter, CreateWaitableTimer, FindFirstFile)"]
    prerequisites: ["Pillar's Process, Clock and File contracts (PIL2, expanded 2026-11-06)"]
    does: >-
      His "code primitives to replace javascript. using pillar": Process, Clock and File as builtins of emerge.exe, from the kernel directly
      (no libc, as the native compiler already is), each conforming to its Pillar contract. With CIE10's Port, they are what COS's manager
      needs to be written in Emerge: serve its routes, supervise each system's process, schedule and time the gates.
    proof: "a native program spawns a child, reads its exit code, kills one that hangs; times a 50 ms timer; lists and watches a folder; each case from its Pillar contract"
  CIE12_windows:
    status: OPEN
    depends_on: [CIE11_retire_the_interpreter]
    spec: emerge/emerge/spec/cie-eg.spec
    blocks: [MOD-NATIVE-WINDOWS]
    files: [emerge/emerge/lang/native/pe.eg, emerge/emerge/lang/native/rt.eg, emerge/emerge/lang/native/codegen.eg]
    requires: ["Windows x86-64 (his machine, through Remote Control)"]
    prerequisites: []
    does: "kernel32 imports and the PE import table; SHA-256 from the OS library as the second source (CIE_D3); emerge.exe rebuilds itself on Windows byte for byte"
    proof: "on his machine: emerge.exe stage 1 == stage 2; every suite green under emerge.exe"

order: "CIE1 built. Then, his CIE_D1: CIE2 → CIE3 → CIE4 → CIE5 → (CIE6, CIE7) → CIE8 → CIE9, CIE10 → CIE11 → CIE12. MOD-STORE's schema (PIL2's other prerequisite) waits."

# ADDENDUM 2026-11-06 — CIE13 added: processes, time and files, native; CIE10 carries Pillar's Port
# James, 2026-11-06, after the coder said COS's manager must stay JavaScript for HTTP, processes and timers until Emerge has them: "okay but no js then right?" · "im saying to code primitives to replace javascript. using pillar"
# No phase had processes or time. CIE13 adds them (Process, Clock, File); CIE10's sockets are Pillar's Port, read against its contract.
# Windows: Process, Clock and File are kernel32 (allowed by CIE-EG 0); only Port needs ws2_32, CIE_D2's open question, still his.

# ── ADDENDUM 2026-11-06 (0.60.426) — CIE4 slice a built: the world in Emerge, hash for hash ──
# James, 2026-11-06: "actaully keep remove js from emerge." · "lets code what we can using emerge, that way we can have a good test. maybe everything from this point should be emerge?"
# The coder's cut of CIE4 into slices (the phase expands, not split; his 2026-11-03 rule):
#   a (BUILT 0.60.426): lang/cie/world.eg, the world itself in plain Emerge (no new construct needed: the native subset already has lambdas,
#     closures, clone, deep equality, try). Compartments, hard/soft constraints, FIFO signals with buffered emits, wildcards, rejection, spent,
#     unrouted, storm limit, genesis and checkpoints through lang/cie/ledger.eg. native.test 'world': the interpreter on world/counter.eg and
#     world.eg on world/counter.world.eg give the same output and the same 10 ledger entries, hash for hash, interpreted and native. 94/94.
#   b (next): the native front end (front.eg) lowers compartment / on / emit / Name.state to world.eg calls, so counter.eg itself compiles;
#     gaps on a null read in a constraint, lenses, record, ledger(), spent() as builtins.
#   c: components, hooks, wires, the contract block and the gate (FIFO, storm limit from the contract), on the same world.
# Found: (1) the native compiler lets a map's contents change through a let or a parameter, which the interpreter's checker refuses; native
# is laxer, a difference to close (front.eg). (2) Newlines inside a map literal are spaces, so a multi-line lambda written inside { … } runs its
# lines together; the lowering must lift handlers to top-level lets, as counter.world.eg does. (3) compartment, on, emit, state are keywords, so
# world.eg names them declare, listen, signal, state_of.

# ── ADDENDUM 2026-11-06 (0.60.428) — CIE4 slice b built: compartments compile natively, as written ──
# James, 2026-11-06: "the moment js is removed from emerge it becomes the replacement. focus on that first. no more js, we focus on .eg" · "next. how much more?"
# front.eg parses compartment (id, intent, state, constraint hard|soft [cost n], on, fn), top-level on, and emit; native/lower.eg rewrites them,
# and C.state, C.f(), spent(), ledger() and ledger_verify(), into lang/cie/world.eg calls; the driver carries world.eg and ledger.eg inside it
# (world_text.eg, ledger_text.eg, as rt and the prelude are). No runtime change: the world is the .eg of slice a.
# Proof: native.test 'compartments natively, as written': lang/test/world/counter_ledger.eg compiled natively prints what the interpreter prints,
# its 9 ledger entries hash for hash. native.test 95/95; selfhost 16/16 (stages 0, 1, 2 byte-identical; front.eg parses every example as the JS parser).
# Found: (1) natively a lens is a copy, not a frozen copy: examples/counter.eg differs in exactly one line, the read-only error the interpreter
# raises when a lens is written (the state itself is safe). Frozen values natively are the gap to close (slice b'). (2) The genesis entry names
# the build: native/emerge.eg holds VERSION "1.13.0" beside package.json; the 'world' cases fail if they drift. (3) The interpreter's CLI prints
# the unrouted notice to stderr; a native program does not print it yet.
# Next: slice c, components, hooks, wires, the contract block and the gate.
