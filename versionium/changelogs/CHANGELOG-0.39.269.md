# NEXUS 0.39.269: agents remember, and the memory is the Clear Glass download manager

**Date:** 2026-09-27 · base: 0.39.268

James:

> *"ollama is supposed to have persistent memory, same with the agents using the models. like theyre supposed to use the memory systems, chatlogs, nodes, etc for context, everything is supposed to persist with agents. using the download manager."* · *"look at clearglass download manager"*

## Map

**The download manager already was the durable record of agent exchanges.** It has two stores behind one door:

- **The downloads list** (`clear-glass/src/downloads/store.js`, JAA `cg_downloads`) holds browser downloads plus each Guardian reply. Replies are filed by the asking agent (`repo-<uuid>`), with job and compartment ids. Guardian's `response-sink` posts them to `POST :7702/cli/downloads` and queues them in `downloads-pending.jsonl` when Clear Glass is closed.
- **The chat and artifact index** (`artifact-chat-index.js`, its own COS compartment) is built on raw `.response` files holding `{ prompt, response, agentId, provider, codeBlocks }`. A JAA index sits over them and can be rebuilt from them.

**Three gaps:**

1. **Only Guardian wrote to it.** Ollama left nothing there, including bridge jobs, copilot's answers, the Agent tab on ollama, and chunk builds on ollama.
2. **Chunk builds weren't routed.** Guardian chunk jobs carried no `agentId`, so they were filed under "chatgpt".
3. **Nothing read it back as context.** Its only readers were the Library's Responses tab and late-reply adoption.

## `lib/agent-memory.js`: one write path, one read path, both over the download manager

**`record(exchange)`**

- Takes any backend. It writes through the same `response-sink.deliver()` Guardian uses: a `.response` node, the ledger, and the downloads list (queued if Clear Glass is closed).
- It adds the same index row shape `guardian/lib/code-artifact.js` writes, and a `chat-logger` line (JSONL + `chat_log`, embedded where vector memory runs).
- Guardian providers are skipped, because Guardian files its own replies.

**`recall({ agentId, query, siblings })`**

- It returns this agent's own past exchanges from the download manager, ranked by words shared with the question and then by recency. Code replies are summarised as "wrote src/x.js (N lines)".
- It adds the files already built in the compartment: each file's exports, requires and top-level definitions, so a new file wires to them.
- When vector memory is running, it adds `chat_log` lines that match semantically. It never pads with recent lines that don't match.
- The result is one labelled block within a budget: `AGENT_MEMORY_BUDGET_CHARS`, default 3,500. With nothing to recall, the block is left out.

**Identity:** `repo-<uuid>` (the id repo-agent and Guardian already use), `spec-<uuid>`, or `copilot`.

## Wired

**The Ollama bridge** (`ollama/routes/jobs.js`, `ollama/lib/dispatch.js`)

- Jobs carry `agentId`, `compartmentId`, `repoUuid` and `record`.
- Every completed job is recorded under its agent, whoever sent it. Excluded: the self-test, tool-loop rounds and `record:false`.
- Recording is not awaited, so memory never delays an answer.

**Copilot** (`copilot/lifeline.js`, `copilot/analysis.js`, `copilot/server.js`)

- Copilot's own chat is one agent, `copilot`, across sessions. Ollama answers get its memory first and are filed under it.
- The memory identity travels as `memoryAgent`, not `agentId`, because an `agentId` makes `_tryGuardian` skip the "is that tab connected?" check.
- `/api/prompt` forwards `agentId` and `compartmentId` to Ollama as well as to Guardian.

**The Agent tab** (`lib/repo-agent.js`, `lib/repo-prompt-blocks.js`)

- A new editable **memory** block sits after the persona and before the question. It's on by default, and left out when empty.
- Every backend now sends the repo's `agentId` and `compartmentId`.
- The Agent-tab result shows what memory was used (`context.memory`).
- Ollama tool-loop answers, which the bridge skips round by round, are recorded once at the end.

**Chunk and codebase builds** (`idearium/api` `speceng.build`, `idearium/agent-suite`, `warp-build-dispatch`)

- Before a chunk goes out, the build recalls the agent's past work plus **the files already finished in this spec**.
- The memory goes between the hat and the chunk prompt, on every backend. It travels beside the prompt, not inside it, so WARP's cache key stays the chunk's own contract.
- **Guardian now receives** the repo's `agentId` (so chunk replies are filed under the repo), `hatInPrompt` and `fileName`.
- **Ollama chunk answers**, which go straight to the runtime rather than the bridge, are recorded here.
- The build response names `agentId` and what memory was used.

**Guardian** (`guardian/lib/jobs.js`, `guardian/server.js`)

- `POST /command` accepts `hatInPrompt: "<hat name>"`: the caller already put that persona in the prompt.
- The job wears that hat with an empty persona and no guessed hat. Previously a guessed `[the_builder] You build…` header was stacked on the same text.
- Without the flag, nothing changes.

