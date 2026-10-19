# HANDOFF — 2026-10-19 — pipeline root causes, verify-first, the phasemap DAG (0.60.170 → 0.60.172)

For the next session (Claude Code, in James's working tree). Read this, then `docs/CLAUDE.md` and `docs/SESSION-PROTOCOL.md`,
before changing anything.

## 1. Where the code is

The three releases were built in a chat container against the uploaded tree (nexus-14.zip + nexus-0_60_168-fixed-files.zip) and
delivered as ONE overlay zip of changed files (`nexus.zip`, 60 files, no .git). James's tree: `D:\Backups\Downloads\nexus-0.60.167`
(package.json said 0.60.168 at his last boot).

Apply and commit:
```bash
# from the repo root, with the overlay unzipped over it
git status                      # expect the 60 files below as modified/new
node --check idearium/api/index.js
node tests/modules/test-pipeline-root-causes.test.js   # 6/6
node tests/modules/test-verify-first.test.js           # 10/10
node tests/modules/test-phase-dag.test.js              # 8/8
node tests/modules/test-repo-inject.js                 # 100/100
node tests/modules/test-contract-phase-build.test.js   # 15/15
```
Commit as three commits if possible (one per version, messages = the first line of each CHANGELOG), else one commit
"0.60.170–0.60.172: pipeline root causes, verify-first, phasemap DAG". 0.60.169 was deliberately skipped: another session's
plan-conflict test (`test-plan-conflict_test.js`, AQ1–AQ7) names it; `lib/plan-conflict.js` is still NOT built.

## 2. What was built (each with its proof; none of it run on Windows)

**0.60.170 — root causes from his 2026-10-19 log** (`CHANGELOG-0.60.170.md`)
- RC1 `lib/safe-watch.js`: fs.watch drop-in; the async EPERM that killed orchestrator/Guardian is said once and re-armed. All 13
  long-running watcher sites use it (incl. ESM `idearium/repo/watcher.js`).
- RC2 `lib/node-registry.js`: scan was O(n²) (store re-read per file); now one map per type. 12k nodes: 10.2 s → 0.95 s here.
  His 20:25 log still shows idearium silent 143 s at boot before it — confirm on his machine.
- RC3 `lib/node-export.js fileIdOf`: `:` etc. → `~` in node FILE names (ids unchanged); build writes `nodes/graph/`, `nodes/phase/`.
- RC4 `lib/path-guard.js` at `repo-inject propose()`: strips "Gemini said", resolves names cut at a dot to the one existing file, or
  refuses. RC5 (where the label enters — transcript reading) NOT found yet.

**0.60.171 — verify first** (`CHANGELOG-0.60.171.md`)
- VF1 `lib/verify-first.js`: an existing file is checked with no model (parse, planned exports, the phase test in COS's process
  sandbox via `cos/testenv/run-target.js`) before any agent. pass → no agent, row `verified`; fail → brief carries the exact
  failure; shallow (no test) → never "done". Wired in BOTH build paths in `idearium/api/index.js`: `runContract` brick dispatch
  (the default, `routing.contract_build`) and the sequential `runPlanned` loop. An existing test is reused only if it already
  proves every code file.
- CB1 `lib/coder-brief.js`: Gemini's own five parts (stack, constraints = AXIOMS v3.1 §1.2 §1.3 §0.5 §8.6 §5.3 §5.7 §12.2 §0.3,
  contract/context, output format, self-critique in the same reply).
- CB2 `lib/pipeline-routing.js preferFirst`: gemini first among browser coders after the learned order
  (`routing.prefer_coder`, `routing.prefer_over: browser|all`; local stays first by default).
- SM1 `lib/agent-self-model.js`: per-provider intent/needs/constraints/learned; `interrogationPrompt` → answers kept as proposals
  for James (§7.2). No route/UI yet (SM2).
