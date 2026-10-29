# 0.39.297 — 2026-10-02

James: "I hate that ui you made. The spacial void is its own page. all of it needs to be isolated, in its own pages. i was describing the pipeline when i told you that, from idearium."
James: "alright but no lowercase. and make sure its enterprise grade"

## The spec workshop, rebuilt as its own page
The workshop is the pipeline's second station: an idea from the Void (or a library document, a repo's spec, or nothing) shaped into a spec's sections. Its page was rebuilt from scratch in the Void's look.

- **The look:**
  - THE SPEC WORKSHOP in Bebas Neue over the same breathing star field;
  - the pipeline's stations across the top: IDEA → SPEC → ARCHITECT → BLUEPRINT → REPO → COS. The ones already done light green, and REPO opens the repo's Spec tab;
  - your sections in cyan, the agent's proposals in magenta.
- **Capitals everywhere:** every label, button, message and tooltip, and the window title. The browser's own prompt and confirm boxes would show lowercase, so the page uses its own dialogs instead.
- **The dial speaks your words.** REACH runs normal, creative, outside the box, novel, outlier, the same scale as the Void, replacing the labels the first workshop made up.
- **The agent only shapes the spec:** draft the open section, open loops, questions. The idea-generation feeds (d20, reverse chain, what ifs, inspiration) belong to the Void, where the ideas are yours.
- **Nothing reaches the spec without your yes.** A proposal can go into the section, become a new section, or replace the section's text (the old text is kept), or you can dismiss it.
- **An idea from the Void arrives with its dials**, so you can see how wild and how steady it was born.
- **Save (Ctrl+S)** writes `spec/<name>.spec` into the repo, where the Spec tab shows it.

## One look, shared
The Void's tokens, fonts, buttons, states and star field now live in one place, used by both pages, so the stations can't drift apart:
- `idearium/ui/css/void-theme.css`;
- `idearium/ui/js/void-sky.js`.

## Enterprise grade, as the Void
- **Limits:** a section is at most 20,000 characters and a title 160. Going over is refused with the count.
- **Every call has a deadline**, and agent calls show a running timer.
- **States:** opening, and unreachable with TRY AGAIN.
- **Keyboard:** every list works by keyboard, with visible focus.

## Found while building
- **Extracting the shared look first broke the Void's script.** The extraction removed lines by their content, which also stripped a closing brace in the Void's script. A syntax check on the extracted file caught it before anything ran. The page was restored from git and the extraction redone by line position.

## Proof
- `tests/modules/test-spec-workshop.test.js`: 8/8. The new checks cover the page's shared look, capitals (no lowercase tooltip, no browser prompt), the spec-shaping asks only, the dial in your words, the limits, and the Void's dials at the start.
- `tests/modules/test-spatial-void.test.js`: 7/7 on the shared look.
- **Chromium against the real server, with a stand-in agent:**
  - from a Void idea → write → draft with the agent → replace (through the in-page dialog) → add a section → save into a new repo;
  - no console errors, no browser dialogs;
  - wide and narrow.
