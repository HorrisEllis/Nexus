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

  CIE_D4_optional_parameters:
    status: "DECIDED 2026-11-07 (his)"
    james: '"I feel optional parameter's is always good."'
    context: >-
      sort_by(xs, f, "desc") was the one builtin with an optional argument, and Emerge had no optional parameters, so sort_by could not move from
      the interpreter's JavaScript into the Emerge prelude. Offered: (1) optional parameters in the language, the coder's recommendation; (2) a
      second name for the descending sort. He chose (1), and said it as a rule: optional parameters are always good.
    chosen: >-
      fn f(a, b = default): a missing argument takes its default, evaluated at call time after the parameters before it; a required parameter
      cannot follow an optional one. In the parser, checker, interpreter and emitter (JavaScript, until CIE11) and natively (front.eg,
      native/defaults.eg: an entry per shorter arity). sort_by moves into lang/core/prelude.eg as fn sort_by(xs, f, dir = "asc"); the interpreter's
      JavaScript sort_by and its comparer are deleted; lang/cie/sort.eg, the native stopgap, is archived as a duplicate.
  CIE_D5_after_emerge_warp2_then_the_field:
    status: "DECIDED 2026-11-07 (his)"
    james: '"once emerge is done then warp 2 and the relational constraint field."'
    chosen: >-
      The order after the JavaScript removal (CIE4–CIE13, CIE11 last): WARP 2 (EM2_warp_his_own) and the relational constraint field (RF1_relational_field,
      CF1_cfr_improved_with_rfr2, specced in emerge/emerge/spec/field.spec), then the field's view (CP11_the_diagnostic_map, expanded the same day).
      And Emerge debugs its own code when compiling: the checker runs inside the native compiler (CIE6 slice b); the JavaScript harness that judges
      check.eg today is temporary, until Emerge can do it (CIE9).
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
    status: BUILT 0.60.431
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

  CIE15_the_rest_of_the_language:
    status: BUILT 0.60.438
    depends_on: [CIE4_native_components]
    spec: emerge/emerge/spec/cie-eg.spec
    blocks: [MOD-NATIVE-SYSTEM]
    files: [emerge/emerge/lang/native/front.eg, emerge/emerge/lang/native/lower.eg, emerge/emerge/lang/native/codegen.eg, emerge/emerge/lang/native/rt.eg, emerge/emerge/lang/cie/world.eg, emerge/emerge/lang/test/native.test.js]
    requires: [node]
    prerequisites: []
    does: >-
      Every example natively, equal to the interpreter: the .. range operator (hello), expect (idearium, modules), record and gap (tests), axiom
      (axioms), kind, template and spawn (primitives), whatif (whatif). Each refused by name today; each built into the native compiler or the
      world, never skipped. The census of 2026-11-06 (0.60.431) is the starting line: 2 of 8 examples equal.
    proof: "every examples/*.eg natively equals eg run, line for line (native.test 'every example')"
  CIE5_native_test:
    status: BUILT 0.60.436
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
  CIE14_the_gaps_found_while_coding:
    status: OPEN
    depends_on: [CIE_D1_remove_the_javascript_now, CIE4_native_components]
    spec: emerge/emerge/spec/cie-eg.spec
    blocks: [MOD-NATIVE-SYSTEM]
    files: [emerge/emerge/lang/native/front.eg, emerge/emerge/lang/native/codegen.eg, emerge/emerge/lang/native/rt.eg, emerge/emerge/lang/native/lower.eg, emerge/emerge/lang/parser.js, emerge/emerge/lang/test/native.test.js]
    requires: [node]
    prerequisites: ["for (b): his call, a language change both parsers carry"]
    does: >-
      His "expanding emerge while you do" (2026-11-06): the gaps found while writing world.eg and lower.eg, each built into Emerge, none worked
      around in silence. (a) Lenses frozen natively, so writing Counter.state raises the interpreter's read-only error (examples/counter.eg's one
      differing line). (b) Newlines inside a map literal end statements in a lambda written there; today the lambda's lines run together. Both
      parsers change, so it is his to say. (c) Native refuses a change through a let or a parameter, as the checker does. (d) stderr natively, for
      the unrouted notice and errors written by programs. Keywords as names (state, on, emit, compartment) are the grammar's, not a gap: named,
      not changed, unless he asks.
    proof: "examples/counter.eg native equals the interpreter line for line; a lambda in a map literal runs each line; native refuses a let write as the checker does"
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

