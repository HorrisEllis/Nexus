# 0.60.270 — three crash causes from his run log; everything from the day written down

James, 2026-10-28: "okay. don't lose any of this." · "stop. fiverr is the most important. that and job applications, 0logging contact info from applications/businesses you apply for"

## Fixed (each from his pasted log)
- `lib/jaa-store.js` — `push(...lines)` overflowed the stack on a large segment ("Maximum call stack size exceeded", thousands of times); event_log never loaded and every reload re-read every segment. Now a loop.
- `guardian/lib/provider-routing.js` — self-heal jobs went to `mistral:7b-instruct-q4_K_M`, which he does not have ("no mistral."), and a 404 in 2 ms was waited on for 115 s. No model is named unless `MISTRAL_MODEL` is set (the bridge uses his default); a failed or timed-out bridge job marks the guardian job failed at once.
- `clear-glass/src/dom/archaeology.js` — the DOM bridge script returned a function ("An object could not be cloned."); it ends with `true` and `dom.injected` fires.

## Kept
- `docs/2026-10-28-run-log-and-direction.md` — the log diagnosis (fixed and open), his ideas quoted with the coder's feedback, his priority order (Fiverr → job applications → contact log).
- `erosmancer/erosmancer-os/` — the ErosmancerOS source from `erosmancer-os-patched.zip` (hostile 15/15); the pre-patch hostile kept in `archive/`. Duplicates dropped and reported in the doc.

## Proof
- `tests/modules/test-run-log-fixes.test.js` 3/3 — RL-01 loads a 300,000-line event_log segment with no load error.
