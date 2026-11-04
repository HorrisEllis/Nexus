# 0.60.298 — a gate reads the element against the gig; a failed step stops with a toast; the ChatGPT window's sign-in loop

James, 2026-10-30, with Fiverr's category menu open and nothing chosen, and Settings › Pipelines showing 0:
> "how about having a condition to the next gate, like what the element says, if it aligns with the gig. it needs to stop, and display toast
> with an error on any step."

James, 2026-11-04:
> "reloading the sign in. it doesn't do on the main browser, only the popup window. maybe synbolic link or copying cookies? also fiverr ai engine
> doesn't work. it gets to the service drop down."
>
> "can you make a gig for: "spec and architect your project regardless of size, and reduce overwhelm""

## Grounded first

- **The category gate read the page, not the dropdowns.** It passed when the page showed the subcategory's words. Fiverr's "Suggested
  categories" links always show those words, so a suggestion click that did not take passed, and nothing else was tried. That matches his
  screenshot: SELECT A CATEGORY was still shown. The bundled macro and pipeline gated the same way (`text: '{{category}}'`).
- **A part that failed was listed, and the fill carried on.** Nothing told him, and Co-pilot's line used a list made before the title, tags
  and dropdowns were filled. So it said "title" and "tags" were left after it had filled them.
- **Settings › Pipelines showed 0.** The Fiverr pipeline Clear Glass ships was seeded into the node files only, never into Pipelines.
- **The ChatGPT window's sign-in.** His "copying cookies" was built in 0.60.13 (`clear-glass/src/cookies/session-hub.js`). It keeps the
  ChatGPT window and the normal tabs equal, live, both ways, for every chatgpt.com cookie. That includes a sign-in's own csrf, state and
  callback cookies, so the normal tab's copies were written into the window while he signed in there. The guard against this existed only for
  the Accounts sign-in window.
- **The Service type dropdown was not a part of the fill at all.**

## Built (GF6)

- **A gate reads the element.**
  - The category is done only when the two dropdowns show the gig's category and subcategory
    (`gig-fields.js categoryChosenScript`). Words inside links, an open menu, or Clear Glass's own spotlight label do not count.
  - A `choose` returns the dropdown it opened, and its gate reads that element (`element-gate.js derive`).
  - The bundled macro "Fiverr gig - choose category" and the Fiverr pipeline gate on the dropdown element itself, through an xpath that
    leaves out links. The macro lists the version it supersedes, so an unedited copy of it upgrades.
- **Fall through.** A suggestion that does not take goes to his macro, then the built-in pick. When the macro says done, the dropdowns are
  read to agree.
- **Stop, and a toast, on any step.**
  - The first part of the gig fill that fails (after his site keys are tried) stops it. Nothing after it runs: no packages and no page macro.
    A toast in his window says the part and why.
  - Every macro run as him, every workflow and every pipeline task that fails also toasts. A pipeline task's event now carries its label and
    error.
- **The evidence rule.** A box whose read the page does not answer is unchecked, not closed (NC0), the same as the choice check already was.
- **Co-pilot's line** comes from the final result: what the page took (typed, chosen, tags), where it stopped and why, and what is left.
- **Service type** is a gig part (`serviceType`, optional). It is chosen in its row: the driver's `choose` now takes a row on its own and uses
  the dropdown to the right of the label. It is gated on that dropdown.
- **Pipelines** imports each `.pipeline` that Clear Glass ships, once each. A pipeline run on a page of its site gets the written gig's
  values for the vars it declares (category, subcategory, package names, descriptions, delivery).
- **The ChatGPT sign-in.** The mirror copies only session credentials (`isAuthCookie`): sign-in and sign-out still follow both ways, and a
  sign-in flow's own cookies stay in the jar that set them.
- **New gig:** `clear-glass/docs/gigs/spec-and-architect-any-size.gig`.
  - Title: "I will spec and architect your project of any size and reduce overwhelm" (71 characters).
  - Category: Programming & Tech › Software Development.
  - Five tags, three packages, four FAQs, five buyer questions.
  - It loads with no warnings.
  - Its numbers are from his own tree on 2026-11-04: 201 build maps, 782 mapped phases.

## Readings (to confirm)

- **The sign-in loop's cause.** It is reproduced in a test (SH-01 fails on the old code), not observed in his run. His next sign-in in the
  ChatGPT window settles it.
- **"service drop down"** is read as the Overview's Service type. The gig file leaves `serviceType` for him to fill with the option exactly
  as Fiverr shows it; the fill picks it and checks that it took.

## Proof

- `test-gig-stop-and-toast` 5/5, in Clear Glass:
  - GS-01: a suggestion that does not take falls through, and the dropdowns are read.
  - GS-02: a failed part stops the fill, with a toast and Co-pilot's line.
  - GS-03: the check is closed on the links alone and open on the dropdowns, and the macro's xpath finds only the dropdown.
  - GS-04: the bundled pipeline is listed once, and a failed task toasts.
  - GS-05: the Service type is chosen and gated, and a missing option stops there.
- `test-session-hub-signin` 2/2. SH-01 fails on 0.60.297's code.
- Updated to the stop-at-first-failure contract, with the stand-ins completed: test-fiverr-works FW-09, test-about-and-nodes AN-03,
  test-fiverr-overview-and-a11y FO-02/FO-03, test-gig-all-fields.
- Still green: test-element-gates, test-pipeline-gates, test-pipeline-nodes, test-gig-fill-menu, test-gig-features, automation-nodes,
  test-site-keys, test-site-settings-ui, test-a11y-trace, test-substrate-spec.
- Fails the same on the base, so not this release: test-cg-agent-doors AD-02.