# ── ADDENDUM 2026-11-06 (0.60.430) — CIE14 (a) built: lenses frozen natively; (c) and (d) placed ──
# James, 2026-11-06: "yes. get emerge complete. js removed completely." · earlier: "remember to take note of metrics while coding in emerge, and expanding emerge while you do."
# (a) BUILT: freeze(v) is a builtin in both backends (lang/runtime.js def, native rt_b_freeze: bit 256 of the kind word, set through the whole
#     value); rt_setindex and rt_setmember refuse a write into a frozen value with the interpreter's message; rt_kind, rt_type_name, printing and
#     equality mask the bit. world.eg's state_of returns freeze(clone(state)). examples/counter.eg natively equals the interpreter line for line,
#     its read-only lens error included (native.test). Compiler rebuilt, stages byte-identical (9f2aa3db…).
# (c) PLACED IN CIE6: the bare native compiler has no checker; eg native runs the JS checker first, which refuses a write through a let or a
#     parameter. The refusal moves into Emerge with the checker (CIE6), not into codegen.
# (d) PLACED IN CIE11: the unrouted notice is the CLI's (eg.js, stderr); a native program's own stderr comes with a builtin both backends share,
#     written when the CLI is retired (CIE11).
# (b) HIS: newlines inside a map literal; a change to both parsers, asked.

# ── ADDENDUM 2026-11-06 (0.60.431) — CIE4 slice c built: components, hooks, wires, the contract and its roads, natively; CIE4 BUILT ──
# James, 2026-11-06: "yes. get emerge complete. js removed completely."
# world.eg: declare with component (the register entry, the derived uuid, boundary), send_in, emit_out, connect (wires out → in, signal → hook),
# roads (the contract's, after the later of the contract and the last compartment), shapes checked at send, emit out and delivery; the contract
# normalised and hashed by contract.eg (gate.max_steps and checkpoint_every honoured; contract_hash in genesis and every checkpoint);
# components_graph() and member_of() for components() and Name.version / .hooks / …. front.eg parses component, contract, in/out hooks, shapes,
# boundary, send, wire, emit out; lower.eg lowers them; the compiler carries contract.eg. contract.eg now sorts roads with the prelude's sort
# and writes its canonical form with ledger.eg's ecf (sort_by and json are not native): the hash is unchanged (contract.test 8/8).
# Proof: native.test 98/98: test/world/components.eg natively equals the interpreter, its 10 ledger entries hash for hash; examples/components.eg
# equals it line for line. Compiler stages byte-identical (72df0919…).
# Census of the examples natively: counter and components equal; refused by name: hello (..), idearium and modules/main (expect), tests (record),
# axioms (axiom), primitives (kind), whatif (whatif). Those are the next phase's: CIE15_the_rest_of_the_language.

# ── ADDENDUM 2026-11-06 (0.60.432) — CIE15 first slice: .. as a value, expect, upper and lower natively ──
# James, 2026-11-06: "yes. get emerge complete. js removed completely."
# Built: a .. range used as a value compiles to range(a, b) (codegen gen_binary); expect cond[, msg] parses (front.eg) and runs as rt_expect with
# the interpreter's three messages word for word; upper and lower are native builtins for ASCII text, and refuse text outside ASCII by name (the
# interpreter's are JavaScript's full Unicode mapping; the tables come with D5's text work). test/world/language.eg natively equals eg run.
# The examples moved on to their next refusal: hello → matches (a regular-expression engine, to build in Emerge), idearium → promote,
# modules/main → sort_by (native needs Emerge to have optional parameters, or a second name: his call, asked), tests → record, axioms → axiom,
# primitives → kind, whatif → whatif.

# ── ADDENDUM 2026-11-06 (0.60.433) — CIE15 second slice: record, gap, promote, gaps(), random(), uid() natively ──
# James, 2026-11-06: "just keep going. how are the benchmarks so fatr?"
# world.eg: the seeded generator (mulberry32, as lang/runtime.js createRng; Math.imul's bits from 16-bit halves, since wrap_mul is not native),
# uid, random, record_entry (the reserved kinds refused), open_gap (types and pressure checked, gap.opened signalled), gaps(), promote_value (a
# false proof refused and a logical gap opened). front.eg parses record, gap and promote; lower.eg lowers them with each statement's line and
# file; the world itself is never lowered (emerge.eg). test/world/language.eg: the same random number, uids, gap ids and 7 ledger hashes natively.
# Census: 3 of 8 examples equal (idearium added). Refused: axioms (axiom), hello (matches), primitives (kind), tests (test blocks, CIE5),
# whatif (whatif), modules/main (sort_by, his call on optional parameters).

