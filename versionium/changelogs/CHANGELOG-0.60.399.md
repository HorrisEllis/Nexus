# 0.60.399 — What starts at boot, and the dependencies first (SC12, SC13)

James, 2026-11-05: "cos also needs to install the dependancies. also this pc is getting its ass kicked. i need options for what systems start
on boot."

## Built
- **SC12, Start at boot for each system.** Every system now has a switch in one list, on the Automation page. Until now this setting sat
  in each system's own Configuration, one at a time. The switch is yours and is read back after a change. The next boot skips what is off,
  and the ledger says so. A switched-off system can still be started by hand (`start <name>` in the Console).
- **SC13, dependencies before boot.** Before `--boot` starts the systems, COS runs `npm install` when:
  - `node_modules` is missing; or
  - `package-lock.json`'s content changed since the last good install. Its hash is kept in `node_modules/.cos-deps.json`, so a git pull
    that only touches the file's time does not trigger an install. Before the first install there is no hash, so the file's time decides
    once.

  It is said on the ledger, and `npm.cmd` is quoted (CA6). A failed install is said and the boot goes on. `--no-deps` skips it.

## Mapped, open
- **SC14:** each system's own `ui/` folder, or its console, opens in its own pop-out window.
- **SC15:** nexus-cli in the Console. A line that starts with a system's name goes to that system's door, so the commands come from each
  system's registry.

## Proof
- `test-cos-boot-and-deps` 4/4. BD-03 runs on a real manager: a system switched off is skipped at boot with the reason, and starts once
  switched on.
- The COS UI suites are unchanged: ui 6/6, console 11/11, ui-starts 3/3.
