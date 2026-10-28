# 0.60.116 — 2026-10-17

James: "Okay so where is the product being made? Or are we building the capability first, then branching?"

Then: "I agree, with the recommendation"

## His decision, and what it was between

FR1 and FR2 had been built inside Nexus on the coder's working assumption, which was never put to him. Answering his
question, the coder set out two options:
- **(A)** keep building in Nexus and branch it out at each release;
- **(B)** build in the branched repo: a standalone product sooner, but it forks at once and every fix is made twice.

The coder recommended **A with a real boundary**: a product folder in Nexus with a manifest, the branch tool reading that
manifest, product files declaring themselves, and a check that fails when the copy lacks something the product needs.
He chose that. It is recorded in `docs/2026-10-16-repo-carve-phasemap.spec` (`decision_where_the_product_is_built`).

## Found while answering: the coder's own claim was wrong

The coder had told him the branched copy carried FR1 and FR2. It did not:
- `lib/change-record.js` (FR1) was never a seed;
- `lib/run-state.js` was never a seed either;
- the optional cut dropped `lib/test-map.js`, so FR2 would have found no tests in the copy.

The preset was a hand-written list, and it had gone stale.

## PB1: the product boundary

- **`products/flight-recorder/product.json`** holds:
  - `seeds`: what the copy starts from;
  - `cut`: links the code runs without;
  - `must`: what the copy has to carry.

  `README.md` beside it has his words, what the product is, and its phases.
- **`lib/repo-carve.js` 1.2.0** reads products from `products/*/product.json`. The old hand-written list is kept as
  `PRESET_0_60_113`.
- **Header tags.** A file whose header says `Product: flight-recorder` is carried without being listed, so a new piece
  cannot be forgotten. The four FR1/FR2 files are tagged.
- **The `must` check.**
  - `plan()` names every must-file the copy lacks, with the link that cut it.
  - The route refuses to make a repo that lacks one (409).
  - The Preview shows the tagged files, and the missing must-files in red.

## The flight recorder now

| | before | now |
|---|---|---|
| files | 168 | 173 |
| systems | 8 | 9 |
| must-files missing | 3 | none |
| files that load alone | 57/57 | 61/61 |

## Proof

`tests/modules/test-repo-carve.test.js`: 14/14.
- CV-13: a fixture product. A tagged file is carried without being listed; another product's tag is ignored. A must-file
  dropped by the optional cut is named with its link. Tagging it carries it. A broken manifest is said.
- CV-14: the real flight recorder carries everything it must, loads alone, and the route reports it.
