# CHANGELOG 0.60.418 (COS 0.7.1) — COS uses the Nexus already running

James, 2026-11-06, with COS's window saying "Nexus did not start: nexus linked is already running (pid 7492): stop it first": "opening cos
gives this error. can you make it so  only one can and will open to the same instance." · on his taskbar: "not a cos problem".

## Found
- COS was already one instance: `requestSingleInstanceLock`, and a second launch shows the first window. Task Manager's "COS (4)" is one
  app's four Electron processes.
- The bug: Nexus, started detached by an earlier COS, keeps running after the window closes. The next COS found it, and refused to start it
  instead of using it.

## Built (MG35b, expanded from MG35)
- **Running and answering:** COS attaches to that same instance. The start answers `ok`, `attached` and its pid, the cockpit opens, and the
  notification says COS is using the running Nexus.
- **Running but not answering:** COS says "already running (pid N) but not answering", and the starting page shows **Restart Nexus**
  (`controller.restart`: stop its whole tree, then start). It never says "stop it first" any more.
- The window's own Start and Restart buttons now update what the window shows.
- COS 0.7.1, so the release workflow builds a new exe with this. A fix left at 0.7.0 would never reach his exe.

## Proof
- `test-cos-app-link` **5/5**:
  - CL-02: a second start attaches to the same pid (it used to assert "one at a time");
  - CL-05: a Nexus alive but silent is said, and Restart brings up one that answers;
  - both fail when run against the old controller.
- The COS app suites pass: window 9/9 (its starting bridge now lists `restart`), ui 22/22, runtime, switch, shell, update, install and service.
- **Not run:** on Windows, in the exe.
