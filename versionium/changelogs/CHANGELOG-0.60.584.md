# 0.60.584 — a system COS starts survives a kill of its manager (MG21)

James, 2026-11-18: "Both" (the freezes stopped, and the systems COS starts survive the service killing its manager) · "just get the system stable. nexus needs to be able to code."

## What changed
MG21, a system COS starts survives a kill of COS's manager: the Windows service kills the manager's whole process tree when its health does not answer (8 times on 2026-11-18); every system that manager had started died with it, Idearium's NM1 builds among them, while systems adopted from an earlier manager lived on. On Windows a system is now started through a launcher that starts it detached and exits at once, so it is outside the manager's tree; COS holds it as an adopted one (its pid, its log files), sees its end within 2 s (a signal-0 check, no process started) and restarts it by the usual rules. A shutdown (the service's Stop) still ends every system and waits for it. Kills of adopted systems run async (MG20). test-cos-outlive 11/11 (MG15-9 the tree killed as the service does, the system lives; MG15-10 an escaped system that ends is restarted; MG15-11 a shutdown still ends it); boot-and-deps 4/4, heartbeat 7/7, memory-baseline 7/7, autopilot-door 5/5, hidden-windows 4/4, desktop-watch ok; autopilot-handover 5/7 (AH-01b, AH-04 failed before this change).

## Files
- cos/manager/supervisor.js: _escape (the launcher), _adopted (pid watched every 2 s, async kill), shutdown ends adopted systems and waits
- tests/modules/test-cos-outlive.test.js: MG15-9..11

## Not done
The freeze's own cause: MG20 (0.60.582) names it when it next happens; none since COS restarted at 15:31. COS loads this at its next restart.
