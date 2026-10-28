# 0.39.327 — 2026-10-05

James: "i though we switched to heartbeat and pulse system". He had pasted `[diagnostic] 'idearium' missed its /health probe but registered 8s ago — treating as ONLINE`.

- `diagnostic/nexus-diagnostic.js` read the pulse first only for clear-glass (`preferHeartbeat: true`). Every other system was HTTP-probed first. A system still booting missed the probe, and the registry rescued it a moment later. That rescue is the line he pasted.
- The pulse is now read first for every system. Each system sends `createPulse` → POST `/api/heartbeat` every 10 s, and orchestrator watches for missed pulses. The `/health` probe is the fallback for a system orchestrator has not heard from: no pulse yet, or orchestrator itself down. `preferHeartbeat: false` opts a system out.
- What a pulse does not prove, said plainly: that the system's own server is answering requests. It proves the process is alive and reaching orchestrator. A blocked event loop stops both, so in practice they fail together.
- `test-health-authority` HA-009 is new (9/9). diagnostic-heal-path, system-registry and boot-log-fixes are unchanged and pass.
