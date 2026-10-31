# docs/2026-10-30-foundation-up-phasemap.spec — everything mapped on 2026-10-30, from the deterministic foundation up, one block at a time
# The ideas, the direction and the calls are James's. The census, the block cut, the order and the pushback are the coder's; every reading
# is marked TO CONFIRM. This map adds only the blocks no map held; the blocks that already exist are named in `order:` by their real ids and
# depended on, not redone (§8.6).

origin: >-
  James, 2026-10-30: "remember, this is all intuitive. and architectural systems thinking. emergent thinker, so pushback and input is
  warrented. map it all. the specs. / that is how the spec was supposed to be, deterministic foundation, then builds each addendum or expansion
  from that, one block at a time / like i want the agent to be able to read what you are typing, using the dag and work area tool, for reading
  specific lines, like full ai assistence for helping, dtebugging, and help with learning."
  The same day, in order: COS manages the system (MG_D4, MG_D5); "cos becomes nexus ... make this into a os ... emerge will be replacing nexus"
  (MG_D8); CIE-EG's registry is the spine (DB21 addendum); Emerge is the Emerge repo, the compound build, the IDE (EW_D2-EW_D4 in the
  emerge-warp map's addenda); Emergence into Emerge, decoupled, with memory storage and a learning observer (EW_D5); the tutor (EW_D6); the
  pipe door, both halves, RAID routing (architecture-spec 0.13.0 RULE C and addendum (d)); "way to many primitives"; ESS v0.1.0.

status: "MAPPED 2026-10-30. Nothing built by this map. Block F0 is next."

