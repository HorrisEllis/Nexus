# 0.60.455 — the Pipelines page, nothing hard-coded

James, 2026-11-08: "yes. I need this done today. nothing is hardcoded." · "i like that though. except for listing the kinds under it. show me a new preview"

- **No kinds list.** The kinds list under the library is gone, and so is the sentence naming the kinds.
- **The kinds come from Emerge's box shape.** `box.KINDS` arrives with every graph from `GET /api/cos/boxes`.
- **Each kind's colour is computed** from its place in that list, round the colour wheel. A kind added to the box shape gets a colour with no change to the page.
- **Proof:** test-pipeline-box 5/5. PB-05 now also checks that the kinds come from the box shape. The new preview was sent to him.
