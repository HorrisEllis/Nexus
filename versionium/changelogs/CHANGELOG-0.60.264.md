# 0.60.264 — the Fiverr panel is wired; his choices on a page become its macro

_Renumbered 2026-10-28: first released on claude/laughing-fermi-4f7sj5 as 0.60.224. Main already had its own 0.60.224 (and up to 0.60.260), so this release takes the next free number. Nothing in it changed (§0.3)._

James, 2026-10-28: "continue" · earlier the same day: "like none of the autofill works" · "use it for correcting or creating
macros/automation"

Owned by: docs/2026-10-28-gated-flows-phasemap.spec (dated addendum).

## Found: the Fiverr panel never did anything
- `renderer/gig-panel.js` (since 0.59.3) and `renderer/page-map-panel.js` (since 0.60.175) start with `const cg = window.cg`, and stop when it
  is missing.
- Nothing ever set `window.cg`: `browser.js` kept its wrapped API in a private variable. So both panels returned on their first line. The
  🎯 Fiverr button didn't open the panel, and "Fill this Fiverr page" was never wired.
- The old tests read the source text and never ran the page, so they didn't catch it.
- Fix: `browser.js` publishes the same wrapped API as `window.cg`, before the panels load.
- Proof: FW-10 drives the real `browser.html` in Clear Glass. It opens the panel, fills, and sees "Point at it", then records and keeps.
  With the one-line fix removed, FW-10 fails on "window.cg is the wrapped API".

## Built: his choices on a page become its macro
What the gig doesn't hold (Service type, the Gig metadata boxes, the pricing rows such as Number of APIs) he does once while the panel
records.
- **The panel button** "Record my choices on this page", then "Stop and keep my choices". It uses the live recorder that already exists.
- **The recording is kept as that page's macro** ("fiverr overview" or "fiverr pricing"). Every later fill of the page replays it, as him,
  after typing. The panel says whether it replayed or where it stopped.
- **Made to replay on any gig** (`gig-pages.pageMacroSteps`):
  - the recording's own gig address is dropped;
  - each click first waits for its element (a dropdown's options exist only once it is open);
  - a click on a button that says Save, Continue, Publish, Submit, Send or Pay is left out and listed (0.39.301: "Not automate talking or
    posting").
- **Recorder changes** (`recorder-script.js`, `recording.js`):
  - a ticked or unticked box is recorded as its state and replays as `check { checked }`. It used to replay as "type 'on'", which toggles.
  - a click keeps what its button said, which is how Save & Continue is recognised.
- **browser_action** names `check`, `select`, `choose` and `pointer`, which the driver already had, so macros can use them.

## Proof
- `tests/modules/test-fiverr-works.test.js` 11/11:
  - FW-10: the real panel in Clear Glass;
  - FW-11: a recording becomes a replayable page macro.
- `test-macro` 22/22, `test-live-recording` 8/8, `test-browser-shell` 28/28, `test-browser-action-screenshot` 10/10, `page-session` 6/6.

## To use it
1. Update to 0.60.224.
2. Open the gig from the dashboard. Edit Gig opens as a tab.
3. Press 🎯 (Fiverr), then "Fill this Fiverr page".
4. Once on each page: "Record my choices on this page", make your Service type, metadata and row choices, then "Stop and keep my choices".
   From then on, the fill does them too.
