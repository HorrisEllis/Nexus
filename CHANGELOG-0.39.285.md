# 0.39.285 — 2026-10-01

James: "its not opening. i just added a new idea and promoted to spec. it needs to show the plan when building." (start:all log:
`src-kernel-state-js failed: exceeded outer wall-clock attempt cap`) · "merge these if needed. the data folder is 10GB... shouldn't
even be using the data folder. Nexus-main\data\erosmancer\telemetry.jsonl is huge" (nexus-13.zip, nexus-14.zip; 8.6 GB).

## Code builds no longer stall
- `lib/seam/detector.js` — the truncation check read every code reply as cut mid-sentence: the last line of code ends in
  `}` `;` `]` `>` or a closing fence, not `.`. Each code chunk was rejected until the outer wall-clock cap. A balanced closing
  fence or a code ending is now a complete reply. `tests/modules/test-detector-code-endings.test.js` 5/5.
- `idearium/spec-engine/chunk-dispatch.js` — the cap's error names the last check that failed.

## The Plan shows the build
- `idearium/ui/js/plan-panel.js` — the spec's code build: files done/total, a bar, per-file state and layer, the failure, and
  "build the rest / retry". Codegen opens the Plan panel.
- Files tab — an empty file the build has not written says "not built yet — its chunk is <state>" and opens the Plan.

## telemetry.jsonl: 8.6 GB → bounded
- `erosmancer/erosmancer-os/src/telemetry/index.ts` — `flush()` appended the WHOLE ring buffer (up to 50,000 events) every 2 s
  and never marked it written, so each event was rewritten thousands of times. Now: each event once; debug kept in memory only
  (`EROS_PERSIST_LEVEL`, default info); the file rotates at 25 MB (`EROS_TELEMETRY_MAX_MB`) keeping one `telemetry.1.jsonl`;
  an oversized file from before is rotated at start. `tests/modules/test-eros-telemetry-bounded.test.js` 4/4 (the old code
  writes 32 lines for 6 events).
- The existing `data/erosmancer/telemetry.jsonl` is duplicates; delete it (or let the first start rotate it and the next
  rotation drop it).

## Merged from the uploaded zips
- nexus-14 is a fork built on 0.39.278. Taken: per-file version history (GET /api/repos/:uuid/file/versions, /file/version;
  `idearium/ui/js/file-versions.js`, on the theme tokens) and a FAILED/ESCALATED chunk reassignable to another agent (the
  failure kept as `priorFailure`). Its maps `docs/2026-10-01-work-visibility-job-reuse-phasemap.spec` (J0–J7 open) and
  `docs/2026-09-29-tool-layers-and-pane-memory-phasemap.spec` registered. Its VM login change is superseded by 0.39.282 N20;
  its other files are older copies of 0.39.278 work. `tests/modules/test-file-versions-and-reassign.test.js` 5/5.
- nexus-13 is a strict subset of 0.39.278: nothing taken.
- Neither zip's `data/` was read into the repo.
