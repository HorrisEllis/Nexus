# 0.60.364 — MG35: the COS exe starts Nexus (COS 0.2.0)

James, 2026-11-01: "need the exe for cos. its how were going to start nexus from now on"

## What was missing
The COS exe (cos/app, built since COSA6) only ran Nexus releases it had installed from zips into its own store. His Nexus is the git folder he updates in place (`D:\Backups\Downloads\nexus-0.60.346`, with UP6, UP11 and UP13), so the exe could not start it.

## Now
- **Link a Nexus folder…** in the window, or `link <folder>` on COS's command line, registers his folder. COS writes nothing inside it.
  - A folder without `VERSION` and `lib/nexus/autopilot.js` is refused, and the refusal names what is missing.
  - The project card shows the linked folder and its version. **Unlink** forgets the link and leaves the folder alone.
- **Start** runs the folder in place, through its own launcher (`lib/nexus/autopilot.js`, which hands supervision to COS's manager), with:
  - the **system node**;
  - its own `data/` and its own `node_modules`.
- **COS never runs it as Electron-as-node.** `ELECTRON_RUN_AS_NODE` would reach every child process and turn Clear Glass's Electron into a plain node.
- **No node on the machine** means the start is refused, with where to get it.
- **Start Nexus when COS opens** is a checkbox on the card, and he chooses it.
  - Linking the first folder ticks it.
  - A start that fails shows a notification and a banner, never silence.
  - Closing the window keeps Nexus running (tray). Quit stops what COS started.

## The exe
`cos/app/version.js` is 0.2.0. When this reaches main, the cos-app workflow builds on a Windows runner and publishes the release **cos-v0.2.0** with:
- the portable exe;
- the installer;
- SHA256SUMS.

The exe is unsigned, so SmartScreen says "unrecognized app" once: More info, Run anyway.

## Proof
- tests/modules/test-cos-app-link.test.js: 4/4. CL-02 starts a fixture folder through the real controller and runtime with `ELECTRON_RUN_AS_NODE`, `NODE_PATH` and `NEXUS_DATA_ROOT` set in COS's own environment. The launcher's recorded environment shows all three absent and the system node used.
- tests/modules/test-cos-app-ui.test.js: 22/22, with UI-06b new.
- The app's other suites are unchanged:
  - store 15
  - runtime 9
  - switch 10
  - build 8
  - update 14
  - shell 12
  - self-update 5

## Unverified until it runs on his Windows machine
- the folder picker;
- the notification;
- where `where node` finds node.
