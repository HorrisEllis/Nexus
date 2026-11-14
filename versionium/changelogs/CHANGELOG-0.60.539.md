# 0.60.539 — Idearium's build records survive a restart; each file tracked through the pipelines

James, 2026-11-14, sent a screenshot of `GET /api/repos/nexus/phases/runs?phase=CS12_the_mover_is_proven` answering `runs: []`. Then: "then we can
track each file moving through the backend. tagging each step, and gate" · "build it if its quick".

## Found
Idearium's log showed the CS12 build getting as far as "before the agent starts". Yet after Idearium restarted, it had no record of that build at
all.

The cause: Idearium writes build rows into the shared store (`lib/jaa-store.js`). That store keeps each table in memory and writes it to disk only
after a debounce. The restart came first, so every row of the build was lost. That is his rule broken at the root: "stop using memory for
storage".

## Fixed
- Idearium's build records (`idearium_phase_runs`) are now written to disk as each row is added:
  - `lib/jaa-store.js` gains `flushTable(table)`, which writes one table now. In the default append mode that is an append, not a full rewrite.
  - `cortex/memory/jaa-db.js` exposes it.
  - `idearium/lib/db.js` calls it for this table.
- Other tables keep their debounce. The change applies only where a restart must not lose rows.

## Built: each file through the pipelines (PC8 expanded_2026_11_14_c, slice a)
- **Tags on each step node.** Every `.process_step` node (0.60.538) is tagged with:
  - its run, pipeline and step;
  - its status;
  - its gate's outcome;
  - every file it named (`file:<path>`).

  File names are read from the step's output: keys such as `file`, `path`, `files`, `changed`, `written` and `read`, at any depth, kept only when
  the value looks like a path.
- **A file's trail.** `GET /api/cos/automation/pipeline-trail?file=<path>` (declared in COS's contract) and `cos file-trail <path>` return every
  step, across runs, that named the file, oldest first. Each entry has the step's state and its gate's outcome. It is a read over the step nodes on
  disk, with nothing held in memory.
- **On the canvas.** OUTPUTS lists a step's FILES. Clicking one shows its TRAIL.

## Proof
- `node tests/modules/test-idearium-build-rows-durable.test.js`:
  - DR-01: a build row is written, then the process is killed at once (no exit, no flush), and the row is on disk for the next process. **It fails
    on the old code**: the row is lost.
  - DR-02: a table not marked durable still waits for its debounce.
- `node tests/modules/test-pipeline-waits-for-a-system.test.js`: 6 passed. PW-06 checks:
  - the files appear as tags on the node;
  - `status:done` and `gate:open` are tagged;
  - a file's trail spans two runs, oldest first;
  - an unknown file has an empty trail.

## Not yet
- Idearium's build itself resuming on Idearium's boot. Its rows now survive; the agent's work in flight does not yet.
- Tracking files a step touches without naming them in its output (Versionium's record of the change, by route).
- His reading to confirm: "moving through the backend" taken as across every system a step calls.
