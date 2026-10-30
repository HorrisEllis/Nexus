# 0.60.290 — the Fiverr autofill fills every field it can; friction goes to his site keys

James, 2026-10-30:
> "the fiverr automation. isn't working. like the autofill needs to do all the work it can. like can you fix the autofill to work with all
> fields, and if you run into friction use the per site keybindings that I proposed."

His idea: the per-site keys he proposed on 2026-10-28 (KB2, "like elements to keys, per site?") should be what the fill falls back to when a
page fights it. Until now those keys only ran when he pressed them.

## What was wrong (read in the code, not assumed)

- **The Fill menu promised fields nothing filled.** It listed the gig title, the description, every FAQ and every buyer question. The fill
  had no step for any of them.
- **Three of the editor's pages were unknown.** Only Overview and Scope & Pricing were recognised, so a fill on Description & FAQ,
  Requirements or Gallery did nothing.
- **The description could not take text.** It is a rich editor. The fill matched only `input` and `textarea`, and the driver's `setValue`
  writes `textContent`, which a rich editor's own model never sees.
- **His keys were never used by the fill.**

## What was built (GF1–GF4)

Spec: `clear-glass/spec/gated-flows.spec` MOD-GF1..4. Map: `docs/2026-10-28-gated-flows-phasemap.spec`, which is DAG-clean.

- **GF1, `clear-glass/src/autofill/gig-fields.js`:**
  - a box is found by the words of its own section ("Gig title", "Description");
  - a box whose nearest words are another section's, or the page-wide "Description & FAQ", is never taken;
  - Save, Publish, Continue, Submit, Send and Pay are never clicked (they are his).
- **GF2, `gig-pages.js`:** Description & FAQ, Requirements and Gallery are placed by their words and the address's `tab=`. Each page lists
  its parts. The Gallery's files are his to add, and the fill says so.
- **GF3, the driver and the bridge:**
  - The driver's new `insertText` puts text in the way a keyboard does: focus, select, insert, with Enter between lines.
  - The bridge fills the title and the description, then each FAQ and each buyer question through their own Add buttons. Each is read back.
    One the page already shows is skipped, so nothing is added twice. Only ticked items are filled.
- **GF4, his keys on friction:**
  - A site key can now name the gig part it serves (`part`). It is set in the bind bar after a pick, in Settings › Keys on sites, or with
    `glass keys bind … --part description`.
  - When a part fails, the fill uses his keys for it on that site: it types or chooses the value at the element he bound, or runs the key's
    click, key or macro. Then it reads the part back again.
  - With no key bound, the part says exactly how to bind one.

## Proof

`tests/modules/test-gig-all-fields.test.js` passes 4/4 in Clear Glass:
- **GF-01:** the title and the description are found by their words, never the FAQ box, and Save is never pressed.
- **GF-02:** every editor page is placed with its parts, and a key may name a part, only on its own site.
- **GF-03:** a test editor that takes only typed text gets the description, with its line break. Two FAQs are added and one already shown
  is skipped. Two buyer questions are added, and a second fill adds nothing.
- **GF-04:** a box the fill cannot find by its words says how to bind a key. With his key bound (part: description), it is typed there and
  read back.

Also green after the change:
- test-fiverr-overview-and-a11y 5/5;
- test-site-keys 5/5;
- test-gig-fill-menu 3/3;
- test-gig-features 3/3;
- test-dropdown-keys 2/2;
- test-gated-dropdowns 6/6;
- test-cg-gig-autofill 4/4;
- test-substrate-spec 3/3.

Two expectations were updated for this change: Overview now includes the title, and the command passes `--part`.

## Not proven yet

- The words and `tab=` addresses of the Description & FAQ, Requirements and Gallery pages are the coder's reading of Fiverr's editor, not
  taken from his screenshots. On his machine the fill either finds those fields or says which one it could not find. If it cannot, binding a
  key for that part (pick the element → Bind a key → "for gig part") is the fix he proposed, and it now works.
- Nothing here has run on fiverr.com yet; the sandbox cannot reach it.
