# 0.39.309 — 2026-10-05

James: "Parse rhe axioms in the docs folder. Do not deviate They are law"
James: "They need context. All of it. From the hat/repo"

## The agent that builds a file gets all of it
A file build now gets every context source the Agent tab's agent has:

- **The hat.** It wears the repo's `persona` block exactly as edited in Settings → Agents. `{persona}` is filled with the hat's generated persona: facts from the atlas, plus what the agent has learned, corrections first. If the block is off, no persona is sent. Plans wear it too.
- **build-memory.** Its own past work (the download manager) and this project's files beside it.
- **build-context.** The file's relations (`lib/build-context.js`): its registry card, who will use it, proven primitives from other projects (interface only), and the spec's invariants.
- **build-atlas.** Everything else NEXUS remembers that matches the file.
- **build-code.** This repo's own code that matches the file.

These are four new **prompt blocks** (`when: build`), **on by default**, editable and switchable in Settings → Agents like every other block. They're on because a build agent has no tool loop to fetch context with. Nothing reaches the prompt that James can't edit (his 0.39.258 rule). A block switched off costs no search. A source that fails is warned, with its reason, and the rest are still sent.

## The axioms, applied to 0.39.308
0.39.308 was audited against `docs/AXIOMS-v3.1.md` and `docs/CLAUDE.md`. Every deviation is now closed:

| Law | 0.39.308 | Now |
|---|---|---|
| §3.3, rule 1: map before build | built with no map | build-from-the-spec phasemap 1.2.0: BC1 with its drift recorded, BC2 |
| §8.5, §6.3: a spec, registered | none | `docs/build-context.spec`, in `SPEC-REGISTRY.spec` |
| rule 3, §5.1: registry with wires, UUID | not in loom, no UUID | `loom/maps/build-context-map.js`, registry regenerated, UUID |
| rule 4, §12.5: addenda | version line only | `idearium.spec`; the component-store phasemap (C-D6) |
| E14: the event contract | `buildContext` undeclared | declared in `event-taxonomy.cjs` |
| Leverage Principles, §16.6 | C-D6 changed without his yes | settled in his words; decision record with alternatives in the spec |
| §17.11: the benchmark | a scratch script | `scripts/bench-file-prompt.js`, sandboxed |
| §12.1, test sandbox | no hostile inputs, no sandbox | both |
| §1.2: nothing silently fails | a failed pack was recorded, not said | warned |
| test isolation | a benchmark run wrote a spec into `data/cortex` | moved out (kept, not deleted); the script now arms the sandbox |

## The loom registry
Regenerated from scratch, as `loom/bootstrap.js` says. Regenerating the base alone rewrites about 23,700 lines, so the committed registry was already stale.

Compared with the base's regeneration, **every base wire is kept and 9 are added**. One of them is agent-memory's `setChunkAgent → agent-providers` wire into `idearium/spec-engine`, which had been rejected since 0.39.269 because spec-engine had no import hook. It's declared now.

Bootstrap still exits 1 with about 460 pre-existing rejections. The rejection counter reads one higher (461), from a first attempt the deferred pass resolves: the final registry carries that wire.

## The benchmark
`node scripts/bench-file-prompt.js` runs spec-engine `buildChunkPrompt` over a file-tree spec whose kernel layer is 14 real `lib/` files. Tokens are estimated at chars/4; no tokenizer is bundled.

| | 0.39.307 | 0.39.309 |
|---|---|---|
| Prompt | 25,741 chars (≈6,436 tokens) | 18,281 chars (≈4,571 tokens) |
| Files seen | 7 of 14 | 14 of 14 |
| In full | 7, each cut at 4,000 chars | 3: the two the file's purpose names, then the next by shared words |
| By interface | 0 | 11 |

**Unfavourable:** files 4 to 7 used to arrive in full and now arrive as interface and glyph only. A file that needs the body of a dependency its purpose doesn't name sees less of it. `IDEARIUM_FILE_PROMPT_FULL_FILES` raises the count.

## Proof
- `test-build-context` **15/15**. New: the build blocks (on by default, sent only when enabled and non-empty, exactly as edited, never in a chat prompt), the build persona as edited, hostile inputs (a dependsOn cycle, null and unicode content, a corrupt `graph.json`, a corrupt store index, a huge file), and the loom map's real edges, read from the regenerated registry.
- `test-prove-loop` against the real server and model: see the run below.

## Not done, said
- `docs/2026-09-27-components-store-and-atlases-phasemap.spec` doesn't parse as YAML (line 24). This is pre-existing and unchanged here; the addendum is added in its own list.
- `.node` types: the build context is still not recorded as a node. `.injection`'s schema is copilot's call-model shape; widening it or adding a type is James's call.
