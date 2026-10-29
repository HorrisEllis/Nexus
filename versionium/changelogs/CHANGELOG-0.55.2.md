# 0.55.2 — 2026-10-10

James: "loop simulations of every deep and drecursive test and debug method you can for idearium and the agents. fix the biggest most structural problems you can, bottom up." · "i want to make sure we arent using idearium for anything guardian should be doing."

## How it was tested

Guardian, copilot and Idearium were started from this tree, with a fake provider tab (`tests/sim/fake-tab.js`) that speaks guardian's real protocol the way a userscript does. The real repo-agent route was driven through all three.

| Scenario | Before | After |
|---|---|---|
| Tab answers | 0.9 s | 0 s, then the economy's own 15 s gap (was 55 s, HP20) |
| Tab never touches the job | 295 s, then a 15-minute idle hold, twice | 91 s: "the chatgpt tab was handed the job and did nothing with it" |
| Tab can't find the input box | "the tab is still answering another job" | "stopped at 'typed and sent' … pick them with ◎" |
| No tab open | 295 s | 46 s: "not connected — no chatgpt tab open", job cancelled |
| `auto`, only ChatGPT connected | 295 s waiting on a Gemini with no tab | 9 s, answered through ChatGPT |
| ChatGPT at its hourly cap | 295 s, "no gate reported yet" | 8 s, names the limit and the time to the next slot |
| Tab comes back after a caller gave up | old jobs re-sent, four times each | nothing re-sent |

## What changed, bottom up

- **HP13 — the failure is put at the right gate.** The userscripts report every page failure as gate `handleJob`, which guardian didn't recognise, so it blamed "tab busy". An unknown gate is now read from what its error says.
- **HP14 — a tab that doesn't take the job is noticed in seconds.** All five userscripts now say "accepted" the moment a job arrives. Guardian watches for any word from the tab about the job. If none comes within 90 s, the prompt was never typed: the job ends with that said, and the tab's slot is freed.
- **HP15 — a typed prompt is never sent again.** Two paths still re-queued a prompt the tab had already typed: the 15-minute idle window and a tab that drops mid-job. Now such a job waits for the chat transcript, then fails saying it was not re-sent.
- **HP16 — a job nobody waits for isn't sent later.** When the caller gives up on a job that was never typed, guardian cancels it. Guardian also re-reads every job before sending, and never sends a cancelled or finished one.
- **HP17 — a missing tab is said in 45 s,** not after the caller's whole wait.
- **HP18 — "auto" tries agents with an open tab first.** An agent with no tab goes to the back of the line, with the reason said. It is moved, not dropped, because Clear Glass can open a tab on demand.
- **HP20 — a routing attempt is not a job.** Each failed background chunk attempt was written to the economy ledger as if ChatGPT had run a job, which restarted the gap clock for your real one. Those records still teach the learned order; they no longer count as use.
- **HP21 — the economy's hold is said.** It shows on the gate trail. If the hold is longer than the caller will wait, or longer than 30 s, the caller is told at once and the job is cancelled.
- **HP22 — a missing tab is not a login wall.** The "no tab" advice said "sign in", and the routing classifier read that as a login wall. That opened ChatGPT's breaker, and "auto" stopped offering ChatGPT.
- **HP19 — the simulator stays:** `tests/sim/fake-tab.js`, and `test-guardian-stack-sim` (11/11).

## Not done here, said

A pinned agent (Settings → chatgpt) still has no next rung when it fails. The climb to the next agent lives in Idearium's repo agent, for the copilot position only, next to three other climbers (the build ladder, copilot's door, lifeline). Moving every climb into one place is ME5 in the one-model-engine map (RAID chooses), not a fifth patch.
