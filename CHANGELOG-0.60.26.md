# 0.60.26 — 2026-10-13

James: "next. fix anything you can."

He pasted the full PowerShell log of a 0.60.23 run with lean mode on. Each fix below is a line from that log.

## What lean mode holds stays quiet

- **The gap-relay (orchestrator).**
  - Before: it warned `diagnostic disconnected (connect ECONNREFUSED 127.0.0.1:7825); retrying in 30000ms` all session.
  - Now it reads `lib/lean-mode.js`. A held source is said once (`diagnostic is held by lean mode`) and checked quietly
    each minute. It reconnects on its own when lean is turned off.
  - A source that is really down still warns (§1.2), at most once a minute.
- **Cortex.**
  - Before: it warned `relay to intelligence:3753 failing (N dropped so far)`.
  - Now, while intelligence is held, its events are not sent at all, and that is said once.
- **The copilot adversarial probe.**
  - Before: it loaded qwen2.5-coder:7b for 60–85 s every ten minutes, the same model the build was waiting on.
  - Now it is held while lean mode is on. The memory-pressure gate it already had is unchanged.

## The officiator stops re-sending the same failed drops

His log showed the same nine staged drops (dacb29dd, 94ad6593, …) sent to Claude on every boot, four boots in a row. Each
came back `no real agent response`. The dedup was in memory only.

Now:
- Each failure is written to `officiator-attempts.json` beside the intake dir. That is state, never committed.
- The next try waits 10 min, doubling each time. After 4 tries the drop is parked, and that is said once.
- A tick stops at the first drop the agent did not answer, rather than sending the rest to the same silent agent.
- "No available agent" spends no attempt.
- A success clears the record.

## A deepseek job is never sent to a model he does not have

Before: `deepseek job → ollama-bridge :3749 (no NCP tab connected)`, then Ollama HTTP 404, because deepseek-coder-v2 was
never pulled, then 120 s of waiting.

Now Guardian reads the Ollama inventory first:
- If a deepseek model is installed, it is used, and the log line names it.
- If none is installed, the job goes to the deepseek tab path, which opens the tab (0.60.25).

## Checked, not changed

- **The "nexus" spec made on each sync.** It is the parent index (NEXUS.md), re-versioned when a system changes, and the
  old version is purged right after. It is one spec, not a pile.
- **Eros.** It runs in-process (Erosmancer), not as a service lean mode can hold. Memory went back to ok by itself each
  time.
- **`Claude reply element not found`.** This needs your ◎ pick once in Clear Glass: open the Claude tab, press ◎, and
  click Claude's reply. It cannot be fixed without seeing the page.

## The coder's own debt

Three phasemaps had stopped parsing as YAML because the coder wrote addenda as bare prose. They are now `# `-commented,
the way this repo's other phasemaps write addenda:
- request-spine;
- nexus-memory-gates-and-contract;
- gates-that-learn.

No word changed, and loom reads the same phases (28, 12, 4).

## Proof

- `tests/modules/test-lean-quiet.test.js` 5/5, new:
  - a held source is not connected to and is said once;
  - lean off reconnects;
  - a source really down warns once a minute;
  - the probe is held while lean is on;
  - the orchestrator and cortex wiring.
- `test-raid-officiator` 15/15. OFF-BACKOFF:
  - neither the next tick nor a restart re-sends;
  - the wait doubles;
  - the drop is parked at 4;
  - a success clears the record.
- `test-dispatcher-deepseek-ncp` 4/4:
  - DSK-003: no deepseek installed → queued for the tab, never sent to Ollama;
  - DSK-004: picking the installed model.
- `test-loom-map` 19/19 and `test-build-surface` 13/13. Five new loom wires:
  - orchestrator, cortex and copilot/adversarial → lean-mode;
  - guardian dispatcher → ollama model-inventory and provider-routing.

You are on 0.60.23. Pull this branch to get 0.60.25 (account fallback, tabs opened) and 0.60.26.
