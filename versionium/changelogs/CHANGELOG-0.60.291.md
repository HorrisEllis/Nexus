# 0.60.291 — each field, dropdown, or anything, gated

James, 2026-10-30, after 0.60.290 filled every field of the gig:
> "each field/drop down/ or anything should be gated."

## What was not gated (read in the code)

0.60.290 read most parts back once, at the moment they were set. Some parts were never read at all:
- the boxes set by the label-matching pass;
- the suggested-category click;
- a field he taught with the picker.

Nothing was read again after the page settled, so a page that put its own value back afterwards still counted as filled. His recorded page
macros carried no gates unless he had written one.

## What is gated now (GG1)

Spec: `clear-glass/spec/gated-flows.spec` MOD-GG1. Map: `docs/2026-10-28-gated-flows-phasemap.spec` GG1.

- **The gate (`gigGate`).** Every part ends at a gate. It reads what the page shows for the part until it is right, then reads again after
  the page settles.
- **The checks (`gigChecks`) only read:**
  - a box's value;
  - the choice a dropdown shows;
  - a checkbox's state (`checkAt` with `read: true`, which is new);
  - text shown on the page.
- **When a gate stays closed:**
  1. The part is done again.
  2. Then his site keys for the part are tried, gated on the element he bound.
  3. Otherwise the part reports what its gate saw.

  A part whose gate stayed closed is never counted as filled.
- **Every part:**
  - **Overview:** title, category (suggested click, macro, or the two picks), tags (each tag, then all of them).
  - **Scope & Pricing:** name, description, delivery, revisions, price (`typeAt` now returns its box), and each package row.
  - **Description & FAQ:** the description and the FAQs.
  - **Requirements:** the buyer questions.
  - **Also:** the label-matched boxes and the fields taught with the picker.
- **His recorded page macros.** A typed step gets a gate on its value, and a choice gets a gate on what its dropdown shows; each retries
  twice. A click waits for its element first, and the next step's own gate covers what it did. A gate he wrote himself stays his.
- **Every gate is listed in the fill's result** (`r.gates`). With no driver to read the page, the result says so (`gatesWhy`) rather than
  counting a pass.

## Proof

`tests/modules/test-gig-all-fields.test.js` passes 5/5 in Clear Glass. The new test is GF-05:
- every part filled has an open gate;
- a page that puts the title back 250 ms after typing passes an immediate read-back but fails the settled gate. It is tried twice and
  reported, never counted as filled.

Also green:
- test-fiverr-overview-and-a11y 5/5;
- test-gig-fill-menu 3/3;
- test-gig-features 3/3;
- test-gated-dropdowns 6/6;
- test-cg-gig-autofill 4/4;
- test-site-keys 5/5;
- test-dropdown-keys 2/2;
- test-fiverr-works 11/11;
- test-autofill-chips 8/8;
- test-substrate-spec 3/3.

FW-09's stand-in driver now answers the reads a page would, because every part is read now.

## Not proven yet

Nothing here has run on fiverr.com yet.
