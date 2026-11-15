# Autofill gap ledger: Fiverr Scope & Pricing, 2026-11-14

Source: James's screenshots of the co-pilot log on the spec-and-architect gig. Each gap has its evidence, its cause and its state.
**Proven** means it was tested here. **Unproven** means it needs a run on his machine.

| # | Gap (evidence) | Cause | Fix | State |
|---|---|---|---|---|
| G1 | `choose: no option matches "12 days"` | The gig asked for 12 days. Fiverr offers 1–7, 10, 14, 21, 30, 45, 60, 75 and 90. The match was correct to refuse, but the error didn't help. | TB4: `option-match.js` now names the nearest offered option, without picking it for him. | Proven (`test/gig-takeback.test.js`) |
| G2 | `the dropdown did not open (no new options after clicking [data-cg-chip="cg-1762"], twice)`, repeated | Likely cause: the driver treated everything already in the page before opening as "not new". That includes options Fiverr keeps hidden in the DOM. When they appeared, they were excluded. | TB2: the pre-open snapshot (`driver/index.js` `__cgPre`) holds only **visible** elements. | Unproven. Watch for slowness: it now runs a visibility check on every element. |
| G3 | Delivery chip lost after a value was picked | `suggest.js` marked the delivery dropdown only while it read `DELIVERY TIME`. Once set to `3 DAYS DELIVERY`, it was no longer recognised as delivery. | TB3: it also marks `N DAYS DELIVERY`. | Unproven |
| G4 | Autofill held $50/$160/$380 and 2/5/9 days, while he typed $60/$180/$420 and 3/7/14 | There was no path from the page back to the gig. The fill only went one way. | TB1: `autofill/gig-takeback.js` plus `autofill.takeback` (co-pilot), `autofill:gig:takeBack` (IPC) and `POST /cli/autofill/gig/takeback`. It reads the table and writes the values he set into the last gig. `SELECT` and blank are never written. `dryRun` shows the changes without keeping them. | applyPricingRead proven. The page reader is unproven. |
| G5 | `Autofill: 0 field(s) filled, 23 still need a Pick` | Probably G2 and G3 cascading. | Re-run after TB2 and TB3. | Open |
| G6 | Save & Continue would not advance | Number of pages was unset. Fiverr requires it, and the autofill has no `pages` part. | He set it by hand. The part isn't added yet. | Open |
| G7 | `test/gig-file.test.js` fails at line 10 (parse warnings on `docs/gigs/nodejs-automation-scraping.gig`) | Pre-existing. It's not touched by this work. | None | Open |

Still to build: write the taken-back gig to its `.gig` file too (it is currently only in the store), and add an "Update from page" button to the panel.

## His complaints, 2026-11-14 18:08 (to problem-solve later, not now)

| # | Complaint (his words) | What it needs | State |
|---|---|---|---|
| C1 | "it needs to map into the element engine so that I can select and edit the fields that hook into the gig files" | Element picker → a field → its gig part (`basic.price` …) → edited value written to the `.gig` file. `_gigAssign` already maps a pick to a part; nothing yet edits the value or writes the file. | Open |
| C2 | "needs to update the chips, the autofill chips, with what I replaced them with. It is not." | After `autofill.takeback` (TB1), the chips still show the old gig until they are re-read. Takeback should call the chips' refresh (`gigSetLast` + re-run suggest) so a chip shows his value. | Open |
| C3 | "One thing doing one thing is not high leverage" | Element engine = ad blocker + behavior engine + guardian picker + macros from elements: one pick, many uses. C1 and C2 are the same hook. | Principle |
| C4 | Save looked like it did nothing | It had saved; Fiverr gives no clear confirmation and the gig goes On Hold for review. Clear Glass could read the "saved" state back and say so. | Open |

Rule he named: automate what repeats, **unless it gets in the way of the thing being completed**. Gig first, tooling after.
