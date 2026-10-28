# NEXUS 0.39.266: nexus back in Idearium, agents build it through the registry harness, deletes stick

**Date:** 2026-09-26 → 27 · base: Nexus-main-9 (package.json 0.39.264, with 0.39.265 code and tests already in the tree but no CHANGELOG-0.39.265.md)

James:

> *"nexus should be in idearium but isn't. really close to being able to use idearium to build nexus from inside nexus using you as the agent."*

## Map

- **The sync side was healthy.** `data/nexus-self/metrics.jsonl` from James's machine shows syncs completing today: 2,102 files, 14 systems, understanding recorded.
- **The same sync on a clean copy of this tree works.** A fresh `idearium/api/index.js` on :4800 creates 14 system repos and the parent in about 10 s. The Repos library then shows one `nexus` block ("14 systems · 1855 files").
- **So the repos exist, and something between the registry and the library hides them.** Two paths were found and both were reproduced.

## Failure 1: Delete archived an immutable repo, and the sync never undid it

- `RepoLayer.archive()` was the only lifecycle call without the `_immutableError` guard. Write, delete-file, fork and writeTextFile all had it.
- The repo detail panel showed **✕ delete** on nexus/core like on any other repo. `DELETE /api/repos/:uuid` then set `status: 'archived'`.
- `list()` hides archived rows. The library groups the 13 system repos *inside* nexus (core, or the parent if core is missing), so once core and the parent were archived, all of Nexus disappeared.
- `_findRepo()` reads with `includeArchived: true`. It found the archived row, compared hashes, and returned `unchanged`. Nothing ever restored the row, and every sync after that kept it hidden.
- **Reproduced live:** `DELETE` on nexus/core and nexus, then `POST /api/nexus-self/sync`. Afterwards only the 13 child repos were listed, and the library showed nothing for Nexus.

**Fix**

- `idearium/repo/index.js`:
  - `archive()` refuses immutable repos with `code: 'IMMUTABLE'`.
  - New `restore(uuid)` moves a repo from archived to active.
- `idearium/api/index.js`:
  - `repo.archive` answers **409** for IMMUTABLE instead of 404.
  - The last-sync status lists restored repos as `<name>:restored`.
- `idearium/repo/nexus-self.js`:
  - `sync()` first restores any archived nexus-self row that has no active twin for the same role and system. It returns them as `restored` and logs `restored archived nexus/core (…)`.
  - `_findRepo()` prefers an active row over an archived twin.
- **This heals James's current state on the first sync after upgrade.** No manual data edit is needed.
- `idearium/ui/js/app.js`: an immutable repo shows no **delete**, **+ add file** or **fork**. In their place it shows "immutable — edit on a COS branch, apply through the gate".

## Failure 2: on first boot the library stayed empty until a reload

- The first sync runs 20 s after boot. On Windows, core (~1,800 files) takes longer than that to sync.
- The sync broadcasts `idearium.nexus-self.sync` once per system. `refreshOnEvent()` handled `repo.*` and did nothing for `nexus-self.*`. The nexus-self pipeline passes `onEvent: null`, so no `repo.*` event fired either.
- A page opened before the sync finished said "no repos yet" until it was reloaded by hand.

**Fix:** `refreshOnEvent()` reloads the repo list on `nexus-self.*`, debounced to one reload per burst (one event per system).

**Reproduced and verified in headless Chromium:** a page loaded before the sync showed "no repos yet". Without a reload, it then showed `nexus · 14 systems · 1855 files`.

## Tested

- New `tests/modules/test-nexus-self-visible.test.js`, 4/4 passing (registered in `run-all.js`):
  - NV-001: archive refused.
  - NV-002: archived core and parent restored by sync; a second sync restores nothing.
  - NV-003: an archived twin stays archived.
  - NV-004: UI wiring.
- The same test run against the unmodified files fails 0/4, so it catches this regression.
- Neighbouring suites are unchanged: `test-nexus-self-and-cos-run` 30/30 and `test-versionium-repo-history` 7/7.