# ── ADDENDUM 2026-11-06 (0.60.434) — CIE15 third slice: axioms; a constraint over a null field is a gap; world errors at the caller's line ──
# James, 2026-11-06: "just keep going."
# world.eg: declare_axiom (recorded, checked at once) and check_axioms (after every top-level statement, at that statement's line, as the
# interpreter's $.axioms); a constraint reading a null state field opens an evidential gap (0.8) and the state does not change, its fields found
# by lower.eg (reads_of). codegen.eg: the embedded world is no_loc like the prelude, so its errors are reported at the caller's line.
# examples/axioms.eg natively equals the interpreter in stdout, stderr and exit status (native.test). Census: 4 of 8 (axioms added).

# ── ADDENDUM 2026-11-06 (0.60.435) — CIE15 fourth slice: whatif natively ──
# James, 2026-11-06: "just keep going."
# world.eg whatif_branch: the world snapshotted (states, comps, handlers, entries, checkpoint, gaps, the generator, spent, unrouted, axioms,
# context, wires), the branch run in its own context, everything put back (also on error), one whatif entry kept. front.eg parses whatif { … };
# lower.eg makes the block's last expression its value. examples/whatif.eg natively equals the interpreter; language.eg shows the branch's draw
# is the world's next draw (restored) and its whatif entry hash for hash.
# Census: 5 of 9 (whatif added). Correction, the coder's: earlier addenda said "of 8"; the census has always counted 9 (eight examples and
# modules/main), so the line was 2, 3, 4 and now 5 of 9. Refused: hello (matches), primitives (kind), tests (test blocks), modules/main (sort_by).

# ── ADDENDUM 2026-11-06 (0.60.436) — CIE5 built: test blocks natively ──
# James, 2026-11-06: "okay. so are you removing it when you're finisged?" · "continue"
# emerge <file> --test (native/emerge.eg TEST_MODE, the main file's tests only): front.eg parses test "name" { … }; lower.eg writes, after the
# program, one try per test in the program itself (an error caught inside the world would carry the caller's line, the world being no_loc), each
# test run as a whatif from the same world (world.eg whatif_begin / whatif_end / whatif_abort), test_pass / test_fail / test_summary printing what
# eg test prints, and __exit (rt_b_exit, native-only, called only by lowered code) giving the status. Without --test, test blocks are skipped as
# eg run skips them. examples/tests.eg natively equals eg test in stdout, stderr and exit status (native.test 101/101); census 6 of 9 in run mode.
# Found: whatif_branch re-raises an error from inside a whatif expression, so such an error names the whatif's line, not its own; the test runner
# avoids it, a whatif expression does not yet (CIE14, to close).
# On his question, said to him: the JavaScript goes file by file, archived (§0.3) as each .eg replacement passes the same tests; the first drop
# is the interpreter core at CIE11.

# ── ADDENDUM 2026-11-06 (0.60.437) — CIE15 fifth slice: kinds, templates, spawn, despawn and instance handles natively ──
# James, 2026-11-06: "I hit my usage limit while you were working, but it has reset now. Please continue from where you left off." · earlier: "continue"
# front.eg: kind (its parents and typed state kept; conformance is the checker's), template T(params) [is K], component … is K, spawn T(id, …),
# despawn, instance wire ends (prev.give, stages[0].take). lower.eg: kinds flattened at compile time (Clamp is Filter → [Filter, Stage]) with
# their typed state; a template becomes define_template(name, arity, factory) whose spec holds its handlers, hooks, constraints and lens fns as
# closures over the parameters; in a program with templates, member reads and method calls on values go through the world (member_any,
# call_any), which answers for a live instance, refuses a stale one with the interpreter's message, and reads a plain map as before.
# world.eg: handles {__h token, name, id, template}, spawn_of, despawn_of (unwire and despawn entries), end_of, is_kind_of, instances_of, the
# initial-state check at declare (the boundary refused at spawn) and the typed-state check at declare and before every commit.
# examples/primitives.eg natively equals the interpreter line for line and its 22 ledger entries hash for hash, on the first native run.
# Census: 7 of 9. Left: hello (matches: a regular-expression engine in Emerge) and modules/main (sort_by: his call on optional parameters).
# Found: a field read on a non-map is worded differently by the two backends ("num has no member .x" vs "a num has no fields"); CIE14.

