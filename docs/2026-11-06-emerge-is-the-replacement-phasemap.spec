# docs/2026-11-06-emerge-is-the-replacement-phasemap.spec — Emerge replaces JavaScript: .eg only from here; what makes that work.
# The direction and every rule below are James's (quoted); the cut into phases and the readings marked "to confirm" are the coder's.

origin: >-
  James, 2026-11-06, after CIE4 slice a (the world in Emerge, hash for hash): "the moment js is removed from emerge it becomes the replacement.
  focus on that first. no more js, we focus on .eg" · "Crystalization memory for verified primitives. add that to claude.md, to also keep note
  of benchmarks of my framework, nexus, and emerge coding, with the framework, date and time, quotes, and what became from it, method, code,
  speed. also node files for data architecture, anything that can be hotswapped? like using example: callto apis? reference(primitive.eg) like
  for routing different data structures, end points, primitives, etc. making it nonlinear. also need to make as small of a framework or guide for
  llms to understand emerge, so any can use it. tool to reference the atlas for it at anytime if they need more context." · "I want an axiom when
  it's done. No non-emerge code, unless specified in the contract or project. lack of capability is an opportunity to build it."

status: "MAPPED 2026-11-06. The axiom is written (AXIOMS §17.13). Nothing else built by this map yet."