## The agent builds Nexus from inside Nexus, and James approves each change

> *"really close to being able to use idearium to build nexus from inside nexus using you as the agent"* … on how agent code should reach the live tree: *"just prompt for approval"*

**What was wrong**

- The Agent tab's code goes through `lib/repo-inject.js`: `propose`, then `apply`, then `RepoLayer.writeTextFile`.
- The Nexus repos are immutable, so that write was refused with IMMUTABLE. An agent's code on a nexus repo could be proposed but could never land.
- The loop dead-ended one step short.

**What changed**

- New `lib/nexus-self/inject-gate.js`. An `.inject` on a nexus repo now carries `target: { kind: 'nexus-gate', system, path }`, where `system = ownerOf(path)`.
- On approval, that inject is applied through `lib/nexus-self/apply.js`: plan, then a live-tree write, then a recorded apply, then a snapshot. The API then resyncs that system's repo.
- Revert is the gate's own `rollback(applyId)`.
- Before comparing, the gate snapshots the live tree (index-cached).
  - A file James edited since the last 10-minute sync does not block an inject for some other file (IG-007).
  - The inject's own base sha is checked against the tree as it is now. An agent that worked from a stale copy of the file is refused as a conflict instead of overwriting his edit (IG-006).
- A path under another system is that system's change. For example, `guardian/x.js` proposed from nexus/core is applied under guardian (IG-005).
- A nexus repo is always in review mode:
  - `modeFor(repo)` returns review.
  - `injectMode: 'auto'` is refused with 409.
  - A stored 'auto' is ignored (IG-008).
- **The approval stands in for the branch gate's "run first" check.** That check exists for branch applies, where nobody has looked at the diff. The apply record's reason says who approved and which inject it was.

**The prompt**

- When a reply settles with proposed injects on a nexus repo, the inject editor opens as an approval prompt, one inject at a time, with a queue for the rest. It shows:
  - the system and the path;
  - whether the file is created or changed;
  - the gate's plan (ok, errors, or conflicts);
  - a coloured diff against the live tree;
  - the content, still editable before approving.
- **approve → live tree** applies it; **reject** drops it. A plan error disables approve. A conflict goes through the existing type-"force" path.
- No prompt text was added. James's rule is that only blocks he can edit in Agent settings go into the prompt. If the agent should be told more about nexus repos, it goes in that repo's `.inject` block.

**Tested**

- `tests/modules/test-nexus-inject-approval.test.js` 8/8 (IG-001…008), run against a throwaway live tree.
- End to end on a running :4800 in headless Chromium:
  - a proposed inject on nexus/core opened the prompt ("gate plan: ok", diff shown);
  - clicking approve wrote `lib/hello-from-agent.js` into the live tree, recorded as `apply-…`;
  - nexus/core was resynced.
- `PUT` of `injectMode: 'auto'` on nexus/core returned 409.
- Regressions: `test-repo-inject` 79/79, `test-nexus-self-and-cos-run` 30/30, `test-versionium-repo-history` 7/7, `test-nexus-atlas-and-glass` 9/9.


---

# Part 2 (2026-09-27): stability, and the registry as the agent's harness

Mapped first in `docs/2026-09-27-registry-harness-and-stability-phasemap.spec`, which holds the measurements, decisions, results and open items.

James:

> *"idearium is laggy as hell. is it the sse? or the orchastrator?"* · *"don't even know what ollama is doing?"* · *"the chunks aren't meant to be as small as possible. use the component registry as the wiring harness like loom does for nexus … right now its not coding at all."* · *"it's meant to make small llms capable of building entire codebases regardless of the size … thats way too much to inject when we have tools they can use to get context"* · *"those tools are for using clearglass and automating"* · *"one component = one file … yes delete old specs … supposed to only be nexus and the nested repos … loom should have this mapped already"*

## Deletes stick across processes (`guardian/jaa-store.js`)

