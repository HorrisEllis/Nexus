# NEXUS 0.39.165 — Idearium UI restructure + repo intelligence scan

## Landed and verified

1. **Topbar** — `open gaps` and `snr` removed; `ideas` and `specs` remain.
   Dead `stat-gaps`/`stat-snr` writes removed from `updateStats()`.
   Per-idea gaps and the snapshot snr metric are untouched.

2. **Tab reorganisation**
   - Create = Brainstorm, Ideas (capture only).
   - Build = Spec Library, Eravos (organism canvas), Architect (block
     canvas), Spec Builder.
   - The old global `#view-architect` (read-only blueprint over EVERY
     compiled spec) is deleted from the nav — it is now a per-repo subtab.
     Welcome pillar 05 repointed at the block canvas.

3. **No sidebars in a repo** — `.repo-wrap` is single-column in both
   states; `.repo-wrap.repo-open .repo-rail{display:none}` removes the
   rail *and* its "filter repos" input once a repo is open. Return via
   the existing "← All repos" button.

4. **Repo subtabs** — Home · Files · Architect · Phasemap ·
   Intelligence · Settings.
   - `renderRepoArchitect(repo)` — that repo's own spec-engine spec,
     chunk by chunk, via `repo.specUuid`/`promotedFromSpec`. Says so
     plainly when a repo has no spec attached.
   - `renderRepoIntelligence(repo)` — new, see below.

5. **`GET /api/repos/:uuid/scan`** + `idearium/repo/scan.js` — the
   Intelligence subtab's data. Computes no new facts: reads graph,
   verification.json and the lazy artifact and reports what is already
   true in them.
   - **dangling hooks** — unresolved graph edges, split by whether the
     specifier is intra-repo (genuinely broken) or external (a package,
     not a defect, and never summed into the headline number).
   - **gaps** — verification tiers that failed/partial/pending, with
     their real `failures` lists, plus files no chunk covers.
   - **tension** — fan-in/fan-out over resolved `depends_on` edges,
     threshold = mean + 2σ (floor 5), inverse edges excluded. Reported
     as real degree counts with the method stated; no composite score.

## Bugs found by testing (each was real, each is fixed)

- `scan.js` originally `JSON.parse`d `graph.json` directly. `writeGraph()`
  deliberately does not persist chunk/symbol containment — `readGraph()`
  rehydrates it. Result: every file reported as "covered by no chunk" on a
  repo with 83 real chunks. Now uses `readGraph()`, the same loader
  `repo.graph.traverse/cone` use.
- The lazy artifact is `verification.lazy.json`, not
  `verification-lazy.json`. Now goes through `readLazyVerification()` so
  it cannot drift again.
- Failed tiers dropped their `failures` array — the only part that says
  *where* a tier failed. Now surfaced.
- The scan returned `ok:false` for "not indexed yet". `api()` in
  ui/js/app.js throws on `ok:false`, which made the UI's own empty-state
  branch unreachable — it always fell into the catch and showed an error
  for a non-error. Envelope is now `ok` (transport) + `scanned` (payload).
- Three dangling `renderArchitect()` call sites would have thrown
  `ReferenceError` after the function moved. Removed/redirected.

## Tests

`idearium/test/ui-restructure.smoke.js` — jsdom; asserts the topbar,
both tab groups, that every `setView()` target has a section, the
no-sidebar CSS, and clicks through all six subtabs asserting each
renders real content. Intelligence is driven by genuine scan output.
`idearium/test/scan-unindexed.smoke.js` — the never-indexed empty state.
Both pass, 0 failures.

Scan verified against a real repo built by the real `runImportPipeline`
(9 files, 83 chunks, 36 edges) with one deliberately planted broken
relative import — correctly separated from `express`/`fs`/`path`.

## NOT done — no backend exists for these

- **CI/CD per compartment with SSH** — no CI/CD subsystem and no SSH
  infrastructure anywhere in the tree. A real subsystem build.
- **Push/pull repos** — `.git` is real (project-import shells out to the
  git binary) but there is no remote config or credential path.
- **Test env / "torture chamber"** — does not exist by that name.
  `cos/playground/sandbox.js` is real and wireable
  (`SandboxRunner.run(compartment, branchId, opts)`).
- **Versionium per compartment** — cheap and real, not yet wired:
  `engine.commit()` already takes `branch`/`system` and
  `/api/versionium/history?system=` filters, so compartmentId maps
  straight on via a proxy from idearium's API.
- **TV shell block** (editable channels, nerve, gated event listeners,
  replay + diagnostic on the floating button, channel settings) —
  untouched this pass.

## Note on import project

Already working; nothing was changed. `project-import.finalize` ingests
into the COS compartment, materializes, runs the chunking pipeline, then
the UI calls `openRepoFor()`. Worth testing rather than rebuilding.
