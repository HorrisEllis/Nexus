# NEXUS 0.39.261: Nexus as immutable repos inside Nexus, the COS run menu, working agent tools, and 116 fewer packages

**Date:** 2026-09-26 · userscripts chatgpt/claude 10.10.0 → 10.11.0, gemini/perplexity/deepseek 10.8.1 → 10.8.2

James:

> *"i want a nexus repo in idearium, that immutable with nested compartments per system so i can manage nexus from inside nexus. phases split up into each respective repo, phases from loom in the phasemap tab, spec from the .spec folder, the home tab uses the atlas for each system. make sure the graphs are hooked in, and nexus is improving it's understanding. i want the run button in cos to work fully, preferably in js, invent anything needed, remove as much external dependancies as possible and then add the needed packages to the root."*

His choices when asked:

- **Changes:** an immutable base, plus an apply gate.
- **Systems:** the autopilot kernels, plus a core system for everything else.
- **Run:** a menu of options.
- **Dependencies:** "anything that's additive … it needs to earn its place".

He sent more requests mid-build, taken from his live Agent tab:

- the `file_tree` tool call "did nothing";
- the reply showed three times;
- the job feed should be collapsible and kept out of the CLI;
- repos should not default to "building";
- a full Idea tab and a Debug tab;
- "the most compressed semantix or linguistics for the chunks".

## Built: Nexus, managed from inside Nexus

**The structure (per system)**

| COS | Idearium |
|---|---|
| `nexus-self` (parent compartment) | repo `nexus`: the index, system graph, understanding, applies |
| `nexus-self-<system>` (nested child) | repo `nexus/<system>`: that system's files |

There are 14 systems: orchestrator, cortex, guardian, idearium, architect, diagnostic, eravos, intelligence, ollama-bridge, versionium, copilot, loom, clear-glass, and **core**. Core owns everything the kernels don't: `lib/`, `cos/`, `siso/`, `warp/`, `docs/`, `tests/` and the root files.

- **One owner per file:** `lib/nexus-self/systems.js` `ownerOf()` gives every file exactly one owner.
- **What is never part of the base:**
  - `node_modules`
  - `.git`
  - every `data/` directory (runtime state)
  - imported user repos

**Immutable (`lib/nexus-self/store.js`)**

- **Blobs:** stored content-addressed and read-only (`chmod 0444`). A blob's name is its content hash, so there is nothing to update.
- **Snapshots:** each is a tree of blob hashes, written once. `HEAD.json` is the only mutable file.
- **Speed on the live tree:**
  - first snapshot: 1.6 s for 2782 files (29 MB)
  - unchanged re-snapshot: 0.1 s (hash cache)
  - hard-link checkout: 10 ms
- **Repos:** each system repo moves to a new spec version only when its slice changed, and older versions stay readable (`RepoLayer.replaceSpec`).
- **Refusals:** RepoLayer refuses write, delete, source write, and fork on an immutable repo.

**Managing it: COS branch → run → apply**

- **Branches (`lib/nexus-self/branch.js`):** a real COS branch in the system's compartment, holding a writable copy of that system's files at the base snapshot. A branch only edits its own system.
- **Apply gate (`lib/nexus-self/apply.js`):** the only path back into the live tree. It is:
  - scoped to the system;
  - based: a live file that moved since the base is a CONFLICT, and nothing is written;
  - recorded before the first write (`applies/<id>.json`);
  - atomic per file;
  - ledgered;
  - re-snapshotted afterwards;
  - reversible with `rollback`, which refuses if the file changed again.
- **Run first:** the API refuses an apply until the branch has run in COS since its last edit, and the run passed. `skipRunCheck` overrides it explicitly.

**The tabs, per system repo**

- **Home:** the system's atlas (languages, component kinds, directories with symbol counts, largest components), its understanding over time, and its edit branches.
- **Phasemap:** loom's phases for that system (`loom/scanners/phasemap-map.js`), grouped by phasemap with status and dependencies.
  - Loom had never tagged eravos, versionium or ollama, so they had no phases at all. They now have 9, 64 and 51.
- **Spec:** the system's own `.spec` files (its `spec/` folder; core: `docs/`), read-only.
- **Parent `nexus` Home:** the systems, the COS compartment tree, the system graph, understanding, and the applied changes (with roll back).

**Graphs and understanding**

- **Pipeline per system:** every system repo goes through the same pipeline an uploaded project does: atlas, chunks, verification, code graph, spec graph.
- **New: the Nexus-level system graph.**
  - A system's graph can only see its own files, so every `require('../lib/x')`, builtin and package landed as "unresolved": 4757 edges. Resolved against the whole snapshot, those are:
    - 913 cross-system edges (62 system→system links);
    - 2901 builtins;
    - 87 packages;
    - 69 broken relative imports;
    - 28 missing optional packages.
  - Nexus-level resolution is **0.9988**, not the 0.941 the per-system graphs implied.
