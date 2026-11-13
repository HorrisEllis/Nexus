# 0.60.504 — COS hears every system's beat; nothing polls for it (PR6 slice a)

James, 2026-11-13: "okay can you replace the polling and decouple what systems you can. thats one reason for the perfoamnce, because theyre
coupled so too many need to run also. like imagine they can access each other also without a node process. get the heartbeat done and
polling disabled" · "orchastrator needs to migrate to the superviser" · "anything that helps performance. i need it." · "the heartbeat
optimizes nexus since when systems arent needed they dont need to be polled."

## Before
- Every beat went to the Orchestrator (:9000). COS could not hear a beat until the Orchestrator, one of the systems COS starts, was up.
- COS's supervisor waited for each start by asking `/health` every 250 ms.
- COS's shell and overview each asked `GET /api/cos/usage` every 5 s, and each answer listed every process (PowerShell on Windows, ~85 MB a
  run) while COS's own resource rules already sample every 30 s.

## Built
- `lib/pulse.js`: each beat and the registration go to COS (`COS_MANAGER_PORT`, `/api/cos/heartbeat`, `/api/cos/register`), whatever
  `orchPort` a caller passes. No system's code changed.
- `cos/manager/server.js`: the two routes; each beat and registration passed on to the Orchestrator, fire and forget, until SW5 moves it in.
- `cos/manager/supervisor.js`: `beat()`. A system whose declaration names its `heartbeat` is up at its first beat, no `/health` request. Each
  beat expects the next within interval x 1.5 + 5 s; a missing beat is said once (`pulse-missed`), a later one clears it (`pulse-recovered`).
  A system COS stopped is asleep, not missed (his: not needed, not polled).
- Declarations: `heartbeat` on architect, copilot, cortex, guardian, idearium, loom, ollama-bridge, orchestrator.
- `cos/manager/resources.js` + `server.js`: each 30 s sample streamed as `cos.usage`; `GET /api/cos/usage` answers from it when fresh.
- `cos/ui/shell/page.js`, `cos/ui/overview/page.js`: usage from the stream, the 5 s timers gone; `contract.json`: the overview listens to
  `cos.usage`, the event described.

## Proof
`tests/modules/test-cos-heartbeat.test.js` HB-01..07 7/7 (new). test-cos-memory-baseline 7/7, test-cortex-heartbeat 4/4,
test-architect-pulse-migration 6/6, test-cos-supervisor 8/8 (one earlier run 7/8: SV-05, timing).

## Not done, said
- **Not proven in Clear Glass.** The UI tests' Clear Glass host exits under this machine's memory (test-cos-ui CU-06, test-cos-hub HB-04/07/08).
- test-cos-resources CR-02 fails on the code before this change too.
- **Not live** until COS restarts (it loads the supervisor) and each system restarts (it loads lib/pulse.js).
- Still to beat: clear-glass (its main process beats to the Orchestrator by itself), diagnostic, versionium, intelligence; they keep the start check.
- Timers left in pages: hub (10 s), deployments (4 s), logs (2 s), the engine page.
- PR4 (the beat quickens on deviation); the Orchestrator's own watch and route retired (SW5).
- In Versionium (§17.12): vtm-b984d44d.
