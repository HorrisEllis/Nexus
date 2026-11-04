# His NSM v2 and NSSM notes (uploaded 2026-11-04 as NSSM.zip)

James, 2026-11-04: "build that for clearglass then make sure cos.exe is completely borderless. also run on startup with an option to disable.
run in service with admin privilages for more control and power.  maybe move the system to the cos folder."

Written 2026-04/05 for the old bridge (bridge/nexus-bridge-server.js on :3747), which is gone. Kept whole, not run (§0.3).
What was carried into COS (docs/2026-11-02-cos-the-application-phasemap.spec CA_D1b, CA4):
- the NSSM service recipe (NSSM-INSTALL.md): install, AppDirectory, environment, logs with rotation at 10 MB, restart after 2 s, auto start —
  now cos/app/service.js for COS's headless supervisor (service NexusCOS).
Already in COS's supervisor (cos/manager/supervisor.js), so not rebuilt: backoff with a cap, a circuit after repeated crashes, start order by
phase gated on health, an event ledger, boot sets. Not yet carried: restart on an unhealthy health contract while the process is alive (nsm.js ②),
jitter on the backoff (③), profiles that extend each other (⑤).
