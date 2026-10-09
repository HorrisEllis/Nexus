# 0.52.0 — 2026-10-09

James: "Do the hardening pass"

This came from the review of 0.51.0 James forwarded ("Thoughts?" — "It's ChatGPT"). I checked each of its five invariants against the code before mapping anything:

- **Two already held.**
  - A stale diff is refused at apply: `lib/repo-inject.js` compares the base sha256.
  - The ladder is bounded: rungs × `retries_per_rung`.
- **The rest were real gaps.** Each is a phase in `docs/2026-10-09-hardening-pass-phasemap.spec`, and all five are done.

## HP1: stale spreads along dependencies

Before this release, editing a spec block marked stale only the phases that named that block. A phase that was built on one of those phases still looked clean.

- **Downstream phases go stale too.** A phase that depends, directly or not, on a stale phase is now stale through it. `idearium/repo/thread.js` follows `depends_on` within the map, matching by full id or short key.
- **Each one names its cause.** `staleVia` names the nearest stale dependency, and a dependency cycle can't loop.
- **The summary counts them.** `summary.stalePhases` includes these phases, and `staleDownstream` says how many came through a dependency.
- **The Phases tab shows it.** A card shows **↻ via SH1**, and the phase's detail says "stale through SH1 …".

## HP2: interrupted runs are said

A run is dispatched by the Idearium process that started it. If Idearium restarted mid-run, the run's last row read `building` forever.

- **Checked at every start.** Idearium now looks at every run whose latest row is still in flight and was written before this process started (`idearium/repo/run-reconcile.js`).
- **One row per lost run.** Each gets one `interrupted` row: the state it was in, its model and rung, when it was last heard from, and "build it again".
- **Found at boot, not by a timer.** A run left in flight by a process that is gone can only have been interrupted, so no heartbeat or guess is involved.
- **Final and harmless.** `interrupted` is a final state, so a second check adds nothing. It is never counted against an agent: agent-record and phase-faults don't treat it as an attempt.
- **Shown in amber** on the Plan and in the Phases tab.

## HP3: the ladder climbs only what is installed

- **Missing models are left off.** An Ollama rung whose model isn't installed is left off before the climb (`lib/pipeline-routing.js present()`), and so is every Ollama rung when Ollama can't be reached. `name` and `name:latest` count as the same model.
- **Said where you look.**
  - The Plan's route: "left off: … not installed in Ollama".
  - Settings → Routing: "left off now".
  - `GET /api/routing`: `ladder.runnable` and `ladder.skipped`.
- **Not a failure.** A skipped rung never gets an attempt row, so it is never counted as that model's failure.
- **Refused when nothing is left.** A build with no rung left is refused (`NO_RUNG`) with a row saying why.

## HP4: signals weighted

Before this release, every failure counted 1 in the learned order.

- **A failure now counts by its class.** In `lib/economy/router.js scores()`:

  | Class | Weight |
  |---|---|
  | failed test | 1 |
  | broken constraint | 1 |
  | dismissed draft | 0.5 (his reason may be the spec, not the model) |
  | anything else | 1 |

- **Configurable.** Set the weights with `routing.signal_weights`, in config and in Settings → Routing.
- **The ledger keeps the class** beside the reason.
- **Counts stay counts.** `failed` is still the number of failures; the new `weighed` is their weight.

## HP5: odd files round-trip

- **CRLF, a byte-order mark (BOM), tabs, trailing spaces, no final newline, mixed line endings.** An untouched file saves byte-identical. Editing one block leaves every other block's bytes and hash unchanged.
- **Found and fixed: a BOM hid every block.** The first heading line never matched because the BOM sat in front of it. Headings are now read without the BOM, and the bytes are kept.

## Open, said

- **The learning's held-out evaluation** (does routing improve on tasks it hasn't seen?) needs history this repo doesn't have yet. It stays open rather than being faked with a toy set.

## Tests

| Suite | What it covers | Result |
|---|---|---|
| `test-hardening-pass` (new) | HR-01 to HR-05: HP2, HP3, HP4 | 5/5 |
| `test-thread` TH-05 | HP1 | 5/5 |
| `test-spec-document` SD-08 | HP5 | 8/8 |

These also pass:

- pipeline-routing 19
- escalation-ladder 9
- model-door 8
- economy 11
- agent-record 30
- build-surface 13 + 3
- phases-tab 5
- workshop-thread 4

`test-config-governance` fails 3/7 on main too, so that failure didn't come from this release.
