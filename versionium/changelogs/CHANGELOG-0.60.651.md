# 0.60.651: the run console is COS's Automation tab; the Lab is a tab inside it

James, 2026-11-24: "build the tab. i need to be able to use the pipeline alos" · "cos/ui/run-console-preview should be the automation tba" · "the lab be migrated into the new automation tab. like i want to use the pipeline for almost anythiogn" · "now the preview can strip it, no ui should have what the backend doesn't. ui should float on top"

COS › **Automation** opens on a new first tab, **Console**: the pipeline screen you shaped in the preview (the canvas, its steps and gates, the side panels, the command line), now reading and acting only through COS's own routes.

- **Run pipeline, Pause, Continue, Cancel run** work (Run menu, or right-click): each goes to COS's engine and says what it did.
- **Build** panel: the latest build's pieces and their state, from COS's Lab route. **Terminal**: COS's console and its command line.
- **The Lab** is now the last tab of Automation, and is off the left menu.
- The other tabs (Pipelines, Workflows, Runs, Log, Desktop, Supervision) stay as they were.

Stripped from the preview, because COS has no route for them yet (the UI floats on the backend, his rule): live model calls and their outputs, the call menu, lineage, the step-time baseline, Retry from a step, Change model, and the Add step pickers for phases, components, commands, frameworks and templates. Each comes back when its backend route exists.

Checked: the page's script parses; every request it makes is a COS route; every menu item names an action that exists. No new server code: the console is a static page COS's page server already serves.
