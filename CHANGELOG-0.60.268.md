# 0.60.268 — node anchors, and the element picker when the fill is confused

James, 2026-10-28: "what a node anchor. also have the element picker come up to map the page if confused."

Owned by: docs/2026-10-26-inline-autofill-ui-phasemap.spec AF5 (mapped and built the same day, with its addendum).

## Reading (to confirm)
"Node anchor" is read as: every field (node) on the page anchored to what it means. The chips already show what goes in a field they
understand. A field they don't understand gets an anchor, set once, so the page is mapped and stays mapped. "If confused" is read as: when a
fill cannot place something, the element picker comes up without being asked.

## Built
- **⚓ on every field nothing placed.** The chips' backend (`_autofillSuggest`) lists each fillable field with no suggestion, and the
  identity it will be remembered by. Passwords and hidden fields are left out. In the window, that field gets a dashed ⚓ chip. Its menu
  lists what the field can be anchored as:
  - on a Fiverr editor page, the gig parts that hold a value;
  - every field type the active profile holds a value for.
- **An anchor is kept by the field's stable identity on the site** (`autofill:anchor`, `cg.autofill.anchor`):
  - a profile type goes into JA3's learned map: `learn-pick.chooseKey`, then `saveLearned`, the same identity and save path a pick uses;
  - a gig part goes into page memory as that part's target, made the same way as Point at it (`_gigAssign` now takes a field the chips
    know, as well as a pick).

  Then the chips come back with the value, and every later fill uses it.
- **Gig parts anchored before are offered on their field** by the chips, marked ⚓.
- **The picker comes up when confused.** After a gig fill, a part it could not place brings the element picker up by itself, with the
  status naming the part. After the pick, the fill runs again and the next missing part comes up. Each part is asked once per round. A
  pending automatic pick stands down if he starts recording (found by FW-10: it had taken over the recording's status).
- `gig-pages.valueOf(gig, part)` is the one reading of a gig part, shared by the fill and the chips.

## Proof
- `tests/modules/test-autofill-chips.test.js` 8/8, in Clear Glass:
  - **AC-06:** a real page's odd field is listed with its key (its id, the stable one). Anchored as email, the key is learned for the site,
    and the next suggestion offers the profile's email on it. A gig part anchored by its field is kept with a selector that finds only that box.
  - **AC-07:** the ⚓ menu in the real `browser.html`, and the choice it sends.
  - **AC-08:** the picker comes up for the part the fill missed.
- Also passing: `test-fiverr-works` 11/11 (FW-10's recording with a pending pick), `clear-glass-gig` 7/7, `test-cg-gig-autofill` 4/4,
  `clear-glass-autofill` 16/16, `test-autofill-learn-pick` 5/5, `-learn-ui` 3/3, `-learned` 4/4, `page-session` 6/6, `eros-hooks` 6/6.
  `test-browser-shell` gave 27/28 and 28/28 on two runs (BST-23, flaky on the base too). `clear-glass-library-ui`: the base's 2.
