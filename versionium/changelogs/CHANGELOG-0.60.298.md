# 0.60.298 — DD1: autofill works on dropdowns and checkboxes, not just text

James, 2026-10-30: **"Hook it into the autofill chip. Make sure it works for all elements. Including drop downs. You can use the keyboard bindings if needed."**

A dropdown doesn't change when you set its value to a string — a `<select>` only moves when the value matches an *option*. Your profile holds "United States"; the option's value is usually "US". So filling a dropdown with the profile value did nothing. Now it resolves to the right option first.

## What was built
- **`clear-glass/src/dom/select-match.js`** (new) — `bestOption(options, want)` picks the `<option>` a person would: exact value → visible text → label → punctuation-insensitive → a conservative prefix/contains (≥3–4 chars, so "No" never prefix-matches "Norway"). `boolOf(want)` maps a clear yes/no for a checkbox. Pure, one source of truth.
- **The in-page DOM mesh** (`archaeology.js` `mutate`) now fills each element the way it actually changes: a `<select>` selects the matching option; a checkbox/radio sets its checked state from yes/no; a `contenteditable` sets its text; all dispatch real `input`+`change`. No silent wrong pick — an unmatched dropdown says what the options were (§1.2). The matcher's source is interpolated from the one file, since the injected script can't `require`.
- **The chip's `fillOne`** (`ipc/bridge.js`) resolves the option with the same matcher before handing the driver the exact option text, so the inline chip is robust on dropdowns too.

## Why this wasn't already done (reuse check)
AF6 (0.60.296) made the chip's *driver-paced single fill* choose a dropdown. But the **bulk fill path** — "Autofill this page", the Library Fill, copilot, and the no-driver chip fallback — goes through `fillFields → handleMutate → mutate()`, which had no option resolution. DD1 fills exactly that gap. AF6's chip + the driver's `select`/`choose` are kept.

## Proof (headless, no Electron)
`tests/modules/test-select-match.test.js` 7/7 — exact value, text→coded value ("United States"→US), case-insensitive, "5"→"5 years", "Oregon"→OR, no-false-match (No≠Norway), punctuation ignored, boolOf yes/no. The reconstructed in-page script parses (`new Function`).

## Still yours to confirm live
The right-click "Autofill this page" and the chip on a real form with country/state/years dropdowns — this container has no Electron, so the DOM behaviour is verified by the matcher's tests + the script parsing, not by driving the page.
