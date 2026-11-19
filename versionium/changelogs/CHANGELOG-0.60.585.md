# 0.60.585 — the COS window starts when Nexus's own systems hold their ports

James, 2026-11-18, his COS screen ("Nexus did not start: ports 7799, 7820, 4800, 9000 already in use by another program"): "i cant get it to start"

## What changed
MG21 followed through, the COS window starts when Nexus's own systems hold their ports: since 0.60.584 the systems outlive the manager on purpose, and the service's Stop kills the manager without its shutdown running, so Idearium, Guardian and Orchestrator kept their ports and the window refused to start. Now, with COS's own status port free, a port whose holder answers /health as a Nexus system does not stop the start: the manager takes it over by its port (MG15b, proven 15:57: 9 systems adopted, none restarted). A port held by anything else still stops it, named. test-cos-app-runtime 11/11 (RT-04b new). The window runs from the installed app (D:\COS\resources\app), so it takes this with a COS app update. Open: a service Stop leaves the systems running until the service starts again and adopts them (the service host kills the manager; its shutdown cannot run).

## Files
- cos/app/runtime.js: nexusSystemAt(port); start() lets a Nexus system's port through when COS's own is free
- tests/modules/test-cos-app-runtime.test.js: RT-04b
