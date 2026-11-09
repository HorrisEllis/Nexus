# 0.60.464 — COS's Settings; his new asks checked against the phases

James, 2026-11-08, to the Settings preview: "I like the settings."

James, 2026-11-08: "Okay. So steps are compartments from cos. That way is can use the cos ui. Also need to show the programmable gates in between as a
compartment themselves. I want the wires to track the actual request running through the pipeline. Check the phases. It’s agnostic. This can map
anything. Can use the gates to build one step at a time, discover gaps. Like look at idearium. Like the code tab. Like I want it all programmable,
manageable, explicit, automatic when it comes to requests. Use it to build macros, frameworks, pipelines, stepwise procedures or repeatable systems."

## Built (SC7 expanded, docs/2026-11-02-cos-console-phasemap.spec)
- **Settings** (`cos/ui/settings/`): its tabs are the contract's pages marked `nav: settings`, in their `tab` order: Network, Startup and services,
  Update. Each tab is that page, whole, and each keeps its own route (§0.3). The shell's gear opens Settings › Update with its settings open (his gear
  of 2026-11-02). Settings is in the rail's foot; Network and Updates left the main rail.
- **Startup and services** (`cos/ui/startup/`): COS itself, meaning the options its exe names (Start with Windows, admin rights, start in the tray,
  the Windows service, closing, minimizing), changed through the exe's door, which re-applies them the way its tray menu does. Systems: every system
  COS declares (`GET /api/cos/systems`), each with its Start at boot (`start.autostart`, his configuration, read back). In a browser with no exe,
  the page says where these are set.
- **Backend first:** `cos/app/window.js` `startupOptions` (the exe names its options with its tray menu's words); the window's door gains
  `startup` and `setStartup`, which change only an option the exe names (CW-05 guards the door's seven calls).
- **core.js** speaks to `window.top`, so a page inside a Settings tab is answered by the shell itself (its confirms, notices and events). For every
  page in the shell's own frame, top is its parent, so nothing changes for them.
- **Not built:** the preview's "Boot set" row. No such setting exists (what starts at boot is each system's Start at boot), so it is said here
  rather than invented.

## His new asks, checked against the phases (docs/2026-11-08-pipeline-canvas-phasemap.spec, addendum 2026-11-09)
Nothing new written; each part expands the phase that owns it:
- **PC_D1:** steps as COS compartments. One reading is his: (a) a declared compartment, or (b) a compartment made for the run.
- **PC5:** the programmable gate as its own compartment.
- **PC4:** the wires carry the request itself, from the engine's run.
- **PC7:** one step at a time, the gate names the gap, the gap becomes a build.

## Proof
- `node tests/modules/test-cos-settings.test.js`: 3/3, in Clear Glass.
- `test-cos-console`: 11/11.
- `test-cos-app-window`: 9/9.
- `test-cos-ui`: 6/6.
- `test-cos-network`: 5/5.
- `test-cos-resources-page`: 3/3.
- `test-cos-console-tab`: 4/4.
- `test-cos-disk`: 5/5.
- `test-cos-hub`: 7/7.
