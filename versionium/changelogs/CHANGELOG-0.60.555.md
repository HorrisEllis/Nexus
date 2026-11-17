# 0.60.555: RAID owns the routing (PC16 slice a)

James, 2026-11-17: "i need ideariums settings to work better. this is meant to be in raid. all of the routing. so much of idearium is meant
to be in the automation engine and raid." · "yes build it, then merge and push. then what gets this all moving. i need this working today."

His decisions behind it:
- PC_D15, 2026-11-13: "Everything routes through RAID".
- RL_D1, 2026-11-17: "wouldn't raid be the bridge?"
- RL_D1b, 2026-11-17: "copilot is meant to be a hat that any agent casn wear".

## Built
- **RAID's routing** (`cortex/core/raid/routing.js`):
  - the routing policy (`routing.*`: mode, chain, ladder, breakers, planner, reasoner, intent map, Ollama models) is held in Cortex's own
    data, `cortex/data/raid/routing.json`;
  - every change is one line in `routing.ledger.jsonl`: who, when, the prior value and the new one.
- **The door:**
  - `GET /api/raid/routing`;
  - `POST /api/raid/routing` with `key` and `value`, or `key` and `unset: true`;
  - `POST /api/raid/routing/import`, which takes the first owner's values, once.
- **Idearium** (`idearium/lib/config.js`):
  - RAID's copy is laid over Idearium's three layers for `routing.*`, as a fourth layer, `raid`;
  - the copy is kept on disk, so a Cortex restart never stops routing;
  - every routing change made in Idearium goes to RAID through the outbox;
  - on its first sync Idearium hands RAID his current settings, so nothing he set is lost, then reads RAID's copy every minute.
- **The Routing & fallback screen** works as before, now on RAID's values. In Settings → Global configuration, a routing key shows its
  layer as `raid`.

## Proof
- `test-raid-routing` 4/4 (new, in run-all):
  - RAID's set, unset, import and ledger;
  - Idearium reads RAID's copy, and describe() names the layer;
  - a write goes to RAID and into the copy, and a reset sends the unset;
  - a value Idearium's schema refuses is left out.
- Unchanged and still green: `test-pipeline-routing` 20/20, `test-settings-console` 5/5, `idearium-agent-routing` 10/10,
  `test-mcof-config-gate` 14/14.
- `test-model-door` MD-04 and 7 of `test-config-governance` fail both before and after this change. Pre-existing, said.

## Not yet (slice b and on, said)
- The learned outcomes are still kept by copilot's door.
- The officiator options from 0.60.552 are not yet folded into `routing.*`.
- The screen is not yet in COS Automation.
- Copilot as a hat (PC16, his) is mapped, not built.
