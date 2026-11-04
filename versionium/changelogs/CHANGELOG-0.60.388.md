# 0.60.388 — a gate reads the element against the gig; a failed step stops with a toast; the ChatGPT window's sign-in loop; merged with main

James, 2026-10-30, with Fiverr's category menu open and nothing chosen:
> "how about having a condition to the next gate, like what the element says, if it aligns with the gig. it needs to stop, and display toast
> with an error on any step."

James, 2026-11-04:
> "reloading the sign in. it doesn't do on the main browser, only the popup window. maybe synbolic link or copying cookies?"
>
> "can you make a gig for: "spec and architect your project regardless of size, and reduce overwhelm""
>
> "merge and push. now get cos built."

Built on the branch as 0.60.298 and 0.60.299. Main had moved 215 commits in the meantime, to 0.60.387, and had taken those numbers. This
release is what of that work main did not already have, put on main's code.

## Grounded first

- **Main's category gate read the page, not the dropdowns.** It passed when the page showed the subcategory's words, and Fiverr's
  "Suggested categories" links always show them. So a suggestion that did not take passed, and nothing else was tried. That matches his
  screenshot: SELECT A CATEGORY was still shown.
- **A failed part of the gig fill was listed, and the fill carried on.** Co-pilot's line used a list made before the page-aware parts ran.
- **The ChatGPT window's sign-in loop.** The cookie mirror (0.60.13) copied every chatgpt.com cookie both ways, a sign-in's own csrf, state
  and callback cookies included. While he signed in in the window, the normal tab's copies overwrote them.
- **Settings › Pipelines did not list the Fiverr pipeline Clear Glass ships.**

## Built (GF6)

- **The category gate reads the two dropdowns** (`gig-fields.js categoryChosenScript`). Words inside links, an open menu, or Clear Glass's
  own spotlight label do not count.
- **Fall through.** A suggestion that does not take goes to his macro, then the built-in pick. When the macro says done, the dropdowns are
  read to agree.
- **A choose is gated on its own dropdown.** The driver's `choose` returns the dropdown it opened, and its gate reads that element.
- **The bundled Fiverr macro and pipeline gate on the dropdown element.** The macro lists the version it supersedes, so an unedited copy of
  it upgrades.
- **Stop, with a toast.**
  - The first part of the gig fill that fails stops it, and nothing after it runs.
  - A toast in his window says the part and why. That includes a page asking for a Service type the gig has none of; main's GT5 had only
    listed it.
  - A failed pipeline task or workflow also toasts, and a pipeline task's event now carries its label and error.
- **The evidence rule.** A box whose read the page does not answer is unchecked, not closed (NC0).
- **Co-pilot's line** comes from the final result: what was done, where it stopped and why, and what is left.
- **Pipelines** imports each `.pipeline` Clear Glass ships, once each. A pipeline run on a page of its site gets the written gig's values.
- **The ChatGPT sign-in.** Only the sign-in itself is mirrored (`isAuthCookie`); a flow's own cookies stay in the jar that set them.
- **New gig:** `clear-glass/docs/gigs/spec-and-architect-any-size.gig`. Title: "I will spec and architect your project of any size and reduce
  overwhelm" (71 characters). It loads with no warnings.

## Not merged, because main already had it (one contract, CLAUDE.md rule 4)

- **The branch's macro run toast (MR1).** Main has MB4 (0.60.359: step i of n, pause, skip, back) and MT1 (0.60.335: the recording toast).
  Main's stands. The branch's copy is kept in `_archive/2026-11-04-mr1-duplicate-of-mb4/`, with its tests.
- **The branch's Service type** (driver row choose and list). Main's GT5 (`gig-pages.js serviceTypeScript`) waits for it, chooses it, reads
  it back and says its options. Main's stands; its GS-05 and GS-06 tests are archived beside MR1.

## Proof

- `test-gig-stop-and-toast` 4/4, in Clear Glass:
  - GS-01: a suggestion that does not take falls through, and the dropdowns are read.
  - GS-02: a failed part stops the fill, with a toast and Co-pilot's line.
  - GS-03: the check is closed on the links alone and open on the dropdowns, and the macro's xpath finds only the dropdown.
  - GS-04: the bundled pipeline is listed once, and a failed task's event carries its label and error.
- `test-session-hub-signin` 2/2. SH-01 fails on the old code.
- 24 suites over main's and this branch's tests, all green except one, run on the merged tree:
  - test-fiverr-overview-and-a11y 6/6, test-gig-all-fields 5/5, test-fiverr-works 11/11, test-about-and-nodes 4/4;
  - test-gig-metadata-glass 7/7, test-gig-metadata-dropdown-glass 5/5;
  - test-macro-blocks 6/6, test-macro-blocks-ui 3/3, test-macro-toast 5/5;
  - test-autofill-page-chip-glass 3/3, test-autofill-radio-checkbox-glass 4/4;
  - test-element-gates, test-pipeline-gates, test-pipeline-nodes, test-gated-dropdowns, test-gig-fill-menu, test-gig-features;
  - test-site-settings-ui, test-a11y-trace, test-substrate-spec 3/3.
- **test-cg-agent-doors AD-02 was red on main since 0.60.359.** MB4 moved the record handlers onto `_recorder()`, but the test's stand-in
  bridge had no `_recorder`, and its source check looked for the old call text. Both are fixed to the contract (one recorder for IPC and
  HTTP). 7/7.
- **Fails the same on main, so not this release:** test-autofill-learn-macro JA5-04 ("a click on the label resolves to the box").

## Readings (to confirm)

- **The sign-in loop's cause** is reproduced in a test, not seen in his run.
- **"bridge not connected" in COS's command line.** The text is not in COS's code (`cos/`, `cos/ui`, `cos/manager/cli.js`). His screen will
  show where it comes from.
