spec:
  meta:
    name:     gating-census
    version:  1.0.0
    date:     2026-10-18
    release:  "0.60.155"
    uuid:     nexus-gating-census-phasemap-v1-0000-2026-1018-jamesbrooks-001
    owner:    "lib (the census, the order) · every map it reads keeps its own phases; this map orders them and owns none of them"
    voice: >-
      The ideas, the direction and the calls are James's. `james:` is his, verbatim. Readings are the coder's, marked to confirm.
    origin: >-
      James, 2026-10-18: "okay lets finish the gating, or next steps. look at all of the phases that mention gates." · then,
      while it was being read: "need to get them done bottom up. really need it all working."
    axioms: "§3.3 map before build, §3.1 bottom-up, §8.6 reuse before build, §0.1 evidence over memory, §0.3 nothing lost, §10.3 one truth; docs/CLAUDE.md: decide by the axioms, bring problems to him"
    how_it_was_read: >-
      loom/scanners/phasemap-map.js loadAll: 75 phases not done whose text names a gate, across 20 maps. Each one was then
      checked against the source (its files, its proof, the CHANGELOGs naming it), not against its status line, because the
      status lines were found stale.

  # ── What the census found ────────────────────────────────────────────────────
  found:
    the_record_lied:
      - "loom's phasemap scanner never read the status of a phase written inline (`PE3: {status: BUILT-0.60.75, …}`): 6 built phases (PE1–PE4, MB1, MB5) read pending. Fixed 0.60.155 (loom/scanners/phasemap-map.js, test PM-INLINE)."
      - "Stale statuses, corrected in their own maps with the old text kept: AM6 BUILT (contract-intake §AM6-CLOSED); RQ24 FOLDED into GT1 + GS1; CX0 SUPERSEDED by CX1; PF0 FOLDED into ID1."
      - "Same id, different phase: CHANGELOG hits for RD0/RD1 (0.60.36/37), CS1 (0.60.49), CT2 (0.39.348) and SF2–SF4 (0.60.66/67) are other maps' phases with the same id. Those phases here are NOT built. An id is unique only inside its map; a reader must carry the map with the id."
    one_thing_mapped_many_times:
      the_gate_record: "GM1 (.gate record) = GW3's open half (ids and hashes on every row) = GW27 (.input/.response/.output) = TL2/TL3 (resume, the timeline). The substrate is built: lib/work-journal.js (the contract ledger), lib/gate-context.js, contract-gates.js checkpoints. Built once, as GM1 over the contract ledger (gate-memory merge addendum)."
      the_rewind: "TL4 (one user-driven rewind) = GW7's rewind = CV3 'undo this run' = DBG5 = DP7. The automatic rewind on a fail is built (GS1, contract-gates.js:679). Built once, as TL4; the others point at it."
      the_precommit_gate: "V9 = S3 = B4 = RF2's staged → tested → promoted. About half built: lib/code-edit.js promoteTested + GT2's commit tags. One gate, in promoteTested."
      the_context: "GM5 (the context stream, addendum b) = GW24 (the gate holds, the agent gets a projection; PARTLY 0.60.76) = CX1 = GA1 = B3. Built once, as GM5; GW24's budget becomes the stream's cut."
      the_listener: "SF4 (one spec ledger) = GW10 (the listener) = GM5's StreamLog. GW10 waits on GW0d (his log)."
    decided_by_his_axioms: "D15–D23 (docs/2026-10-17-decisions-by-the-axioms.spec addendum c): GW0b, GW0c, GW0e, GW0f, GW0g, GW0h, GW0i, TL0a, TL0b — each had a recommendation waiting on a yes, each technical. Their phases are no longer blocked on him."
    still_his:
      - "GM0a — what 'the precommit compartment' is (his words). Blocks GM1, and through it GM2, GM3, GM6, GM7, GM8."
      - "GW0d — the listener 'cant detect any specs': needs his failing log. Blocks GW10."
      - "D10 vs D13 — how a chunk is named and kept (two contracts, kept)."
      - "His live runs: EX0's Ollama run, P4's claude.ai round trip, QA2."

  # ── The order, bottom up ─────────────────────────────────────────────────────
  # A layer needs only what is under it. Inside a layer, pieces in any order (his "non linear", 0.60.154).
  layers:
    L0_the_record_tells_the_truth:  "DONE 0.60.155 — the scanner fix, the stale statuses, the id-collision finding, D15–D23."
    L1_primitives_no_decision:
      - "GM5 the context stream — DONE 0.60.156: lib/context-stream.js + lib/context-sources.js on siso/ (gate-memory addendum b), wired into every gate"
      - "GM4 the node lattice — DONE 0.60.157: intelligence/lattice/node-lattice.js; and node indexes for the five systems the route says have 'no database yet' (cortex, diagnostic, idearium, orchestrator, sentinel)"
      - "DONE 0.60.157: LM0 loom wires with stable ids — ids from their endpoints (loom/scanners/source-map.js:301 still numbers them)"
      - "GW5 tool parity — the capability-diff test and the gate rows (run.status, gate.packet, contract.trace) in route-commands"
      - "QA1 the catalogue runs — the runners for CK-231, 234–246, 249–252"
      - "RD0/RD1 RAID's own contract and commands — /api/raid/status in the interaction contract, HEAL_REQUESTED in the taxonomy, raid status/queue/decide rows"
    L2_one_of_each:
      - "TL3 the timeline (unit decided D22) → TL4 the one rewind (scope D23) → TL5 the code tab timeline; GW7's macro, DBG5 and DP7 point at TL4"
      - "the one precommit gate in promoteTested (V9/S3/B4/RF2)"
      - "GW13 the sandbox door (egress D17) → GW14 copy in, diff out → GW11 a snapshot per gate, GW15 every file tested (D18), GW16 parallel (D19), GW22 find before generate (D21)"
      - "GW2's remainder (fresh chat D15), GW12 (D20)"
    L3_needs_GM0a:
      - "GM1 the gate record → GM2 restarts, GM3 the fulfilled index (+ PC8 approval) → GM6 crystals (+ FMR10), GM7 the panel, GM8 the commands"
    L4_above:
      - "GW4 copilot on the gates, GW6 intelligence on every gate, GW8 causal field, GW9 the contract panel, GW17 friction per file, GW18 bisect, GW25 the systems at the gate moments, GW26 everything declares what it needs, SF2–SF4, KT1, AU1, CS1, PL/RF/WF phases"

  phases:
    GC0_the_census:
      status: "DONE 0.60.155"
      files: [loom/scanners/phasemap-map.js, tests/modules/test-loom-phasemap.js, docs/2026-10-18-gating-census-phasemap.spec]
      does: "The census above, and the record corrected so the Phases tab and loom stop reporting built work as pending."
    GC1_layer_one:
      status: OPEN
      depends_on: [GC0_the_census]
      files: [lib/context-stream.js, lib/context-sources.js, intelligence/lattice/node-lattice.js, loom/scanners/source-map.js, idearium/cli/route-commands.js, lib/check-catalogue.js]
      does: "L1, piece by piece, each its own release with its test; order inside the layer is free."

  # ── ADDENDUM 2026-10-18 (a) — 0.60.156: GM5 built; a regression of the coder's found and fixed on the way ─────────────
  # GM5 (layer 1) is built and wired: every gate's attempt now carries what the context stream found. Running the boundary test
  # for it found SB-06 red on main: lib/readme-generate.js (0.60.153, the coder's) required loom/scanners/phasemap-map.js, a lib →
  # loom crossing. Fixed by handing the phases in from scripts/generate-atlases.js (no system); test-system-boundary 10/10 (SB-08,
  # also red on main, passes with it).
  # ── ADDENDUM 2026-10-18 (b) — 0.60.157: GM4 and LM0 built; the three red-on-main tests green ──────────────────────────
  # GM4: intelligence/lattice/node-lattice.js (1,491 nodes, 14 systems, typed edges). LM0: stable wire ids and an idempotent
  # bootstrap. BP-01 (the coder's TF2 outside WARP), PB-05 (a fixture counted as code) and LM-07 (a stale pin) fixed at their
  # causes. Left in layer 1: GW5 (it waits on GW1's remainder, so it moves to layer 2), QA1, RD0/RD1.
