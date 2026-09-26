spec:
  meta:
    name:        movement
    version:     0.1.0
    foundation:  nexus-system-foundation@1.0.0
    layer:       lib + cli
    uuid:        nexus-movement-v1-0000-2026-0808-001
    purpose: >
      ALL MOVEMENT for one system in one read-only snapshot — logs, error logs,
      ledgers, event types, gaps, tension/friction, sigma, schema drift, changes.
      One data layer (lib/movement.js), many renderers (cli/nexus-movement.js
      now, the tablet next).

  origin: >
    James, 2026-08-08: "autopilot needs a massive update and upgrade, I feel
    it's not encompassing enough — all logs, error.logs, ledgers, event types,
    gaps, tension, friction, all of it, sigmas, changes. All movement." Plus:
    "tablet needs to be something similar to this for each system" (checkmk
    Server Performance dashboard — gauges, time series, tables).

  the_measurement_behind_it: >
    autopilot.js:527 _statusSnapshot() returns SIX fields per kernel — status,
    restarts, crashesInWindow, lastExit, downSince, pid. That is process
    supervision. It answers "is it running", which was the one question that was
    already easy. Nothing in it can answer "is it healthy", "what is it doing",
    or "what changed". Autopilot is not wrong; it is scoped to processes, and
    everything else was simply never aggregated anywhere.

  why_one_data_layer: >
    The tablet's problem was never the chart library. It was that nothing
    aggregated per-system movement for a chart to draw. So lib/movement.js
    returns DATA and holds no rendering, cli/nexus-movement.js holds no data
    access, and `--json` emits exactly what the tablet consumes. Two renderers,
    one truth. A second aggregator inside the tablet would be a second truth.

  sources:
    process:  "autopilot :7799 /status — up/down, restarts, circuit trips"
    events:   "event_log (JAA) — type histogram + 48-bucket rate series"
    ledgers:  "data/ledger/<system>/**.jsonl — tailed with lib/ledger-tail, so a 1.7MB ledger costs one 64KB block"
    changes:  "component_ledger (JAA) — registered/updated/error/verify/route_decided"
    gaps:     "gaps (JAA) — open/total by severity, oldest-open age"
    sigma:    "sigma_rollups (JAA) — avg/max, warn + halt counts, series"
    friction: "cortex/self-heal/fault-taxonomy — thresholds, bands, known classes"
    drift:    "schema_drift (JAA) — rows that stopped matching their schema"
    errors:   "*.log files + error-typed events + ledger error actions"

  # ══════════════════════════════════════════════════════════════════════════
  law_the_whole_thing_rests_on: >
    AN UNREAD SOURCE MUST NEVER LOOK LIKE A QUIET ONE.

    Every section returns { ok, ... } or { ok:false, reason }. Nothing is
    defaulted to zero, because a zero and a silence render identically on a
    dashboard and that confusion is exactly how this codebase has been fooling
    itself — 11 hard-rejected loom wires under a healthy summary line, seven
    test suites scoring 0/0 as a ✓, 13 crystals rendering as ?:?/unknown/0/0.

    snapshot.blind[] lists every source that could not be read, with a reason.
    The CLI draws it as its own panel and a gauge with no data renders `??????`,
    never 0%. Tests MV-3, MV-4, MV-6 and MV-10 pin this. A renderer that omits
    the BLIND panel is not conformant.

  # ══════════════════════════════════════════════════════════════════════════
  found_while_building_this:
    - "guardian.bus.log and cg.bus.log are DIRECTORIES, not files. A path named like a file, shaped like a stream. Reading them threw EISDIR; now reported by name."
    - "data/ledger/.._.._etc/ exists, dated 2026-07-30. A path-traversal-shaped system name reached the ledger writer, which SANITIZED it into a directory name rather than rejecting it. The sanitisation stopped the traversal — but it silently accepted the input and created a system that does not exist."
    - "~90 throwaway systems named bl7-<timestamp>, exactly 100 rows each, are ~9,000 of component_ledger's 13,001 rows — 69% of the change ledger is test debris. systems() excludes them by pattern; the real fix is that the ledger namespace is UNVALIDATED and accepts any string as a system."
    - "sigma_records is EMPTY. It is the permanent half of the sigma reconciliation and its writer (meta/causal-nexus/recompute-trigger.cjs) was removed with the causal-nexus retirement. The live half survives in sigma_rollups. Reported in every snapshot rather than hidden."
    - "cortex/memory/jaa-db.js prints '[jaa] Loaded ...' to STDOUT on require, so ANY --json surface in this tree is unparseable by a piping consumer. Worked around in the test with a recorded note; the real fix is that a library must not write to stdout."
    - "The fault taxonomy's eight KNOWN_FAULT_CLASSES are all OPERATIONAL — stale_module, timeout, api_degraded, queue_saturated, memory_pressure, bottleneck, circuit_breaker, import_error. Verified by injecting a real silent-swallow fault into a built component: getFaultClass('silent_swallow') returned null. There is no class for a CONSTITUTIONAL fault, which is the category AXIOMS exists to prevent and the category this tree actually suffers from. Every snapshot states this blind spot."

  measured_2026_08_20:
    systems_discovered: 20
    note: >
      Discovered from data/ledger + component_ledger, not from a hardcoded list.
      liminal 740 events / 740 changes · guardian 187 / 617 / 85 streams ·
      cortex 378 / 372 · forge 370 / 370 · copilot 326 / 195 · idearium 86
      ledger streams / 559 changes. Systems with ledgers but zero events —
      eros, eravos, cg, ollama, idearium, reflection, sentinel, testfaculty —
      write to disk without emitting an attributable event_log row, which is a
      finding this panel makes visible for the first time.

  not_built:
    - "TABLET RENDERER. This spec deliberately stops at the data layer + CLI. The tablet consumes `--json` and must draw the BLIND panel; it is not started here (§1.1 — a renderer nobody has written is not a renderer)."
    - "AUTOPILOT INTEGRATION. autopilot.js is untouched. Nothing is removed from _statusSnapshot(); movement READS autopilot's /status as one of nine sources. Rewriting the supervisor to own aggregation would put data collection inside a process that must not inherit side effects (§5.12)."
    - "WRITE PATH. Read-only, everywhere. It creates no rows, emits nothing, persists nothing."
    - "TOKENS/BUDGET. Not a movement source. Belongs with the account registry."

  gate: >
    tests/modules/movement.test.js — 8 tests, and the ones that matter are the
    negative cases: MV-4 (an unknown system is BLIND, not clean), MV-6 (zero
    errors from zero sources is not a clean bill of health), MV-7 (ledger reads
    stay bounded — the reason it uses ledger-tail).
