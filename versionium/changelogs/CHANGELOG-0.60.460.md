# 0.60.460 — no console window beside Clear Glass

James, 2026-11-08: "also can we have cos.exe run the command prompts in the background?" (with a screenshot of an empty `C:\Program Files\nodejs\node` window)

## What was wrong
COS started Clear Glass through `node_modules/.bin/electron`. On Windows that file is a `.cmd` launcher, and it runs `node …\electron\cli.js` in a console window of its own. That was the empty node window, open for as long as Clear Glass ran. Both of COS's paths did it:
- the supervisor;
- the COS app's desktop starter, used when Nexus runs as the Windows service.

## What changed
- **Both paths now start Electron's own program** (`electron/dist/electron.exe`), with no shell and no console. Clear Glass's own window shows as before.
- **The `.bin` launcher is used only when that program is missing.**

The phase is SC16 (no console windows), expanded rather than rewritten.

## Proof
- `test-cos-hidden-windows` 4/4. HW-04 is new: the real program is used, with no shell, and the window still shows; the launcher is kept when the program is missing; anything else is unchanged.
- `test-cos-service` 7/7; `test-cos-ui` 6/6; `test-cos-hub` 6/6.

## Said
This could not be run on Windows from here. On his machine, the next start of Clear Glass from COS should show no node window.
