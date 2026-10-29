# 0.60.165 — 2026-10-19 — AB1 (economy-resume): a rate-limit hold waits and retries, it no longer cancels

James, 2026-10-19: "fix the economy time out also like retries when the time runs out." · "i dont think it resumes."
(His build, stuck: "IDLE chatgpt job … cancelled · the economy holds chatgpt 299 s".)

## The cause
`economy_wait_ms` defaults to 30 s — a hold longer than that (his 299 s) is **cancelled** "so the route can move on." Every
other agent was also at-limit, so the ladder exhausted → terminal `failed`/`contract-incomplete`. The retry machine
(`_autoRetry`) only fires on **stalls** (runs that went quiet) and **rejections** — never on a clean terminal fail. So it halted
with no way back, and there was no setting to make it resume. The user was right.

## The fix — resume the all-transient case (reuse, no new scheduler)
- **`lib/run-watch.js economyHeld(rows, { heldMs, maxAgeMs })`** — finds build runs that ended terminal-failed on **only**
  time-bound holds (a provider economy/rate limit, or no local model fit free RAM), whose last step is older than `heldMs` (the
  slot has had time to free) and younger than `maxAgeMs`, and where no later run of the phase has since reached a good state.
- **`idearium/api/index.js _watchRuns`** — after the stall sweep, the existing watchdog now also picks up those economy-held
  runs and builds them again through the existing **`_autoRetry`** (which re-runs the phase through MF1 + the economy pre-filter,
  so it only proceeds when a slot/model is genuinely free). Capped and configurable.
- **Config** (`idearium/lib/config-core.cjs`): `repos.on_economy` (retry|close, default retry), `repos.economy_retry_minutes`
  (default 5), `repos.economy_retries` (daily cap, default 4 — higher than a stall, since the hold lifts on its own).

## Safety (the critical part)
A run is retried **only** when every failure signal is transient. **Any** hard signal — `empty`, `truncated`, `tool-errors`,
`test-failed`, `login`, `lost`, `provider-down`, `timeout`, `unknown` — blocks the auto-retry (a human or another path owns it).
A phase already built again to a good state is never re-held. Proven in the test.

## Proof
`tests/modules/test-economy-resume.test.js` — AB 5/5: an all-transient fail is held (AB-01); any hard signal blocks it, for
every hard class (AB-02); too-recent isn't held and too-old isn't resurrected (AB-03); a since-succeeded phase isn't re-held
(AB-04); the economy cap and a clean run are handled (AB-05).

## Files
- `lib/run-watch.js` — `economyHeld`, `limitFor('economy')`, exported.
- `idearium/api/index.js` — `_watchRuns` retries economy-held runs; `_autoRetry` message handles the economy kind.
- `idearium/lib/config-core.cjs` — `repos.on_economy` / `economy_retry_minutes` / `economy_retries`.
- `tests/modules/test-economy-resume.test.js`, `run-all.js` — the test, registered.
- `lib/version.js`, `package.json` — 0.60.165; phasemap AB1 marked built (economy-resume slice).

## Next
The remaining AB1 half — phase→phase auto-advance (build the next ready phase on success) — and CT1 (COS test runner).
