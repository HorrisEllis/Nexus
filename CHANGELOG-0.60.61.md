# 0.60.61 - 2026-10-15

James: "now can we get the pipeline working?" · "3. like all the phases from earlier." (the red line on his screen: "the chatgpt tab was handed the job and did nothing with it for 90 s — the prompt was not typed, so it is not sent there again")

## What I found
- The Nexus half works: `test-guardian-stack-sim` (a fake tab speaking Guardian's real protocol), `test-run-pipeline` and `test-run-state` pass. The pickup watch fired as designed: Guardian handed the job to the tab and the tab never said "accepted" within 90 s.
- The break is at the real tab. His runtime data is not in this sandbox, so which kind of break it was cannot be read from here. Clear Glass already carries an older note (providers/host.js) that a hidden-window typing problem was "not yet confirmed fixed".
- My 0.60.52 attention change was checked and does not gate typing (it only decides who owns a sign-in window).

## What changed
The message said *what* happened, never *which kind*. Guardian already knows each tab's connection and heartbeat, so the timeout now appends one of three facts to the unchanged first sentence:
1. **No tab connected:** the page script is not running there (tab closed, or never injected).
2. **Connected, heartbeat older than 30 s:** the script stopped (frozen, hidden and throttled, or the page crashed).
3. **Connected, heartbeat fresh, never accepted:** the script is alive and did not act (a sign-in or consent screen, a different page, or the input box not found).
The facts are also kept on the job (`pickupDiagnosis`) and sent on the bus event. `lib/pipeline-routing.js` still classifies the message as `lost`, so the run still moves to the next provider.

## Proof
`test-guardian-stack-sim` GS-12 (12/12). `test-pipeline-routing` failed once and then passed three times in a row without a code change: a timing flake, not caused by this.

## Still needed from him
The next failure will name its kind. The run's log line (or `idearium log`) shows it.