- **Understanding is measured, not claimed.** Each sync appends `understanding.jsonl` with, per system:
  - symbols, graph edges, cross-system edges;
  - broken imports, missing packages, parse failures;
  - specs and spec↔code disagreements;
  - phases done, glyph ratio.
  - Each record names what improved and what regressed since the last one, and goes to the ledger as metrics.
- **Sync schedule:** runs 20 s after idearium boots, then every 10 min (`NEXUS_SELF_SYNC_MS`). It yields between systems and stages, so `/health` keeps answering. It is off in test processes and with `NEXUS_SELF_AUTOSYNC=0`.

**Found and fixed while building it**

- **Import pipeline, L6:** it ran every test file in the affected cone with `execFileSync`, inside idearium's own process. For Nexus's core slice that was 126 s of blocked event loop, and any imported project with tests hits it. It is now async, and callers can turn it off.
- **Graph cone, `affected()`:** it rebuilt the graph indexes once per changed file. It is now one multi-source BFS: the same files on every repo tested, and 26.5 s → 0.23 s on core.
- **Full sync of all 14 systems:** 162 s → 11–15 s.
- **Boot reconcile:** it would have adopted every older immutable version as an orphan repo. It now counts `specHistory` as covered.

## Built: the COS run menu, in JS

Run opens a menu computed for the repo. Unavailable options show their reason.

| option | what it does |
|---|---|
| Run entry / Run a file… | Runs `package.json` main or a conventional entry; for a Nexus system, the kernel's own entry. |
| Boot + health probe | Starts the server on a shifted port, waits for `/health`, then stops it. |
| Run all tests / one test… | For a Nexus system: every test in Nexus that references that system's code (guardian: 85). |
| Syntax check | Parses every JS file in one process; runs none of them. |
| Resolve dependencies | Every import, classified: builtin, repo, Nexus package, missing, or broken relative import. |
| Run a package script… | A `node <file>` script, run directly with no shell. |
| Run all tests in a VM | COS's qemu backend, when it really is available. |

**The runtime (`cos/runtime/`), plain JS:**

- **Resolution:** `NODE_PATH` plus an ESM `module.register` hook resolve bare packages from Nexus's root `node_modules`. Nothing is installed.
- **TypeScript:** runs through Node's own type stripping.
- **Port shift:** every `listen(port)` binds a free port, and the requested→actual map is recorded.
- **Network isolation:** outbound connections are refused except to the run's own ports. `networkIsolated` was a flag nothing enforced for process runs.
- **Clean environment:** the environment is cleaned, and every data store points inside the run directory.
- **Where it runs:**
  - ordinary repos run on a branch of their compartment;
  - Nexus systems run in a full-tree workspace: the base hard-linked read-only, with the chosen branch laid over it.
- **Verified live:**
  - guardian booted from the immutable base, answered `/health` in 0.8 s on :7820→:46127, and 3 calls to live kernels were refused;
  - guardian's own `test-back-and-forth` (18/18) and `test-chat-transcripts` (30/30) passed inside the workspace.

## Fixed: the agent's tool call "did nothing"

- **The live reply:**
  ```
  tool
  {"name":"file_tree","arguments":{}}
  ```
