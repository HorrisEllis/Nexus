# 0.60.174 — 2026-10-19 — the page as blocks, chunks and a map that learns

James, 2026-10-19: "like i need copilot to use clearglass more effectively. parse the dom, index each element as blocks, then
download into a index to chunk, then synthesize a fucking map in relation to the weboage to use as a map or reference point for
inputs from the cli or the intent. learns over time." · "then it can be a map tool, chunk tool for understanding/analysing/ reverse
engineering,, web scraper."

His idea and direction; the coder's part is the code. Map: docs/2026-10-19-upload-intent-and-page-map-phasemap.spec (PM1–PM4).

## What it stands on (§8.6)
page/semantic-tree.js (roles, accessible names, addresses — the walk is reused, not copied) · the interaction field's covered-layers
rule for z · the reader.js rule (the in-page code is a real function the tests run).

## Built
- **PM1 `clear-glass/src/page/blocks.js`.** The page as blocks: semantic-tree's walk in a new, opt-in content mode — landmarks,
  headings, paragraphs, lists, tables, images, code, text-bearing boxes, fields and actions — each with its address
  (`main › form "Apply" › textbox "Email"`), selector, box, z and text. A block's id is stable across visits and does not change
  when content is inserted above it. `siteKey()` makes /jobs/123/apply and /jobs/456/apply one map.
- **PM2–PM4 `page-map.js`.** Chunks by landmark and section (every block exactly once) · a keyword index and search ·
  `synthesize()` → regions, forms with their fields (required marked) and submit, actions, navigation, as short lines a small model
  reads · `toMarkdown()` / `toJSON()` for scraping · `find(intent)` → ranked targets with selector, address, centre and the reasons
  (words, the verb's kind, covered or off-screen, stability, what worked before).
- **`page-memory.js` — learning by counting.** Per site: visits; each block's seen count, so a stable block is trusted; what is new,
  changed and gone since the last visit; intent → block outcomes (a success raises that block for that intent on that site, a
  failure lowers it). Kept under ~/.clear-glass/page-maps (data). A file that will not parse is kept as .bad and said.

## Proof
`tests/modules/clear-glass-page-map.test.js` 6/6 — PM-06 runs the real page in Clear Glass's engine: a cookie modal covering the
Apply button gives it z > 0 and `find("click apply")` says it is covered. semantic-page-tree 7/7 and semantic-field-map 5/5
unchanged.

## Not proven
No screen and no agent tool yet: PM5 (driver actions, co-pilot tools, commands) and PM6 (Nerve) are next; PM7 (live injected map)
and PM8 (panel) are open. Not run on Windows or against a live site.
