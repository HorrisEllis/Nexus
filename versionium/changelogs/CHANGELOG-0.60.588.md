# 0.60.588 — Clear Glass starts again from COS

James, 2026-11-18: "I need to be able to open idearium. I can't without opening Firefox and I don't want to waste the ram." · "It should be consistent with clearglass or ideariums compartments when they popup."

## What changed
Clear Glass starts again from COS: its node_modules\.bin launcher was missing, so neither declared candidate existed and COS (the window and the manager) spawned a bare "electron": "spawn electron ENOENT". Now a candidate's electron.exe (node_modules\electron\dist, present) is used even when its .bin launcher is missing (cos/app/desktop-systems.js, cos/manager/supervisor.js). On his machine the launchers were also written back (node_modules\.bin\electron and electron.cmd, not committed), so the installed COS window starts Clear Glass before its next update. test-cos-service 11/11, test-cos-outlive 11/11, test-cos-hidden-windows 4/4; a fixture with no .bin resolves to electron.exe. Mapped, not built: an Open button on each system in COS that opens its UI in its own Clear Glass compartment (context.create + navigate), consistent with the compartments Idearium and Clear Glass already pop up; a preview first.

## Files
- cos/app/desktop-systems.js, cos/manager/supervisor.js: electron.exe from a candidate when its .bin launcher is missing
