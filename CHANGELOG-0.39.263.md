# NEXUS 0.39.263: Nexus is one repo, its Home is the Nexus atlas, and Clear Glass replaces Playwright

**Date:** 2026-09-26 · clear-glass 3.16.0 → 3.17.0 · versionium 3.2.0 → 3.3.0

James:

> *"playright? no what is that for? litterally have clearglas... also nexus is the repo, not 15, just nexus, then clicking inside of it, shows the rest of them in maybe architecture or no, the nexus atlas, wire that completely in as the homepage of the nexus repo, and everything referenced can be opened in idearium, including each system."*

## Nexus is one repo

**The library**
- The library shows one card, `nexus`, instead of 15.
- The 14 system repos are opened from inside it.
- While you are in a system, the compact list shows it under nexus.
- A filter that names a system still finds it.
- Back from a system goes to nexus; back from nexus goes to the library.

**The Home tab is the Nexus atlas**
- Nexus's Home renders `docs/atlases/nexus-atlas.md`, read from the immutable snapshot (`idearium/ui/js/nexus-atlas.js`, loaded after app.js).
- Every system is a block at the top, showing its files, versions, loom phases done/total, symbols, resolution and port. Clicking a block opens that system.
- Each `### <system>` module heading in the document gets a live line with the same numbers.
- The operational panels from 0.39.261 are in a collapsible section below: snapshot and sync, understanding, system graph, compartments, applied changes.

**Everything referenced opens in idearium**
- The page collects its references: code spans, file-tree lines, `:port`s and `*-atlas.md` names.
- They are resolved in one request, `POST /api/nexus-self/resolve` (`resolveRefs` in `idearium/repo/nexus-self.js`).
- What each kind opens:

| Reference | Opens |
|---|---|
| system name, `nexus.<system>`, `:port`, a system's directory | that system's repo |
| file | its system repo, Files tab, with the file open in the editor |
| `*.md` doc | rendered in place with a breadcrumb; its own references are live too |
| directory | its system repo's Files tab |
| `NEXUS/` | the nexus Home |

- Indented file-tree lines resolve as full paths: `guardian/` → `lib/` → `node-registry.js` is `guardian/lib/node-registry.js`.
- A bare name like `loom.spec` prefers the copy inside the system it is named after (`loom/spec/loom.spec` over `docs/loom.spec`). The other copies are listed in the link's tooltip.
- A path the snapshot does not have is marked struck-through with the tooltip "not in the snapshot". It is never guessed.
- A plain term such as `sigma` or `AX-013` is left as text.

**Each system's Home starts with its own atlas**
- It shows `docs/atlases/<system>-atlas.md`, found by the system's name or by the directory it owns (`ollama-atlas.md` for ollama-bridge), with its references live.
- A breadcrumb `nexus › <system>` sits at the top.

**New routes**
- `GET /api/nexus-self/atlas`: the document, per-system numbers, and architecture-spec's `nexus-atlas-aggregate` roll-up of every synced system's `atlas.json`.
- `POST /api/nexus-self/resolve`
- `GET /api/nexus-self/file?path=`: any text file of the immutable base, read-only.

**Also fixed:** the UI connected to the hardcoded `:4800` even when a different idearium served it. The idearium that served the page is now tried first.

## Playwright is gone: Clear Glass drives the pages

Playwright was a root devDependency for three probe scripts. Four more probes needed Python playwright, which was never installed, so TX-20, GS-20, SA-09 and SA-10 always reported SKIPPED.

Clear Glass is already a Chromium, so it now drives the pages itself.