- **Cause:**
  - Guardian reads replies from the **rendered** page, where a ```` ```tool ```` fence is already a code block, with no backticks left in the text.
  - Copilot only recognised the literal Markdown fence, so every tool call from a browser agent was silently dropped.
- **Fix:** `_findToolCalls` reads the fence, the rendered block (label line, optional "Copy code", then the JSON), and a bare call object.
  - A non-fence form counts only when its name is a tool actually offered.
  - Tested end to end: `file_tree` runs, its result goes back as turn 2, and the agent answers from it.

## Fixed: the reply shown three times; the feed is out of the CLI

- **Cause:** a tab can stream one job from two readers. The 500 ms transcript reader goes first. Then the reply watch, which started from 0, resent the whole reply as a "delta", and the Agent tab appended it. That matches the paste: 117 + 189 + 189.
- **Fix, userscripts (all five):** the watch's first chunk for a job is marked `reset`.
- **Fix, Agent tab:** a chunk that is the whole reply, or a cumulative restatement, replaces the text; a tail repeat is dropped.
- **The feed:** a collapsible panel, collapsed by default and remembered per viewer. Its one-line summary shows generating/idle and the last gate. The CLI below is only the conversation.

## Built: Idea tab, Debug tab; repos no longer "building"

- **"building" was never true:** every repo was stamped `building` at creation.
  - Repos now start `specced`. `building` is set only by the build queue or build route when work actually runs.
  - Existing repos, and the "Repo: x" ideas auto-created for them, are migrated once at boot.
  - Ideas a person wrote are never touched.
- **The idea follows its repo:** three spec→repo paths passed the originating idea as the fork `parent`, and `ingest` ignored `ideaUuid`. The idea a repo came from is now its idea.
- **Idea tab:**
  - The repo's idea, editable.
  - Iterations: **improve**, **iterate** and **expand**. Each is a real IdeaOS idea, causally linked to the repo's idea, with a status: open, doing, done or dropped.
  - Each iteration can go to the agent as a task, or onto the roadmap as a real phase. The new `roadmap.addPhase` is checked by reading it back through loom's parser, and dependencies are kept.
- **Debug tab:** one read of what is wrong, with actions to re-check, run the tests, or hand the findings to the agent:
  - live syntax errors;
  - imports that resolve to nothing;
  - missing packages;
  - files the pipeline could not parse;
  - failed verification tiers;
  - every COS run with the failing file's actual error line;
  - agent errors.

## Built: chunk glyphs, the most compressed semantic form

- **What a glyph is:** `lib/chunk-glyph.js` gives every chunk a deterministic one-line glyph. It is written to `indexes/glyphs.json` and cached by content hash.
- **Code:**
  - what it defines, with its signature;
  - `←` what it pulls in;
  - `→` what it calls;
  - `⚑` events;
  - `⇄` routes;
  - `$` environment variables;
  - `io` side effects;
  - `✗` throws;
  - `¶` its own purpose line.
- **Prose and specs:** sections, obligations (MUST/SHALL), the opening claim, and tf-idf terms against the repo's own corpus.
- **Data:** its top-level keys.
- **Measured compression:**
  - code 12–16×;
  - specs about 14×;
  - guardian as a whole: 1.77 MB → 73 KB (**24×**).
- **In the agent's context (`lib/repo-context.js`):** after the ~4 full-text chunks, "More of this project, compressed" gives glyphs of the near-misses and the rest of those files, in their own budget. A question that matches nothing gets a glyph line for every file.

## Dependencies: every package earns its place

| package | was used by | now |
|---|---|---|
| `express` (+~60 transitive) | 3 Clear Glass servers | `lib/micro-http.js`: the exact subset used. Same status codes as express in all 11 compared cases; JSON errors instead of HTML pages. |
| `multer` | guardian loaded it and never used it | removed |
| `adm-zip` | 4 modules, 2 tests | `lib/zip.js` on `zlib`: identical on all 4480 entries of a real archive; CRC-checked; zip-slip refused; ZIP64. |
| `vectra` | `lib/vector-memory.js` | removed. The in-house `local-vector-index.js` fallback already existed and is tested. |
| `uuid`, `node-fetch` | already replaced in code, still listed | removed (`crypto.randomUUID`, global `fetch`) |
| `ws` | remote-desktop signal server | `lib/nano-ws.js` (in-house), now also on a bare port |
| `js-yaml` | 19 files | **kept**, one version (5.x) at the root. emerge's private 4.x is gone; only `load`/`loadAll`/`dump` are used. |
| `electron`, `electron-builder` | Clear Glass | **kept**, hoisted to the root; Clear Glass's `build.electronVersion` is pinned. |
| `jsdom`, `playwright` | tests (dev) | **kept** (dev) |

**Result:**

- The root's runtime `dependencies` is now one package: `js-yaml`.
- The workspace manifests (clear-glass, emerge, remote-desktop, bridge-electron) declare none.
- The lockfile was regenerated, **584 → 468** packages, and verified with a clean `npm ci`.

**Bugs found in `nano-ws` on the way:**

- `WebSocket = {…}` had no declaration. On Node 22 that **replaced the process-wide global `WebSocket` client** in every process that loaded it, guardian included.
- Its sockets lacked `ws`'s instance constants. So `ws.readyState === ws.OPEN` was always false, and the signal server never sent anything.
- remote-desktop's integration test passes 6/6 on it.

**Not changed: `erosmancer/erosmancer-os`.** It's a separate TypeScript sidecar that keeps its own dependencies. Its test runner (`tsx`) needs esbuild's native binary, which fails the same way on the untouched baseline, so its code could not be verified and was not rewritten blind.

## Tests

- **New:** `tests/modules/test-nexus-self-and-cos-run.test.js`, 30 tests, all passing:
  - store and snapshots;
  - apply, conflict and rollback;
  - nested compartments and branches;
  - runtime resolution, port shift and network isolation;
  - the run menu;
  - tool calls from a rendered page;
  - the feed;
  - the repo phase default, immutability and addPhase;
  - glyphs;
  - zip, micro-http and nano-ws;
  - no removed package required anywhere.
- **Updated pins:**
  - `test-repo-run` (the route now runs the COS menu);
  - `test-live-stream-and-gates` GS-11 (the watch's first chunk resets);
  - userscript versions;
  - `test-sr11-import-pipeline` and `idearium-repo-watcher` (build their fixture zips with `lib/zip.js`).
- **Also run and passing:**
  - COS suite (156/157, the same single failure as baseline);
  - loom phasemap and loom map;
  - diagnostic and gap-field;
  - idearium ingest, materialize, auto-repo and repo-watcher;
  - `test-back-and-forth`, `test-chat-transcripts`, `test-one-tab-e2e`;
  - the tool-runtime, tool-listener and agent-tools suites;
  - the Clear Glass server suites on `micro-http`;
  - remote-desktop signal.
- **Full `run-all`:** compared with 0.39.259's; see the commit message.
