# 0.60.232 — 2026-10-24 — JA5: the pick is also a macro and an automation node

James, 2026-10-24: "merge and push. yes make the macro too."

This was his answer after JA4, when the coder asked about his 2026-10-19 words: "saves to per site settings, and as a macro or
automation and updates the autofill." JA3 and JA4 had saved a pick only to the site's settings, and the JA3 notes marked the macro
"to confirm". This builds it.

"merge and push" came first: [PR #152](https://github.com/HorrisEllis/Nexus/pull/152) (JA3 + JA4) merged to `main` at `e05a5ed8`.

## What it does
- **At the pick**, the box also gets a CSS selector from `renderer/selector-check.js`, run as an `input` check: exactly one match,
  and it must be the editable box that was picked. The phasemap first named this reuse. The selector is kept for the site as
  `autofill.selector.<fieldKey>`. If you click the label, the pick is first resolved to its box, through the box's own positional
  xpath, counted the way selector-check walks it.
- **The site's macro**, `autofill <host>`, is rebuilt from that site's learned fields:
  - `urlPattern` is `<origin>/*`;
  - there is one `type` step per field that has a selector;
  - each step types a `{{param}}` (`github`, `cover_letter`, …), so **your profile values never go into the macro**. You give them
    when it runs.
- It is saved through `macro.js`'s own `create`, which also validates it. `macro.js` refuses a duplicate name, so a rebuild is a
  delete plus a create; the old row stays as history (§0.3).
- It is exported as a `.macro` node into the automation nodes folder, so it is an automation too.
- **A field with no stable selector** is still learned, so the autofill still fills it. It is left out of the macro, and the
  dialog says why.
- **Forget** drops the field's selector and rebuilds the macro without it. The macro is removed when nothing is left.

## On screen
- The Pick says `Saved in the macro "autofill micro1.ai" (1 step).`, or why the field is not in it.
- In Fields it learned, each field says `in the macro "autofill <host>"` or `not in the macro (no stable selector)`.

## Reuse (§8.6)
selector-check.js gives the selector, macro.js stores and validates the macro, and macro.js `export` writes the `.macro` node.
No new store and no new macro format.

## Built
- `clear-glass/src/autofill/learn-pick.js`:
  - `selectorScript`, `macroName`, `macroFor` (pure over the store) and `saveMacro` are new;
  - `resolveScript` returns the box's xpath;
  - `pickAndLearn` keeps the selector and saves the macro;
  - `forgetLearned` drops the selector;
  - `listLearned` gives each field's `selector` and `macro`.
- `clear-glass/src/ipc/bridge.js` — `_autofillMacroDoor()` (macro.js and the automation `NODES_DIR`) and `_autofillForget()`
  (forget, then rebuild the macro). The pick and both forget doors (HTTP and IPC) use them.
- `clear-glass/renderer/settings/sections/autofill.js` — the macro in the Pick message and in the learned list.
- Loom: `economy-map.js` edges learn-pick → selector-check, bridge → macro.js, and bridge → automation-engine.

## Proof
`tests/modules/test-autofill-learn-macro.test.js` — JA5 **5/5**:
- JA5-01: `macroFor` gives `{{param}}` steps, the `urlPattern`, params named for macro.js, and the fields left out. No profile
  value is in the macro.
- JA5-02: the steps pass the **real** `macro.js` create validation.
- JA5-03: `saveMacro` replaces the macro rather than being refused as a duplicate, exports the node, and removes an empty macro.
- **JA5-04: a real page in Clear Glass** (`glass.js`), with the real dom mesh and the real `selector-check.js`:
  - a click on the label resolves to its box and that box's xpath;
  - selector-check gives a selector that matches exactly that box, without using its generated id;
  - a wrapping label resolves to the box inside it, and a button is refused with why.

  This is the first run of the pick's page scripts on a real page.
- JA5-05: `pickAndLearn` keeps the selector and saves the macro, and Forget rebuilds it. A box with no stable selector is learned,
  left out of the macro, and the reason is said.

`test-autofill-learn-ui.test.js` (JA4) 3/3 now also checks the macro on screen. JA1–JA3 still pass.

## Open
- A real fill on a live listing (your login, your machine).
