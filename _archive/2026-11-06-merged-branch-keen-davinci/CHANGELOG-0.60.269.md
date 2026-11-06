# 0.60.269 — The wizard's FAQ, buyer questions and pricing dropdowns

James, 2026-10-26: "continue." This picked up what 0.60.268 said the wizard still left: the FAQ behind "Add FAQ", and the pricing
dropdowns.

## What changed (FW2)
On each page, the gig fill now also does what that page asks:

| Page | What the fill does |
|---|---|
| Description & FAQ | For each FAQ: press "+ Add FAQ", type the question and the answer into the boxes that appear, press Add |
| Requirements | For each buyer question: press "Add New Question", type it, press Add |
| Pricing | For each package column, choose the Delivery Time and Revisions dropdowns by the number (`-1` means Unlimited) |

Both native dropdowns and Fiverr's own work.

- An FAQ or question already on the page is not added twice.
- A row with no control in it is reported. The first try skipped one silently, which this test caught.

## Proof
`clear-glass/test/gig-wizard.test.js` runs in real Electron, on the local wizard. Overview, Pricing, Description and Requirements are each
filled in turn, then it stops at Gallery.

| What the page held when it moved on | Value |
|---|---|
| Delivery Time, per package | 3, 5 and 7 days |
| Revisions, per package | 1, 2, Unlimited |
| FAQs | both added |
| Buyer questions | both added |

None of them are left to copy. These are unchanged: gig-dropdown, field-query, autofill-inline, gig-file, clear-glass-autofill 16/16,
agent-doors 7/7.

## Not checked
Fiverr's real pages. Their button words ("+ Add FAQ", "Add New Question", "Add") are matched as shown on Fiverr. If one differs, the fill
says which part it could not do.
