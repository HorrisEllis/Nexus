# 0.60.209 — six more systems hold their own files (DL3)

James, 2026-10-22: "continue" (after 0.60.208, Guardian end to end).

Map: docs/2026-10-21-data-layout-phasemap.spec DL3_rewire_writers, with a dated addendum.

## What moved
- **Six systems now find their data through `lib/data-home.js`:** versionium, ollama-bridge, architect, clear-glass, diagnostic and
  orchestrator.
- No code names their root `data/` paths now, so each one's files come home at its next boot:

  | system | files in this tree |
  |---|---|
  | versionium | 8 |
  | ollama | 2 |
  | architect | 1 |
  | clear-glass | 1 |
  | diagnostic | 5 |
  | orchestrator | 5 |

- **Diagnostic's table of systems** points each one at `<folder>/data`. That table is what the system registry's `dataDir` field
  comes from.
- **`rewired()`** accepts a system's name or its folder name, because `ollama-bridge` lives in `ollama/`.
- **Not yet:**
  - Their tables in Cortex's database (SS2) move one system at a time. Each needs routes, as Guardian's did.
  - The shared `data/ledger/` folder is still its own step.

## Found by running the tests one by one
- **`ollama-command-index` let a real boot move this checkout's data.**
  - The test started `ollama/server.js` without the test sandbox. `run-all` provides one, but a direct run did not.
  - Its boot brought `data/ollama/*` home in this checkout.
  - The tracked files were restored from git. The clear-up's own rollback correctly refused: the running server had appended to the
    moved files, so their hashes had changed.
  - Two fixes:
    - the test now sets up the sandbox;
    - `lib/data-home.js` itself sandboxes any test process before it computes a path, as every other resolver does.
- **`test-agent-facts` GA-02** checked that Clear Glass's provider cache was under its own temporary folder. Its intent was "never in
  the repo", and it now checks exactly that.

## Proof
- `test-data-rewired` 3/3: no code names a rewired system's old path; Diagnostic's table points home; the shared writers resolve each
  rewired system to its own folder.
- The 68 test files that load these modules were each run on 0.60.208 and on this release. All match apart from GA-02, described
  above.
- `test-data-home` 6/6, `test-guardian-own-data` 5/5, `ollama-command-index` 19/19 (the tree untouched).
