# 0.60.226 — 2026-10-23

James: "can you decompose the phases into .phase with the dependancy graph per phase node. then move them into the repsective systems,
or sort them at least. need to do something about the dependancy graph. in the idearium pipeline, building phases, extending, building
from scratch. run deep and recursive simulations, of every possible failure mode, loop until we get a solid pipeline. using all phases,
specs, everything you can to get idearium coding any project, any phase. agent needs to map dependancies if nexus cant map one."

## Mapped first

`docs/2026-10-23-self-building-loop-phasemap.spec` has a dated addendum quoting this request and adding:

| Phase | What |
| --- | --- |
| SL7 | build a complete phase again only when asked |
| SL8 | the agent maps what Nexus cannot |
| SL9 | every phase a node |
| SL10 | the pipeline simulated |

SL3 (the backlog groomed) was already mapped and owns the DAG repair. `docs/self-building-loop.spec` gained four modules, one schema
(AgentMapping) and four interfaces, and compiles at full depth (test-substrate-spec 3/3). The measurements behind the map are in its
addendum:
- 1971 phases, 1172 open;
- 535 phases with no depends_on;
- 565 open phases with no files;
- 244 that MP1 cannot place;
- 3 cycles and 17 dangling references.

## SL7: building again (this release)

The pipeline's own suites were the first evidence. On main, test-contract-phase-build was 5/14 and test-chunked-phase-build was 11/16.

- **Root cause 1.** SL1 (0.60.223) closes a proven phase. After that, every later build of the phase (resume, replan, retry) was refused
  with ALREADY_COMPLETE.
  - Now a complete phase is built again only when asked: `rebuild: true` on the route, or `repo phase <repo> <phase> build --rebuild`.
  - The UI asks before it builds again. The Tasks panel's retry button now goes through the same door as ▶ build.
  - The run's rows say `rebuild: true`, and the status reason says "built again on request".
  - Without the ask, the refusal stays and now names how to ask.
- **Root cause 2**, found once builds ran again. A resumed build re-sent every file.
  - The contract's input was the whole phasemap file. The pipeline's own status writes (DONE, active, status_previous, the
    `# roadmap edit` comment) changed that file, and so did any edit to another phase in the same map. Each of these STALEd every brick.
  - `cortex/core/raid/contract-gates.js` `phaseBlock`: an input `{ path, phase }` now hashes only the phase's own block, without its
    status lines. A change to what the phase actually says still STALEs it.
  - CP-06's miscount (counted 10, dispatched 15) was the same re-sending.
- **Missed in 0.60.225:** the `VERSION` file was left at 0.60.224. It is 0.60.226 now.

## Proof

| Suite | Before | Now |
| --- | --- | --- |
| test-contract-phase-build | 5/14 | 14/14 |
| test-chunked-phase-build | 11/16 | 16/16 |

Unchanged and green: phase-close 6/6, evidence-close 5/5, contract-adapters 19/19, build-queue 6/6, phase-graph 4/4,
phase-deps-gate 3/3, substrate-spec 3/3.
