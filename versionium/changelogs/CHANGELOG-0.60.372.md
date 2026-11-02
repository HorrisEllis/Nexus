> Renumbered from 0.60.339 on merge (2026-11-02): built on `claude/sleepy-gates-9lc085` as 0.60.339, in parallel with main, which used 0.60.339 first (CHANGELOG-0.60.339.md is main's). Numbered above main's 0.60.365 so both stand (§0.3).

# 0.60.372 — FP6: the AI ENGINE multi-select dropdown fills, for a fact

James, 2026-11-01: **"do it, I need it fiverr ready, take screenshots if you have to. use idearium as a map if you need, or in the docs the atlas. I need this working for a fact."**

## The gap
`_gigMetadata` (GT6, 0.60.320) filled the Gig-metadata **radios and checkboxes**, but not the multi-select **dropdown** his real AI Development page uses for **AI ENGINE** ("Choose…"). So the one metadata field that matters most on his live gig stayed blank.

## What was built
A metadata field whose control is a dropdown is now filled through the driver's proven `choose`, one value at a time — gated on the field's **chosen state (its chips)**, not the trigger text (which keeps saying "Choose…") nor the open menu (which is full of the wanted words).

- `clear-glass/src/autofill/gig-fields.js` — **`metaDropdownScript()`** finds, within the "Gig metadata" section, the field rows whose control is a dropdown (a `<select>`, a combobox/`aria-haspopup`, or a "Choose…"/"Select…" trigger), names each by its row label, and marks each trigger `data-cg-meta-dd` + the section `data-cg-meta-root`. **`metaChosenScript(idx, value)`** is the honest read-back: a selected option / checked input, or a chip bearing the value **outside** the open menu.
- `clear-glass/src/driver/index.js` — `choose` gains one optional param, **`confirmScript`**: a page-side predicate used in place of the trigger text to decide a pick took. A value already chosen is **left alone** (clicking it again would toggle it off) and returns `{ already: true }`.
- `clear-glass/src/ipc/bridge.js` — `_gigMetadata` routes a dropdown field through `choose` with `confirmScript = metaChosenScript`, reads it back, and names any value Fiverr does not offer with the field's own list (§1.2). A radio/checkbox field still takes the tab-and-panel path.

## Reuse (§8.6 reuse before build)
`option-match` (FP2) for the labels, `choose` for the open/pick/human-pace — extended in place, not forked. `confirmScript` is general: it fits any chip/tag multi-select, not metadata only.

## Proof (Clear Glass's own engine, never Playwright — AXIOMS §4.1)
`tests/modules/test-gig-metadata-dropdown-glass.test.js` **5/5** on a live multi-select page:
- **DD-01** `metaDropdownScript` finds AI ENGINE + PROGRAMMING LANGUAGE, not the DELIVERY TYPE radios.
- **DD-02** AI ENGINE ← Claude, ChatGPT, Gemini — three chips, matched case-insensitively, each gated on the chosen state; a **screenshot** (`_artifacts/fp6-ai-engine-dropdown.png`).
- **DD-03** a value not offered ("Grok-9 Ultra") said with the list; the offered ones still chosen.
- **DD-04** idempotent: a value already chosen is not toggled back off.
- **DD-05** a dropdown field and a radio field filled in one call.

## Map & specs
Phase `FP6_metadata_dropdowns_multi_select` in `docs/2026-10-28-first-principles-phasemap.spec`; addenda in `clear-glass/spec/flow-cores.spec` (choose's `confirmScript`) and `clear-glass/spec/gated-flows.spec` (MOD-GT6 fills dropdowns).

## The one failure mode, named not silent
In production the prior field's menu is dismissed by the click on the next control (universal click-away). A dropdown left open is the one thing that could pollute the next field — it is reported, never passed over.
