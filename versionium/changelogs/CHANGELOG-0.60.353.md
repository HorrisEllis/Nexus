# 0.60.353 — UP11: an attached folder knows where to pull from

James, 2026-11-01, pasting his `git pull` in D:\Backups\Downloads\nexus-0.60.346: "There is no tracking information for the current branch."

## What was wrong
- Nexus's attach step (UP6, `attachInPlace`) turned his unzipped folder into a git working tree on `main`, but it never set `main`'s upstream.
- The update tool always names `origin/main` itself, so it worked. A plain `git pull` did not.

## Fixed
- `attachInPlace` now runs `git branch --set-upstream-to=origin/main main`.
- A folder attached before this release needs that command once, by hand.

## Proof
tests/modules/test-nexus-update.test.js UP-10 now checks that `main@{upstream}` is `origin/main` after attach.
