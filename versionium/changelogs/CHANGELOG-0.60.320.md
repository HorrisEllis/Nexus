# 0.60.320 — the Gig metadata bullets, tab by tab (GT6); a tag no longer typed twice

James, 2026-10-30:
> "almost. more timing in between drop down menus. then we need the services, then the bullets for each tab for each catagory."

0.60.318 was the timing and 0.60.319 the services. This is the bullets.

## Built (MOD-GT6)

- **The gig file has `metadata`**, tab by tab as the page names them:
  `{ "PROGRAMMING LANGUAGE": ["JavaScript"], "FRONTEND FRAMEWORK": ["React", "Vue.js", "Svelte"] }`.
  - A lone value, or a `*` in a tab's name, is read the same way.
  - It shows in the gig's parts and the template.
  - The chip menu has one row for it (`TAB: a, b; TAB: c`), and an edit there reads back as written.
- **The fill does it after the category and the service type**, because the tabs belong to the subcategory chosen. For each tab in the gig:
  - the tab is opened with the pointer, and its choices are read until they hold still (GATE-GT6-001);
  - each value is ticked or picked on its label, as checkboxes or radio buttons, found under the words "Gig metadata", never by a class name;
  - the tab's limit is kept: the page's counter (`3 / 5`), "up to N", or 1 for radio buttons (GATE-GT6-002);
  - each choice is read back under a gate (GATE-GT6-003), and the counter is put on the result.
- **Said, never guessed:**
  - a value the tab does not offer, with the tab's own list;
  - a tab the page does not have, with the page's tabs;
  - a value past the limit (the first N are kept);
  - a required tab (`*`) the gig names nothing for, with its list.

  Nothing he did not name is unticked.
- **Found by the test:** clicking a tab re-renders the tab list, so the marks on the tabs went stale (the GT4 lesson again). The tabs are
  marked again before every click now.

## Fixed: a tag typed twice

FO-02, open since 0.60.319, was caught this time: `'ai agent'` was a chip twice. After Enter, the tags loop read the chip once, at once. A
page that draws the chip a moment later read "not shown", and the tag was typed again. Now the chip is waited for, using the gate's settle,
and read again just before any retype. A tag already shown is never typed a second time.

## Proof

- `tests/modules/test-gig-metadata-glass.test.js`: **6/6**, on a live fixture page in Clear Glass's engine. The panel re-renders on each
  tab click, and the page refuses a sixth box.
  - It includes his acceptance: JavaScript in PROGRAMMING LANGUAGE, three frontend frameworks ticked and read back, the counter `3 / 5`.
  - It also checks the limit, a value not offered, a tab missing, a required tab left empty, and the whole fill through `_gigFill`.
- The tag fix: `test-fiverr-overview-and-a11y` 0 failures in 20 repeated runs, against 2 in about 30 before.
- 16 neighbouring suites are green.

## Open

- **The fill's report and Copilot do not show `r.metadata` yet.** That is GT2's truthful report, next.
- **GT3:** the choose fields in the macro editor. **SD0–SD5:** site data.
- **Not yet confirmed on Fiverr itself.** The fixture is modelled on his screenshot of Gig metadata.
- **Not recorded in Versionium from this sandbox.** The boot sync records it on his machine (§17.12).
