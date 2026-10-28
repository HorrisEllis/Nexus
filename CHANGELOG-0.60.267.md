# 0.60.267 — the page reader is always there; a chip under each input

James, 2026-10-28: "fill this in · Did not fill: matchGigFields: domFields must be the dom_query array" · "needs to autofill any field it can.
also needs to have the autopill under each input fieled." (and 2026-10-26: "need to have a autofill ui for relevant pages. like firefox has,
like a autofill button where it shows under the input")

Owned by: docs/2026-10-26-inline-autofill-ui-phasemap.spec (AF3, dated addendum).

## Why it did not fill
- Every fill (the gig's, the profile's, the co-pilot's) reads the page through `src/dom/archaeology.js`, which asks the page's
  `window.__cgDomMesh`.
- That reader is put on a page by `inject()`, and nothing ever called it.
- The only other reader came from the DOM-tree panel (`renderer/browser.js`), and only if that panel had been opened. It can query, but it
  cannot change a field: no `queryOne`, `mutate` or `prepareType`.
- So on his Fiverr page the query came back `undefined`, and the gig fill stopped with "domFields must be the dom_query array".

## Fixed
- **The reader goes on first.** Every query and every change first makes sure the full reader is on the page (`_ensure`), and replaces the
  query-only one. A page that refuses it is said ("the page would not take the DOM reader…"), never `undefined`. A query always returns a
  list or an error, and the gig fill says "the page could not be read" if it ever gets neither.
- **"Any field it can."** The gig panel's fill takes every match, placeholder ones too (`low`), not only `medium` and up.

## Built: the chip under each input (AF3)
- **Where it is drawn.** In Clear Glass's own window, over the page (`renderer/autofill-inline.js`, `autofill-inline.css`), like Firefox's.
  The values never enter the page until he clicks, so a site's scripts cannot read his profile from the chips.
  - The page reports only where its fields are and when its set of fields changes (`src/autofill/suggest.js` `reporterScript`, through the
    webview bridge's two new channels `autofill:rects` and `autofill:stale`).
- **What each chip offers.** What the active autofill profile would put there (`matcher.detectFields`, with the site's profile and the learned
  map), and what the written gig would (`gig.matchGigFields`), best first.
  - The chip shows the first; ▾ lists every option with where it comes from.
  - A field that already holds the value has no chip, and a `{{template}}` still to finish is not offered.
- **A click fills that one field** (`cg.autofill.fillOne` → `handleMutate`, the React-safe way) and keeps the page's focus.
- **They follow the page.** They refresh on load, on in-page navigation and when fields appear (Fiverr's editor steps), and they move on
  scroll and resize.
- **The gig in the panel is the chips' gig.** It is shared with main when it is written, loaded or reopened (`autofill:gig:setLast`).
- AF4 (the Settings toggle and the default-profile picker) is still open. A site with autofill off gets no profile suggestions, by its site
  settings.

## Proof
- `tests/modules/test-autofill-chips.test.js` 5/5, in Clear Glass (`src/driver/glass.js`, no Playwright):
  - **AC-01 (his error):** a page with no reader, and one with only the query-only reader, are queried as a list and filled, and the page's own
    input handler saw the value;
  - AC-02: the profile and gig suggestions are combined;
  - AC-03: the reporter sends positions, never a suggested value;
  - AC-04: the real `browser.html`: chips under the fields, none where the value is already there, ▾ options, a click fills;
  - AC-05: the suggest backend over a real page.
- Every suite touching the reader, autofill, the gig panel or the window: the same result as before this release. `clear-glass-library-ui`'s
  "exactly two callers of detectFields" is now "at least two": the chips are a third caller of the same function, which is the reuse that
  check guards. Its 2 Ctrl+J failures are as on the base.
