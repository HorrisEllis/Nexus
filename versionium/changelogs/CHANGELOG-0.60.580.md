# 0.60.580 — busy is not dead (MG15c)

James, 2026-11-18: "Rerun NM1 now" · "im getting sick of nexus being so unstalbe"

## What changed
MG15c, busy is not dead: the NM1 rerun was lost to 0.60.579 itself. COS booted at 12:43 while Idearium was mid-build (heap snapshot); its health did not answer in 30 s and the new rule stopped it as dead. Now a live pid that does not answer is adopted as degraded and its health waited for; it is never stopped for a slow answer (at boot from running.node, or by its port). test-cos-outlive 8/8 (MG15-8 new).

## Files
- cos/manager/supervisor.js: _waitUp (an adopted pid kept as degraded while it does not answer); _adopt no longer refuses a live pid
- tests/modules/test-cos-outlive.test.js: MG15-8

## The coder's fault
0.60.579 added a stop-on-no-answer rule that killed the build it was meant to unblock. Posted to Cortex's failure record.

## Not done
The running COS manager takes this only after `restart cos` (his act).
