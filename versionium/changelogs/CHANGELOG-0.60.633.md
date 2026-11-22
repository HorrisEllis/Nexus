# 0.60.633: Settings › Storage and data

James, 2026-11-22: "first give cos ui a tab for storage and data, like location of nexus, reinstall tools, verifify integrity tools, manage nexus, in
the cos ui settings." Shown the live preview: "Yes, build it".

## What changed (SC19 slice a)
- **Location:** Nexus's folder, COS's, the version, GitHub, the service, and each drive's free space (a drive under 5% is called out).
- **Integrity:** Verify reads git's status in Emerge (`cos/sovereign/storage.eg`): code files missing, changed, not tracked; data counted apart;
  Emerge's lock; the last backup.
- **Repair and reinstall:** restore only missing code files; npm install from the lockfile, then restart the running systems; reinstall the COS
  service through the app; roll back the last update.
- **Manage Nexus:** restart it; back up now (a git backup branch with the uncommitted edits, and every data folder archived into `nexus-backups`
  beside Nexus); which systems are up.
- **Data by system:** measured by COS, kept on disk.
- Every act is a person's (an agent gets a 403), asks first, and is written to COS's ledger. A long one is a job kept on disk and streamed as `cos.storage`.

## Different from the preview (said)
- **Move Nexus is shown but held.** Switching COS to a new folder belongs to the COS app, which has no way to do it yet (CA7 slice b).
- **Open folder became Copy folder path.** The manager runs as a Windows service with no desktop, so it cannot open a window.
- **Reinstall dependencies is not a clean wipe.** It runs `npm install`: deleting node_modules while Nexus runs from it could leave Nexus unable to start.

## Proof
`eg test cos/sovereign/test/storage.test.eg` 3/3. On a real COS manager from the worktree: an agent refused (403), no confirm refused (400), a deleted code
file found and restored, a restart, a backup (branch and a 1.7 MB archive of 1,982 entries, removed after), the tab read in the browser on live data.
Not run: Reinstall dependencies, Reinstall the COS service and Roll back, because each would act on his running Nexus.
