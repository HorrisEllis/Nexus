# 0.60.582 — COS says what blocks it (MG20)

James, 2026-11-18: "im getting sick of nexus being so unstalbe"

## What changed
MG20, COS says what blocks it: the Windows service killed COS's manager 8 times today for not answering its health (event loop blocked 50 s, measured at 15:10), and each kill took the systems it had started (Idearium's NM1 builds at 14:38 and 14:59). The cause was not found by reading, so the manager now records it: every synchronous child process (execSync, execFileSync, spawnSync) over 2 s is a ledger line "slow-sync" with its command and time, and any event-loop stall over 5 s is a ledger line "stall". test-cos-outlive 8/8.

## Files
- cos/manager/server.js: the sync-call timer and the event-loop lag watch
- cos/manager/supervisor.js: record(kind, system, why) for the manager's own lines

## Not done
The fix itself waits on what the next stall names. Systems the manager starts still die when the service kills it (open).
