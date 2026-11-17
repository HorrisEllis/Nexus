# 0.60.557 (COS 0.10.3): the COS window stops kicking him off his page

James, 2026-11-17: "the ui keeps crashing and kicking me out of the pipeline tab. i want that to stop, also keeps refreshing the overview of the systems." · "cos ui needs to stop refreshing and kicking me off the page when it reloads. pissing me off."

## Found (`cos/app/desktop/main.js`, `retarget`)
- The COS window re-checks the cockpit every 2 s, and waits 1.5 s for an answer.
- With his machine at 96% memory (deepseek-coder-v2:16b loaded, 8.6 GB), one slow answer was enough to flip the window to the starting
  page.
- The next answer then reloaded the cockpit's home page. That threw him out of the pipeline tab and back to the overview, again and again.

## Fixed
- The window leaves the cockpit only after 5 checks in a row miss (about 10 s). A blip no longer touches the page.
- When it does come back from the starting page, it opens the page he was on (its URL with the tab), not the home page.

## Proof
- `test-cos-app-window` 9/9. CW-05 now checks the new lines, including "one slow answer does not leave the cockpit".
- Every COS app suite green: build 8/8, link 5/5, runtime 10/10, self-update 10/10, shell 12/12, store 15/15, switch 10/10, ui 22/22,
  update 14/14.

## Not yet (said, his asks the same message)
- **The overview's own refresh inside the cockpit** (the system cards re-drawn while he reads them): not touched here.
- **CPU shown as 0% in the header:** Nexus runs as a service, so its processes are not COS's children. The reading needs the service's
  processes.
- **An "open" button on each system:** to its UI in the system's `ui/` folder, and to its compartment settings.
- **The UI floating above the systems, using each system's drawbridge (its interaction contract).**
- **Idearium's lag and crashes:** his machine is at 96% memory, and the 16B model alone holds 8.6 GB. A model unloaded while no build
  runs would free it.
