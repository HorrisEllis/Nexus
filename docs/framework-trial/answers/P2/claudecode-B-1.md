**What is broken:** the code is fine, but two parts of the pipeline use different project roots. This project was imported on Oct 15, before the importer stripped wrapper folders. So its files sit under `looking-glass-bundle-v0_4/` (or a similar wrapper), and the real path is `looking-glass-bundle-v0_4/lib/title.js`. Since the Oct 20 change, the build step, the proof runner and the missing-file check look for `<root>/lib/title.js`. The file browser shows the tree under the wrapper, which is why the owner sees `lib/title.js` there. Each agent write either goes into the wrapper or lands at a root path that the next build (or import/sync) does not read. "Missing" is a false report: the build is looking in the wrong place. Phases created after Oct 20 work because their paths were recorded after the change.

**What solving it looks like:**
- Minimal: SP5 resolves `lib/title.js` and `tests/sp5-title.test.js` and goes green.
- Optimal: every project imported before Oct 20 has one root, used the same way by the importer, browser, build, proof and agents.
- Exceptional: a "missing" result that keeps coming back stops the loop and gets diagnosed, instead of being retried for two days.

**What is fixed and what can change:** The old zip layout and the dated importer change are history and cannot be changed. The stored project layout and how roots are resolved can be changed.

**What I'm relying on:** the file exists (the browser shows it), and the tool calls report the same path as missing. When one file is both present and absent, the paths disagree, not the code.

**What is missing:**
- No check confirmed where an agent's write actually landed.
- No retry limit or diagnosis after the same failure repeated.
- No migration ran for projects imported before the importer change.
- Nothing reported that the change only affected new imports.

**Options:**
- A. **Migrate the project (my choice).** Snapshot it first, then move the wrapper's contents up to the root. Remove only true duplicates (the stray `lib/title.js` copies the agents wrote), and compare them before removing so nothing is lost. Record the migration and run it for every project imported before Oct 20.
- B. **Resolve paths per project.** Store a `rootPrefix` for each old project and have every tool apply it. Nothing on disk moves, but every consumer has to apply it correctly forever, and any one that forgets causes the same failure again.
- C. **Pin SP5's paths with the wrapper prefix.** This is quick, but it is a patch for one phase, and the next old phase breaks the same way.

**Testing option A:** Its weakest assumption is that the cause is a wrapper folder. Prove that first: list the project root and `stat` the exact path the build checks, then the path the browser shows. If the wrapper also holds a `tests/` folder, the migration must move it too. Another failure mode: the agents' copies of `title.js` may differ from the original. Compare them before keeping or dropping any, and archive what is replaced. Then add the missing safeguards:
- after every write, check the file through the same resolver the build uses;
- after the same "missing" result twice in a row, stop and report a root mismatch;
- add a test that imports a wrapped zip under the old layout and builds it.

**What this rests on:**
- The file is visible yet reported missing.
- The importer change was dated and affects layout.
- The project was imported before that date.
- Only phases from after the change work.

**What would prove it wrong:**
- the build's checked path really does contain `title.js`;
- there is no wrapper folder in the project tree;
- phases created before Oct 20 in other projects imported after Oct 20 also fail.

If any of these hold, look instead at path caching or the build's working directory.