# ── ADDENDUM 2026-11-07 (0.60.438) — CIE15 built: regular expressions and sort_by in Emerge; every example natively ──
# James, 2026-11-06: "continue" · "Please continue from where you left off."
# lang/cie/regex.eg: a backtracking regular-expression engine in Emerge with JavaScript's u-flag grammar (alternation, groups, classes with ranges and
# negation, \d \w \s \b and their negations, every quantifier and its lazy form, anchors, the escapes); lookaround, named groups and backreferences
# refused by name. 92 cases (test/world/regex-cases.json, among them the five patterns the tree uses) judged by JavaScript's own RegExp: equal,
# interpreted and native. lower.eg rewrites text matches pattern to it in every program, world or not.
# lang/cie/sort.eg: sort_by in Emerge (keyed once, stable in both directions, the interpreter's errors); lower.eg rewrites sort_by(xs, f[, dir]) to
# it with "asc" filled in, so native needs no optional parameters. His question (optional parameters in the language) still decides whether the
# interpreter's JavaScript sort_by can be deleted; it no longer blocks native.
# emerge.eg: a module's file is named relative to the main file (lib/stats.eg), as the interpreter names it.
# Proof: native.test 'every example natively': all 8 examples, modules/main and test/world/sort_by.eg natively equal eg run (native.test 104/104).

# ── ADDENDUM 2026-11-07 (0.60.439) — optional parameters, his (CIE_D4); sort_by into the Emerge prelude; the first JavaScript deleted ──
# James, 2026-11-07, asked whether Emerge should get optional parameters (the coder recommended yes; the alternative was a second name for the descending sort): "I feel optional parameter's is always good."
# Built: optional parameters in both parsers, the checker (arity ranges; a default sees the parameters before it), the interpreter, the emitter
# (eg build) and natively (native/defaults.eg). sort_by written in lang/core/prelude.eg; bootstrap build 16; the interpreter's def('sort_by') and its
# cmpSort deleted (12 lines). lang/cie/sort.eg and native/sort_text.eg archived (_archive/2026-11-07-sort-eg/, a reported duplicate).
# Not native yet, refused by name: a lambda with defaults (the dynamic calling convention), and a module fn with defaults called through its module
# with fewer arguments (CIE14).
# Proof: native.test 104/104, every example plus sort_by.eg and optional.eg natively equal eg run; selfhost 16/16; lang 166/166; differential 19/19.

# ── ADDENDUM 2026-11-07 (0.60.440) — CIE6 slice a built: the checker in Emerge, equal to checker.js on 211 programs ──
# James, 2026-11-07: "continue"
# lang/cie/check.eg: lang/checker.js ported rule for rule (scopes, names, arity with optional parameters, assignment rules, whatif/test boundaries,
# state rules, lenses, emits and records, gaps, try, wires and sends with their seams, kinds and conformance, compartments, components, templates,
# the diagnostics' severities from primitives, SIGNAL_MUST_ROUTE_OR_LOG), its input the tree lang/parser.js builds and an environment (builtin
# arities, primitives, the runtime's signals) given as data.
# The judge: test/world/check-corpus.json, 227 programs harvested by running lang.test.js with its harness recorded, plus the examples; 211 parse
# (the other 16 test the parser). check.eg gives the same 75 errors and 43 warnings as checker.js, line, column and message, interpreted and native
# (native.test 105/105). Native: the 211 programs checked in 0.17 s.
# parse_json lowered natively onto lang/native/json.eg (a gap found writing the judge, built).
# Slice b, next: front.eg builds the same tree as lang/parser.js (State nodes, Kind and Contract in full), so the native compiler runs check.eg
# itself, and the let-write gap (CIE14 c) closes natively.

# ── ADDENDUM 2026-11-07 — his direction: Emerge debugs its own code when compiling; then WARP 2 and the field (CIE_D5) ──
# James, 2026-11-07, after the checker was proven in Emerge with a JavaScript harness: "its meant to debug it's own code when compiling. so that js harness is only temporary until emerge can also do it. once emerge is done then warp 2 and the relational constraint field. then code can be represented as nodes moving through the field, tension and friction can be color coded, the primitives define the shape of the structure or field, anything outsiide of the field is noise, friction introduced. with that we can visualize the process of code development or debugging, pipelines and workflow automation immutable nodes like packets of data or primitive from emerge running through each gate."
# CIE6 slice b reads it: the native compiler runs check.eg on every program before it builds, and refuses to build on an error, printing the
# diagnostics as eg check does; the JS judge of check.eg (native.test) stays only until CIE9 rewrites the tests in Emerge.