**`clear-glass/src/driver/glass.js` plus `glass-host/main.js`**
- Node starts Clear Glass's Electron on the host script.
- Each page is a BrowserWindow, driven through its own `webContents.debugger`: the DevTools protocol spoken in-process, with no remote-debugging port.
- With no display on Linux it runs `--ozone-platform=headless` with offscreen windows. A shown window under the headless platform segfaults Electron 42.
- A machine without the Electron binary can point it at any Chromium (`GLASS_CHROMIUM`), driven over the DevTools websocket.
- The API is the subset of Playwright's that the probes used, under the same names, so a probe changes one line:
  - `launch`, `newPage`, `goto`, `evaluate`
  - `click` (on an inline element's first line box, so a wrapped link is hit)
  - `fill`, `selectOption`, `keyboard.press`, `locator`, `$`/`$$`/`$eval`/`$$eval`
  - `waitForSelector`/`Function`/`LoadState`
  - `route` (the Fetch domain), `exposeFunction` (Runtime bindings), `addInitScript`, `cdp`, `screenshot`
  - selectors: CSS, `text=`, `:has-text()` and `a >> b`

**Every real-page probe now runs on it**

| Probe | Result |
|---|---|
| `transcript-push-chromium.js` (TX-20) | 10/10 |
| `live-stream-chromium.js` (GS-20) | 8/8 |
| `selector-check-chromium.js` (SA-09) | 10/10 |
| `selector-assign-ui-chromium.js` (SA-10) | 9/9 |
| `agent-blocks-chromium.js` | 13/13 |
| `clearglass-library-window.js` | 29/29 |
| `clearglass-menu-library.js` | 4/4 |
| `nexus-atlas-home.js` (new: a real idearium, in a sandbox) | 8/8 |

- `home-split-equivalence.js` is ported, but its reference commit `30a0c24` predates this checkout's history, so it reports SKIPPED here, as the Python version would have.
- The six `.py` probes are deleted. The shared probe helper is `tests/probe/_glass-probe.js`.
- `tests/manual-chatgpt-console.playwright.js` became `tests/manual-chatgpt-console.glass.js`.
- Root devDependencies are now electron, electron-builder and jsdom. The lockfile went from 468 to 462 packages.

## Versionium holds every repo's history; loom no longer reads .git

James: *"loom depends on the .git i want versionium to hold the history for each repo."*

Before this, two runtime paths read git:
- loom's phasemap history stamped each phase transition with `git log -1 -- <spec>`;
- idearium's repo snapshots recorded `gitCommit`, the HEAD of a `.git` inside the repo directory.

Neither does any more.

**Every repo's history is its versionium chain**
- A repo's history is its snapshots on branch `repo-<uuid>` in versionium, with the files attached. Versionium already had this layer; nothing new stores history elsewhere.
- **Nexus repos:** each sync commits every new or changed `nexus/<system>` repo, and the `nexus` index, to versionium with its files (`sync({ commitVersion })`, wired in the API).
  - An unchanged sync commits nothing.
  - A failed commit is recorded on the repo as `versionError` and retried by the next sync.
  - The `nexus` index now goes through the import pipeline too, so it can be versioned.
- **Snapshot record:** §33's commit field is now `versionCommit`: `{ source: 'versionium', branch, parent, parentKnown }`, where the parent is the previous version from the file layer's plan.
  - `snapshot.js` no longer imports `child_process`.
  - Records from before this release still show their `gitCommit`.
  - The Versionium tab shows a "version" row.

**Versionium 3.3.0: two new routes**
- `POST /api/versionium/files/stage` puts content into the blob store ahead of `record()`.
  - It works in batches under `FILE_MAX_RECORD_BYTES`, and the sha256 is computed by versionium, not taken from the caller.
  - `record()` takes staged content for any file whose bytes are already stored.
  - So a repo's first version can be any size: core's first version was 98 MB against a 32 MB request cap. It was refused before; now it is staged and recorded (15 s in the sandbox run).
- `GET /api/versionium/files/versions?path=` lists every commit that wrote a path, newest first, with the file's sha256 as of each commit, including deletions.

**Loom**
- `persistHistory()` now stamps each transition with the versionium commit whose copy of the spec has exactly the bytes on disk: `versionCommit`, `versionRepository` and `versionAt`.
- When versionium has no such version, it records `versionCommit: null` with `versionReason`.
- It asks through `lib/nexus-client` (the API), once per spec file per run. Once versionium is unreachable it stops asking, rather than waiting on a timeout for every file.
- `persistHistory()` is now async and single-flight, so two overlapping calls cannot write the same transition twice.

**Also fixed:** `materialize()` deleted the `spec-graph.json` the pipeline writes (since 0.39.246). It is now in the PRESERVE set.

**Sandbox run, with a real versionium on :3754 and a real idearium**
- guardian: three chained versions (183 → 184 → 183 files) as a probe file was added, then removed; `files/versions` shows the add and the delete.
- core's first version (98 MB) was staged and recorded.
- loom's lookup returned `vtm-23fce093` for `docs/2026-08-22-session-full-phasemap.spec`.

**Still using git, deliberately:** `scripts/precommit-check.js` and `scripts/run-verification-manifest.cjs`, which are developer tools for the git checkout itself.

## No Compartment tab: repos are compartments

James, on main's 0.39.262 Compartment tab: *"what is this? repos are compartments. get rid of that and move it where it belongs. should not be a compartments tab, repos are compartments. the only repo i should be seeing is nexus, the rest are nested in the nexus repo, in the atlas."*

**Removed**
- The Compartment tab, its entry in the Create menu, and the Compartment view.
- Anything that still asks for that view lands on Repos.

**The lanes live in the idea's repo**
- The four lanes (brainstorm, problem solving, expand, improve) now live in the repo's **Idea tab**, under the idea's text.
- The Idea tab's own iteration list (add to roadmap, send to agent) moves into a collapsed "iterations" section below the lanes.

**Every idea worked in the lanes has a repo**
- `POST /api/ideas/:uuid/repo` finds the idea's repo, or makes one.
- A new repo is bare, has its own COS compartment, and leaves the idea's phase as it is (`ingest({ keepIdeaPhase: true })`).
- These actions all go through it, and then open that repo's Idea tab:
  - promoting a brainstorm;
  - "work it in its repo" on an idea;
  - `workbench.admit`;
  - `openCompartmentIdea()`.
- At boot, every idea already in the old Compartment is given its repo (`_reconcileWorkbenchRepos`), so nothing worked there is stranded.

**Only nexus at the top**
- The navigator ("Expand all") lists repos only.
- `nexus` holds its 14 systems under a "systems" separator, not as top-level entries.
- The Repos badge counts what the library shows: nexus, not its systems.

**Tests**
- `idearium/test/compartment-ui.smoke.cjs` is rewritten for this layout, and passes. It checks:
  - there is no Compartment tab, view or menu;
  - opening an idea asks for its repo and lands on its Idea tab;
  - the four lanes (nested, linked) render inside it;
  - the navigator nests the systems in nexus;
  - the badge counts correctly.
- `tests/probe/nexus-atlas-home.js`: 10/10 in a real idearium. Two new cases check that there is no Compartment tab, that the badge reads 1, and that promoting a brainstorm opens its own compartment-backed repo on the lanes.

## Tests

`tests/modules/test-nexus-atlas-and-glass.test.js`: 8/8, registered in run-all.

| Group | What it covers |
|---|---|
| AT-001 | every kind of atlas reference resolves to what it names; an unknown one resolves to null |
| AT-002 | the Home is the atlas from the base, every system listed with its own atlas doc |
| AT-003 | a live edit does not show until the next snapshot |
| AT-004 | routes are registered before `:system` |
| UI-001 | markdown and file-tree references |
| UI-002 | one nexus card; back from a system goes to nexus |
| CG-001 | no Playwright, no Python probe, every probe drives Clear Glass |
| CG-002 | a real page: wrapped-element click, fill, `:has-text`, `text=`, events, screenshot size |

`tests/modules/test-versionium-repo-history.test.js`: 7/7, registered in run-all.

| Case | What it covers |
|---|---|
| VH-001 | staged content is recorded and verified by hash |
| VH-002 | `versions()` lists commits newest first, including a deletion |
| VH-101 | a version over the request cap is staged in batches, and still refused when staging isn't possible |
| VH-201 | the first sync versions every repo and the index |
| VH-202 | an unchanged sync commits nothing; a changed one commits only that system and the index |
| VH-203 | a failed commit is recorded and retried |
| VH-301 | nothing in the history path runs git |

Other suites for this part:

| Suite | Result |
|---|---|
| test-mco3-repo-snapshot | 39/0 (was 37/1: the `spec-graph.json` fix) |
| test-mco3-versionium-tab | 32/0 |
| loom phasemap-map | 12/1; its new versionium test passes, and the one failure is also failing without this change |
| mcob-file-versioning | 33/0 |
| mcob-snapshot-restore | 30/0 |
| mcoc-import-baseline | 25/0 |
| versionium-sovereign | 11/0 |
| vsb1 | 5/0 |

Suites that changed, all passing:

| Suite | Result |
|---|---|
| test-chat-transcripts | 31/0 (TX-20 now runs) |
| test-live-stream-and-gates | 13/0 (GS-20 now runs) |
| test-cg-selector-assign | 9/0 (SA-09 and SA-10 now run; SA-06 is still SKIPPED, because its 0.39.250 base commit is not in this history) |
| version-sync-and-registry | 28/2, the same two failures as before this release (lib/version.js lists idearium 4.8.0 while idearium reports 4.7.0) |
