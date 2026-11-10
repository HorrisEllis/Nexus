# 0.60.482 — Nexus fitted to his 8 GB all-in-one

James, 2026-11-10, with a screenshot of Task Manager (a Lenovo all-in-one, i3-1215U, 7.7 GB, memory at 91%, disk at 99%): "What’s the
highest leverage. To get this working." · "Do it."

## Measured first
At boot, each of the 11 Node systems used 80–150 MB, 1,225 MB together:

| System | MB |
|---|---|
| architect | 89 |
| copilot | 81 |
| cortex | 83 |
| diagnostic | 142 |
| guardian | 131 |
| idearium | 107 |
| intelligence | 126 |
| loom | 96 |
| ollama | 83 |
| orchestrator | 138 |
| versionium | 149 |

What it showed:
- all of them started at boot;
- each was allowed a 1,024 MB heap;
- so an idle Nexus is not what fills 7.7 GB; the room each system has to grow is.

## Built
- **Six systems start on demand** and stop after 10 idle minutes: architect, copilot, intelligence, loom, ollama, versionium. This is COS's
  existing `onDemand`, now declared in their `compartment.json`, and saves about 0.6 GB at idle.
- **Heap limits from the measurements:** 384 MB for the six, 512 MB for the core five (cortex, diagnostic, guardian, idearium,
  orchestrator), about 3–4x their idle. His per-system settings in COS still override both.
- **A sleeping system is woken on first use** (`lib/nexus-client.js`). A call refused by a sleeping system asks COS to touch it, then
  retries for up to 6 s.
  - A health check never wakes a system.
  - COS unable to wake it leaves the first error as it was.

  This is the interim until PR6, where a system announces itself up by its first heartbeat.

## Proof
- `test-call-system` T-WAKE-1..4, 8/8:
  - woken and answered;
  - health never wakes;
  - COS down, said;
  - woken but silent, said with how long it waited.
- `test-cos-supervisor` 8/8: SV-08 sees cortex's 512 MB on its command line.
- Declaration readers green: service, system template, sovereign systems, genesis, boot log, autopilot handover, cortex door.

## Failing before and after this change, said
- `test-compartment-declarations` CD-01: intelligence-consumer was retired in 0.60.380 and the test still expects it.
- CD-02: `cortex.args`, changed since DO3a. CD-02 now skips only the two fields changed here on purpose.

## Not measured yet
Memory under load, and on his machine with his data. That comes with PR4 and PR6, the heartbeat carrying each system's own deltas.
