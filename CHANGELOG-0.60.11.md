# 0.60.11 — 2026-10-13

James: "so why is compartment browser in clearglass ui. should be gone" · "it should have it no where. im scared of regression."

His merged fix (0.60.10) took the label off the browser. The same "compartment · …" label was still drawn in five more places, and all are now removed:
- Settings (`clear-glass/renderer/settings.html`)
- Library (`clear-glass/renderer/library.html`)
- the agent sign-in popup: its title bar, its window title and its element-picker hint (`clear-glass/src/providers/attention.js`)
- Idearium's window bars (`idearium/ui/js/window-chrome.js`)

Regression guard: `tests/modules/test-no-compartment-label.test.js` scans Clear Glass's renderer and source and Idearium's UI, and fails if the label comes back anywhere. The guard found the last two copies itself. `test-accounts-picker-cos` AT-01 now requires the label's absence (40/40).
