# docs/2026-11-21-the-decomposer-phasemap.spec — any project decomposed the way Emerge builds: one component a file, one syntax a file, each wired
# to its system's drawbridge and described in CIE-EG
# author: james-brooks (the direction and the calls are his; the map is the coder's, to his words)
origin: >-
  James, 2026-11-21: "Like I'm talking the way emerge does. Like each component its own file. HTML elements per component. All syntax its own
  files. Then all wired into the drawbridge and hooked into cie-eg in emerge code. That way we can use it to refactor, decompose components, wire
  them to the component registry for any projects. That way we can fix nexus' architecture, and build new systems with architectural
  consistency. Decouple. Think of how stable, and high leverage." · "Iderium ... since that keeps crashing, since it's fucking, it's become a
  monolith ... that'll help, and then that shouldn't crash anymore, because it'll be broken down, there won't be any more bottlenecks, and then
  we'll also have a tool for future projects to do the same if the architecture ... starts to slip, or ... any new systems imported to the code
  base." · "let's just get this done." Earlier the same day, on importing: the chunking "was supposed to refactor and decompose the projects,
  components" (his reading 1: an import decomposes, not only indexes). The law it rests on, amended the same day: AXIOMS §5.13 ("HTML is
  structure, CSS is presentation, Emerge is behaviour") and §10.4 (a node type registered before it is stored).
measured: >-
  2026-11-21: idearium/api/index.js is one ES-module file of 12,329 lines (940 KB, 518 routes, 431 handlers); every real build in it took
  Idearium's heap to ~93% and it went down. lib/project-split.js (FA4) refuses it: "an ES module or TypeScript file — the split keeps CommonJS
  semantics only". lib/project-decompose.js (CS0) makes one component per code FILE, so a monolith imports as one component.
covers: >-
  Expands, does not rewrite: CS0_projects_decomposed_into_components (decompose), FA4 (split, one component a file), the Finish tool (project-spine,
  project-convert: wired to the spine), AD1 (every tool through its language's adapter), CIE4 (Emerge's native components). Serves DB1–DB7 (the
  pipeline's components to Pillar; the build to COS): the decomposed pipeline backend is DB5's module.

decisions:
  DC_D1_rearrange_never_rewrite_blind:
    status: "DECIDED 2026-11-21 by his axioms"
    chosen: >-
      The decomposer only re-arranges what exists: each piece moved to its own file, the old path kept as the door (FA4), checked by the project's own
      tests and, for Emerge, its compiler (verify) before the next piece moves. Porting a component's behaviour to Emerge (§5.13) is a later step per
      component, a small gap the ladder can fill, never part of the split.
    axioms: "§0.3, §1.2, §5.13, §5.15, §5.16, §8.4, §16.5, §17.13"
  DC_D2_the_output_is_genesis_shaped:
    status: "DECIDED 2026-11-21 (his)"
    james: '"Okay but emerge doesn''t have es modules, and neither does the rest of nexus. Like a reflection of genesis.spec."'
    context: >-
      Said after DC1 slice a (0.60.629) taught the split to write ES-module pieces, and its preview of Idearium's server held 194 of 232 units in
      the door through _require (createRequire(import.meta.url)). Idearium is the one ES-module package in Nexus; Emerge and every other system are
      CommonJS, shaped as idearium/spec-engine/templates/genesis.spec describes a system (config → server.js → the registry → components → UI).
    chosen: >-
      The decomposer reads any project (ES modules included: slice a's adapter stays), and what it writes into Nexus is genesis-shaped: CommonJS
      pieces like the rest of Nexus, the system's server.js the origin, each component on its registry (the drawbridge), described in CIE-EG. An ES
      module entering Nexus is converted to CommonJS, not kept as one; slice a's ES-module output is kept only for projects outside Nexus that stay
      ES modules. Idearium is decomposed into a genesis-shaped system, not split as an ES module (its _require root goes away: every piece has require).
    changes: "DC1 slice b becomes ES module → CommonJS conversion (import → require, export → module.exports, import.meta.url → __filename); DC4 targets genesis.spec's shape"

phases:
  DC1_the_split_speaks_es_modules:
    status: OPEN
    depends_on: []
    files: [lib/project-split.js, lib/adapters/javascript.js, tests/modules/test-project-split.test.js]
    does: >-
      FA4 expanded: an ES-module file splits like a CommonJS one: each component (a banner section, else a top-level declaration) its own file with
      import/export, the old file kept as the door re-exporting what it held, every new file wired into the spine; verify runs the project's tests.
    proof: "an ES-module fixture with three sections split into three files plus the door; its tests pass before and after"
  DC2_decompose_inside_files:
    status: OPEN
    depends_on: [DC1_the_split_speaks_es_modules]
    files: [lib/project-decompose.js, lib/component-store.js, lib/adapters/contract.js]
    does: >-
      CS0 expanded: on import, each file read through its language's adapter (units, symbols, dependencies): each unit a component in the store with
      its dependencies, not one per file; HTML, CSS and behaviour kept as separate components of one element (§5.13).
    proof: "a monolith fixture imports as its units, each with its dependencies; a page imports as structure, presentation and behaviour"
  DC3_wired_to_the_drawbridge_in_cie_eg:
    status: OPEN
    depends_on: [DC2_decompose_inside_files]
    files: [lib/project-spine.js, lib/project-convert.js, emerge/emerge/lang/cie/self.eg]
    does: >-
      Each decomposed component entered in its own system's component registry (the drawbridge: registry, event bus, interaction contract, §5.16)
      and described as an Emerge component (CIE-EG: its contract, takes, gives, events), each new node type registered in the taxonomy first (§10.4).
    proof: "a decomposed fixture's components listed by its system's registry, each with a CIE-EG description Emerge's checker accepts"
  DC4_idearium_decomposed:
    status: OPEN
    depends_on: [DC3_wired_to_the_drawbridge_in_cie_eg]
    files: [idearium/api/index.js]
    does: >-
      The decomposer run on Idearium's server, slice by slice, each verified before the next: first the pipeline backend (_phaseBuild through the
      watchdog, 1,261 lines: DB5's module), then the route groups. Idearium never stops answering.
    proof: "idearium/api/index.js a door of imports; Idearium's heap during a build measured before and after; its tests pass at every slice"
  DC5_the_multitool:
    status: OPEN
    depends_on: [DC3_wired_to_the_drawbridge_in_cie_eg]
    files: [cos/automation/method.eg, docs/innovation-toolkit.framework]
    james: >-
      "I was thinking of an agent tool called multitool. Like using my framework as tool tips for the framework ... the tool would be the registry
      for the edge cases that the tips can use ... my framework is a bunch of tools, right, for problem solving, ambiguity, complexity, strategy"
      (2026-11-21)
    does: >-
      His framework as an agent tool: each section a tool; a registry of edge cases (ambiguity, complexity, strategy, a stuck gap, …) naming which
      tool fits, each with its tips in his words; an agent or a gate asks "I face X" and gets the section and its tips (method.eg resolves the text).
      The coder's reading, to confirm with him.
    proof: "a stuck gap asks the multitool and gets the section and tips its edge case names"
build_order: [DC1, DC2, DC3, DC4, DC5]
first_slice: "DC1: the split speaks ES modules (Idearium's server is one), proven on a fixture before it touches Idearium."
