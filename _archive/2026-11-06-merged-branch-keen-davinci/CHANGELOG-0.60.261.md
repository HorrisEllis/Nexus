# 0.60.261 — The agents' recall tool, and the macro error fixed

James, 2026-10-26: "make the tool." This was his Glass_Engine.md idea: "what if we have a tool for the agents to capture the recent event
ledger or orchastrator? using the .response nodes, chat ledgers for the repo, and log for context. for persistent memory?"

He also sent a screenshot of Settings › Macros showing `Cannot find module '../mesh/automation-engine.js'`.

## The recall tool (RC1)
`nexus.recall.tool` (the `recall` row) reads several sources in one call. Each source is read through its own system's route.

| Source | Where it comes from |
|---|---|
| The event ledger | Idearium's activity: one repo's, or every system's |
| A repo's runs | Idearium |
| The orchestrator ledger | Idearium's counts |
| The newest agent replies (`.response` nodes) | Guardian's new `GET /api/responses/recent` |
| The chat ledgers | Clear Glass |
| The end of a log | Nexus's own logs |

- **The answer:** one compact text, within a budget (6,000 characters by default).
- **Nothing silent:** a system that is down is named with the reason, never returned as an empty success.
- **Who has it:** every agent through the tool table, and the co-pilot hat.

Proof: `tests/modules/test-recall-tool.test.js` 4/4, against stand-in Idearium, Guardian and Clear Glass servers. It checks every source, a
system that is down, the budget, Guardian's `recent()`, and the wiring.

Open: RC2, memory written back. A recall's digest would be saved as a node the agent reads at the start of its next session. It is mapped,
not built.

## The macro error
**Cause:** two sessions released a 0.60.251 the same day.
- On main, AE1 moved the automation engine out of Clear Glass.
- On this branch, the macro doors work added a `require` of the engine's old path.

The two met on main, so main's Clear Glass failed when Settings › Macros recorded.

**Fix:**
- main is merged in here.
- That one `require` now reads `lib/automation-nodes.js`.
- The shared macro recorder, which the merge had replaced with main's older inline copy, is restored.

test-cg-agent-doors 7/7.

main's own 0.60.254–0.60.259 changelogs and version lines are kept in `_archive/2026-10-26-main-parallel-0.60.254-259/`. Their numbers
collide with this branch's.
