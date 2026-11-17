# 0.60.559: a busy Idearium no longer leaves Ollama off the ladder

James, 2026-11-15: "need the pipeline working. like this is priority."

His RQ0 build failed on 2026-11-17 and was diagnosed on his machine (a cloud session could not reach it).

## Found (from the run's own records, in order)
- **The first error, 21:55:35 UTC**, on build phrun-mwl8cat2-u6vu's first row: the ladder left Ollama off, `ollama:""` — "Ollama could not be
  reached — ollama bridge unreachable: [nexus-client] ollama GET /api/models timed out after 4000ms".
- **Ollama was not down.** Its own log (AppData/Local/Ollama/server.log) answered `/api/tags` in 7–8 ms at 13:55:31 and 13:55:35 local, the
  bridge's calls for that request. ollama-bridge had been up since 21:54:47.
- **Idearium was busy.** COS's ledger: Idearium missed its pulse at 21:53:51, 21:54:20 and 21:55:05 (no beat for 20 s from 21:54:45). On a busy
  thread, a 4 s timer that has expired runs before the reply that has already arrived, so the probe said "timed out".
- **What followed from it:** no Ollama rung, so no plan ("no Ollama model on the ladder to code the plan") and no test writer; the bricks went
  to the remote agents; nothing was written for 10 minutes after verify-first; the watchdog closed it and retried, which stalled the same way;
  the pipeline's own build then ended "contract-incomplete"; Idearium's retry budget for the phase was used up; and the pipeline's landed step
  read Idearium's "auto-retry-held" note as the newest build.

## Fixed (only the first error)
- `idearium/api/index.js` `_ollamaModels`: a probe that timed out is asked once more with 15 s. A refusal (connection refused, Ollama answering
  nothing) is still "unreachable" at once.

## Proof
test-log-fixes LF-07: a timed-out probe is asked again with a longer limit and the models come back; a refusal is not asked again. It fails on
the old code (no `_ollamaModelsForTest`). LF-02 fails on main before and after this change (Guardian's sign-in wall; seen 2026-11-15).

## Not done (said)
- The landed step reading Idearium's auto-retry note as a build was fixed on 2026-11-15 (lib/flight-data.js latestBuild, FD-10) in his running
  tree, uncommitted, and is not in main: idearium/api/index.js there was reset when the branch moved. Its own release.
- RQ0 is shelved; the re-run is N1 (the cloud session's advice).
