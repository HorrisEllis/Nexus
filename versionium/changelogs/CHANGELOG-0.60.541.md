# 0.60.541 — the update tool's git runs hidden and never prompts; its errors in plain words

James, 2026-11-14, two screenshots:
- earlier the same day, Settings › Update showed git's raw words: "Unhandled Exception: OutOfMemoryException. fatal: could not read Username for
  'https://github.com': terminal prompts disabled";
- then an empty `C:\Program Files\Git\cmd\git.exe` window opened over COS while it checked GitHub.

## Fixed (`lib/nexus-update.js`)
- **No more empty git windows.** Every git the update tool starts runs with `windowsHide`. Run from COS, which has no window of its own, a git
  started without it opened an empty console.
- **No hidden waits.** Git never waits on a prompt nobody can answer: `GIT_TERMINAL_PROMPT=0` and Git Credential Manager set non-interactive.
- **A failed fetch is said plainly, with its fix.** Git's own words are kept beside the plain line.
  - Out of memory: Git's sign-in helper ran out of memory; close some apps and press Check GitHub now again.
  - No sign-in: GitHub needs your sign-in once; run `git -C "<this Nexus folder>" fetch origin main` and sign in.
  - No network: GitHub could not be reached.

## Proof
- `node tests/modules/test-update-git-quiet.test.js`: 2 passed.
  - UQ-01: every git call in the tool is hidden and non-prompting.
  - UQ-02: his two errors map to plain words with the fix.
- `test-cos-updates`: 12 passed.
- `test-nexus-update`: 13 passed, 1 failed. UP-07 also fails on the code before this change; it is not caused by this release.
