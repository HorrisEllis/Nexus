# 0.60.90 - 2026-10-16

_Built on the branch claude/code-tab-run-state-phasemap (PR #91) as 0.60.69; renumbered 0.60.90 at the merge with main (main had already used 0.60.69)._

James: "being upgrade cos executable"  (read as: begin upgrading the COS exe; to confirm)
After: "i want this almost like vmware. minimize to taskbar. auto updates from dropping in new zips, downloading it from clearglass. versions using versionium  in idearium"

## What changed (COSA12 and the first slice of COSA13)
- **Update policy:** `off | ask | auto`, default `ask`, in the window's header and `cos settings update.policy <value>`. A zip dropped on the window or into the inbox is installed; then:
  - **off:** nothing else happens by itself.
  - **ask:** the window offers the switch.
  - **auto:** COS switches by itself ONLY when the checksum was verified, the version is newer than the current one, nothing else is running an operation on that project, and the project is idle. Otherwise it offers, or waits, and says why. It is the normal switch: preflight, data snapshot, health check, automatic rollback.
- **COS has no idle signal from a running Nexus yet**, so with Nexus running, auto waits rather than guess. It is retried every 30 s once a signal exists. (The autopilot's `/status` carries no "a job is running" field; adding one is the next step.)
- **Window like VMware:** minimize goes to the taskbar, close hides to the tray, size and position are remembered (`settings.json`, a damaged file is set aside with a warning, never silently reset), and a status strip shows each project, version and health, plus any release waiting.

## Proof and honest limits
`test-cos-app-update` ST-01..05, AU-01..09 (real zips and store, the switch faked); `test-cos-app-ui` UI-12..14 (jsdom). NOT built: Clear Glass downloading releases (COSA7), the Versionium record of every install/switch/rollback (COSA14), the autopilot idle signal. Windows behaviour (taskbar, tray, remembered position) is unverified. COS app version 0.2.0.