- **What was wrong:** every process wrote its whole in-memory copy of a shared table back on each flush.
  - Orchestrator's compactor deleted the same 7,176 event_log rows every 10 minutes, and they were back seconds later. On James's machine event_log went 7,176 → 19,788 rows in an hour, loaded by every process.
  - The same flush also overwrote other processes' *updates* with a stale copy.
- **Fix:**
  - A process writes back only the rows it changed since its last flush.
  - A clean row that is gone from disk was deleted elsewhere, so it is dropped.
  - A clean row that changed on disk is refreshed from disk.
  - `reloadTable()` follows the same rule.
- **Test:** `test-jaa-deletes-stick` 5/5; the original code fails 3 of them.

## The page never lands on the orchestrator proxy (`idearium/ui/js/app.js`)

- **What was wrong:** after a slow moment the page could reconnect through `:9000/api/idearium`. Its `/health` passes (it's Idearium's), but every `/api/*` through it was 404, until a reload.
- **Fix:**
  - The proxy candidate is gone.
  - The page's own origin is skipped when the orchestrator serves it.
- **Checked live:** loaded from `:9000/ui/idearium/`, the page's API base is `:4800`.

## Only nexus and its nested repos; one spec each; removing a spec deletes it

- **What was wrong:**
  - Every repo ingest minted a "Repo: <name>" idea, so the nexus sync alone made 15.
  - Every re-registration minted another, orphaning the last.
  - Every nexus/core change kept a new ~55 MB spec (19 MB manifest, 16.7 MB `.spec`, ~1,700 chunk files and ~1,700 chunk nodes) forever.
  - Removing a spec only set a flag.
- **Fix:**
  - Nexus repos mint no idea (`noIdea`).
  - The sync removes linked and orphaned "Repo: nexus…" ideas. An idea written by a person is never touched.
  - Replacing a nexus repo's spec purges the old version: the directory, its chunk nodes and its cortex mirror rows (`purgeSpec`). History stays in the snapshot store and versionium.
  - Removing a spec deletes it, unless it is a live repo's content. A repo's files *are* its spec, so that one is only stopped, and goes when the repo is deleted.
  - Deleting a repo purges its specs.
  - A one-time boot pass purges specs that were already removed.
  - **This supersedes §7.4 "archived, not deleted" for specs, by James's decision.**
- **Caught live, not by tests:** `purgeSpec` wasn't on spec-engine's default export, which is what the API calls, so every purge was silently skipped. Fixed; SC-008 guards it.
- **Live, on data left by earlier runs:** 15 ideas removed, 20 old versions purged, 15 specs on disk, 0 ideas.
- **Test:** `test-nexus-specs-and-ideas-cleanup` 8/8.

## A slow sync names its slow step (`idearium/repo/nexus-self.js`)

- Any sync over 1 s logs its steps, for example: `sync took 7791ms — systems 4524ms · cleanup 1754ms · understanding 792ms · … · tree 2905 files, 4 re-hashed`.
- James's 10-minute Idearium outage happens on syncs that changed nothing. That takes 236 ms here, so its cause on his machine is still unlocated. This line will name it on the next run.

## The registry is the harness: loom's map, now with events

- **Events in loom's registry** (`loom/scanners/source-map.js`, `loom/bootstrap.js`):
  - The scanner reads what each file emits (`emit`/`broadcast`/`publish`/`fire`, including `emit(new Event(…))`) and hears (`.on`/`.once`/`.subscribe`/…, and SISO `signature:`). Names must contain `.` or `:`.
  - Wired events become `event` hooks and emit→listen wires, only where both sides exist, so no hook dangles.
  - Every event, wired or not, goes to `loom/data/events.json`.
  - Refresh result: 709 events, 379 event hooks, 459 wires, 0 dangling. Every other bootstrap count is identical to before.
