# 0.39.354 — 2026-10-05

James: "okay spec workshop looks like shit. needs to be enterprise grade. feed the pipeline"
James (his screenshot of the workshop's start page beside the Void): "look at the first screenshot. you see now?"
James: "needs to be a full workshop. like a full document writter. emerge. like we talked about. animated, alive, like void, like not a small little ui,fully featured,"

WS7, the full workshop, is built. It was mapped first in `docs/2026-10-02-workshop-codex-rewind-phasemap.spec` (1.7.0). It also builds part of WS6 (parts and modes, in the emerge map).

## What was wrong (from your screenshot and the page)
- Two boxes floated on an empty black screen, and every label, button and input was the same small grey caps.
- "FROM THE VOID (0)" was selected with nothing in it.
- The REACH dial was the biggest control, though WS6 had already said "reach sectoin needs to be removed".
- The stations were greyed out and did nothing.
- **SAVE was where it stopped.** The routes that plan and build a spec existed, and nothing in the workshop called them.

## The workshop now (`ui/workshop.html`, `css/workshop.css`, `js/workshop.js`)
- **In the Void's world.** The star field is alive behind it (WS4 had hidden it). Glass panels rise in, the pipeline line under the bar flows, and the current station glows. Your work shows in cyan, the agent's in magenta.
- **The start.**
  - **WHAT ARE YOU SPECCING?** Type and press Enter to start a blank spec with that title.
  - Three cards to start from instead: **FROM THE VOID**, **SPEC LIBRARY** and **A REPO'S SPEC**, each with its count. Each opens a picker with a filter. An empty one links to where its content comes from.
  - Your workshops are shown as cards: mode, open proposals, and saved path or NOT SAVED YET.
- **The writer: one document.**
  - **The title, then every section** as a heading and a text block that grows as you write.
  - **Saving as you type.** Each section is kept 0.8 seconds after you stop typing. An edit that fails to send is kept and sent again.
  - **The outline:** jump to a section, move it up or down, remove it (kept under REMOVED) and restore it.
  - **The tools:** word count and reading time, FOCUS (only the document), and **CAPS / AS TYPED**. CAPS is the default, by your rule; AS TYPED lets you read your own writing. What you type is always stored as typed.
  - **Keys:** Ctrl+S saves, Ctrl+Enter sends to the pipeline.
- **PARTS (WS6).** The spec template's 11 blocks are grouped in three tiers:
  - **MINIMUM:** meta, purpose, schema, api, build order.
  - **MODS:** axioms, events, integration, failure modes, tests.
  - **COMPONENTS:** the registry.

  A gauge shows MINIMUM n OF 5. A missing part is one click to add, and the agent drafts it unless you're in manual mode. Each section says which part it fills.
- **MODES (WS6).**
  - **MANUAL:** you write. The agent only points at what's missing.
  - **ASSISTED:** the agent proposes part by part.
  - **STRETCHED:** **CARRY IT THROUGH EVERY PART** adds every missing part and drafts each one in turn, and you can stop it.

  The mode is written into the agent's prompt. In every mode, nothing enters the spec without your yes.
- **SEND TO THE PIPELINE.** An overlay shows each step live:
  1. **Save.**
  2. **Plan:** the repo's agent splits the spec into phases, and the page waits until that run finishes. If it fails, or you don't want to wait, **PLAN FROM THE SPEC NOW** derives the plan from your sections.
  3. **Phases:** the phases in build order, with the next one marked.
  4. **BUILD NEXT:** a snapshot is taken, then the agent builds that phase.
  5. **OPEN IN IDEARIUM:** opens the repo on its Phases tab.

  If the spec changed since it was planned, it says so and offers PLAN AGAIN.

## Server side (kept small)
- `lib/workshop.js`:
  - New: `PART_TIERS`, `MODES`, `MODE_GUIDE`, `partsOf()` and `setMode()`.
  - `editSection` now takes `part` and `move`.
  - A new workshop starts in assisted mode.
- `/api/workshop/:id` returns the parts and modes, and accepts `{ mode }`.
- The pipeline uses the repo's existing routes (`/spec/plan`, `/spec/build`, `/plan`). Nothing new was added.
- app.js opens a repo on its Phases tab when the workshop asks.

## Where it differs from the map
- **The agent's buttons are still DRAFT, OPEN LOOPS and QUESTIONS.** The map listed what-ifs, d20, reverse chain and inspiration too. WS4 removed those ("remove the noise"), and the tests keep them in the Void. Putting them back in the workshop is your call.
- **The test doesn't run idearium's own server.** The browser test runs the real page and the real `lib/workshop.js` against a server inside the test that answers like idearium. The API's parts and modes wiring is checked in its source (WF-02).
- The WS4 page is kept at `ui/_archive/workshop-0.39.300-ws4.html`.

## Proof
- **`tests/modules/test-workshop-full.test.js`, 10/10, driven by Clear Glass** (never Playwright):
  - **WF-01:** parts in tiers from the real `blocks.yaml`; a part is kept on add; sections move; each mode is said in the prompt.
  - **WF-02:** the API returns parts and modes, and app.js opens Phases.
  - **WF-03:** the sky is drawn, the sources are counted, and WHAT ARE YOU SPECCING plus Enter opens a blank spec.
  - **WF-04:** manual adds a part with no agent call; assisted adds and drafts it; the draft stays a proposal until accepted, then fills the part and the gauge reaches 20%.
  - **WF-05:** typing is kept as typed and the caret stays where you are; the word count is the document's; a section moves; remove, then restore.
  - **WF-06:** STRETCHED drafts every missing part once, in tier order, with nothing accepted on its own.
  - **WF-07:** save, then plan (the agent's run watched to its end), then the phases P1–P3 with P2 next, then BUILD NEXT posts `{path}`.
  - **WF-08:** a failed plan, then PLAN FROM THE SPEC NOW (`derive`), then the phases.
  - **WF-09:** CAPS / AS TYPED, remembered for you, and focus mode with Esc.
  - **WF-10:** no lowercase tooltip, no browser prompt() or confirm(), and the old page archived.
- **Updated to the new page:**
  - `test-spec-workshop` 8/8. WS4's "no sky" and the REACH dial are retired, with the reason in the test.
  - `test-architect` 8/8.
  - `test-synthesis-zoom-versionium` 6/6.
  - `version-sync-and-registry` 30/30.
- **Loom:** `idearium/ui/js/workshop.js` is mapped with its real edges: idearium's HTTP API, and app.js through postMessage. The registry was regenerated from scratch.

## Versions
- idearium 4.30.0 (MINOR: the workshop's responses carry parts and modes, and it accepts a mode).
