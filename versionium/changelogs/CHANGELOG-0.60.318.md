# 0.60.318 — choose finds its dropdown again; gates timed per part (GT1, GT4)

James, 2026-10-30:
> "almost. more timing in between drop down menus."
> "wheich needs more timing for the gates for the drop down menus."

His Copilot, on the Fiverr gig editor: `Driver error [choose]: Element not found: [data-cg-choose="1"]`.

## The cause

`choose` (clear-glass/src/driver/index.js) marked the dropdown it found with `data-cg-choose=<n>`, then clicked it by that mark after its
open wait. Fiverr replaces the dropdown when it opens, and re-renders the whole section once the category is chosen. The mark went with the
old element, so the click found nothing.

## Built

- **GT4: the mark is a hint, never the only way to the element (MOD-GT4).**
  - Before each open, pick and read-back, `choose` checks the mark. If it is gone, it finds the dropdown again by what it showed, or once
    picked by the option it now shows, and marks it again. The result says so (`refound`).
  - If the dropdown really is gone, the error names the mark, what it showed, and the dropdowns the page has. It is never a bare "Element
    not found".
  - Between the category and the subcategory, the fill waits `gates.betweenDropdownsMs` (a new site key, 1200 ms by default, 0–15000). Then
    it waits for the DOM to go quiet (`element-gate quietScript`) and for SELECT A SUBCATEGORY to show.
  - Found by the test: Clear Glass's own spotlight label (`#__cg_spot__`) was read as a page option. The fixture showed "open undefined" as
    the dropdown's only option. The overlay is excluded now, and the label names what it opens.
- **GT1: a gate's timing is the part's (MOD-GT1).** `element-gate gateTiming(step, site)` and `backoffMs`:
  - text keeps today's timing: 2500 ms, 400 ms settle, one retry;
  - a choice waits 8 s (as long as `choose` waits for options), gets 3 tries, and waits 600, 1200, then 2400 ms between them
    (architecture-spec RULE D, "increasing the timing little by little");
  - his site keys `gates.timeoutMs` and `gates.settleMs` lift the floor, and the step's own fields win.
  - The bridge's `gated()` uses it for the category, the subcategory, revisions and learned choices. Each try, what it saw and the wait
    before the next go on the part's gate record.

## Proof

- `tests/modules/test-choose-refind-glass.test.js`: **7/7**. It drives the real `choose` on a live fixture page in Clear Glass's engine
  (glass.js). The fixture replaces its dropdown on open, re-renders after the category, and brings the subcategory 1.5 s later.
- **Against the old driver**, GR-01 fails with his exact error, `Element not found: [data-cg-choose="1"]`. GR-02 fails with
  `[data-cg-choose="2"]`.
- GR-05: a list that loads 4 s late closes under the old constants and holds under the choice timing. Both are run.
- 15 neighbouring suites are green: gig, gig autofill, element gates, Fiverr overview/pace/works, gated dropdowns, gig fields/features/menu,
  pipeline gates, site settings, dropdown fill, gates-solid, live stream.

## Open

- GT5 (service type), GT6 (the metadata bullets per tab), GT2 (a truthful fill report), GT3 (choose fields in the macro editor), SD0–SD5.
  They come next, in DAG order.
- `Driver error [eval]: Script failed to execute`: the renderer console's text on his machine is needed to trace it.
- Not recorded in Versionium from this sandbox. The boot sync records it on his machine (§17.12).