- **`lib/registry-harness.js`:** a read view over the maps Nexus already keeps.
  - For nexus repos: loom's registry and events, plus the snapshot for which file each id is (loom's `idFor`).
  - For any other repo: its `graph.json` in the same shape.
  - One component = one file. The operations:
    - `find`: components by path; events; words in code, with code lines ranked above comments.
    - `card`: purpose, exports, requires and required-by, events in and out with who's on the other end, routes, covering tests.
    - `read`: 200-line numbered ranges.
    - `namedIn`: which component a question names.
- **Idearium routes:** `/api/repos/:uuid/harness/{find,card,read,write,test}`.
  - `write` proposes an `.inject`. On a nexus repo that opens the approval prompt, then goes through the gate.
  - `test` runs covering tests through the COS run menu, each under the nexus repo that owns it.
- **Five tools** (`lib/agent-tools/tools/loom/harness.js`): `loom.find.tool`, `loom.card.tool`, `loom.read.tool`, `loom.write.tool`, `loom.test.tool`. They learn their repo from the run context.
- **The first message** (`lib/repo-agent.js`, `lib/repo-prompt-blocks.js`):
  - The new default tool scope, `harness`, allows every tool but lists five, plus one line naming the other groups (Browser & Clear Glass, COS, Versions …) to find with `loom.find.tool`.
  - A new `context-card` block carries the card of what the question names.
  - `context-code` and `context-map` are off by default and can be switched back on in Settings → Agents.
  - For "add a retry limit to the flush lock in guardian/jaa-store.js": **22,269 → 2,701 chars** (ChatGPT via Guardian) and 2,092 (Ollama). The card is of the right file, where the 4 pre-fetched chunks were the wrong files.
- **UI:**
  - A `loom.write.tool` write opens the approval prompt.
  - The Agent tab shows which card was sent.
- **Checked live on nexus/core:**
  - card: 7 ms, 660 chars;
  - find: 271 ms;
  - read by range;
  - write, then the prompt, then approve, then the file in the live tree;
  - test runs the covering tests in COS in about 2 s.
- **Test:** `test-registry-harness` 7/7.

## Ollama: window sized to the prompt, every call logged (`lib/ollama-activity.js`)

- `num_ctx` was set nowhere, so a long prompt was cut from the front, instructions first.
- **Window size:** every call path now sets it from the prompt's size (floor 4096, ceiling `OLLAMA_NUM_CTX_MAX`, default 16384). A prompt that can't fit says so. Call paths covered:
  - the bridge's generate, chat-with-tools and channel stream;
  - `lib/cli-reasoning`, the `ollama_generate` tool, `lib/context-builder`;
  - Idearium's and loom's agent suites;
  - `ollama-runtime`.
- **Logging:** every call is one console line and one row in `data/ollama/activity.jsonl`, recording caller, operation, model, prompt size, window, duration and failure. Embedding calls are logged too. The bridge serves `GET /api/activity?n=`.
- **`nexus-live` capped:** it grew every 5 s and nothing read it. Its context lines are now capped at 200.
- **Test:** `test-ollama-activity` 5/5, against a fake Ollama.

## One chat per repo agent (`guardian/lib/chat-transcripts.js`, dispatcher, userscripts 10.11.1)

- **What was wrong:** an agent with no chat yet had its first job typed into whatever chat the tab showed, then filed that chat as its own. The nexus and nexus/core agents shared one ChatGPT conversation.
- **Fix:**
  - Such an agent gets a new chat (`newChat` tells the tab not to wait for earlier turns).
  - A chat another agent holds is never handed to a second agent.
- **Test:** `test-chat-per-agent` 5/5.

## Regressions

- Suites that pass:
  - JAA: jaa-db 53, multiprocess, flush-lock 7, selective-load 8, artifact-index 9, cookie-vault 7;
  - nexus-self: 30, versionium history 7, atlas 9, visible 4, inject approval 8;
  - repo agent: repo-inject 79, repo-agent 35, provider 60, node 44, learn 33, late 17, hat-memory 35, agent-tools-and-graph 13;
  - Ollama: command-index 17, runtime 8;
  - chats: chat-transcripts 31, back-and-forth 18, live-stream 13;
  - dangling-hooks 19.
