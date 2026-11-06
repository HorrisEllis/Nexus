# 0.60.266 — The gig fill chooses Fiverr's Category and Subcategory

James, 2026-10-26: "can you fix the drop down mewnu?" This is Fiverr's Category and Subcategory. Until now, the gig fill left both "to
copy by hand".

## Why they were left
They are Fiverr's own widgets, not `<select>`s. Each is a box reading "SELECT A CATEGORY" that opens a list on mouse-down. The
subcategory list only fills after a category is chosen. A fill that types into inputs had nothing to type into.

## What changed (FD1)
After the text boxes, the gig fill:
1. Finds each dropdown by its words.
2. Opens it the way a mouse would (pointer and mouse down, up, click).
3. Waits for the list.
4. Chooses the option that matches the gig: the exact text first, else the closest by shared words. The category goes first, so the
   subcategory list fills.

If no option fits, the reply says so and lists the real options, so the gig file can be corrected. A native `<select>` is set by its
option text, with a change event. Nothing is saved or published.

## Proof
`clear-glass/test/gig-dropdown.test.js` runs in real Electron, against widgets built the way Fiverr's behave:

| Case | Result |
|---|---|
| Category | **Programming & Tech** chosen, and the page itself registered it |
| Subcategory | **AI Development** chosen, and the page itself registered it |
| A subcategory that does not exist | said, with the four real options |
| A native `<select>` | set, and its change event fired once |

The gig-file, field-query, autofill (16/16) and agent-doors (7/7) suites are unchanged.

## Not checked
Fiverr's real page. If Fiverr's list doesn't hold the gig's subcategory (for example, "AI Development"), the reply names the ones it
does.
