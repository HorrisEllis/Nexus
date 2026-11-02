# 0.60.366 — CA1: Clear Glass to the tray after no input

James, 2026-11-02: "clearglass needs a setting for automatically minimizing to tray after a period of time."

## The setting
Settings → General → **Go to the tray after no input**: off (the default), 5, 15, 30 or 60 minutes.
- **Idle means the OS's own idle time:** no keyboard or mouse anywhere.
- **Work is never hidden.** Clear Glass stays up while a window plays sound or a macro or workflow runs.
- **Once per idle stretch.** A window he brings back is not hidden again until he is idle again.

## Found on the way
Clear Glass's tray icon was an empty image. That is invisible on Windows, so a window hidden to the tray could not be brought back. The tray now has a real icon (`clear-glass/assets/tray.png`).

## Proof
tests/modules/test-cg-idle-tray.test.js: 3/3.

The tray icon and the idle time on Windows are unverified until it runs on his machine.
