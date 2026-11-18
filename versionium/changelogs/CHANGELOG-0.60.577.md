# 0.60.577: systems outlive COS's manager (MG15 outlive)

James, 2026-11-18: "yes the node instances should be hooked into the service, until emerge.exe is doned" · "system states saved as a node file, crash reverts them back to the most recent one." · "Next. Get this built. Please."

Why: COS's restart (to load 0.60.575) stopped every system and cut NM1's DeepSeek build mid-run. Read first: restartCos called sup.shutdown; each
system's output was a pipe into the manager, so a system left running would die at its next log line (EPIPE). No Windows job object holds them.

- `cos/manager/supervisor.js`:
  - a system writes to its own files (`<data>/manager/logs/<name>.out.log`, `.err.log`; 10 MB, one older kept), started detached; the manager reads
    each file as it grows into the same console, wall and EADDRINUSE handling as the pipe had. Found running it: Windows does not reliably tell
    fs.watch when another process appends, so the file's size is also read every 500 ms while the system runs (a local stat, not a request).
  - the running systems kept as a node file at every spawn and exit (`<data>/manager/state/running.node`, type `cos-running`, and the last 5).
  - at boot, before starting anything: a system in that file whose process is alive and whose health answers is adopted (state up, same pid,
    a ledger line `adopted`), not started again; one alive but not answering is said and started as usual. An adopted system is stopped by its pid
    (taskkill /T); its end is seen by the stop or the reaper's minute.
  - `handOver()`: COS's own restart leaves the systems running, the state kept for the next manager. `shutdown()` (the Windows service's stop)
    still stops them all. A test's fake spawn keeps the pipes (`policy.outlive`).
- `cos/manager/server.js`: restartCos hands over instead of shutting down.

Mapped first: docs/2026-10-24-cos-manager-phasemap.spec MG15 addendum 2026-11-18 (slices o, a, r).
Proof: tests/modules/test-cos-outlive.test.js 6/6 (a real child: logged to its file, kept in the node file, handed over, adopted by a second
supervisor with the same pid, its new lines read, stopped by its pid); test-cos-console-tab CT1-01..03 (CT1-04, the Clear Glass page, fails on
his PC as before); test-cos-autopilot-door 5/5; test-cos-boot-and-deps 4/4.
Not proved yet: a COS restart on his machine during a build, the build going on.
Recorded, for after: his "instead of ports, we use nexus://guardian" — systems addressed by name only (each on a named pipe), COS the one HTTP door for the pages.
