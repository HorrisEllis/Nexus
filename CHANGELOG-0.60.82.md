# 0.60.82 — 2026-10-16

_Built on the branch claude/exciting-shannon-m4nawj as 0.60.81; renumbered 0.60.82 at the merge with main (main had already used 0.60.79)._

James: "expand the code tab in repo. the file and code tab merge. all of it from the phases3"

The UI on top of 0.60.81's backend, in his order: backend, then route, then command, then UI. The map is
`docs/2026-10-15-code-tab-run-state-phasemap.spec`, addenda (b) (the plan) and (c) (what was built).

## The Files tab is merged into Code (CE6)

He decided this on 2026-10-15 ("yes one tab.") and repeated it today.
- **No Files button.** `setRepoSubtab('files')` and `openApiRepoFile()` open the Code tab, so a file opened from
  search, the atlas or Architect lands there.
- **Nothing deleted.** The Files panel and its opener (`openApiRepoFileInFiles`) are kept, archived (§0.3).
- **The tree** gets the Files tab's filter, **+ file** and **× delete** (to .trash/), beside its file states and
  waiting diffs.
- **The open file** gets **edit**: a textarea; Ctrl+S saves through `POST …/file`, the one write path, so a save is a
  version; Esc cancels; a dirty edit is never dropped silently. It also gets **manage · history**.

## Manage and History are one menu (CV1)

He asked for this on 2026-10-15: "that and manage and histry should be one menu".
- Manage opens on the Code tab's file, with the picked lines as its scope.
- Its right rail is the file's whole timeline, newest first:
  - its manage runs;
  - the commits that touched it, with their labels (0.60.81: edit · manage · agent · person · restore · revert, and
    by whom);
  - its versions.
- Tag chips filter the timeline. Any version can be **diffed with now** or **restored** (the restore is itself a
  version).

## The picked lines, with an action (CE7)

- Pick lines in the gutter. The agent pane offers change · expand · refactor · fix · document · explain.
- The agent gets exactly those lines (`POST …/code/assist`). What comes back is a diff above the code, waiting for
  Apply. Explain only answers.

## The bottom panel (CE9)

He asked on 2026-10-15: "code tab needs all the activity, response ledger, etc."
- **activity:** as before.
- **runs:** the run state Nexus keeps.
  - The route copilot gives this repo's agent.
  - Each run as a pipeline: goal → each step ✓/✗ → its state.
  - Opened, a run shows the agents that tried it, what happened to it (fallback, off-task, lost, rewound), and the
    files it read and changed.
  - **rewind this run** asks with a dry run first.
- **responses:** the repo agent's exchanges.
- **tasks · log · control · versions · machine:** the Plan panel's own views, drawn in the Code tab.
  `repo-tasks.js`'s one resolver `_rtEl` points them at whichever mount is on screen: one set of data, two mounts.

## Phases in Idearium (CV6)

- Every phase of this map already carried its declared systems (PT1/PT2, 0.60.63–64). What was wrong: the map's
  `open_decisions:` entries (CE0, CV0) showed as pending phases.
- loom's reader now marks entries under `open_decisions:` / `decisions:` as `kind: decision`, and reads a DECIDED one
  as done. The marker is carried through the roadmap node, `schema.phase_node` and a "decision" chip on the Phases
  tab.
- Nothing is dropped, so no count changes.

## Proof

- `tests/modules/test-code-tab-merge.test.js` 7/7:
  - MG-00 reads the page's own source;
  - MG-10…15 drive the real scripts in Clear Glass: tree, edit, Manage + timeline + diff + restore, line actions,
    runs + rewind, responses + tasks + log.
- Unchanged and still passing:
  - `test-code-tab` 16/16
  - `test-code-surface-state` 6/6
  - `test-code-tab-expand` 8/8
  - `test-build-surface` 13/13
  - `test-build-surface-2` 3/3
  - `test-phases-tab` 5/5
  - `test-moce-roadmap-ui` 17/17
  - `test-one-idearium-phases-nodes` 21/21
  - `test-loom-phasemap` 7/7
  - `test-loom-phasemap-status` 14/14
  - `test-phase-specs-tag` 7/7
  - `test-vm-control` 7/7
  - `test-loom-map` 19/19
- Failing before and after, the same way (checked by running each without these changes):
  - `test-moce-roadmap`: 3 failures (`specs` and `blocks` undeclared in the schema, and a status read);
  - `test-event-contracts` EC-05;
  - the probes `repo-drawer-views-glass` and `repo-tasks-drawer-glass`.

## Not done (said, not hidden)

- **CE9's Clear Glass mesh mount.** The views are Idearium page scripts; mounting them in Clear Glass's renderer is
  separate work.
- **"Retry from step n" and "send to another provider".** They have no route yet.
- **"Every check with its last result".** The runs panel shows the current plan step's gate bar, not the full list
  of checks.
- **CV5 (universal versioning)** waits on his answer to CV0. **CE11** belongs to the automatic-tracking map.
- **No live run on his machine yet.**
