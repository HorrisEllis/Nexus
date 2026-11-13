# 0.60.501 — COS's memory floors judged against this machine's baseline (CP6a expanded)

James, 2026-11-13, while Clear Glass was refused a restart every 15 s: "also the resource manager, should use the baseline deviation when its
applicable."

## Before
On this machine (7.7 GB) free memory sits at about 8-14%. The floors were fixed: Clear Glass's own 15% (`haltPctOverride`), the halt floor 10%,
the balance floor 15%. So Clear Glass was refused without end, the halt rule held a proposal to stop Idearium at boot, and rule:balance asked
RAID every 30 s (hundreds of `raid-refused` lines).

## Built
- `cos/manager/supervisor.js`: the supervisor learns free memory, the mean and sigma of the last 240 samples (two hours at one per 30 s), kept
  in `memory-baseline.json` beside its ledger. `memoryJudge(free, floor)`: a floor bites only when free memory is also more than 2 sigma under
  that baseline; with fewer than 20 samples the fixed floor decides as before; under 3% a start is always refused. Each refusal says the
  baseline.
- `cos/manager/resources.js`: feeds each sample in; the halt proposal and the balance rule ask the same judgement.

## Proof
`tests/modules/test-cos-memory-baseline.test.js` MB-01..07 (7/7, new). `test-cos-supervisor` 8/8, `test-cos-resources` 11/11.

## Not done, said
- **Not live.** COS's manager has not been restarted on it, so Clear Glass is still held back by the fixed 15% floor.
- **Not agnostic.** His next words: "the baseline deviation is for a lot. agnostic. everything is meant to be agnostic as possible." This is
  memory only, in JavaScript. Emerge already has delta and sigma (`emerge/emerge/lang/cie/observe.eg`); the agnostic form belongs there. Asked,
  not built.
- `cos/manager/supervisor.js` is also in SW5's files (the orchestrator into the supervisor, on main's sovereignty map).
- A start the baseline allows can push free memory lower than the old floor would have (Clear Glass is about 500 MB).
- In Versionium (§17.12): vtm-2eff17d9.
