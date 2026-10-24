**What is broken:** the project's root path, not SP5's code. The project was imported on Oct 15, before the importer started stripping a zip's single wrapper folder. Its files most likely sit under `looking-glass-bundle-v0_4/lib/title.js`. The build and the proof resolve `<project>/lib/title.js`, which does not exist. The file browser shows "lib/title.js" because it either opens at the wrapper folder or because the owner is reading the nested path. Each agent attempt writes the file somewhere the build does not look, or writes it inside the wrapper. Two days of retries never changed what the build checks. Phases created after Oct 20 have no wrapper, so they build fine.

**End-state**
- Minimal: SP5 builds and `tests/sp5-title.test.js` passes.
- Optimal: every pre-Oct-20 import is migrated to the flat layout, and the build, proof, agent and browser all resolve paths through one root function.
- Exceptional: a "missing" error prints the absolute path it checked and the project root. A retry loop that writes a file that is then still "missing" stops after one attempt and reports a path divergence instead of spending agent calls.

**Constraints**
- Walls: the original zip's layout, and the history (the Oct 15 import is done).
- Obstacles: the importer change applies only to new imports, there is no migration, the error messages hide the paths, and retries are unbounded.

**Invariants:** the file exists (the owner sees it), and the agent writes succeed. Three independent tools agree it is "missing", so they share one path assumption. The only variable that separates working phases from failing ones is when the import happened relative to Oct 20.

**Working backward:** a build passes when the path it checks equals the path where the file is written. That is false here, and the gap is the root (wrapper versus no wrapper).

**Negative space**
- No migration for old imports.
- No absolute path in the error.
- No check that a write is visible to the next build.
- No retry limit.
- No layout version recorded on the project.

**Options**
- A. Migrate this project by stripping the wrapper. Take a snapshot first, move the contents up, and archive the wrapper folder and any duplicate `lib/title.js` copies the agents left (keep them, do not delete). Then rebuild SP5.
- B. Leave the files in place and record a `root: looking-glass-bundle-v0_4/` field on the project, so every tool resolves through it.
- C. Re-import the zip with the new importer.

**Choice:** A, with B's single root resolver added so the bug cannot come back. C is the weakest because it loses any edits made after import.

**Attack**
- Weakest assumption: that a wrapper folder is the cause. Before moving anything, prove it by listing the project root and finding every `title.js` with its absolute path.
- If the wrapper is not there, the divergence is between the agent's workspace and the build's workspace. The same fix applies: one root function, and the build reads where the agent wrote.
- Failure mode: some files in the wrapper may be referenced by paths that include the wrapper. After migrating, run every phase, not only SP5.
- Failure mode: several stray copies of `title.js`. Diff them, keep the newest valid one, and archive the rest.

**What it rests on, and what would prove it wrong**
- It rests on the dates (import Oct 15, importer change Oct 20), on post-Oct-20 phases passing, and on a file that is visible but reported missing.
- It is wrong if the absolute path the build checks really contains the file. If so, look instead at permissions, case sensitivity, or a stale build cache or snapshot that the build reads instead of the live tree.
