# 0.60.477 — the update pulls the latest; a conflict is asked, never a dead end

James, 2026-11-10: "Need to push an update to cos. It won’t let me update. The manual update feature doesn’t work well either. I need the update to be
able to pull the latest version. If there’s a conflict, prompt me to ask if I want to fix it or not. Should we make a seperate repo for cos. So I can
update seperately. I can’t get cos updated"

## What stopped it (found in the code)
- The update popup showed **no button at all** when a file he had edited was also changed on GitHub ("commit or set them aside first").
- Commits here that GitHub lacks were refused unless "Keep mine" was used; edits and commits together had no way through.
- No backup, no update: when Idearium was not running or too slow, every update was refused.

## Now
- **A conflict is asked** (`ask: conflict`): *Fix it and update* keeps his edits and commits on a branch `local/<date>` (his edits committed there by
  "Nexus update"), then takes GitHub's version (`git reset --keep`, which refuses rather than overwrite). Nothing is lost; later updates fast-forward.
  *Leave it* changes nothing. Asked before any backup is taken.
- **No backup is asked** (`ask: no-backup`): *Back up with git* makes a `backup/<date>` branch at this commit and saves every uncommitted edit as
  `_archive/update/<date>-backup/local.patch`.
- Where: COS's update popup, COS's Updates page, and a terminal with nothing running: `npm run update` (now `node lib/nexus-update.js update`;
  `--yes` answers yes to both). The old script stays as `npm run update:plain`.
- Route: `POST /api/cos/update/apply` takes `resolve: fix` and `backupWith: git`; a conflict or no backup answers 409 with the ask.
- Roll back still works on a fixed update (it returns to where he was).

## Proof
- `node tests/modules/test-nexus-update.test.js` UP-15 (conflict asked, nothing moved, no backup taken; fix keeps both; git backup with his edit in
  the patch; roll back returns); UP-07 fails as before this change (lib/hat-seed.js wording).
- `node tests/modules/test-cos-updates.test.js` 12/12 (CU-02: the refusal is an ask). Popup, menu, COS app update tests unchanged and green.
- Run by hand on a throwaway clone: the terminal asked both questions, kept the edit on `local/<date>`, updated.

Coder's part: the reading of "fix it" as keep-yours-on-a-branch-and-take-GitHub's (merging both is possible later, his call).
