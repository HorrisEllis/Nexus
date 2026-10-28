# 0.60.273 — accessibility per site (the Tab switch); Fiverr's dropdowns, picked inside their own list

James, 2026-10-28, with three screenshots: "need the accessability settings, per site. look at picture 2.  image 3, its the drop downs"

## Picture 2: his Fiverr portfolio, in yellow-on-black links with wide spacing
- Nothing in Clear Glass styles a page when Tab is pressed (checked: no such CSS in clear-glass/src or renderer). The look is Fiverr's own,
  turned on by a Tab press; his earlier words: "how do i turn this off, the accessabilit, i hit tab too many times."
- A new per-site setting, **Accessibility › Tab mode**, is `site` (the default, nothing changes) or `off`:
  - It is the key `accessibility.tabMode` in `src/site-settings/keys.js`.
  - It is drawn from the key table in the Site Settings popup and in Settings › Sites.
  - `readers.tabMode(url)` reads it.
- On `off`, each load of that site runs `src/page/keyboard-mode.js` `offScript()`. On every Tab press it takes a snapshot, then 60 ms,
  300 ms and 1 s later undoes whatever changed: classes and attributes on html and body go back, and new style sheets are disabled. The
  snapshot and the diff are `state-diff.js` (FP4). Tab still moves focus; nothing is blocked (FG_D4).
- This is FG1 of `docs/2026-10-28-gated-flows-phasemap.spec`.

## Picture 3: STANDARD and PREMIUM still "DELIVERY TIME", PREMIUM's menu open at the bottom right
- Cause: `_pointerAct` brought an option into view by centring it on the page. With a menu in a scrolling list near the bottom, that moves
  the page, and a menu that closes or detaches when the page moves loses the click.
- Now the option is scrolled inside its own list (`scroll: 'within'`), and the page moves only if the list itself is off screen, by the
  least it can.
- If the pointer's click does not take and the option is still on the page, it is clicked once directly. The result says
  `clickedBy: 'page'`, and every choice is still read back.

## Proof
- `tests/modules/test-site-a11y-and-dropdowns.test.js` 3/3:
  - SA-01: the key, the reader and the table.
  - SA-02: in Clear Glass, a page that turns on a yellow-link look on Tab; with `off` the look is undone and focus moves to the next field.
  - SA-03: in Clear Glass, a menu that closes when the page scrolls; "7 Days" and "30 Days" are picked from below the list's fold.
    **SA-03 fails on the 0.60.272 driver.**
- test-site-settings-ui 3/3 (ten groups now), test-fiverr-works 11/11, test-fiverr-pace 2/2, test-site-readers 7/7.

## Not proven here
Fiverr answers this sandbox 403. Whether Fiverr's own Tab look sits on html or body (what `off` undoes) is shown on his machine:
`window.__cgTabOff.last` in the page says what was undone. If it lives deeper, the probe shows it and the switch grows to cover it.