principle: >-
  His: a deterministic foundation, then each addendum or expansion built on it, one block at a time. A block is built only when every block
  under it is built and proven; a block never reaches up. The foundation has the fewest primitives (ESS's five, his); everything above is a
  function registered by its hash, not a new primitive.

decisions:
  F_D0_foundation_up:
    chosen: "the order below: a block builds only on proven blocks beneath it; each block is specced (emerge module format), phased, then built"
    by: "his, 2026-10-30 (quoted in origin): \"deterministic foundation, then builds each addendum or expansion from that, one block at a time\""
  F_D1_ess_is_the_kernel:
    chosen: >-
      TO CONFIRM (the coder's recommendation, from his spec): ESS's five primitives (WRITE, BIND, CALLTO, RESOLVE, UNRESOLVE) are the kernel,
      under the CIE-EG names already built (register, road, emit through the gate, deliver, gap); everything else is library. With the review
      in architecture-spec addendum (d): full-hash identity, a capability per role for BIND, CONTRACT_UPDATE gated, replay by seq.
    by: "his \"way to many primitives i feel like\" and his ESS v0.1.0; the mapping and the review are the coder's"
  F_D2_copies_are_locked:
    chosen: >-
      TO CONFIRM (the coder's pushback on "copy all the files cos needs"): what COS takes from Emerge, ERAVOS and the uploads is a read-only
      snapshot with a lock (source, commit, sha256 per file) and a check that fails on any edit; refreshed only from the source. The callers
      of lib/emerge switch in the same block, and lib/emerge is archived, so there is never a second live copy.
    by: "the coder, by §0.3, §10.3 and the measured drift (lib/emerge: 21 files differ from Emerge; 224 terms defined differently, 2026-10-05)"
  F_D3_the_assistant_watches_structure_not_keystrokes:
    chosen: >-
      TO CONFIRM (the coder's shaping of his "read what you are typing"): the assistant reads the buffer live, but acts on structural moments
      (a statement completes, the checker reports, the cursor rests on a gap, a test fails, he asks), not on every keystroke; the checker
      answers first and a model only when the check cannot (his "deterministic first"); in learning mode it gives a nudge, then a hint, then
      the answer (dynamic decomposition again); what he types stays on his machine (local model) unless he allows otherwise.
    by: "his request (origin); the trigger, the order and the privacy rule are the coder's, by §2 (deterministic first, docs/CLAUDE.md) and §4.3"

phases:
  F0_the_kernel_spec:
    status: OPEN
    depends_on: [F_D0_foundation_up, F_D1_ess_is_the_kernel, DB21_one_registry_schema_every_level]
    files: [emerge/spec/kernel.spec, CIE-EG_Specification_v0_3_1.md]
    does: >-
      In Emerge's repo: the kernel as one full spec, five primitives, each with its contract, error paths and acceptance; the hash store
      (append-only, full SHA-256 identity), the binding table and its log (replay by seq), the bus with RESOLVE and UNRESOLVE, structural noise
      (ESS §8). Each primitive mapped to what CIE-EG and the runtime already build (lang/ledger.js, the gate), so the spec describes code that
      exists wherever it can. Compiles at specDepth 1.0.
    proof: "the kernel spec compiles at full depth; every primitive names the built function that implements it, or is marked unbuilt"
  F1_one_vocabulary:
    status: OPEN
    depends_on: [F0_the_kernel_spec]
    files: [emerge/lang/emerge-lang.spec, emerge/spec/cie-eg.spec]
    does: >-
      Every name above the kernel is mapped to a primitive or to a library function built from them: the language's 14 constructs, CIE-EG's 13
      entry kinds, SISO/WARP's five, and Emergence's language spec 2.0.0 (seven roots). Duplicates are said and one name kept; the 224 terms
      defined differently between the two vocabularies go to him as a list, his calls.
    proof: "a table from every construct to a primitive or a library function; no construct left without one"
  F2_the_locked_snapshot:
    status: OPEN
    depends_on: [F_D2_copies_are_locked, F0_the_kernel_spec]
    files: [cos/vendor, cos/vendor/VENDOR.lock.json, scripts/vendor-check.js, lib/emerge, idearium, copilot, guardian, tests/modules/test-substrate-spec.test.js]
    does: >-
      COS's read-only snapshots (Emerge at a commit, ERAVOS canvas and schemas at a commit) with their lock and the check; every caller of
      lib/emerge switched to the snapshot in the same block; lib/emerge archived.
    proof: "vendor-check fails on a one-byte edit; the spec test and the build run on the snapshot; nothing requires lib/emerge"
  F3_the_door:
    status: OPEN
    depends_on: [F0_the_kernel_spec, MG15_the_supervisor_in_cos]
    files: [lib/door, idearium/cli/route-commands.js]
    does: >-
      RULE C (his): each system's server.js ingests its input folder one packet at a time and serves the same door over HTTP (pipes,
      pipes/:name?since, pipes/:name; /input and /output); each packet carries its --intent; a refusal is UNRESOLVE (a gap with its reason).
      Built once from his SNR Passthrough's shape (input → reorderable chain → output) as a template each system instantiates with its own
      pipes; the template is shared, each door is its system's (§5.15).
    proof: "two systems' doors: a packet dropped in one's input folder comes out of its output, one by one, with its intent; a bad packet refused with its reason"
  F4_raid_routes_the_doors:
    status: OPEN
    depends_on: [F3_the_door, CS11_raid_in_the_exe, MG23_allocation_and_balance]
    files: [cos/manager/router.js]
    does: "COS routes packets between doors with RAID: which system, which agent, and the load; each route a RESOLVE or an UNRESOLVE on the ledger"
    proof: "a packet routed across two systems by RAID's decision, the decision named on the ledger; an unroutable packet surfaces as noise (ESS §8)"
  F5_memory_and_learning:
    status: OPEN
    depends_on: [F1_one_vocabulary]
    files: [emerge/components/pattern-engine, emerge/components/crystal, emerge/components/rfr2, emerge/components/cfr]
    does: >-
      Emerge's components above the kernel, decoupled (EW_D5): the pattern engine with memory storage (the crystal store) and the learning
      observer (observe/ + RFR2), CFR, from Emergence and the Associative Lattice; scan, pattern, graph, confidence, adversary, test,
      crystallize (EW_D4). Each a registered component reached only through the gate, ported to .eg from its spec with its tests.
    proof: "a statement proven once is reused from its crystal on the next build without a model call; the observer proposes a pattern through the gate"
  F6_the_compound_build:
    status: OPEN
    depends_on: [F5_memory_and_learning, GWK1_the_walker_and_chain_schema]
    files: [emerge/compiler/t2-gate.js, emerge/bench]
    does: "the compound build (EW_D3): automatic chunking, each checked statement fed back to its gate, the next by another agent, crystals reused; measured on Emerge's bench before adopted"
    proof: "bench: statement-gated against whole-node T2, pass rate, tokens and time, both numbers published"
  F7_the_assistant:
    status: OPEN
    depends_on: [F_D3_the_assistant_watches_structure_not_keystrokes, F6_the_compound_build, EW4_the_ide_into_idearium]
    files: [emerge/lang/ide.js, idearium/repo/work-surface.js, lib/phase-dag.js]
    does: >-
      Full assistance as he types, in Emerge's IDE and Idearium's work area: it reads the buffer, the DAG (what this line depends on and
      what depends on it) and exact lines through the work area; helps, debugs (from the checker's gaps and the ledger's why), and teaches
      (nudge, hint, answer). Acts on structural moments, checker first, local model second.
    proof: "typing a statement with an error: the checker's gap shown at once; the assistant's explanation cites the lines and the DAG edge it read"
  F8_the_tutor:
    status: OPEN
    depends_on: [F7_the_assistant, F3_the_door]
    files: [tutor]
    does: "EW_D6: the tutor as its own system on Emerge; one-idea atoms, dynamic decomposition, adapts to age and measured overwhelm, storage by door URLs; Learn Emerge (Emerge repo, claude/emerge-learn) is its first content"
    proof: "a learner stalled on a step gets it split into smaller steps; the split that worked is crystallized and offered next time"

order: >-
  Foundation up. Each line builds only on the lines above it; ids are the real phases in their maps.
  1. F0_the_kernel_spec, F1_one_vocabulary — the five, and every name mapped to them.
  2. DB16_a_registry_for_each_system, DB21_one_registry_schema_every_level — the spine at every level (CIE-EG §5).
  3. F2_the_locked_snapshot — one Emerge, locked; lib/emerge archived.
  4. CS4a_cos_boots_alone, MG15_the_supervisor_in_cos, MG16_the_autopilot_door, MG17_autopilot_hands_over — COS runs the system.
  5. F3_the_door, F4_raid_routes_the_doors — data flows in and out of every system, routed by RAID.
  6. MG18_the_supervisor_screen and the MG screens after it — the UI floats on the doors and the manager (ERAVOS canvas: to confirm).
  7. F5_memory_and_learning, F6_the_compound_build — Emerge learns and builds compounding.
  8. F7_the_assistant, F8_the_tutor — help as he types; learning for everyone.
  The OS (MG_D8 b) and emerge replacing the JS (MG_D8 c) are the end-state this order walks toward, system by system through MG26.

pushback_recorded:
  - "Too many primitives: agreed, measured (CIE-EG, the language, SISO/WARP, 73 node types); his ESS is the reduction (F_D1)."
  - "Copying files into COS repeats the measured drift; locked snapshots instead (F_D2)."
  - "Reading every keystroke is noise and cost; act on structural moments, checker first (F_D3)."
  - "ESS v0.1.0: 28-bit short hashes, hash pins code not behaviour, BIND as root, ungated CONTRACT_UPDATE, replay by ts (architecture-spec addendum (d))."
  - "AES-GCM nonce in CIE-EG §8.3: one key per chain (Learn Emerge, level 6)."
  - "Attribution: SISO and Jaa's architecture are Jonathan Bailey's, as Nexus's own siso.spec says; his work builds on them."

# ── ADDENDUM 2026-10-30 — F_D3 answered; F2 and MG28 (his) ─────────────────────────────────────────────────────────────────────────────
# James, 2026-10-30: "no not every keystroke, only when you need it. or maybe make it a setting, using the contiious event stream."
# F_D3 (his): the assistant acts only when it is needed, on the continuous event stream (the structural moments are events on it); how
# eagerly it acts is a setting. "copy every file you need to a cos/dependancies folder": MG28 (cos-manager map, MG_D9) copies with a lock;
# F2 still switches lib/emerge's callers and archives it, so the two copies of Emerge stay a named gap until F2.

# ── ADDENDUM 2026-10-31 — F2's place for Emerge: the top level, emerge/ (docs/2026-10-31-emerge-as-a-system-phasemap.spec EAS_D1) ─────────
# James, 2026-10-31: "emerge needs either to be a module for idearium, or a system with a server.js, etc. ... needs to be one" · "okay. do it
# as long as it gets up closer to building large projects, like i want to be buyilding an operating systems".
# Emerge is a sovereign system (EAS_D0, by §5.15). F2's switch of lib/emerge's callers and its archive stand; where they switch to changes:
# the one locked snapshot of Emerge sits at Nexus's top level, emerge/, as a system (EAS3, EAS4), not under cos/vendor, so COS does not own
# it (§5.15 rule 2). COS's own locked copies (his MG28, "copy every file you need to a cos/dependancies folder") are unaffected.
# TO CONFIRM with him: if he meant Emerge itself under cos/, EAS3 changes its folder only. F_D2 above is kept as written (§0.3).
