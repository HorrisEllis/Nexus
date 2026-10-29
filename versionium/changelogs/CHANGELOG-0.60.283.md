# 0.60.283 — a site's remembered accessibility look reset; a new gig's Overview filled with gates

James, 2026-10-29, with a screenshot of his Fiverr dashboard still in yellow-on-black links and wide letter spacing:
"The accessability man. i can't fix it."

Then, with a screenshot of a new gig's Overview (Gig title, SELECT A CATEGORY, SELECT A SUBCATEGORY, Search tags):
"the autofill is still buggy. like i want autofill to do it all if possible. can you get fiverr to work, now with the keybindings, and
gates"

## The accessibility look
**Why Tab mode Off (0.60.273) could not fix it.** Off undid what changed right after a Tab press. A site that *remembers* its look in
its own storage loads with the look already on. No Tab is pressed, so the diff sees nothing.

**What is new:**
- **The reset.** Site settings › Accessibility has **Reset this site's accessibility look** (`site:a11yReset`, bridge `_a11y`). It
  finds what holds the look on: html/body classes and attributes, localStorage and sessionStorage keys, and readable cookies, wherever
  their names say accessibility (`keyboard-mode.js` `A11Y_RE`). Then it:
  - backs every entry up first, value included, to `userData/a11y-resets/<host>-<time>.json`, so it can be put back;
  - removes them;
  - sets the site to Off;
  - reloads the page.

  If nothing matched, the reset says so, with every storage key and cookie name it looked at and how a link looks, so a look stored
  under another name can be traced.
- **Off, from now on.** At each load, Off also sweeps the look away (classes, attributes, storage, never cookies), and it keeps a
  removed class off when the site puts it back.

## A new gig's Overview
**Why it was skipped.** The fill did not recognise the page. Its signs ("suggested categories", "gig metadata", "service type") appear
only after a category is picked. It is recognised now by Gig title, SELECT A CATEGORY, Search tags and Positive keywords, and by the
new-gig address.

**What the fill does there now:**
- **Category, then subcategory.** It uses a new bundled node, **Fiverr gig - choose category**
  (`clear-glass/automation/nodes/fiverr-gig-choose-category.macro`):
  - each pick is gated on the page showing the value, with 2 retries;
  - it is editable in Settings › Macros, where `pick` and `keysFor` bind keys;
  - if the node cannot run, the same two picks are built in, each read back.

  The driver's `choose` now finds a dropdown by the text it shows alone (no column needed).
- **Search tags.** At most 5, typed one by one, with Enter after each. Each is gated: the tag must show on the page and leave the box,
  else it is typed once more. A tag box he pointed at before is used first.

## Found while testing
- 0.60.281 wrote the preload's `applications` namespace on one line. The test stub's parser then swallowed the next namespace
  (`about`). The real app was not affected. It is written like the others now, and OC-05 checks that the stub reads it.
- Two stand-in bridges in older tests lacked `_gigFeatures`:
  - fiverr-works FW-09 (fixed in 0.60.281);
  - about-and-nodes AN-03 (fixed here; that suite was not run for 0.60.281).

## Proof
- `test-fiverr-overview-and-a11y` 5/5, driven in Clear Glass:
  - FO-02: the category, then the subcategory whose options appear only after it, then three tags;
  - FA-01: a look the site brings back from its own storage at every load, reset, backed up, and gone after the reload; his other
    storage kept.
- about-and-nodes 4/4, fiverr-works 11/11, gated-dropdowns 6/6, gig-features 3/3, autofill-chips 8/8, browser-shell 28/28,
  opportunity-contacts 6/6.
- Not checked live on Fiverr: the sandbox cannot reach it.
