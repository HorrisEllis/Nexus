# NEXUS 0.39.271: one Idearium, a real phases manager, the living spec, COS debugging, every system as nodes

**Date:** 2026-09-27 · base: 0.39.270

James (with four screenshots):

> *"can you fix this? also get versionium working. its like there are two ideariums or something … i want the roadmap and phases combined into a fully enterprise grade manager. the spec tab is for the .spec in the spec folder, the living model. i want cos to be able to run test envirements that can test any codebase, with the debugging and testing tools. can you check copilots tools, and capabilies. i wanted a command index for each system and exactly like gaurdian where all data, commands, etc are physical node types. guardian isnt finished, .hats, .agents. all data are nodes … look at the architecture doc"*

**Mapped before building:** `docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec` (R1 · V1–V2 · N1 · P1–P4 · S1–S2 · T1–T3 · C1 · X1–X5 · Z1). It was written after a live run of cortex, versionium and idearium from this tree, before any source change. What turned up while building is in its `build_drift`.

## The :9000 "route not found: GET /idearium/"

The TV shell is served at `/`, so its link `../idearium/` resolved to `/idearium/`. That is a directory, and the orchestrator's static fallback only served files. A top-level UI directory (`/idearium/`, `/guardian`, `/cortex` and the rest) now redirects to `/ui/<path>`, where it is already served.

## Versionium

**The real fault was in the history list.**
- **The truncation.** `GET /api/versionium/history` returned the first 200 commits in storage order, across every repo. Every repo's Versionium list filtered that page, and so did the import-baseline check, the agent tools and cortex's CLI.
- **The effect.** Once 200 repo snapshots existed in total (the 15 nexus systems add 15 on every sync), a repo's new snapshots never appeared. A repo could look unversioned and be given a second baseline.
- **The fix.** `history` takes `?branch=` and `?n=`. With `n` it returns the newest `n` first; without it, it behaves as before. Every repo list now reads its own branch. Proven live: 210 filler commits, then a snapshot, and it is first in the list.

**Three other fixes:**
- **Dead proxies.** The orchestrator's `/api/cortex/versionium/{log,commit}` still called cortex, which only answers "moved". They now call versionium.
- **Stale registry entry.** Cortex's registry keeps its `versionium.log` entry, now marked as moved.
- **The nexus repo's Versionium tab** showed one file, its `NEXUS.md` index. That is correct by design, but it read as "nothing is backed up". It now shows all of NEXUS:
  - every system's versions and latest snapshot;
  - the immutable base's history;
  - a **snapshot every system** button.
  - New routes: `GET /api/nexus-self/versions` and `POST /api/nexus-self/snapshot`. Live: 15 of 15 systems snapshotted.

## One Idearium

Create and Build belong to a repo, as you asked in 0.39.264. They used to appear in the global bar when a repo opened, which is why it felt like two Ideariums.
- The top bar is now always Welcome + Repos.
- Create and Build are the last two entries of the open repo's own tab row.
- Their views carry a "← back to the repo" bar.
- The canvas iframes no longer 404 on load when Idearium is served on :4800 directly.

## Phases: Roadmap and Phasemap in one manager

**What was wrong before:**
- For an ordinary repo, "Phasemap" showed verification tiers, not phases.
- "Roadmap" showed phasemap phases.
- The two used different status words, and nothing could be built from either.
- Loom's parser only read `  X1_slug:` phases. **Every phasemap written in the `- id: X1` list form was invisible**, including the last four releases' own.

**Loom now reads the list form.** Only inside a `phases:` block: an `- id:` inside a drift log's `entries:` was being read as a phase. The list form's plain status words are understood (built, active and so on). `closes:`, `files:` and `name:` are returned for both forms. 57 list-form phases in `docs/` are now visible.

**The Phases tab** (`idearium/repo/phases.js`, `idearium/ui/js/phases.js`) covers:
- **Which phasemaps.** An ordinary repo shows its own phasemaps. A nexus repo shows NEXUS's, from the immutable base: all of them for the parent, the tagged ones for a system (with a "this system's only" filter).
- **Summary:** a progress bar plus complete, active, planned, ready, blocked and builds counts, each one a clickable filter.
- **Views:**
  - **Board:** Ready, Blocked, Active, Complete.
  - **Layers:** dependency order.
  - **Table:** sortable.
  - **Maps:** one card per phasemap with its progress.
- **Filters:** text, status, phasemap, ready only.
- **Detail pane** for a phase:
  - its status, which you can edit;
  - depends on, needed by and blocked by, each clickable;
  - closes, files and systems;
  - its builds.
