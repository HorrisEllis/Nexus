# 0.60.652: the Automation tab is the pipeline console, with no frames

James, 2026-11-24: "Nope the whole tab." · "Fuck iframes. Build the automation tab better."

COS › **Automation** is now the pipeline console itself: no row of sub-tabs, no page inside a page.

- **The canvas** shows the chosen pipeline's steps and gates; **under it, the build**: a bar of its pieces (green passed, grey waiting, red held or failed) and each piece with its tries and model, from COS's Lab route. Before the first round ends, its steps so far.
- **The Lab** is a panel of the console (right edge): systems up, RAID requests met, every build, the issues and proof.
- **Run pipeline, Pause, Continue, Cancel run** act through COS's engine. **Terminal** is COS's console and command line.
- **Workflows, Desktop, Supervision**: the old engine page is one click away (More › "Workflows, Desktop, Supervision…"), as its own page, until each is a panel of the console.

Fixed on the way: a build's rows no longer show "0:00:00 PM" (COS's Lab route gives no times, so none is shown); the empty "Model calls" area under the canvas is gone (COS has no route for model calls).

Checked: the page's script parses; every request is a COS route; every menu item names an action that exists; no frames.
