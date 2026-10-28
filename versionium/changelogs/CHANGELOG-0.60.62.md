# 0.60.62 — 2026-10-15

_Built on branch claude/brave-cori-eczug1 as 0.60.50; renumbered when merged with main, whose own 0.60.50 is a different release (CHANGELOG-0.60.50.md)._

James: "bricks keep failing." (with his run log of 0.60.47)

## What his log showed

From 13:48 on, every staged drop the RAID officiator tried failed the same way, every 20 s:

> `[raid-officiator] synthesis failed for drop 71ba5ced (try 1/4, next in 10 min): no real agent response (forAgent=ollama) — guardian unreachable or an empty response`

After four tries each, 40+ drops were parked. Guardian was not unreachable: it completed dozens of ChatGPT, Gemini and
DeepSeek jobs in the same minutes.

## Root cause (read from source)

- RAID chose Ollama to synthesize (`decideForContract`), which was right: it was the agent that was up.
- The officiator and RAID's brick executor (`contract-intake.js _realAgentExecutor`) both send work through
  `copilot/lifeline.js dispatchToNcpAgent`, which is `_tryGuardian`.
- `_tryGuardian` first checks Guardian's `GET /providers` and refuses any provider not `connected`. Guardian lists
  `ollama` there, but it has no browser tab, so it is always `'null'`. Every Ollama job was refused before being sent.
- A second fault waited behind it: `_tryOllama` polled for 35 s at most, with a 30 s job timeout. His log shows
  qwen2.5-coder:7b taking 55–87 s on a 1.2 KB prompt (`adversarial-probe` lines); a contract-synthesis prompt is bigger.

## The fix

- An Ollama job in `dispatchToNcpAgent` goes to ollama-bridge directly (`_tryOllama`), with a 240 s window
  (`NEXUS_OLLAMA_DISPATCH_TIMEOUT_MS` to change it) and 2048 tokens. A repo agent's job (`agentId`) still goes to Guardian.
- `_tryOllama`'s poll follows the job's own timeout instead of stopping at 35 s.
- A dead bridge returns `{ ok:false, error }` with a reason, not `null`.

## Proof

- `tests/modules/test-lifeline-ollama-dispatch.test.js` 3/3, against a fake bridge and a fake Guardian on loopback:
  LO1 the bridge answers and Guardian is never asked; LO2 the job carries ≥ 120 s; LO3 a dead bridge is an honest failure.
- All 3 fail on the old `lifeline.js`.

## For him to do once

Drops already parked stay parked (§0.3: nothing is erased for him). To retry them, delete
`data/officiator-attempts.json` or the entries in it, then restart.

## Also in the log, not changed here

- The first `start:all` failed on every port (`EADDRINUSE`): an earlier Nexus was still running. The circuit breaker
  said so. The second run was clean.
- Free memory swung between 3% and 25% the whole run. A 7B model on Ollama plus Electron and 13 Node processes is near
  the machine's limit; slow Ollama answers are part of that.