- **Add a phase** to any phasemap.
- **Build a phase:**
  1. It takes a **Versionium snapshot first** and refuses without one (`NO_SNAPSHOT`), as you asked: "versionium to backup the files".
  2. The phase goes active.
  3. The repo's own agent gets the phase as its task: the phase's text, the missing items it closes, the dependencies already done and the map's invariants.
  4. Each step is recorded (`idearium_phase_runs`).
- **Where edits go.** A nexus phase edit goes through the **apply gate** into the live tree, recorded and reversible (a test edit was rolled back through it). An ordinary repo's edit goes through its repo layer.
- **Nothing was removed.** Phasemap's verification tiers and graphs moved to the Intelligence tab, and the Roadmap renderer is kept.

**Routes:**
- `GET /api/repos/:uuid/phases`
- `GET .../phases/runs`
- `POST .../phases/{status,add,build}`

## Spec tab: the living spec

`GET /api/repos/:uuid/living-spec` (`idearium/repo/living-spec.js`) lists the repo's spec folder: `spec/`, `specs/` and root `*.spec`, with phasemaps left out.
- For a nexus system it reads from the immutable base. For core, that is the architecture spec.
- For the nexus parent it lists every system's own spec.

The tab shows:
- the spec's meta;
- every section as a tree;
- its version history (the audit trail);
- gaps;
- the dated addenda;
- the raw text.

A spec that is not valid YAML says at which line and is still shown. The spec-engine chunk builder that was this tab is kept below, as "build manifest".

## COS: test any codebase, and debug what fails

- **Run the test suite** (new). It runs the repo's own test command on the process backend: `node --test`, `jest`, `vitest run`, `python3 -m pytest`, `go test`. It runs directly, with no shell and no network, and ports are shifted. A script that needs a shell (`&&`, pipes, `$VARS`) is left to the VM, which says so. A suite whose dependencies aren't installed says the VM installs them.
- **Run all tests** runs every runnable test (was the first 40: "40 of 518").
  - 4 at a time (`COS_RUN_CONCURRENCY`) within a 280-second budget (`COS_RUN_BUDGET_MS`).
  - Tests the budget didn't reach are listed, with a "run the next N" button that continues from there.
  - It now applies the same runnable filter the menu counts with.
- **A debug report on every failure** (`lib/cos-debug-report.js`):
  - **The error.** Covers node:assert and `node --test` output (message, actual, expected), jest, vitest, mocha, pytest, go, rust, rspec and phpunit.
  - **The frames in the repo.** Node, Python, Go, Rust, Ruby and PHP; frames in the runtime or `node_modules` are counted, not listed.
  - **The source lines around each frame,** read from the run's own directory before cleanup.
  - **A hint** for timeouts, missing modules, taken ports, network attempts and syntax errors.

  It shows in the run result and in the Debug tab, and "hand this to the agent" includes it.
- **nexus/core** said "no entry to boot". It now says core has no process of its own and to boot the system that runs it, and it offers Nexus's root `package.json` scripts.

## Copilot: tools and capabilities checked

**The inventory:**
- **46 served routes.**
- **109 tools.** `/api/prompt/tools`, and `/api/prompt` with tools, reach all of them; `/api/prompt/stream` offers a fixed 17.
- **Intuition answers ~14 intent kinds without a model.**
- **Lifeline order:** worn hat → named agent → provider → Ollama, escalating to Guardian below 0.75 confidence.
- **Background jobs:** the self-test every 10 min, a 60 s stream digest, a 5 s nerve push and an hourly self-model refresh.

**What was wrong, fixed:**
- **Declared but never served (5):**
  - `POST /api/introspect`, `/api/introspect/retry`, `GET /api/introspect/health` and `GET /api/agents/capability` are now served. Their modules (`lib/introspect.js`, `lib/agent-capability.js`) were real and tested.
  - `POST /api/agents/calibrate` stays declared, **marked not served**. It needs a live probe that would spend real quota.
- **Served but not declared (16):** added to `copilot/registry-components.js`.
- **Wrong port:** `interaction-contract.json` said port 4850; copilot runs on 3750.

## Every system as nodes; Guardian's .hat and .agent

**What was there.** The capability, command and system node files in ten systems came from one export run on 2026-09-12 that was never checked in.
- No code in the tree could produce them again.
- They had drifted: Guardian had 36 declared and 33 files, Versionium 13 and 6, Intelligence 53 and 18.
- Orchestrator, diagnostic, cortex and idearium had none.

**`lib/system-nodes.js` is the generator.** For each of the 16 systems with a `registry-components.js` or an `interaction-contract.json` it writes:
- a capability node per declared component;
- a command node per declared *or served* route, **marked declared and served**. "Served" is read from the system's own dispatch: Guardian's and Ollama's command-index extractors, and Idearium's route table. That is "declared ≠ served", made physical.
- a system node: port, entry, spec, counts, declared-but-not-served, and the sources it read.

