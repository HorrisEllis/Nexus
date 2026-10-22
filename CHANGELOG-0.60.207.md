# 0.60.207 — each system brings its own data home (DL2)

James, 2026-10-22: "start the data migration. look at the phases, any migrating data to the respective systems, and make each system
responsible for it's own data."

Map: docs/2026-10-21-data-layout-phasemap.spec DL2_one_resolver (DAG checked; its graph had no crossings).
Spec: docs/data-layout.spec MOD-DATA-HOME, with a dated addendum.

## The phases that migrate data
There are two tracks. Both are "each system responsible for its own data":
- **The data-layout map** (DL0–DL7). It moves files out of the root `data/` into each system's own `data/` folder.
  - DL0 (the census) and DL1 (the clear-up tool) were done in 0.60.177.
  - This release is DL2.
- **The system-store track** (SS1–SS4, docs/2026-10-19-pipeline-root-causes-phasemap.spec). It moves each system's tables out of
  Cortex's shared database into the system's own.

## What was built
- **`lib/data-home.js`, one resolver.** `home(system, kind, …)`, `ledger(system)`, `nodes(system, type)` and `memory(name)` resolve
  under `<system>/data/`. In a test they resolve under the test sandbox. They never resolve under the root `data/`.
- **Each system brings its own data home at boot.** Every system's entry runs `atBoot('<system>')` first, before anything opens its
  data: architect, clear-glass, copilot, cortex, diagnostic, guardian, idearium, intelligence, loom, ollama, orchestrator and
  versionium.
  - It moves the root `data/` files the ownership table gives that system, through the clear-up tool: a manifest first, then each
    file copied, its sha256 checked, and only then the source removed.
  - A file whose old path some code still names is not moved. It waits, and is listed with the code to rewire.
  - Files marked as your call are never moved.
  - The result is recorded in `<system>/data/.home.json`.
  - A boot with the same release and the same waiting files reads nothing, so the 14 boots on your machine stay cheap. The census now
    walks only that system's paths.
- **Route:** `GET /api/data/home` (every system), `GET /api/data/home/:system` (each file's plan), `POST /api/data/home/:system`
  (bring it home now) and `POST /api/data/rollback`.
- **Commands:** `data home [<system>] [--apply]` and `data rollback <manifest>`. Agents get them too, through `nexus.command`.
- **Screen:** Settings console → **Data**. Each system shows its folder, what is ready, and what waits and why. Waiting files are
  grouped by the code that holds them back. There is a "bring home" button for files that are ready.
  - The spec named a Toolbox section for this, but no Toolbox exists, so it went into the settings console.

## What it means today
- Little moves yet. The census still finds code naming every owner's root path.
- `diagnostic/nexus-diagnostic.js` names every system's path, so it holds every system back.
- The migration happens as each owner's code is rewired: DL3 for files, SS2 for tables.
- **Next:** SS1, which moves Guardian end to end. Then each owner's files and tables together, fewest references first: versionium,
  ollama, architect, loom, clear-glass, and so on.

## Proof
- tests/modules/test-data-home.test.js 6/6:
  - **DH-01**: each kind resolves under its system.
  - **DH-02**: in a scratch tree under the real ownership table, owned files move, a file still named by code waits, your call stays,
    and rollback restores the files byte for byte.
  - **DH-03**: a test never moves the real tree.
  - **DH-04**: a cached boot reads no census.
  - **DH-05**: the route and the commands.
  - **DH-06**: the Data screen, in Clear Glass.
- test-data-clearup 5/5.
- These suites fail exactly as they do on 0.60.206: test-system-boundary, test-test-sandbox, test-event-contracts and
  test-cli-route-commands. Each was compared line by line.

## Also in this round
- 0.60.206's full-suite failures were checked against 0.60.205, file by file. Only one was 0.60.206's: an undeclared event, now
  declared, along with three older ones.
