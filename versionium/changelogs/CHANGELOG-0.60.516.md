# 0.60.516 — COS 0.9.0: COS's own Windows service host, built from scratch; no nssm.exe

James, 2026-11-13, told the service switch needs nssm.exe, which is not on his machine and not in his NSSM.zip (that zip is his NSM v2):
"need to build it from scratch."

## Found
- COS 0.8.0's "Run Nexus as a Windows service" answers "nssm.exe was not found" on his machine: no nssm.exe in NSSM_EXE, beside COS, or on PATH.
- Emerge's native binary (0.60.512, process control) is a Linux ELF, so the host cannot be written in Emerge yet (CA_D8, decided by his axioms).

## Built (CA8)
- `cos/app/service-host/cos-svc.cs` → `cos/app/bin/cos-svc.exe` (19 KB, built by `build.cmd` with the C# compiler Windows carries; nothing to
  download, runs on Windows 10/11 with nothing installed). It answers the service control manager and does what NSSM did for COS:
  `install <config>`, `start`, `stop`, `remove`, `status`, `run`, and `console` (the same loop in a terminal).
- The loop: node + autopilot as NexusCOS (LocalSystem, at boot), COS_SERVICE=1, logs rotated at 10 MB, started again when it exits (2 s,
  doubling to 30 s) and, his NSM v2's rule, when it is up but its health URL stops answering. Stop ends the whole process tree.
- `cos/app/service.js` uses the host first and nssm.exe only when the host is missing. The switch's words no longer ask for nssm.exe.
- COS 0.9.0 (`cos/app/version.js`) carries the exe, so the cos-app workflow publishes it once this is on main.

## Proof
- `node tests/modules/test-cos-service.test.js`: 11 passed, 0 failed, on his machine. SV-11 runs the built exe: a process started with its
  environment and arguments, logged, restarted at 200, 400, 800 ms, ended on stop; a missing service said.
- By hand: `cos-svc install` without admin answers "Access is denied (5) — run as administrator" and installs nothing.
- Not yet proven: the service installed and running as LocalSystem. That needs his admin approval, through the switch in COS 0.9.0.

Coder's part: the host, the choice of C# by his axioms (recorded as CA_D8 with the options weighed), the tests. The call to build it is his.