**How it behaves:**
- Unchanged nodes are not rewritten.
- A node whose source is gone is archived to `data/nodes/_archive/`, never deleted.
- Nodes that other writers own are never touched.
- It runs at orchestrator boot. Live: 16 systems, and 0 rewritten on the second run.

**Guardian hosts the agent types.** Every forged hat is written as a `.hat` and as an `.agent` (name, intent, commands, personality — `schema.agent`). Guardian's node registry (per-type folder watcher, `_ledger.jsonl` and JAA index) **now starts at boot; it never had.** Two changes came with it:
- `hat`, `capability` and `system` joined its types.
- A bug that cut every dotted node id at its first dot is fixed.

**Reading the nodes:**
- `GET /api/nodes`, `/api/nodes/:type`, `/api/nodes/:type/:id` and `POST /api/nodes/sync` on the orchestrator.
- `node cli/nodes.js sync | index | list <type> | get <type> <id> | drift`.

`docs/command-index-per-system.spec` had ollama and guardian as SPECCED; both are built, so they are corrected, with an addendum.

## Axioms

1. **Map first.** The phasemap came before any source change.
2. **Reuse.** Phases compose `roadmap.js` and loom's one parser. Nexus edits use the existing apply gate, builds use `repo-agent.dispatch` and snapshots use the existing snapshot path. Nodes use `node-export`, the existing extractors and `hat-forge`. Copilot's new routes mount existing modules.
3. **Registry with wires.** `loom/maps/one-idearium-map.js`: 4 components, 11 hooks, 16 wires, 0 failures on a fresh bootstrap. It adds the missing export hooks: roadmap, nexus-self, repo-agent-node, and Guardian's and Ollama's command-index.
4. **Addenda and registration.**
   - Addenda in the idearium, orchestrator, versionium, copilot, guardian, loom, cos and architecture specs, and in `command-index-per-system.spec`.
   - New specs: `system-nodes`, `phases-manager`, `living-spec` and `cos-debug-report`, all registered in `docs/SPEC-REGISTRY.spec`.
   - Both atlases are updated for the new tabs; 49/49 references resolve.
5. **Nothing lost.**
   - The Roadmap and Phasemap renderers are kept.
   - The chunk builder is kept, under "build manifest".
   - Copilot's `calibrate` is marked, not removed.
   - Generated nodes whose source is gone are archived.

**Version and packaging:** `lib/version.js` 0.39.271 (`previous: 0.39.270`), with lib entries `system-nodes` and `cos-debug-report`; `package.json` follows. One `nexus.zip`, packaged as 0.39.270 was: the root `data/` is left out.

## Tests

- **`tests/modules/test-one-idearium-phases-nodes.test.js`: 21/21**, registered in `run-all.js`.
- **`test-moce-roadmap-ui` 17/17**, updated for the Phases tab. The kept Roadmap renderer is driven directly.
- **Other suites touched, all passing:**
  - roadmap 39/39;
  - loom phasemap 12/12 and 5/5;
  - cos-testenv 63/63;
  - nexus-self + cos-run 30/30;
  - repo-run 15/15;
  - agent memory 9/9;
  - hat-agnostic 15/15;
  - versionium history 7/7;
  - atlas refs 49/49.
- **Full `run-all.js`,** 0.39.270 vs 0.39.271 from fresh copies: **4,165 passed / 124 failed vs 4,190 passed / 120 failed.**
  - The only suite that went down was `queue.test.js` (51 → 50 in the parallel run). Run alone it is 51/51 on both trees, so that is run-order noise.
- **Live checks** in a sandbox running cortex, versionium, idearium and the orchestrator:
  - the redirect;
  - the 200-commit truncation fix;
  - snapshot every system;
  - Phases on the nexus parent and on a system;
  - a nexus phase edit through the apply gate, and its rollback;
  - a phase build (snapshot taken, then the agent call recorded — copilot was not running, so the run is recorded as failed);
  - the living spec;
  - the Run menu for nexus/core;
  - node sync and `GET /api/nodes`.
  - The Phases and Spec tabs were rendered in Chromium.

## Not done

- **A test run's debugger is a report, not a stepper.** There are no breakpoints and no attach. The report points at the failing line with its code.
- **Process runs still install nothing.** A suite with uninstalled dependencies runs in the VM.
- **Phase builds on NEXUS still need a hand to apply them.** The agent's code arrives as injects, and applying it to the live tree is still the apply gate by hand. RAID is not in that path.
- **Other systems' registries don't run.** Only Guardian runs a node registry (watcher, ledger and index). Architecture gap AS1 stays open for the others.
- **Versionium on your machine.** It worked in the sandbox after these fixes. If your Versionium tab still misbehaves, a screenshot of it would pin down what's left.
