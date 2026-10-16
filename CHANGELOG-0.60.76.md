# 0.60.76 - 2026-10-16

A mistake in 0.60.75, found and fixed.

## What went wrong
The proposal-evidence runner (0.60.75) runs a file's linked tests in a shadow copy of the tree. The shadow emptied only the top-level `data/`. Nested state folders (`guardian/data`) were reached through symlinks, so tests run in the shadow wrote into the real ones. My commit then used `git add -A -- . ':!data'`, which excludes only the top-level folder, so one modified file and eight new response nodes under `guardian/data/` went into the 0.60.75 commit and were pushed. That breaks "NEVER commit data/**".

## What changed
- `lib/proposal-evidence.js`: every folder named `data`, at any depth, is copied into the shadow (the tests still find their fixtures; their writes stay in the copy).
- The nine files are removed from git and the working tree. History still contains them in cbf6918; I did not rewrite pushed history.
- tests PE-08b (a write into a nested data folder stays in the copy) and PE-10 (a before/after listing of every real data folder is identical after running six real tests).
- Staging from now on excludes data at any depth: `git add -A -- . ':!data' ':!**/data/**'`.
