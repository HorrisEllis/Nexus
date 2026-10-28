# 0.60.261 — Fiverr works in Clear Glass: Edit Gig opens as a tab, the pricing boxes fill, the dropdowns are chosen one by one

_Renumbered 2026-10-28: first released on claude/laughing-fermi-4f7sj5 as 0.60.221. Main already had its own 0.60.221 (and up to 0.60.260), so this release takes the next free number. Nothing in it changed (§0.3)._

James, 2026-10-28: "why did fiverr open in a popout window? like none of the autofill works. Why does it do that." · "it needs to do the drop
down menus. one by one, macros if needed, using erosmancer and mouse curve and the virtual input to simulat mouse movement." · "the drop down
doesn't work" · "only whats needed for a fact." · "stop. just get fiverr working."

Owned by: docs/2026-10-28-first-principles-phasemap.spec (FP1, FP2), docs/2026-10-28-tab-compartments-phasemap.spec (TC3),
docs/2026-10-28-gated-flows-phasemap.spec (FG2) — each with a dated addendum. Spec: clear-glass/spec/flow-cores.spec.

## Three causes, each read in the code
1. **Edit Gig left Clear Glass.** It is a `target=_blank` link. `src/main/compartment-window.js` allowed every site popup as a bare window,
   which no tab, driver, autofill or macro addresses.
2. **The pricing boxes were never typed into.** They have no label or name, only placeholders ("Name your package", "Describe the details of
   your offering"). A placeholder match counted as low, under the fill's default floor (medium).
3. **The dropdowns were skipped on purpose.** `src/autofill/gig.js` filled inputs and textareas only, and ClearDriver's `select` refused anything
   that is not a native `<select>`.

## Built
- **Links meant as tabs open as tabs** (`src/tabs/open-decision.js`, `decideOpen`; used by the popup handler; `renderer/browser.js` listens for
  `cg:open-tab`). The tab opens in the same window and session, so Fiverr stays signed in. A sized popup (a Google or PayPal sign-in) still
  opens as a window, because it reports back to its opener. `about:blank` and other non-web popups stay windows (their opener writes into them).
- **Fiverr's exact placeholders count as medium**, so the default fill types the package names and descriptions.
- **ClearDriver `choose`** (`src/driver/index.js`, with `src/page/option-match.js`). One dropdown per call.
  - It finds the dropdown the way a person does: by the column's header (BASIC) and the row's label ("Number of APIs integrated"), or the text
    it shows (DELIVERY TIME). It goes by where they sit on the page, never by class names. A selector works too.
  - A native `<select>` is set through `select`, after the option is matched.
  - A site's own widget is opened with the curved pointer (`via: 'native'`, or `'eros'` for ErosmancerOS's virtual input). It reads the
    options that appeared and matches the wanted one: exact, then case, then normalized, then prefix, then contains, then by number, so "3"
    is "3 Days" and never "30 Days". It clicks the option with the pointer and reads the dropdown back.
  - An ambiguous or missing option is refused, with the options seen. A dropdown that does not show the choice is a failure.
- **The gig fill chooses each tier's delivery time**, one after another, after typing. Each result is in the fill's `dropdowns`: chosen, or why
  not.

## Proof
- `tests/modules/test-fiverr-works.test.js` 5/5, the dropdowns driven in Clear Glass (`src/driver/glass.js`, no Playwright).
  - On a page laid out like his Scope & Pricing screenshot, three custom DELIVERY TIME dropdowns are chosen one by one, and the page shows
    3 Days, 5 Days and 30 Days.
  - A native SELECT row is set by column and row.
  - A missing option is refused with the options listed.
- Found while proving it: inside the in-page script, `\s` collapsed to `s`, so every "s" was stripped and "3 Days" read as "3 Day". The
  read-back caught it, and the escape was fixed before release.

## Not done (no fact on record yet, said)
- The other pages of the gig editor (Overview's category dropdowns, Description & FAQ, Requirements). Their labels are not on record. With
  this release, `choose` works on them by column/row or by the text they show. A screenshot of each page, or a page read in Clear Glass, gives
  their blocks.
- The feature rows (Number of APIs, checkboxes) need his values per tier. The gig does not hold them.
- Save & Continue and Publish are his (0.39.301: "Not automate talking or posting").
- Not yet seen on fiverr.com itself: Fiverr answers this sandbox with 403. The first real run is on his machine. If a dropdown is refused, the
  message lists the options it saw.
