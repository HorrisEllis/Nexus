# 0.60.556 (COS 0.10.2): COS attaches to the Nexus already running instead of starting a copy

James, 2026-11-17, with COS saying "Nexus did not start: ports 7799, 7820, 4800, 9000 already in use by another program": "it needs to just do that not have a button. or not make another copy period. like it should be a projection ontop of the service"

## Found
- His COS screen said "Nexus did not start: ports 7799, 7820, 4800, 9000 already in use by another program … is another copy still
  running?"
- Nexus was running as the Windows service (NexusCOS, COS 0.5.0). That is also why it wrote to the SYSTEM account's folders this morning.
- The COS app keeps a run record only for the copies it starts itself. The service's copy had none, so COS tried a second copy, and the
  ports refused it.

## Fixed (`cos/app/runtime.js`)
- `start()` first asks the status port who holds it (`whoRuns`).
- When it is Nexus (COS's manager answers `/api/cos/health` with `service: cos-manager` and its pid), COS writes its run record for that
  process and attaches. COS is a view on the running service, not a second copy: no button, no prompt.
- Ports held by something that is not Nexus still stop the start, named (RT-04 unchanged).
- COS 0.10.2: the exe is rebuilt by the cos-app workflow on main, and COS updates itself.

## Proof
- RT-10: a Nexus answering on the status port is attached to, status follows it, and a second start says "already-running", not a second
  copy.
- `test-cos-app-runtime` 10/10, `test-cos-app-switch` 10/10, `test-cos-app-link` 5/5, `test-autopilot-handover` 7/7.

## Not yet (said)
- Not run on his machine.
- The service still runs as SYSTEM. Its data paths (`%APPDATA%`) are the ones GD5 moves into each system's own data folder.