decisions:
  EQ_D0_emerge_only:
    status: "DECIDED 2026-11-06 (his)"
    james: '"no more js, we focus on .eg" · "No non-emerge code, unless specified in the contract or project. lack of capability is an opportunity to build it."'
    chosen: >-
      New code is .eg. Code in another language is written only where a contract or the project names it (a client's project in its own
      language, his "Any language, from specs"; Emerge's own remaining JS while CIE4–CIE12 remove it). A capability Emerge lacks is built into
      Emerge (a Pillar primitive, then natively), not borrowed from JavaScript. First in order: the JavaScript removal from Emerge
      (docs/2026-11-06-cie-eg-build-phasemap.spec), because "the moment js is removed from emerge it becomes the replacement".
    axiom: "AXIOMS-v3.1 §17.13"
    reading_to_confirm: >-
      "I want an axiom when it's done": read as "write the axiom now, as the close of this ask", and it binds new code at once; Emerge's own JS,
      named by the CIE map, is the exception the axiom allows until CIE11 retires it. The other reading: the axiom is written only once Emerge's
      JS is gone. The coder wrote it now; his to confirm.

  EQ_D1_extensions_are_their_owners:
    status: "DECIDED 2026-11-06 by his axioms (§5.9, §5.15, §5.16); the reading of \"database files\" his to confirm"
    james: '"node files, eg files, yaml files, and database files. all new extensions need to be defined in a taxonomy and ledger."'
    chosen: >-
      Each extension is defined by the system that owns its files, in that system's own registry (§5.16), never in one central list in lib/;
      the system registry joins the lists into the one taxonomy he reads. lib/node-schemas (75 schemas, one central folder in lib/) is the
      prior form: its schemas are reused as the definitions, moved to their owners over time, not copied.
    reading_to_confirm: >-
      "database files": read as the files a store keeps (Emerge's stores, MOD-STORE; the .jsonl ledgers; any .sql/.sqlite/.db). The other reading:
      a database's own schema files only. His to confirm.

phases:

  EQ5_every_extension_in_a_taxonomy_and_a_ledger:
    status: OPEN
    depends_on: [EQ_D0_emerge_only, EQ_D1_extensions_are_their_owners]
    spec: emerge/emerge/spec/cie-eg.spec
    files: [emerge/emerge/lang/cie/extensions.eg, emerge/emerge/lang/test/extensions.test.eg, emerge/emerge/extensions.eg]
    requires: [node]
    prerequisites: ["his answer to EQ_D1's reading (where each system's list lives)"]
    does: >-
      His "node files, eg files, yaml files, and database files. all new extensions need to be defined in a taxonomy and ledger": every
      extension is defined once by the system that owns it: its name, what a file of it is, its schema (the node schema where one exists, e.g.
      lib/node-schemas/schema.crystal), who writes and reads it, and whether it is code, data, a node, config or a database. A ledger records each
      extension added, changed or retired, dated, with why. A census in .eg (lang/cie/extensions.eg) reads the tree and names every extension
      with no definition. Measured 2026-11-06 (git ls-files, data/ excluded): 141 extensions, 66 with no node schema, among them .eg (67 files),
      .nex (168), .yaml/.yml, .sql, .jsonl, .ndjson. Emerge's own (.eg, its .node, its stores) are defined first, in emerge/emerge/extensions.eg.
    proof: "the census lists 0 undefined extensions in Emerge's folder; a new extension without a definition fails the census; each definition has its ledger line"

  EQ1_the_crystal_memory:
    status: OPEN
    depends_on: [EQ_D0_emerge_only, PIL2_contracts]
    spec: emerge/emerge/spec/cie-eg.spec
    files: [emerge/emerge/lang/cie/crystal.eg, emerge/emerge/lang/test/crystal.test.eg, lib/component-store.js]
    requires: [node]
    prerequisites: ["the primitive factory's verdicts (CS0 expanded, 0.60.420: verified · failed · untested)"]
    does: >-
      His "Crystalization memory for verified primitives": a primitive that passed its contract's tests is crystallised: its code hash, its
      Pillar contract, the tests and the run that proved it, stored once and reused before anything is written again (WARP's crystallizer, docs/warp.spec,
      is the idea's prior form: an exact cache whose entries are promoted after verification and invalidated on rollback). Written in .eg; the
      store's own file format a Pillar File and a ledger entry per crystal. Reading to confirm: "crystallization memory" as this promotion of
      verified primitives into a reusable, hash-addressed memory.
    proof: "a primitive proved once is reused the second time without a model call; a crystal whose test now fails is demoted, said"

  EQ2_the_benchmark_ledger:
    status: OPEN
    # expanded 2026-11-06, his "remember to take note of metrics while coding in emerge, and expanding emerge while you do": every slice of
    # Emerge work logs its metrics (below), and every gap it finds in Emerge is a phase that builds it into Emerge (§17.13).
    depends_on: [EQ_D0_emerge_only]
    spec: emerge/emerge/spec/cie-eg.spec
    files: [docs/BENCHMARKS.md, emerge/emerge/lang/cie/bench.eg, emerge/emerge/lang/test/bench.test.eg]
    requires: [node]
    prerequisites: []
    does: >-
      His "keep note of benchmarks of my framework, nexus, and emerge coding, with the framework, date and time, quotes, and what became from
      it, method, code, speed": one row per run: what was measured (his framework, Nexus, Emerge coding), date and time, his words, the method,
      the code (commit, file), the speed and the counts, and what came of it. docs/BENCHMARKS.md is the readable record; bench.eg writes and
      reads its rows. Every number names its benchmark (§17.11). Today's first rows: CIE4 slice a (10 ledger entries equal, interpreted and
      native), native.test 94/94, Pillar's PI-01..05.
    proof: "a row written by bench.eg for a real run, read back the same; the doc lists it"

  EQ3_reference_nodes:
    status: OPEN
    depends_on: [EQ_D0_emerge_only, PIL2_contracts]
    spec: emerge/emerge/spec/cie-eg.spec
    files: [emerge/emerge/lang/cie/reference.eg, emerge/emerge/lang/test/reference.test.eg]
    requires: [node]
    prerequisites: ["his answer to the readings below"]
    does: >-
      His "node files for data architecture, anything that can be hotswapped? ... callto apis? reference(primitive.eg) like for routing different
      data structures, end points, primitives, etc. making it nonlinear": a reference names what it points at (a primitive, an endpoint, a data
      structure, a callto) instead of importing it; a router resolves it at run time, so the target can be swapped without changing the caller.
    readings_to_confirm:
      - "reference(primitive.eg) as a language form (a reference resolved by the router at run time), or as a node file kind (<id>.reference) that names its target"
      - "\"callto apis\": Clear Glass's callto index (elements a macro calls by name) generalised to any API, or the callto he means elsewhere"
      - "\"nonlinear\": routing by what a caller needs (its contract) rather than by a fixed import path"
    proof: "the same caller runs against two targets swapped by changing one reference, with no change to the caller"

  EQ4_the_emerge_guide_for_any_llm:
    status: OPEN
    depends_on: [EQ_D0_emerge_only]
    spec: emerge/emerge/spec/cie-eg.spec
    files: [emerge/emerge/GUIDE.eg.md, emerge/emerge/lang/cie/atlas.eg, docs/atlases/emerge-atlas.md, idearium/lib/emerge-rung.cjs]
    requires: [node]
    prerequisites: []
    does: >-
      His "as small of a framework or guide for llms to understand emerge, so any can use it. tool to reference the atlas for it at anytime if they
      need more context": a guide small enough to sit in any model's prompt (the syntax, the traps found by running it: parameters are read-only,
      newlines inside a map literal, keywords that cannot be names, no if-expression, `not`/`or`), checked against the language by running every
      example in it; and an atlas tool written in .eg (eg run lang/cie/atlas.eg <topic>) that answers a topic from MAP.md, the spec and the
      examples, for a model that needs more. The Emerge rung's CARD (idearium/lib/emerge-rung.cjs, 0.60.421) is the first draft; it moves to read
      the guide, so there is one.
    proof: "every example in the guide passes eg check; a model given only the guide writes a program that passes eg check; the atlas tool answers a topic"

# ── ADDENDUM 2026-11-06 (0.60.429) — EQ2 expanded (metrics while coding in Emerge); EQ5 and EQ_D1 written (every extension defined) ──
# James, 2026-11-06: "remember to take note of metrics while coding in emerge, and expanding emerge while you do."
# James, 2026-11-06: "node files, eg files, yaml files, and database files. all new extensions need to be defined in a taxonomy and ledger."
# EQ2 now also asks, per slice of Emerge work: wall time of each run, .eg lines added, JS lines removed (Emerge's total before and after),
# tests and their counts, the failed runs before the pass and what each taught, and each gap in Emerge found, with the phase that builds it.
# EQ5: the extension taxonomy and its ledger. The ledger's covers named only shared files (no phase covers the intent; OC7 types COS's
# orchestration nodes, a part of it).
