# 0.39.372 — 2026-10-07

James: "Do you think we should have each repo a control panel for the system, and compartment for the nexus repos?" · "hooks into the desktop envirement."

## NC2 — each Nexus repo is its system's compartment and control panel
**Found:** the compartments already existed. `idearium/repo/nexus-self.js` makes a Nexus compartment with one child compartment per system, and links each system's repo to its own. Three things were built on that.

**1. Controls through the supervisor, never through the system itself.**
- **autopilot** (the supervisor `npm run start:all` runs) gains `POST /control/:name/:op`:
  - **restart:** stopped, then straight back;
  - **stop:** held down until started;
  - **start:** from held or stopped, or from a tripped circuit breaker, which is exactly what it waits for a person to reset. It's refused while memory is critical.

  A stop or restart you ask for is never counted as a crash.
- **Idearium:**
  - `GET /api/repos/:uuid/system` shows a system repo's processes as autopilot sees them: status, pid, port, restarts and crashes. `core`, `cos` and `components` say they have no process of their own; they're code the other systems load.
  - `POST /api/repos/:uuid/system/:op` sends restart, stop or start. Each act is a row of the repo's log.

**2. One intent, not two copies.**
- **The repo's charter is its compartment's intent.** Saving it sets the intent through COS's own gate.
- **COS nesting applies:** a system's compartment holds Nexus's conditions and axioms as well as its own.
- **Nothing is lost silently.** A check COS can't run (a `page` check) is named, not dropped.
- **Every place that reads the charter now reads it as it applies:**
  - the build request, the phase proof, the work-surface proof and the charter view;
  - the inherited conditions and axioms come first, each marked *from nexus*.

**3. Control, the drawer's third view.**
- the system's processes, each with restart, stop or start;
- the desktop: pause, resume and "checkpoint now";
- its checkpoints, each with rewind.

**NC1 is answered in writing.** The answer is in the repo-compartment phasemap's addendum: the live tree changes only through approval, and a system's desktop runs a copy.

## Proof
- **New: `test-system-control` 7/7.** The real autopilot supervises a throwaway process. It covers:
  - restart, with a new pid and no crash counted;
  - stop: held, never restarted, no crash;
  - start from held, and a person resetting a tripped breaker;
  - refusals;
  - the panel's wiring;
  - the charter set on its COS compartment, with the page check named;
  - the charter as it applies, inherited conditions first and marked, in requests and proofs.
- **The Clear Glass probe is now 16/16.** The Control view checks:
  - the process as the supervisor sees it;
  - restart going through the system route;
  - a stopped system offering start, and no stop;
  - checkpoint now;
  - the checkpoints with rewind.

  The probe also caught a bug in itself, now fixed: a check for "start" also matched "restart".
- Unchanged and passing:

| Suite | Result |
|---|---|
| autopilot restart-delay | 6/6 |
| autopilot boot-gates | 9/9 |
| autopilot warp-spine | 4/4 |
| boot-phases | 8/8 |
| phase-proof | 7/7 |
| chunked-phase-build | 14/14 |
| event-contracts | 8/8 |
| work-surface | 27/27 |
| nexus-self-and-cos-run | 30/30 |
| cos-workspace | 17/17 |
