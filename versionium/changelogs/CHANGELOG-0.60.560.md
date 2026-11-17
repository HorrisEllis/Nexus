# 0.60.560: the 2026-11-15 pipeline fixes, kept this time

James, 2026-11-17: "finish it. need nexus building itself"

On 2026-11-15 the CS12 build was run through COS's pipeline on his machine, stop by stop, and each stop was fixed there. Those fixes were never
committed. When his branch moved to 0.60.558, the ones in `idearium/api/index.js` were lost, and his RQ0 run on 2026-11-17 failed on one of
them again (landed read Idearium's "auto-retry-held" note as the build). This release puts them all in main.

## Fixed
1. **landed reads only builds.** `lib/flight-data.js` `latestBuild(flights, phase)` takes the newest `phrun-…` run. Idearium's own auto-retry
   note about a phase (run id `auto-…`) is not a build. The route also looks in the Nexus system repos, where a Nexus map's phase can build.
2. **Versionium never freezes on git.** His checkout is a partial clone (`[blob:none]`). `git log -p -- lib/version.js` fetched every old blob
   from GitHub inside `execFileSync`, on Versionium's own thread, for the boot's releases sync: Versionium answered nothing, `/health`
   included, for minutes, three times on 2026-11-15 (git.exe under it, 0 % CPU). In Versionium's process git now runs with
   `GIT_NO_LAZY_FETCH=1`; the backfill child (`release-backfill-worker.js`) may still fetch. `read()` says why a release is unpinned.
3. **The build's snapshot retries a timed-out Versionium** ("files/limits timed out after 8000ms" when COS had woken it from idle).
4. **No "which file?" follow-up job.** A reply's lone code block without a path was followed by a second job in the same chat; its one-line
   answer (the file name) became what the build read, on Claude's and Gemini's pages. While a request (a chunk, a brick, the test writer) asks
   for one file, `lib/repo-inject.js` `expectAsking` names it, and the lone block goes there.
5. **Inline code.** The chunk brief says to write the file in the reply as text, not as a file, artifact or canvas. Guardian's Claude
   userscript reads the reply from the conversation the page loaded when the page's text holds no code block.
6. **The test writer hands over.** A writer that does not answer hands the test to the next agent on the route that is not the coder; last of
   all the model that codes (Ollama), marked not independent (PE6). The test is still kept only if it fails on today's tree.

## Proof
test-flight-data FD-10, test-release-backfill-off-process RB-03, test-idearium-solid SO-01b, test-log-fixes LF-05b and LF-07: each fails on
the old code. Suites run in the worktree on 0.60.560 are listed in the commit.

## Not done (said)
- Nexus building itself end to end is proved only by a run: N1 through COS's pipeline, after this release reaches the folder COS runs from.
- ChatGPT and DeepSeek were signed out in Clear Glass and Gemini's page was unresponsive on 2026-11-15: his sign-ins are his.
