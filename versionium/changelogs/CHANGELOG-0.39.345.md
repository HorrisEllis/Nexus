# 0.39.345 — 2026-10-05

James: "should we have the lanes, be hooked into gaps, phases? like i want to be able to brainstorm. also the reach. like its meant to use genesis spec. also can you make the windows borderless like comportmant desktop for cos. also what about having ai generate the spec from the idea, like it feeds all the text input fields for each part of the spec. the spec workshop was supposed to use blocks. like enterprise grade, it looks bad. also the spacial void is supposed to feed into the spec workshop pipeline, then the spec workshop needs the templates from the quick spec menu. with the ability to edit, save, and remove spec templates."

- **Built: borderless windows** (`clear-glass/src/main/compartment-window.js`). The workshop, the void, the architect and the spec library now open frameless, dark and resizable, like the COS desktop. Each of these pages already drew its own title bar (`ui/js/window-chrome.js`), but Clear Glass only routed desktop and settings that way, so the workshop got Windows' frame and its File/Edit/View menu. `test-compartment-window` 6/6, with CW-11 new.
- **Mapped: `docs/2026-10-05-idea-to-spec-workshop-phasemap.spec`.**
  - WK1: the workshop opens with the template's blocks (the genesis spec's by default, the same list as the quick spec), and the reach dial goes.
  - WK2: templates are edited, saved and removed (archived, never deleted).
  - WK3: the agent drafts every block as proposals, accepted block by block or all at once.
  - WK4: the void's → SPEC lands in the workshop with what the void knows.
  - WK5: lanes feed gaps and phases on his click.
  - WK6: enterprise grade, tested in Clear Glass.
  - The map extends WS5, WS6 and UI0, which were already mapped. Four pushbacks are recorded for him.
