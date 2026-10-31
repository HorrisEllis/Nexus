# 0.60.317 — AE3: the orchestrator's automation dispatches agent work (through RAID → Guardian)

James, 2026-10-30: **"need to finish the automation in orchestrator."**

The automation engine already runs inside the orchestrator (AE1, 0.60.256), but its agent-step hooks were stubs. Now they're real: an automation can dispatch actual agent work from the orchestrator.

## What was wired (`orchestrator/automation/index.js`)
- An **`agent` step's provider is decided by RAID** (`lib/raid-port.js` `decide` — the routing decision stays RAID's, §5.2), then the task is **dispatched to Guardian** (`:7820 /command`), the orchestrator's existing runner. Both `enqueue` (fire-and-forget) and `askAgent` (awaited reply) paths.
- **Fail-soft** (§1.2): RAID down → the step's own `agentKey` is the provider; Guardian down → the step says so and the rest of the workflow keeps running.
- **`busEmit`** streams the engine's run events through the orchestrator's own SSE (`setBus(broadcast)` at boot — the bus is the orchestrator's, injected, no cross-system reach).
- Browser/macro steps keep their fail-soft Clear Glass port (`:7704`).

## Sovereignty held
No new static cross-system require — RAID is core `lib`, Guardian is reached by a runtime port. `test-system-boundary` 10/10.

## Proof (headless)
`tests/modules/test-orchestrator-automation.test.js` 7/7 (injected Guardian/RAID): RAID picks the provider, Guardian gets it with the prompt, a down peer is a clean error (not a throw), a task with no `agentKey` is refused, the bus and browser ports fire. `automation-engine` 16/16, `automation-v2` 18/18, `automation-nodes` 8/8, `automation-registry` 11/11 unchanged.

## Remaining (his machine)
The awaited-reply completion-watch (poll Guardian's job to done for `askAgent`), AE2 (Clear Glass serving `:7704`), and AE5 (the automation UI).
