# 0.60.222 — the gig fill knows which Fiverr page it is on, and learns elements from the picker

James, 2026-10-28, with screenshots of Fiverr's Overview and Scope & Pricing: "like autofill should detect pages, so it can know when to
paste, or detect the actual elements. like hook into the element picker, mayne use it for correcting or creating macros/automation"

Owned by: docs/2026-10-28-gated-flows-phasemap.spec (dated addendum).

## What stands on what
- The page reader (`readPage`): url, title, headings, text, and links with their selectors.
- Page memory (`src/page/page-memory.js`), which already kept what each site's pages show and what worked there. It now also keeps targets.
- The element picker's pick (its xpath).
- `option-match.js` and ClearDriver `choose` (0.60.221).

## Built
- **Page detection** (`src/autofill/gig-pages.js`, pure). It decides the page from what the page shows:
  - Overview: Suggested categories, Service type, Gig metadata;
  - Scope & Pricing: Scope & Pricing, Packages;
  - anything else is "unknown". It says so and doesn't guess, because only these two pages are on record.
- **The fill does the detected page's parts only.**
  - Overview: it clicks the suggested category that matches the gig's ("Programming & Tech > AI Development"). When none matches, it lists
    the suggestions.
  - Scope & Pricing: it types each tier's name and description, then chooses each tier's delivery time.
- **The picker teaches it.** Each part the fill can't find is listed in the gig panel with **Point at it**:
  - the element picker starts, and he clicks the element;
  - the pick becomes a selector that finds exactly that element, checked on the page (three boxes with the same placeholder are told
    apart);
  - it is kept for that part, site and page, and the part is filled again;
  - every later fill uses the kept element first;
  - each lesson is a line in the activity.
- **The panel's count is fixed.** "Filled N field(s)" printed the list of filled fields, not a number. It now reads, for example, "Scope &
  Pricing page: typed 3, chose 3".

## Proof
- `tests/modules/test-fiverr-works.test.js`, 9/9:
  - FW-06 page detection;
  - FW-07 kept targets;
  - FW-08: in Clear Glass (no Playwright), a pick on the second of three "Name your package" boxes becomes a selector that finds only that
    box;
  - FW-09: the fill does only the detected page, uses a kept element first, chooses the delivery per tier, lists what it didn't find, and
    clicks the category on Overview.
- Existing suites: clear-glass-gig 7/7, cg-gig-autofill 4/4, page-session 6/6, cg-field 13/13. Browser-shell is 27/28: BST-23 fails the same
  way with these changes stashed.

## Not built yet (said)
- "correcting or creating macros": a pick replacing a failed macro step's selector, and a fill saved as a macro. Macro steps can't choose
  from a dropdown yet (FG4), so these wait on that.
- Gig metadata's checkbox tabs and the Service type dropdown need his choices. The gig doesn't hold them.
- The editor's other pages aren't detected until they are on record.
- Not yet run on fiverr.com (it answers this sandbox 403). His screenshots still show Edit Gig in a pop-out window. 0.60.221 opens it as a
  tab, so his Clear Glass may predate that release.
