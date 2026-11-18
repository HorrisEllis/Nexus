# 0.60.563: N1 closed through the pipeline, on its own test

James, 2026-11-18: "sure." — to closing N1 with its new test, after pasting a review (ChatGPT's) that asked for the run to be recorded
as what it proved: "Don't let a successful pipeline run accidentally become a successful implementation claim. Those are different gates."

## Recorded (docs/2026-11-08-pipeline-canvas-phasemap.spec, PC8)
Run 74f98418 (N1): pipeline route **demonstrated**; agent orchestration **demonstrated** (Ollama's brick passed, Gemini planned, Claude
last); new implementation **not demonstrated** (the landed `lib/semantic-variant.js` equals the 2026-11-04 file, 0 lines differ); test
integrity **reviewed**; Emerge-first for existing JS **unresolved** (his).

## Changed
- `tests/n1.test.js` (the build's test-first proposal, applied with his yes): 30 tests on N1's own parts — protect/restore 9, validate 8,
  jsVariant 3, similarity 3, the per-agent novelty store of 50 7. Its require is now plain (`require('../lib/semantic-variant.js')`):
  `lib/test-map.js` does not see a computed `path.join`, so evidence found "no test can check it". Caveat, said: never seen failing first
  (the code existed), so it proves less than PE6 asks.
- `idearium/pipelines/idearium-build.pipeline`: the `ledger` step gives its own reason when the run gives none
  (`{{vars.why | default:… | json}}`); it had failed "say why: a ledger line without a reason is noise" after evidence closed N1.
- `docs/2026-09-26-guardian-retry-novelty-and-installs-phasemap.spec`: N1 `DONE 2026-11-18. by evidence — n1.test.js (linked)` (written by
  Idearium's evidence step).
- Rejected pending review (kept in Idearium, re-appliable): two rewrites of `tests/modules/test-guardian-retry-novelty-installs.js`
  (307 → 246 / 244 lines, dropping its header with his 0.39.265 words).

## Proof
`node tests/n1.test.js` 30/30 in the live tree; evidence: "every file exists and 1 test(s) passed" (tests/n1.test.js, linked:
lib/semantic-variant.js); the ledger's N1 `built` line (logged by hand on the step's own route: the finished run cannot retry a step).
