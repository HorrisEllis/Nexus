# 0.60.224 — 2026-10-23

James: "next"

## Why

The self-building loop's map orders SL2 after SL1: close the out-of-date backlog by evidence, not by guessing. "pending" is often out
of date (GA1 shipped in 0.60.161 and still said pending), and every phase left open wrongly holds back everything that depends on it
(DG1).

## Built (SL2)

- **`lib/phase-close.js` 1.1.0.**
  - `evidenceTests(phases, { root })` finds the tests that may judge each open phase.
  - `byEvidence({ phases, root, dryRun = true, setStatus })` runs those tests, each test once, two or three at a time. A phase closes as
    `DONE <date>. by evidence — <tests>` only if every file exists and every one of its tests passes.
  - A failing test keeps the phase open and names the test, and a timeout counts as failed. A missing file keeps it open and names the
    file. No test keeps it open, said: "no test can check it".
- **What may judge a phase**, decided by the axioms (TRUTH_OVER_COHERENCE, §0.1):
  - **its own:** a test file the phase names in `files:`;
  - **linked:** a test tied to one of its files by require or path (lib/test-map.js) that is specific to that file. Specific means the
    test is named for the file, or is one of at most 3 tests that reach it, on a file at most 3 open phases share.
  - Why it is narrower than "tests linked to its files": that wording gave 158 checkable phases, many judged by tests that only require a
    store every test uses.
- **Each test runs in its own sandbox and process group** (`lib/test-sandbox.js` `childEnv`, as `tests/modules/run-all.js` does), and is
  killed with anything it started.
- **Doors:**
  - the route `POST /api/repos/:uuid/phases/evidence` (`{ apply, limit, map }`; a dry run unless `apply: true`);
  - the command `repo evidence <repo> [--apply] [--limit n] [--map …]`;
  - the Phases tab's "⚖ done by evidence?": a dry run that lists what would close and what a failing test keeps open. "close N" asks
    before writing.
- Each close is kept in `idearium_phase_closes` (kind `evidence`) and recorded on the activity log.

## The first dry run over Nexus (nothing written)

`docs/2026-10-23-evidence-dry-run.md` lists every phase with its tests.

- 137 open phases could be judged. 202 distinct tests ran in 13 minutes: 180 passed, 1 timed out.
- **107 would close.** Only **2** of them close on their own test: G0 and PS1_phase_specs. The other 105 close on a test that is specific
  to one of their files. That shows the file works, not that the phase's whole intent was built.
- 30 stay open because a test failed.

Nothing was applied to Nexus's maps. Closing 107 phases at once is a cost he would want to see first. To confirm with him: apply the 2
"own" ones, all 107, or a subset he picks from the list.

## Found

- **Fixed:** the first dry run spawned tests without a sandbox, and they wrote ledgers into `data/` and `cortex/data/`. Three of those
  files went into a commit (untracked again in c5c787c5's parent); the rest were moved out of the tree and kept.
- **Not traced yet:** even sandboxed, some test writes `failure_mode` nodes into `cortex/data/nodes/failure_mode`, which is not one of the
  sandbox's stores. Reported; the files were moved out of the tree and kept.

## Proof

- `tests/modules/test-evidence-close.test.js` 5/5:
  - **EC-01** which tests may judge a phase;
  - **EC-02** the dry run with real tests in a fixture tree: one closes on a passing test, one stays on a failing test, one stays with no
    test, one stays on a missing file, and a hot shared file's test does not count;
  - **EC-03** apply through the real writer, and a refusing writer keeps the phase open, said;
  - **EC-04** the real API on a repo: dry run, apply, the map says `DONE … by evidence`, the record is kept, and nothing is left to check;
  - **EC-05** the Phases tab in Clear Glass: the dry run is sent with `apply: false`, the list shows, and close asks first.
