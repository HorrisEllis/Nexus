# 0.60.88 - 2026-10-16

_Built on the branch claude/code-tab-run-state-phasemap (PR #91) as 0.60.67; renumbered 0.60.88 at the merge with main (main had already used 0.60.67)._

James: "cos app for windows"

## What changed (COSA2, COSA3, COSA4: COS runs and switches your installed versions)
- **Runs the version itself:** `cos/app/runtime.js` starts the version's own supervisor (`nexus/autopilot.js`) and waits for `:7799/status`. No Node install: the COS app runs the project with its own runtime. The release zip has no `node_modules`, and Nexus's whole runtime dependency list is one package (`js-yaml`), which COS bundles and hands over.
- **Refuses before starting, with the reason:** a release that needs a module COS does not bundle (names it), or a port already used by another program (names the port).
- **Stops the whole tree** (a project that started its own children does not leave them running).
- **Switch is safe:** the candidate is checked BEFORE anything running is touched. Then: stop, snapshot your data, start the new one, require it healthy. If it does not come up, the data is restored, the version that worked is running again, and the reason (with the log's last lines) is shown. The failed version stays installed for inspection.
- **Rollback later** goes back without touching data unless you say `--restore-data` (the newer version may have written real work).
- CLI: `node cos/app/cli.js switch|rollback|start|stop|running|logs`.

## Proof and honest limits
`test-cos-app-runtime` RT-01..09 and `test-cos-app-switch` SW-01..10: real zips, real processes, real sockets, a release that crashes, one that hangs, one that needs a missing module. On Linux. NOT verified on Windows: `taskkill` tree kill, the Electron runtime flag, junctions. Not built yet: the window and tray (COSA6), Clear Glass delivering updates (COSA7). Clear Glass itself (Electron) is not started by COS yet, only the Node services.
