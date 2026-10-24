# 0.60.226 — 2026-10-24

James, uploading looking-glass-bundle-v0_4.zip and its error report: "This is a few days old. But does this help. A project that had auto built 5 phases"

## Does it help? Yes: it found a hole the new loop would have walked into

These were checked against the zip, not taken from the report:
- **Seven proof runs**, all READY. SP0 to SP4 each had a test condition that ran.
- **SP5's proof had one condition**, "A test that proves title as the spec states it, against the real code (no mock)". It was checked as
  a **file**: `lib/title.js` exists. No test ran, and the report's footer still said "Every line above was checked by running it, not by
  reading it."
- **SP1's test** only asserts a non-empty list of strings, and its code returns twelve generic words, none of them from the spec.

SL1, as built yesterday, closes a phase whose run is proven, so the loop would have closed SP5 and moved on.

## Built

- **`idearium/repo/proof-run.js` `proofStrength(results)`** reports what a proof ran:
  - `ran`: met conditions that ran a test, a command or a page;
  - `files`: met conditions that only looked at a file;
  - `untested`: conditions whose words promise a test or a pass but were checked as a file.

  Every run carries it.
- **The report tells the truth:**
  - a proof that ran nothing reads **READY ON FILES ONLY**;
  - "Promised a test, checked only a file" lists the conditions like SP5's;
  - the footer says how many lines ran something, or that nothing was run.
- **The loop won't close on a files-only proof:** `lib/phase-close.js` `landed()` does not close it, and `lib/trust-rule.js` `allows()`
  does not land it. The proof row now carries the strength.

**Replay of his seven runs:** SP0 to SP4 close, because their tests ran. SP5 does not, and the reason is said.

## Already fixed before this

The "Gemini said …" stray files and the names cut short at a dot (E5) are handled by `lib/path-guard.js` (RC4, 0.60.170): it strips the
chat label and refuses a cut name. This was checked on his four file names.

## Not fixed here (proposed to him; not added as phases, per his 2026-10-21 "stop adding more phases")

- **A test that cannot fail proves nothing (E1, SP1).** Run the phase's own test once against its module with every export gutted. A
  test that still passes is reported as unable to fail, and its pass is not counted as proof. This is deterministic and needs no model.
- **A phase spec copied from another (E3).** Flag two phases whose `does:` text matches once the name is removed.
- **The scene that fails its own schema (E6) and the README link** are that project's to fix.

## Proof

- **`tests/modules/test-phase-close.test.js` 7/7.** PC-07 uses his SP5 condition exactly as `latest.json` kept it:
  - its strength is 0 ran, 1 file, 1 untested;
  - SL1 does not close it, and rule B does not land it;
  - the report says READY ON FILES ONLY and names the promise.
- **`tests/modules/test-proof-run.test.js` 7/7.** The footer assertion now reads the new truthful line.
- **`tests/modules/test-phase-proof.test.js` 7/7.** PP-03's proof is two file checks, so its report now says READY ON FILES ONLY. The
  assertion was changed to that: the behaviour change is deliberate.
- Also green: test-self-building-loop 5/5, test-evidence-close 5/5, test-runtime-proof 18/18.
- His report is kept as `docs/2026-10-22-looking-glass-v0_4-error-report.md`.
