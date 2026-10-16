# 0.60.70 - 2026-10-16

James: "just need a cli to replace powershell, to run the npm run start:all command, and cli commands."
Context: he was asked whether to extract one shared command layer first or build the console now. This answer narrows the whole console: a command line, not a platform. The larger plan (docs/2026-10-16-cos-console-phasemap.spec) stays mapped and unbuilt.

## What changed
- **`cos/app/shell.js`, the COS command line.** Understands exactly:
  - `npm run <script> [-- args]`, `npm start`, `npm test`: the script in the CURRENT version's `package.json`, when it is one `node <file> [args]` command. 12 of this repo's 13 scripts are, including `start:all`, `start:core`, `autopilot`.
  - `nexus <args>` (cli/nexus.js) and `node <file>` (a file inside the version).
  - COS's own verbs: switch, rollback, start, stop, running, logs, list, status, import, inbox, remove, settings.
- **No PowerShell, no npm, no shell.** It runs with COS's own runtime and the bundled modules; arguments are passed as data, so `&&`, quotes and Windows quoting rules never apply. Anything else is refused with the reason (a chain, `concurrently`, `npm install`), and nothing is started.
- **It will not start a second copy:** `npm run start:all` while COS already runs the project, or with the ports taken, is refused and says so.
- **Ctrl+C ends the whole process tree**, not the console.
- **Where:** `cos sh [project]` (interactive), `cos exec <project> "<line>"` (one line, exit code returned), and a **Command line** pane in the COS window.

## Proof and honest limits
`test-cos-app-shell` SH-01..12 on real zips and real processes (including a grandchild that must die on Ctrl+C); UI-15/16 in jsdom. Limits: the window pane has no keyboard input to the running program, so interactive tools like `nexus-repl` need `cos sh` in a terminal; `test:all` is a chain and is refused; Windows (ELECTRON_RUN_AS_NODE, taskkill, the pane) unverified. COS app version 0.3.0.
