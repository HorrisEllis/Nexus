# 0.60.292 — a gate on every DOM element, for every caller; his own gates made with the picker

James, 2026-10-30, after asking where 0.60.291's gates were added (the answer: the Fiverr gig fill only):
> "it needs to be universal for all dom elements. like for the job applications for instance, even if we need a way to create them per
> page using the element picker, per site settings, macros and automation features. stop thinking so narrow"

He was right that 0.60.291 was too narrow. It gated one form, but the gate belongs underneath every write.

## Where writes to a page happen (read in the code)

Every write goes through one of three doors:
1. **ClearDriver** (`clear-glass/src/driver/index.js`), used by every fill, macro, site key and agent: `type`, `setValue`, `insertText`,
   `typeAt`, `select`, `choose`, `check` and `checkAt`.
2. **The DOM mesh's value write** (`handleMutate`, `clear-glass/src/dom/archaeology.js`), used by the general autofill, the applications
   fill, screen-QA and agents' `dom_mutate`.
3. **The workflow engine's in-page fill, select and tick** (`lib/automation/engine.js`).

`clear-glass/src/gates/` is an older event-bus "gate" registry. It shares the name but is a different thing, and it is left untouched.

## What was built (UG1–UG5)

Spec: `clear-glass/spec/gated-flows.spec` MOD-UG1..5. Map: `docs/2026-10-28-gated-flows-phasemap.spec`, which is DAG-clean.

- **UG1, `clear-glass/src/page/element-gate.js`: one gate for any element.**
  - **Where:** a CSS selector, an XPath, the DOM mesh's id, a dropdown or checkbox at a column and row, or the whole page.
  - **What must hold:** a value, an exact value, a pattern, a shown choice, ticked or clear, contained text, visible, gone, or the address.
    `{{value}}` stands for whatever was just written.
  - GG1's settle loop now lives here, so there is one loop for every gate.
- **UG2, ClearDriver gates every write it makes.**
  - Each write is checked against three things: what the write implies, his gates for that element, and any gate the call carries.
  - The gate is read until it holds, then read again after the page settles. If it is closed, the write is retried. If it is still closed,
    the call fails with `GATE_CLOSED` and what the gate saw.
  - Each site sets its own gates in Site settings › Gates: on or off, settle time, timeout and retries.
  - A person's own call may turn one write's gate off, and the result says so. An agent's call may not.
- **UG3, the DOM mesh's value writes are gated the same way.**
  - The general autofill counts a field whose gate stays closed as failed, with the reason, never as filled.
  - This covers job applications.
- **UG4, his gates per site, usable from macros and automation.**
  - They are kept in the options store, beside his site keys, and validated.
  - Each applies at every write to its element, on its whole site or only on one page.
  - The driver's new `gate` action checks one gate, one of his by id, or all of his on the page.
  - **Macros:** a `gate` step.
  - **Workflows:** fill, select and tick are gated through the driver, and there is a new step, "Check gates".
  - **Agents:** `glass gates [url] | add | remove | check`.
- **UG5, the screens.**
  - After an element pick, **Gate this element** asks what must hold and whether it applies to the whole site or only this page.
  - Settings › ClearDriver › **Gates on sites** lists, checks and removes them.

## Proof

`tests/modules/test-element-gates.test.js` passes 5/5. UG-02 to UG-05 run in Clear Glass:
- **UG-02:** a text box, a native dropdown and a checkbox open their gates. A box whose page puts its value back fails with
  `GATE_CLOSED` after the retry. Gates switched off on the site are reported as off. An agent cannot turn a gate off.
- **UG-03:** on an application form, the general autofill fills name and email with open gates. It reports the reverting phone field as
  failed (`GATE_CLOSED`), never filled.
- **UG-04:** his picked gate ("matches an email", by XPath) closes a write of "not an email" and opens for an email. The `gate` action
  checks all of his. The macro and workflow steps reach it.
- **UG-05:** the bar saves a gate from a pick, page-scoped. The store validates and removes it, and the command row builds its requests.

## Not proven yet

Nothing here has run on his PC or on fiverr.com yet.
