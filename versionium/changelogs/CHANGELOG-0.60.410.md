# 0.60.410 — ErosmancerOS in the browser panel; the COS window spam found and stopped

James, 2026-11-05: "make sure its been added to browser.html. then after that merge and push, and release." · "also getting spammed with
command prompt from cos, any way to hide those? like making a background service for that?"

## Built
- **ES4 (part): ErosmancerOS's options and threats in the browser.** They are in the Element Engine panel you open from browser.html's toolbar.
  - Pace and how actions are sent are dropdowns.
  - Every other option is a field, with what it does under it.
  - A change is saved where `eros set` saves it, so the panel and the CLI always agree.
  - A bad value is refused, and the message says why.
  - The threats are listed in plain words.
  - Still open in ES4: the watch-rules part, which waits on CM1–CM3.
- **The command-prompt spam.** You are on 0.60.404, which already hid each system's own window (SC16, 0.60.400). The spam came from somewhere else:
  - COS's watchdog read each system's CPU and memory by starting one **visible PowerShell per system, every tick**. With 13 systems that is 13 windows per tick, plus 13 PowerShell starts of CPU.
  - Now **one hidden** PowerShell reads every process at once, and the result is kept for 2 seconds.
  - The command-line read in `cos/services/anonymous/nexus.js` is hidden too.

## Proof
- `test-cos-hidden-windows` 3/3. HW-03 is new: reading 13 systems in one tick starts one hidden PowerShell, and it reads again after 2 s.
- `test-cg-element-engine-plugin` 6/6. EP-06 is new.
- `test-adblock` 13/13.
