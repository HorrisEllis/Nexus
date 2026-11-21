# 0.60.632 — the Emerge rung reads the three faults of run 15

James, 2026-11-21: "yes. do it, end to end."

## What changed
- **idearium/lib/gaps.eg** (Emerge): `in_string(body, name)`, `fix_for(said, body)` (the brace fix when the undefined name sits in a string's braces, else the hints), `copies_examples(body)` (two or more `== "…"` comparisons: the examples answered, not the rule); `struggle()` counts a name as missing only when the try called it (`name(` outside a string). Built to `idearium/lib/eg-build/gaps/main.js` by `eg build --standalone`.
- **idearium/lib/test/gaps.test.eg**: three new tests (13/13); the older struggle test now gives the call its name describes.
- **idearium/lib/emerge-rung.cjs**: the brief says how to write a brace in a string and to write the rule, not the examples; a copying body is refused before compiling; a compiler refusal gets `fix_for`.

## Measured
EMB3 run 15 (phrun-mwqrhwmy-xqkz, 10:50–11:14): planned and tested with no model; the rung asked 3b then 16b for 3 gaps over 13 minutes; gap body tried 8 times: 4 refusals were "y" is not defined from "if !x { y }" inside a string, 2 were ENOSPC (C: had 0.10 GB, now 17.8 GB after moving two old compartment caches to D:), and every body compared the input with the phase's example texts; body (a parameter) and y were linked in as new functions until the chain's depth limit held it. gaps.test.eg 13/13, test-emerge-rung 12/12.