- **Updated to the new default** (`harness` instead of `all`, every tool still allowed): AT-08 and one `test-repo-agent` check.
- **Failing before and after, not touched:** `test-tool-guide` T-001 (56 older tools have no guide note), `nexus-nerve` and `nerve-phase0-phase1` (hard-coded paths), and `flush-redundancy` (missing module).

---

# Part 3 — the component store

James: "warp is the build logic. supposed to reuse components. i wanted a components store for all components build in folders with their dependancies." His answers: store everything WARP builds; reference each dependency by id + version; the store is a nested repo in Idearium; atlases are hand-written narrative plus generated sections. Plan and status: `docs/2026-09-27-components-store-and-atlases-phasemap.spec`.

## What was wrong

- A file WARP built lived only inside one spec directory, and was deleted with it when the spec was purged.
- The only reuse was `warp-crystals.json`, keyed by the whole prompt. The prompt includes the spec name, so the same file built for a second project never hit.
- Nothing recorded what a built file requires.

## The store (`lib/component-store.js`, `components/`)

- **Layout:** each component is `components/<id>/<version>/`, holding the file byte for byte and a `component.json`. The manifest follows architect's component nodes (id, namespace, name, version) and adds path, sha256, purpose, dependencies, unresolved requires, npm packages, who built it, and the reuse keys that point at it.
- **Identity:** the id is `<project>.<dotted path>`. Versions count up as `1.0.n`, and the same bytes never make a new version.
- **Dependencies:** each relative require is pinned as `{ id: version }`. If the file it needs is stored later, the pin is added then. A require that matches nothing is kept as unresolved, never dropped. npm packages are listed separately; node built-ins are not.
- **Reuse is exact:** by contract (path, layer and purpose) or by prompt. A file edited by hand no longer matches its sha256 and is refused. `invalidate()` stops a wrong version from being reused.
- **Nested repo:** `components` is a nexus-self system (`lib/nexus-self/systems.js`). Loom never scans it, and tests get their own store (`NEXUS_COMPONENTS_DIR` in `lib/test-sandbox.js`).

## WARP's build path (`idearium/api/index.js`)

- **Before dispatch**, the build asks the store in this order:
  1. by contract, before the existing prior-section reuse;
  2. by prompt, right after the prompt is built.
  A hit completes the chunk with the stored bytes at 0 tokens (`source: 'component-store'`).
- **After completion**, the file is stored on both paths: a synchronous WARP build, and a queued browser-agent build that completes through `speceng.chunk.complete`. The chunk-complete event names the stored component.
- **Not stored:** imports and nexus syncs complete chunks elsewhere and never reach the store.
- **API:**
  - `GET /api/components` lists components, or searches with `?q=`;
  - `GET /api/components/:id` returns the manifest and closure;
  - `POST /api/components/:id/invalidate` stops a version being reused.

## Agents (`lib/registry-harness.js`, `loom.*.tool`)

- `loom.find.tool` with kind `stored` finds components already built for any project.
- `loom.card.tool` and `loom.read.tool` accept `store:<id>@<version>`. A near match is found by the agent, never pushed into its prompt.
- `buildNexusIndex({ files, root })` is split out, so the harness index can be built over any file list.

## Atlases

- **Generator built:** `lib/atlas-generate.js` and `scripts/generate-atlases.js` write a generated section between markers in each atlas. It covers the counts, routes, events and their listeners, and each directory's files with purpose, exports, dependency counts, events and covering tests.
- **Not yet done:**
  - running the generator over all atlases;
  - rewriting the stale diagnostic narrative;
  - raising the resolver's 2,000-reference cap.
- **Added:** `docs/atlases/components-atlas.md` and a `### components` section in the Nexus atlas.

## Tests

- **New:** `test-component-store` 8/8.
- **Still passing:** `test-registry-harness` 7/7.
- **`test-nexus-atlas-refs`:** 46/47. The one failure is a leftover `bridge/input` runtime directory in the build tree; it is not in the shipped tree.
