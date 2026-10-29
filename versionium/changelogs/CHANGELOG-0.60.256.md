# 0.60.256 — The autofill data out and in; gig files are .gig

James, 2026-10-26: "continue. look at autofill. i want to be able to import and export the data. have a download template button just
the fiverr gigs, also fix it so its .gig not .gig.json."

Map: `docs/2026-10-26-autofill-transfer-phasemap.spec` (AT1–AT5).

The coder's reading, to confirm:
- "the data" means everything autofill keeps about him: the profiles, the fields it learned per site, and the last gig.
- "a download template button just the fiverr gigs" means the template is for Fiverr gigs only. An export is its own example and needs no
  template.

## What changed
- **AT1, one `.autofill` file** (`clear-glass/src/autofill/transfer.js`). It is YAML, format `clearglass.autofill/1`, named
  `autofill-<date>.autofill`, so he can read and edit it the way he reads a `.gig`. It holds:
  - his profiles, with their ids;
  - each learned field, with its site and its selector;
  - the last gig.

  An import merges:
  - A profile is replaced only by a newer copy. His own newer edit is kept.
  - A new profile is added with its id, so importing the same file twice doubles nothing.
  - Learned fields are set for their sites, and the gig becomes the last gig.
  - Anything it cannot take is refused and named, never dropped: an unknown field type, a row with no site, or a gig file sent to the
    wrong place.
  - What it replaces is kept first (one JAA row), and **Undo the last import** puts it back.

  `AutofillStore` gained `putProfile` (checked as `createProfile` checks, and keeps its id) and `replaceProfiles` (for the undo).
- **AT2, every door.**
  - IPC: `autofill:export`, `autofill:import`, `autofill:import:undo`.
  - HTTP: `GET /cli/autofill/export`, `POST /cli/autofill/import`, `POST /cli/autofill/import/undo`.
  - Rows: `autofill export [--out <file>]`, `autofill import <file>`, `autofill import undo`.
  - Agents: `autofill_manage` gains the actions `export`, `import` and `importUndo`.
  - The co-pilot: `autofill.export` and `autofill.import` (with `undo`).
  - Registry entries, three events in the taxonomy, and the loom wires.
- **AT3, on screen.** Settings → Autofill opens with **Your autofill data**, which has four buttons:
  - Export autofill data
  - Import a file…
  - Undo the last import
  - Download Fiverr gig template

  Each says what it did. The Fiverr gigs pane keeps its own Download template button.
- **AT4, `.gig` only.**
  - Every gig file Clear Glass writes ends in `.gig`. `gigFilename` replaces a `.json`, `.yaml` or `.gig.json` ending.
  - Downloads are typed `application/octet-stream`, so nothing adds an extension.
  - `clear-glass/docs/gigs/nodejs-automation-scraping.gig.json` was the only `.gig.json` Clear Glass gave him. It held the same gig as the
    `.gig` beside it (checked: both parse to the same gig), so it is archived as a true duplicate in `_archive/2026-10-26-gig-json/`.
  - An old `.gig.json` he has still loads.
- **Found and fixed:** the self-building loop that came in with 0.60.255 emitted `loop.*` events that no taxonomy declared. EC-05 counted
  4 new ones. They are now named in full (`idearium.loop.started|step|stopped`) and declared, so EC-05 is back to its 0.60.254 state.

## Proof
| Suite | Result | What it checks |
|---|---|---|
| `tests/modules/test-autofill-transfer.test.js` | 5/5 | Real stores in a temp folder. Export → import is lossless; a merge keeps the newer copy; refusals are named; undo restores profiles, the gig, a learned field's earlier value, and removes a selector the import added; every door, row, tool, registry entry, event and loom wire. |
| `clear-glass/test/autofill-transfer-render.test.js` | 1/1 | Renders the Settings section in jsdom, the pattern settings-merge-render uses (no Playwright, AXIOMS §4.1). Export saves `autofill-2026-10-26.autofill`, the template saves `gig-template.gig`, both typed octet-stream. |
| `clear-glass/test/gig-file.test.js` | ok | `.gig` names, an old `.gig.json` still loads, no `.gig.json` is shipped. |
| `tests/modules/test-self-building-loop.test.js` | 5/5 | |
| `test-cg-agent-doors` | 7/7 | |
| `test-cg-field` | 13/13 | |
| `test-eros-hooks` | 6/6 | |
| `test-route-contracts` | 4/4 | |

Still red, and the same on 0.60.254:
- EC-05: `idearium.phase.closed`, `phase.reopened`, `repo.phases.groomed`, and cos/remote-desktop's events.
- EC-06.

## Not done
The Settings pane has not been clicked through in a running Clear Glass on his machine. The jsdom render covers the pane and both
downloads. It does not cover the real file dialog.
