# 0.60.263 — two gaps that would still stop Fiverr on the live site

_Renumbered 2026-10-28: first released on claude/laughing-fermi-4f7sj5 as 0.60.223. Main already had its own 0.60.223 (and up to 0.60.260), so this release takes the next free number. Nothing in it changed (§0.3)._

James, 2026-10-28: "continue get it working"

Owned by: docs/2026-10-28-tab-compartments-phasemap.spec and docs/2026-10-28-gated-flows-phasemap.spec (dated addenda).

## Fixed
- **A link in a bare window popped out again.** His Edit Gig was already open in a bare pop-out window (his screenshots). A page there has
  no tab strip, so 0.60.221's rule ("open it as a tab of the window it is in") had nowhere to put the tab, and the link popped out.
  - Now a link meant as a tab, from any window without a tab strip, opens as a tab of the main window, which comes to the front.
  - A sized popup (a Google or PayPal sign-in) still opens as a window.
  - Code: `src/main/compartment-window.js` (`attach(contents, { openTab })`) and `src/main/index.js`.
- **Options that are plain divs.** `choose` looked for a dropdown's options among list items and elements whose role or class says option
  or item. A site whose options are plain divs read as "the dropdown did not open".
  - Now, when none of those appear, it takes what appeared on screen when the dropdown opened: short text, one line. It still matches the
    option, clicks it and reads it back.

## Proof
- `tests/modules/test-fiverr-works.test.js`, 9/9:
  - FW-02: a bare window's link-tab goes to the main window, and a sized popup is still allowed;
  - FW-05: in Clear Glass, a Revisions dropdown whose options are plain divs is chosen ("unlimited" → "Unlimited") and shows it.
- `test-compartment-window`: CW-04 now accepts `attach(contents, …)`. It is back to its base result; CW-03 fails the same way on the base.

## To use it
Close the pop-out window and open the gig from Fiverr's dashboard in the main window. Edit Gig opens as a tab there; on each editor page
press "Fill this Fiverr page" in the gig panel, and "Point at it" for anything it lists.
