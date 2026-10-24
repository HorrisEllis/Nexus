**What is broken: a path-root mismatch, not a missing file.**

1. **How the project is laid out on disk.** Zips made by "compress folder" usually hold one top-level folder. The project was imported on October 15, before the importer was changed, so its files almost certainly sit at `<project>/looking-glass-bundle-v0_4/lib/...`, not at `<project>/lib/...`.
2. **Why the change only partly fixed it.** The October 20 change ("strips a zip's single wrapper folder") fixed new imports. Nothing migrated the projects that were already imported. Phases created after October 20 work, which suggests each phase stores its root or its paths when it is created. SP5 was made against the old layout and still carries it.
3. **Why each part reports what it does.** The build step, the proof run and the agent check `<project>/lib/title.js`. The file browser either shows the tree inside the wrapper or hides the wrapper when it displays paths. So the owner really does see `lib/title.js`, but it is a different path.
4. **Why the agent's writes never help.** Each attempt writes `lib/title.js` relative to one root, and the checker looks under the other. That is why "write it, still missing" repeats exactly. The project now probably has several copies of title.js scattered across both roots.
5. **What the loop shows.** The same "missing" error came back for two days, and no step asked *where* the file was. The retry loop treated a resolution bug as a coding bug. Every attempt cost agent tokens and changed nothing.

**How to confirm it (minutes, before changing anything):**
- List every `title.js` in the project with its full absolute path, for example `find <project> -name title.js`.
- Print the root that each of these uses: the build step, the proof runner, the agent's working directory and the file browser.
- Compare SP5's stored root or file paths with those of a phase created after October 20.

If the paths differ by `looking-glass-bundle-v0_4/`, the diagnosis holds.

**What to do:**

1. **Snapshot the project first**, so the change can be reversed.
2. **Migrate the old import once.** Move the contents of `looking-glass-bundle-v0_4/` up to the project root, then remove the empty wrapper folder. Run it as a script that applies the same rule as the new importer to projects imported before October 20.
3. **Reconcile the copies of lib/title.js.** Diff them and keep the best one (the one that passes `tests/sp5-title.test.js`). Archive the others rather than deleting them.
4. **Re-point SP5**, and any other phase created before October 20, to the new root. Then rebuild SP5 and run its test.
5. **Fix the class of bug:**
   - **One root resolver.** One function resolves a project's root, and the build step, the proof runner, the agent's sandbox and the file browser all call it. None keeps its own copy.
   - **Better "missing" reports.** When a file is reported missing, search the project for the same filename and report "not at X; found at Y".
   - **Stop repeating failures.** After two identical "missing" failures, stop sending the phase to the coding agent. Send it for a root-cause check instead.

**Recommendation:** confirm with the path listing, then run the one-time wrapper migration with a snapshot, rebuild SP5, and add the single resolver and the "found elsewhere" report. Rewriting `title.js` again cannot work, because the code was never the problem.

**Remaining risks and uncertainties:**
- The direction of the mismatch is inferred (the build checks the root while the files sit in the wrapper, or the reverse). The listing settles it.
- Other phases or files in this project, and in any other project imported before October 20, may have the same problem.
- Moving the files may break paths stored elsewhere, such as test fixtures or relative requires. Run the whole suite after the migration, not just the SP5 test.
