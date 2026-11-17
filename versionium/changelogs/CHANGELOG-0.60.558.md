# 0.60.558: the phase is chosen from Idearium's list, never typed

James, 2026-11-17: "cos doesn't update from github. the ui for pipeline is garbage. i have no way to select the phases. like manually typing that in is trash. idearium api? thats kind of the point."

## Found
- **The run form** (`cos/ui/automation/engine.js`, askNeeds) already offered a dropdown of the phases that can be built now
  (Idearium's `/api/phases/next`, through COS's `/api/cos/pipeline/ready`). It showed only when that list arrived in time.
  - COS waits 20 s for Idearium.
  - Idearium's phase census takes about 17 s cold on his machine, longer under memory pressure.
  - So the list often failed, and the form fell back to a box to type the phase id into.
- **COS from GitHub:** his COS did update itself, 0.10.1 → 0.10.2. COS 0.10.3 was released (22:05) after his COS last checked, so the
  card said 0.10.2 was the newest. "Check GitHub now" finds it.

## Fixed
- The form shows at once. The phase is a dropdown, filled from Idearium's API when it answers, with a filter box over the phase id, its map
  and what it does, and a count of the phases that can be built now.
- When Idearium is slow, the form says so, with **Try again**. It never shows a text box for the phase.
- The Automation page asks Idearium for the list as soon as it opens, which warms Idearium's census, so it is usually ready by the time he
  presses Run.

## Proof
- `test-cos-console` 12/12.
- Not driven in Clear Glass here (said). The proof on his machine: Run, and the phase is picked from the list.

## Not yet (said)
- The run form is still a form above the pipeline, not on the canvas.
- More of the pipeline's controls are his to name.
