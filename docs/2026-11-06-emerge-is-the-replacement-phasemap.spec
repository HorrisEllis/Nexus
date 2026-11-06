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

phases:

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