- RC4b `path-guard repairTree`: labelled/cut-short files already in a repo are archived to `.nexus/archive/path-guard/<stamp>/` at
  the start of a phase build (runs inside the test-first branch, i.e. when a planner is set).

**0.60.172 — every phase in one DAG** (`CHANGELOG-0.60.172.md`)
- DG3 `lib/phase-dag.js`: all phases + decisions of all maps of a repo; declared/inferred edges, cycles, dangling, undeclared,
  layers, ready, critical path, same-file conflicts; `slice()` per phase. Build refuses 409 `DAG_INVALID` (cycle or dangling;
  `anyway` overrides). Slice saved with the phase graph; graph route shows it; `GET /api/repos/:uuid/phases/dag`,
  `repo dag <repo> [phase]`. Standard added to `docs/CLAUDE.md`.
- Nexus's own maps: 149 maps, 1,744 phases, 61 decisions, 3 cycles (PV0⇄PV1, PL6⇄RF0, GA6⇄GA9), 25 dangling, 525 without a
  depends_on line → DG4 (his call on each cycle).

## 3. What to look for on his next run (SP5_title, looking-glass-bundle-v0.4)

1. `repo dag looking-glass-bundle-v0.4 SP5_title` first — the new gate can refuse a phase whose map has a dangling depends_on.
2. Build SP5: expect a `verified` row for `lib/title.js` and NO "Write ONE file: lib/title.js" / "WRITE THE TEST FIRST" jobs.
   If the test fails against title.js, the brief now carries the failing assertion; if the plan says `title() -> string` and the
   test calls `title(' Looking Glass ')` that is the plan/test conflict AQ1–AQ3 is for (still unbuilt).
3. The "Gemini said tests/…" folder should move to `.nexus/archive/path-guard/…` and leave the Phases panel's "used by".
4. No orchestrator/Guardian EPERM exits; idearium's "node registry" line within seconds of its boot.

## 4. Open, in order (all mapped; maps are the source of truth)

From `docs/2026-10-19-pipeline-root-causes-phasemap.spec`:
- RC5 find where "Gemini said" enters a path · RC6 the unowned 293-char Ollama job every ~90 s (85–147 s each, no caller named,
  20:32–21:52 in his log) — find the caller; the bridge should refuse ownerless jobs.
- AQ1–AQ3 plan-conflict (`lib/plan-conflict.js`, his uploaded test) — the other half of SP5's loop.
- VF2–VF5 (one-response bundle, mutation check, second opinion on need, reviewer memory gate) · SM2 interrogate route/UI.
- DG4 Nexus maps to the standard · DG5 DAG drawn in the Phases panel and carried in the brief.
- SS1–SS4 each system its own store, nodes as data, sealed into compartments · MEM1 cortex keeps the books (his model).
- PR1–PR2 page reader (DOM → semantic tree → chunk → index → synthesize; reuse `clear-glass/src/page/semantic-tree.js`) so Fiverr
  autofill and the co-pilot read pages · ID1 ideas wired through Idea → Notes → Spec → Phases → Code · UI1 Toolbox · UI2 Versionium
  file in Code.

From `docs/2026-10-19-infrastructure-spine-phasemap.spec` (new, his 2026-10-19 ask) — and see 4b for the Idearium control map:
- IN0 baseline census → IN1 old files out (archived + git, approved in batches) · IN2 quotes ledger (`docs/quotes/*.jsonl`,
  `[Q-…]` refs in code) · IN3 the registry is the spine (one component shape; declared edges live next to the component) →
  IN4 retire `loom/maps/*.js` hand maps → IN5 architect mirrors and edits the registry → IN6 systems onto the spine ·
  IN7 every phase/spec file mapped to a registry id · IN8 any-size (incremental, streamed, budgeted).

## 4b. Idearium control — James's ask at hand-off (mapped in `docs/2026-10-19-idearium-control-phasemap.spec`)

