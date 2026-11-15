# 0.60.544: the Fiverr autofill take-back, merged into main

James, 2026-11-15: "look at main. merge branches"

## Merged
`clear-glass/autofill-takeback` (his commit of 2026-11-14, one commit, 10 files):
- **autofill.takeback:** reads Fiverr's Scope & Pricing table back into the last gig, so what he typed on the page (prices, days) is
  kept. A dropdown left on "SELECT", or a blank, never overwrites a value.
- **Dropdowns:** the driver's `choose` snapshots only visible elements before opening one. Options Fiverr keeps hidden in the page were
  read as "not new", so the dropdown seemed not to open.
- **Delivery:** the delivery dropdown is still recognised once it reads "N DAYS DELIVERY".
- **A missing option** (12 days, when Fiverr offers 10 or 14) names the nearest one offered and never picks it for him.
- `clear-glass/docs/2026-11-14-autofill-gap-ledger.md`: gaps G1–G7 and his complaints C1–C4.

## Looked at, not merged
- `claude/cos-own-service-host` (2 commits): already folded into main by hand on 2026-11-14 (the COS assistant map RC2, the floating-menu
  commands under SC10, his wizard ask under CA8). Merging it again would duplicate that text and collide on the ids CA8 and CA9.
- Every other branch on the remote has nothing main lacks. The older ones only look ahead because main's history was rebuilt.

## Proof
`node clear-glass/test/gig-takeback.test.js` ok; `gig-file.test.js` ok; every changed file parses.
Unproven on his machine: the page reader and the dropdown fixes (his commit says so). A run on the Scope & Pricing page proves them.
