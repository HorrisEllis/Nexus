spec:
  meta:
    name:     build-context
    version:  1.1.0
    date:     2026-10-05
    release:  0.39.308 (1.0.0) → 0.39.309 (1.1.0)
    uuid:     nexus-lib-build-context-spec-v1-0000-2026-1005-jamesbrooks-001
    owner:    idearium.api (the build dispatch) · lib (the pack) · lib/repo-prompt-blocks (what is sent)
    files:    [lib/build-context.js, lib/repo-prompt-blocks.js (the build blocks), idearium/api/index.js (speceng.build),
               idearium/spec-engine/index.js (_buildFilePrompt), loom/maps/build-context-map.js, scripts/bench-file-prompt.js]
    status:   built — proven by tests/modules/test-build-context.test.js and tests/modules/test-prove-loop.test.js (PL-07)
    phasemap: docs/2026-10-05-build-from-the-spec-phasemap.spec (BC1, BC2)
    origin: >
      James, 2026-10-05: "Should be more than that. Like using the traversal of chunks, primitives, like the
      relationship between words when generating code. The boundaries. Learning to code from that" · "And the agents
      use it for context right?" · "Yes. We need the agents to use it. Also what about the .node types. Also combining
      primitives or invariants to build higher leverage code for less tokens." · "They need context. All of it. From
      the hat/repo"

  purpose: >-
    The agent that BUILDS a file knows what the Agent tab's agent knows: the repo's hat and everything the repo and
    NEXUS hold that bears on the file — and it knows it through the repo's own prompt blocks, so nothing reaches the
    prompt that James cannot edit in Settings → Agents (his 0.39.258 rule).

  contract:
    pack: >-
      lib/build-context.js pack({ manifest, chunk, repo, repoDir, budget, stored, buildsOn }) -> { text, chars,
      sections, sources, left }. Deterministic: no model, no network. One budget (BUILD_CONTEXT_BUDGET_CHARS, default
      3600). Sections, each labelled: BUILDS ON (dependencies through every layer: path, layer, purpose, exports,
      glyph — never code; off when the caller's prompt carries the files below), RELATIONS (the file's registry card
      when it exists — requires, one level further up, required by, events and who hears them, tests — from
      lib/registry-harness.js: loom's wires for Nexus, graph.json for a repo), USED BY (every file that stands on it,
      through every layer), PROVEN PRIMITIVES (other projects' stored components of the same file type that share its
      subject: id, purpose, exports, glyph — never bytes, never a version marked failed, never its own project;
      BUILD_CONTEXT_STORED=0 or stored:false turns it off), INVARIANTS (the spec description's sentences carrying
      MUST/NEVER/ALWAYS/SHALL/ONLY… that share a word with the file's subject). What did not fit is in `left` and said
      in the text. A section that fails is named in `sources`; pack never throws.
    file_prompt: >-
      spec-engine _buildFilePrompt: the files below this one's layer, ranked by rankFiles (a file whose base name its
      path or purpose names first, then shared words); the first IDEARIUM_FILE_PROMPT_FULL_FILES (default 3) in full
      (≤ 4000 chars each, ≤ 12000 in all), EVERY other one by interfaceOf (path, layer, purpose, exports, glyph), up to
      6000 chars of interfaces, then bare paths — none dropped.
    blocks: >-
      lib/repo-prompt-blocks.js build blocks, `when: 'build'`, ON by default (a build agent has no tool loop to fetch
      context with — the reason 0.39.279 turned the chat blocks off does not hold here): build-memory {memory},
      build-context {build} (the file's registry card is its RELATIONS section — no second card block),
      build-atlas {atlas}, build-code {code}. renderBuild(blocks, data) ->
      { text, used }: only enabled build blocks, a block whose data is empty sends nothing, each exactly as edited.
      The hat is worn as before (agent-suite wearHat: its persona — atlas facts + learned observations, corrections
      first).
    dispatch: >-
      idearium/api speceng.build, for a chunk with a realPath: the repo's blocks (getBlocks — the original's for a
      linked code repo) → the data for each ENABLED build block only (a block switched off costs no search) →
      renderBuild → the memory channel, beside the prompt (WARP's cache key stays the contract). The response's
      `memory.buildContext` and the chunk.complete event's `buildContext` say what was sent ({ chars, used, sections }).
      A source that fails is warned once with its reason (§1.2) and the rest still go.

  invariants:
    - "nothing the build agent is sent is outside an editable block (James, 0.39.258)"
    - "never a stored component's bytes, never a failed version (C-D6, §17.10)"
    - "the pack is deterministic: the same manifest and chunk give the same text"
    - "never over its budget without saying what was left"

  failure_modes:
    - "no repo for the spec → the defaults' blocks; RELATIONS and build-code say there is no repo on disk"
    - "graph.json missing or corrupt → RELATIONS names the reason; the rest are sent"
    - "component store index unreadable → PRIMITIVES names the reason; the rest are sent"
    - "a dependsOn cycle → the closure stops at the first repeat"

  decisions:
    C-D6_for_build_prompts: >-
      Was (docs/2026-09-27-components-store-and-atlases-phasemap.spec C-D6, default): near matches are found by a
      model with loom.find.tool, never injected. Alternatives weighed: (a) keep it — a build agent has no find tool, so
      it would never see them; (b) inject the stored file — rejected: bytes from another project are not this file's
      contract, and §17.10; (c) the interface and glyph only. 0.39.308 chose (c) without his yes (drift, BC1). James,
      2026-10-05: "They need context. All of it. From the hat/repo" — (c), editable and switchable as the
      build-context block. Chat agents keep C-D6 as it was.

  addenda:
    - "2026-10-05 1.0.0 (0.39.308): built before it was mapped — see BC1's drift."
    - "2026-10-05 1.1.0 (0.39.309): everything goes through the editable build blocks; all of the hat/repo context."