James, 2026-10-19: "i need more control over phases." · "need to be able to manage/upload/detect files in the file manager for
the code tab. like idearium all needs to interconnect. map to the correct places, consolidate redundancy in the code tab to more
expanded tabs instead of so many tabs. need to make sure retry logic, response from agent, contract, component store, i need more
control and access to it. logs, flight recorder, able to see into the raid compartment in the files tab. the debug and intelligence
tab should be migrated into one enterprise grade toolbox, especially for cos and testing and verifying. anythingg you can think of.
need to be able to open versionium files in the workarea or surface, only backup the diff changes, consolidate the ideas and notes
tab into one beautiful interconnected idea management system with interconnected features to promote to phase, automatically map
ideas to nexus, nothing exists without dependancies. files names must remain consistent."

13 phases, DAG-clean (0 cycles, 0 dangling, every phase declares depends_on). Ready now (no dependencies): NM1, PC1, CT0, VS1,
VS2, IX1. Suggested order:
1. **PC1 phase controls** — pause/resume/cancel a build; retry from one brick; rerun the proof only; pin an agent; force/skip
   verify-first; edit status/depends_on/files inline (written to the map, DAG-checked); split/merge/reorder; history + rewind.
   Routes + commands first.
2. **NM1 one name per file** — identity = registry id; renames through one door (registry, imports, phasemap files, DAG);
   near-twin detector.
3. **FM1 file manager** (upload as proposals through repo-inject; detect type/component/phase/tests/last version/last agent;
   rename/move/archive) → **FM2 stores in the Files tab** (RAID queue + drops + contract gates, agent responses, contracts, retries,
   component store, flight recorder, logs — virtual folders, open in the surface).
4. **TB1 Toolbox** (Debug + Intelligence → one: health & logs, flight recorder, failures, COS, verify, agents, DAG, resources).
5. **CT0 census → CT1** fewer, wider Code tabs (his choice on the merge is a recorded decision).
6. **VS1** open any version's file in the surface (compare, put back) · **VS2** check how versions are stored today
   (whole-tree snapshot per commit — content-addressed or full copies?), then diff-only with periodic checkpoints.
7. **IX1** one link index over every id → **IM1** ideas + notes as one system → **IM2** promote to phase (funnel → DAG-checked
   phase) · **IM3** ideas auto-mapped to Nexus (no model first).
It supersedes-and-keeps UI1–UI3 and ID1 in the pipeline map. Every UI phase is tested in Clear Glass, never Playwright.

## 4c. Architecture decision NC0 — neutral core, replaceable interpreters, explicit evidence

