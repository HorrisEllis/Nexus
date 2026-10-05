# 0.39.328 — 2026-10-05

_Released on branch claude/nexus-idearium-overview-yoguem as 0.39.308; main used 0.39.308–0.39.327 for other work meanwhile, so it is renumbered 0.39.328 on merging main. Comments in the code that say §0.39.308 refer to this release._

James: "Should be more than that. Like using the traversal of chunks, primitives, like the relationship between words when generating code. The boundaries. Learning to code from that"
James: "And the agents use it for context right?"
James: "Yes. We need the agents to use it. Also what about the .node types. Also combining primitives or invariants to build higher leverage code for less tokens."

## What was found
The Agent tab's agent was given glyphs, registry cards, the atlas and its memory. The agent that **builds** a file was given the spec digest and the export lines of finished files — nothing else. `lib/relational-context.js` had no caller at all. And the file prompt pasted the **first 12 lower-layer files in full** (up to 24,000 characters), in manifest order; a 13th file was never seen.

## What a build agent is told now
Every file chunk carries a **build context** (`lib/build-context.js`): deterministic, no model, one budget (3,600 characters), each part labelled.

- **BUILDS ON** — the files it depends on, through every layer: path, purpose, exports, glyph. Their interface, never their code.
- **USED BY** — the files that will depend on it, so it exports what they need.
- **RELATIONS** — when the file already exists (a repair, a rebuild, Nexus rebuilding itself): its registry card. Requires, one level further up, required by, the events it emits and who hears them, its tests. Loom's wires for Nexus, the repo's `graph.json` otherwise.
- **PROVEN PRIMITIVES** — components built and kept in **other** projects that do this kind of work: interface and glyph only, never their bytes, never a version that failed verification. This changes C-D6's default ("near matches are found, not injected") for build prompts, because a build agent has no find tool to look them up with. `BUILD_CONTEXT_STORED=0` turns it off.
- **INVARIANTS** — the spec's own MUST / NEVER / ALWAYS sentences that name the file's subject.

What did not fit the budget is listed, never dropped silently. It rides beside the prompt (the memory channel), so WARP's cache key is still the file's contract.

## Fewer tokens, more seen
The file prompt now sends the **3 files this one is most about in full** (the ones its path or purpose names come first) and **every other lower file by its interface**.

Measured on 14 real Nexus `lib/` files feeding one new engine file:

| | Before | After |
|---|---|---|
| Prompt size | 25.7K chars | 18.3K chars (−29%) |
| Files in full | 7 (each cut at 4K) | 3 |
| Files seen at all | 7 of 14 | 14 of 14 |

`IDEARIUM_FILE_PROMPT_FULL_FILES` sets how many go in full (default 3).

Also fixed: exports written as method shorthand (`module.exports = { play() { … } }`) were read as no exports at all.

## Proof
- `test-build-context` passes **11/11**.
- `test-prove-loop` passes **7/7** against the real server and a model. New PL-07: `lib/sum.js` is told the test will use it, and the test's prompt carries `lib/sum.js` in full, first.
- `version-sync-and-registry` 30/30, `test-agent-memory` 9/9, `test-registry-harness` 7/7, `test-component-store` 8/8, `test-pipeline-routing` 19/19, `test-build-from-the-spec` 5/5.
- `test-build-verify` BV-09 fails, and fails identically on 0.39.307 without this change.

## Not done
- **`.node` types.** The build context is not recorded as a node. `.injection` exists for exactly this ("what was prepended to a dispatch and why"), but its schema is copilot's call-model shape. A build-context record needs either a widened schema or its own type — James's call.
- Recipes and crystallisation (MR7/MR8), the containment tree and `contextFor(node, budget)` (FG1–FG5): still mapped, not built.
