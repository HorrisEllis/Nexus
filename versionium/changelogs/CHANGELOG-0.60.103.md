# 0.60.103 - 2026-10-16

James: "the ui is fucked up. its too cluttered. thats why i want you to rebuild it the way i told you." · "naming schema... versions... why do you do tht?"

## Code tab (TB5, first cut)
One view on screen at a time: files, changes, plans, runs, COS (idearium/ui/js/code-surface.js `csView`, remembered per browser). Badges show waiting changes, building/failed phases, running calls. The agent pane opens on request, when lines are picked, or while the agent is busy. COS is a placeholder (what it should show is still to confirm).

## COS zip import (cos/app/store.js)
The version is read from inside the zip (VERSION, then package.json). The folder name is only a cross-check when it carries a version, so GitHub's Nexus-<branch>.zip installs. CA-14.

## Not done
test-code-tab CT-11, CT-15, CT-20, CT-22, CT-31 still look for regions that moved to other views; they need csView('changes'|'runs'|'plans') before their selectors.