James, 2026-10-19 (adopting a reviewer's qualification): "make the core domain-neutral now, but don't make the feature pilot wait for
a grand adapter framework. Establish the boundary and prove it with two small adapters before expanding it." · "the components in
the component registry can be any language … all resuable or deterministic code thats architectural, memory or data storage, or
maintains consistency for stability, should have a schema, template or resuable node type or spec file"

Recorded in `docs/CLAUDE.md` (migration, evidence and schema rules) and mapped in the infrastructure map's addendum:
- **NC1** the boundary in code: manifest, graphs, registry shape, proof contract (pass | fail | **unknown** + evidence) — `lib/core/`.
- **AD1** the minimum adapter contract (detect, parse, symbols, dependencies, test, build; any may answer unknown) →
  **AD2** JavaScript adapter by WRAPPING what exists (verify-first, phase-plan exportsOf, loom's scanner, run-target) →
  **AD3** a small Python adapter · **AD4** a documents adapter (Nexus's specs/phasemaps as the non-code domain).
- **NT1** acceptance: the same pipeline on a Python repo and on Nexus's specs with `lib/core/*` unchanged. Only then more adapters
  (tree-sitter / language servers for breadth).
- **FP1** feature pilot (verify-first, phase DAG, file manager) depends only on NC1 + AD2 — it does not wait for NT1.
- **SC1** scaling limits named with remedies and budgets (reachability, whole-table rewrites, full-tree rebuilds, version conflicts).
- **ST1** a schema/template/node type/spec for every reusable architectural, storage or consistency module (68 node schemas,
  loom/templates, architecture-spec scaffold and genesis.spec exist today) — census the gaps.
Key distinction to keep: a generic representation is not generic verification; unknown edges stay unknown.

## 4d. Phases as nodes, phases checked against Nexus, a change entry for every event

James, 2026-10-19: "splitting up all the phasemaps in nexus to their respective system, and into .phase nodes for each phase, and
.dag bundled in?" · "did you make a way to check the phases in relation to nexus. also every contract, file change, diff, phase
completed needs a changelog for versionium?"

Honest status: neither existed. DG3 checks phases against each other, not against the tree; Versionium labels every applied diff
but contracts and phase completions write nothing to it and no readable changelog is produced per event. Measured: 889 of 1,780
phases name no files; 19 done phases name missing files; 367 open phases name only existing files (candidates for "already done");
58% of phases span more than one system.

Mapped in the infrastructure map's last addendum:
- **PN1** phasemaps → `<owner-system>/phases/<map-id>/<phase-id>.phase` + one `.phasemap` narrative node per map, as a proposal with
  an ownership report for the 1,036 cross-system phases (owner + `touches:`); done alongside DG4. The .phase holds what is authored;
  the DAG slice is derived — a `.graph` node keyed by the DAG hash, not bundled into each file (it would go stale on every edit).
  → **PN2** read nodes first, text second, same DAG hash required → **PN3** maps rendered from nodes; new phases born as nodes.
- **PRC1** phase reality check — consistent · drift · maybe-done · uncheckable · orphaned; route, command, Toolbox section. Ready now.
- **VC1** a `.change` entry per event (file change, diff, contract pass/fail, phase completed/proven, restore, release) from the
  records that already exist, no model; the Versionium commit message is the entry. Ready now. → **VC2** changelogs rendered from
  entries (per repo, feature, phase, release).

Suggested first moves in the Code tab after committing: PRC1 and VC1 (both ready, both make every later phase checkable and
recorded), then PC1 phase controls, then NC1/AD1/AD2 and the FP1 pilot.

## 5. Known failures and drift (not caused by these releases)

- `test-test-first` TF-04 ("asked twice") fails on the uploaded tree as before.
- `test-agent-record` AR-41/AR-42 fail on the uploaded tree.
- `test-release-version` RV-03 needs a .git (fine in his tree).
- The root `run-all.js` (hand-kept copy) lacks every suite since 0.60.16x; `tests/modules/run-all.js` is current.
- `docs/PROOF-OF-COMPETENCY.md` numbers table is stale (says 104 phasemaps / 317 suites; now 149 / 543 test files).

## 6. Facts measured this session (for the portfolio and the next decisions)

- 490k lines of JS; 543 test files; 404 suites in the runner; 296 specs; 376 changelogs; 94 MB without node_modules.
- Sovereignty: no kernel's compartment seal is ready; 56 non-test files in the 12 kernels still require
  `cortex/memory/jaa-db.js`; `lib/system-store.js` (IM6) has one user (diagnostic/healer).
- Shared-store contention: "BREAKING STALE FLUSH LOCK … held >10000ms" means a whole-table flush took >10 s while other kernels
  waited — the reason MEM1/SS1 matter, not only tidiness.

## 7. Working agreement reminders (docs/CLAUDE.md)

Map before build (a phasemap phase first, with depends_on — DG3 now enforces it). Reuse before build. Wire loom (until IN4 retires
hand maps, add rows to `loom/maps/run-state-map.js`). Addenda to every spec touched; register new specs. Archive, never delete.
Every version line and changelog opens with James's words verbatim. UI is tested in Clear Glass only. Say what was not proven.
