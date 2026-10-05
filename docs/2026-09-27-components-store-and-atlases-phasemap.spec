spec:
  meta:
    name:     components-store-and-atlases
    version:  1.0.0
    date:     2026-09-27
    release:  0.39.266 (part 3)
    owner:    lib.component-store · idearium.spec-engine.warp-build-dispatch · idearium.api · lib.atlas-generate · docs.atlases
    status:   in progress — C1, C2, C3, C4, A1 built · A2, A3 not yet
    origin: >
      James (2026-09-27): "every atlas should be expanded. also warp is the build logic. supposed to reuse
      components. i wanted a components store for all components build in folders with their dependancies.
      look at codeforge or architect".
      Answers: store scope "Everything WARP builds" · deps "Reference by id + version" · location "A nested
      repo in Idearium" · atlases "Narrative + generated sections".
    supersedes_plan: LM14 in docs/2026-09-01-living-model-and-autonomous-pipeline-phasemap.spec and C3 in
      docs/2026-09-02-nexus-vision-master-phasemap.spec (both planned the store; neither built it).

  # ── Measured, not recalled ──────────────────────────────────────────────────────────────────────────
  exists:
    - WARP's only persistence for idearium builds is idearium/data/warp-crystals.json (FlatFileCrystallizer),
      keyed by a sha256 of the WHOLE prompt. The prompt embeds the spec name, so the same file built for a
      second project never hits. Population is in memory (PopulationStore maxPerClass 8) and lost on restart.
    - warp-cascade.js ignores population.seed: cascade({seed, event}) → runCascade({event}). A seed never reaches
      the model; "seed from near matches" through WARP is not a thing that exists today.
    - idearium/api speceng.build already reuses a prior DOCUMENT section (findPriorSection: sectionId +
      sectionDesc) before dispatch. Nothing does that for a FILE chunk (realPath set).
    - The file chunks WARP builds end as `<nn>-<section>-<uuid8>.<ext>` inside one spec directory, with no
      record of what they require. Purging the spec (D2 of the harness phasemap) deletes them.
    - architect/data/nodes/component/*.component: id · namespace · name · version 1.0.0 — the manifest shape
      this store follows. There is no codeforge directory, file or reference in the tree (searched).
    - docs/atlases: 15 atlases, 414–5,353 words. diagnostic-atlas.md says the :7825 kernel may not exist; it does
      (diagnostic/nexus-diagnostic.js, 3,075 lines across 3 files). Several system atlases carry references to
      files no longer in the tree (tests/modules/test-nexus-atlas-refs reports them).
    - idearium/repo/nexus-self.js resolveWith() reads at most 2,000 references per request.

  decisions:
    C-D1 (James): the store holds everything WARP builds — every file chunk that completes through the build path.
    C-D2 (James): each dependency is its own component; component.json pins { id: version }.
    C-D3 (James): the store is a nested repo in Idearium — root folder components/, nexus-self system "components".
    C-D4 (James): atlases = hand narrative + sections generated from the registry between markers.
    C-D5 (default): component id = <project>.<dotted path without extension> (loom's idFor rule, project for "nexus").
        version = 1.0.<n>; the same bytes again never make a new version.
    C-D6 (default): reuse is exact, never guessed — (a) the same contract (file name + what the chunk is asked to
        do) or (b) the same prompt returns the stored bytes at zero cost. Near matches are FOUND, not injected:
        loom.find.tool kind "stored" lists them and loom.read.tool reads "store:<id>@<version>" (harness rule I1).
    C-D7 (default): imports and nexus syncs are not builds — they never write to the store.

  invariants:
    CI1: a completed WARP file chunk is in the store before its spec can be purged.
    CI2: every dependency a stored component names by relative path is pinned to an id + version, or listed as
         unresolved with the path it asked for — never dropped.
    CI3: the store is never scanned into loom's registry (it is built output, not Nexus source).
    CI4: a generated atlas section is rewritten only between its markers; the narrative is never touched by it.
    CI5: every path a generated section names is a real file (the atlas refs test resolves them).

  phases:
    - id: C1
      status: built
      name: the store — components/<id>/<version>/{file, component.json}, components/index.json
      files: [lib/component-store.js]
    - id: C2
      status: built
      name: WARP writes and reuses — store on completion (sync + callback paths); reuse before dispatch;
            the WARP exact cache answers from the store too (a crystal survives a purged spec)
      files: [idearium/api/index.js]   # warp-build-dispatch.js unchanged: the store is asked by contract and by prompt in the build path
      depends_on: [C1]
    - id: C3
      status: built
      name: nested repo — nexus-self system "components"; loom skips components/; test sandbox gets its own store
      files: [lib/nexus-self/systems.js, loom/scanners/source-map.js, lib/test-sandbox.js]
    - id: C4
      status: built
      name: the store through the harness — find kind "stored", read store:<id>@<version>
      files: [lib/registry-harness.js, lib/agent-tools/tools/loom/harness.js, idearium/api/index.js]
    - id: A1
      status: built
      name: atlas generator — per system, per directory, per file: purpose, exports, requires / required by,
            events out and in, routes, covering tests; writes between <!-- generated:registry --> markers
      files: [lib/atlas-generate.js, scripts/generate-atlases.js]
    - id: A2
      status: not started
      name: every atlas expanded; diagnostic narrative rewritten from its source; components atlas added;
            nexus atlas gains ### components
      files: [docs/atlases/*.md]
    - id: A3
      status: not started
      name: the resolver reads every reference an expanded atlas carries (cap 2,000 → 8,000)
      files: [idearium/repo/nexus-self.js]

  open_items:
    - WARP's population seed is still dropped by warp-cascade (see exists). Giving a model a near match should stay
      a tool call (C-D6), so this is recorded, not changed.
    - >-
      ADDENDUM 2026-10-05 (0.39.308–309) — C-D6 for BUILD prompts. 0.39.308 injected near matches' interfaces into a
      file build's context without James's yes (drift: docs/2026-10-05-build-from-the-spec-phasemap.spec BC1). James,
      2026-10-05: "They need context. All of it. From the hat/repo." Settled: a file build is given other projects'
      stored components that share its subject — interface and glyph only, never bytes, never a version marked failed
      (§17.10) — through the editable build-context block (lib/repo-prompt-blocks.js); a build agent has no tool loop to
      find them with. Chat agents keep C-D6 unchanged (found with loom.find.tool kind "stored"). Alternatives and
      rejections: docs/build-context.spec decisions.C-D6_for_build_prompts.
    - Existing warp-crystals.json entries are not back-filled into the store: they carry no file path.
    - Atlases regenerate when scripts/generate-atlases.js runs (and after a loom bootstrap); not on every sync.
