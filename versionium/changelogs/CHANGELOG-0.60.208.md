# 0.60.208 — Guardian holds its own data (SS1, DL3 for Guardian)

James, 2026-10-22: "start the data migration. look at the phases, any migrating data to the respective systems, and make each system
responsible for it's own data."

Maps:
- docs/2026-10-19-pipeline-root-causes-phasemap.spec SS1_system_store_adoption. Its plan is written there as `plan_2026_10_22`, and
  the phase graph was read before any code: two crossings, both already in the baseline.
- docs/2026-10-21-data-layout-phasemap.spec DL3_rewire_writers. Guardian is the first owner rewired.

## Guardian no longer writes into Cortex's store
- **The callto agent** (`guardian/agents/index.js`).
  - Nothing loads it: no require and no spawn. It was rewired rather than archived, because a test still loads it.
  - Its own tables (`agent_calls`, `guardian_health`, `artifacts`, `toasts`) live in Guardian's own store. `agent_calls` was brought
    over from Cortex once, and that is recorded.
  - Cortex's tables go through Cortex's own routes: `event_log` through `POST /api/event`, and `cortex_memory` through
    `POST /api/memory/insert`.
- **Bridge turns** (`guardian/ask.js`) go to Cortex through `POST /api/event`.
- **Flap events and flapping gaps** (`guardian/lib/ncp.js`) go through `POST /api/event` and `POST /api/gaps`. They are buffered while
  Cortex is down.
- **Cortex's `POST /api/event`** now keeps `queue_uuid` and `comp_id` as top-level fields, so the gap engine still matches those
  events.
- Result: Guardian's data blockers went from 3 to 0 (`lib/system-boundary.js` sovereignty).

## Guardian's paths go through the data-home module
- Every file that named `data/guardian` now resolves its paths through `lib/data-home.js`:
  - `guardian/config.js`, `server.js`, `jobs.js`, `account-routing.js`, `agent-registry.js`, `artifact-upload.js`;
  - `lib/seam/queue.js`, `service/guardian-service.js`;
  - Diagnostic's table of systems;
  - the CLI's and contracts' labels.
- No code names `data/guardian` now, so at Guardian's next boot its files move to `guardian/data/`. Every move is in a manifest and can
  be rolled back.
- `service/guardian-service.js` moves Guardian's data before it creates any folders. Otherwise a new empty file could take a path that
  a moving file needs.
- **Shared writers.** `lib/ledger-writer.js` and `lib/cortex-write.js` now put Guardian (the systems in `data-home.REWIRED`) in its
  own folder, and leave every other system's files where they are. So no system's log ends up split across two folders partway through
  the migration.

## Not yet
- Guardian's channel ledgers in `data/ledger/guardian/` stay where they are for now. That `data/ledger/` folder holds every system's
  channel ledgers, and 15 code files name it, so it moves in its own step.

## Proof
- tests/modules/test-guardian-own-data.test.js 5/5:
  - **GD-01**: Guardian's data blockers are 0.
  - **GD-02**: no code names `data/guardian`.
  - **GD-03**: the callto tables go to their owners, and `agent_calls` was brought from Cortex once.
  - **GD-04**: the shared writers.
  - **GD-05**: Cortex keeps the scope fields.
- The 84 test files that load these modules were each run on 0.60.207 and on this release.
  - All match, except four that pinned the old path. Those were updated to ask the data-home module, each keeping what it checks.
  - `guardian-job-persistence` had been writing real job files into the tree. It now writes into the test sandbox.
  - The remaining failures in those files are the same ones listed in `known-gaps`: they need your live data.