## Tests

- `tests/modules/test-agent-memory.test.js` **9/9** (M-009 pins the loom map to the source):
  - record puts every sink under the agent, with the downloads entry queued when Clear Glass is closed;
  - Guardian replies are not recorded twice;
  - recall ranks the agent's own work, includes sibling signatures, keeps other agents out and holds the budget;
  - the bridge records only real jobs;
  - the memory block;
  - chunk builds send memory, `agentId`, `hatInPrompt` and `fileName`;
  - Guardian honours `hatInPrompt`;
  - copilot's Ollama recalls first and names its agent.
- `test-agent-hat-agnostic` 15/15; `test-repo-agent` 35/35; `test-repo-agent-provider` 60/60.
- **The 80 existing test files that touch the changed modules**, run on 0.39.268 and on this tree:
  - 66 pass here, including `test-guardian-retry-novelty-installs`, which fails on 0.39.268.
  - The other 14 fail on both with the same failing cases. One of them is `lifeline-fluid-routing` T-004/T-005.
  - That comparison caught the `agentId`/tab-check regression above before it shipped.

## Axioms pass (James: "you patch it. make sure you follow the axioms")

Read first: `docs/CLAUDE.md` (the working agreement) and `docs/AXIOMS-v3.1.md`.

- **Rule 1, map before build (§3.3).** 0.39.267–269 were built before any map; that was not followed.
  - `docs/2026-09-27-agent-hat-memory-download-manager-phasemap.spec` records every phase as built-before-mapped (O1–O3, H1–H4, G1–G5, M1–M5), not back-dated.
  - X1 (this pass) was done after the map.
- **Rule 2, reuse (§8.6).**
  - Memory has no store of its own. It writes through Guardian's `response-sink` and the chat index (§10.1, one write authority) and reads `chat-logger` / vector memory.
- **Rule 3, the registry, with wires.** `loom/maps/agent-memory-map.js` maps `lib/agent-providers.js`, `lib/agent-memory.js` and `copilot/lib/activity-recall.js`:
  - their real require edges, plus the HTTP edge to copilot;
  - the consumer edges from hand-mapped files the scanner skips;
  - two hooks that were missing on existing components: `nexus.lib.extract-code.export` (7 consumers had no endpoint) and `nexus.copilot.server.import` (nothing could wire into copilot's server).
  - `loom/bootstrap.js` runs the map and leaves its files out of the scan.
  - **Fresh bootstrap of the zip, 0.39.268 vs 0.39.269:** unresolved registry wires 112 → 104, and all three components are wired both ways. Bootstrap still exits 1 on both: about 2,560 duplicate-id rejections from re-declaring what the shipped `registry.json` already holds, which predate this work.
- **Rule 4, addenda (§12.5) and registration (§6.3).**
  - Dated addenda in the `copilot`, `idearium`, `guardian`, `ollama`, `clear-glass`, `loom` and `cortex` specs.
  - Specs for the three new components: `docs/agent-memory.spec`, `docs/agent-providers.spec`, `docs/activity-recall.spec`. Spec-drift reports them synced, where before they read "no spec".
  - All four are registered in `docs/SPEC-REGISTRY.spec`.
  - The addenda are YAML comments. `copilot.spec`, `ollama.spec` and `loom.spec` already failed to parse on 0.39.266 at the same lines; they are left as found, not silently rewritten.
- **Rule 5, nothing lost (§0.3).**
  - The Eravos mods are hidden from New Spec, not removed (`?include=eravos`).
  - Superseded code (the hard-coded provider lists, the 7b default) is replaced in place with its reason written beside it.
- **§5.1:** UUID headers on the three new modules. `activity-recall`'s `comp_id` is now aligned with its registry id (`nexus.copilot.lib.activity-recall`); two names for one component would have been two truth layers (§10.3).
- **§5.4 version.** `lib/version.js` system is 0.39.269, with 0.39.264 kept as `previous`, and `package.json` follows.
  - The drift is recorded: both said 0.39.264 through 0.39.265–266.
  - The new lib entries are `agent-providers`, `agent-memory` and `activity-recall`.
  - Service versions were not bumped: Idearium's four sync points already disagree (`version-sync-and-registry` fails 2 checks on 0.39.266), and bumping them would add to that drift.
- **Tests:** both suites are registered in `tests/modules/run-all.js` and silence module chatter (`[jaa]` and similar).
  - **Full `run-all.js`, 0.39.268 vs 0.39.269:** 4,149 passed / 114 failed vs 4,184 passed / 113 failed.
  - Every per-suite difference is either the new tests or run-order noise. `test-repo-agent-late` and `orchestrator-cli` fail under a loaded parallel run on one side or the other; alone, both pass on both trees.
- **Delivery:** one `nexus.zip`, `data/**` excluded (state, not code).

