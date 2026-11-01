# 0.60.340 — CR1: the general autofill fills radios and checkboxes

James, 2026-11-01: **"Radios and checkboxes. Can we add that to autofill?"**

## The gap
`clear-glass/src/autofill/matcher.js` filled text inputs and `<select>` dropdowns, but its matching pass **deliberately skipped** `checkbox` and `radio` — a text-value set doesn't apply to them. So on a job application, a Yes/No "authorized to work?" radio and a relocate/consent checkbox were never filled.

## What was built
`matchChoiceFields(domFields, profile, opts)` — concatenated into `matchFields`, so `detectFields`/`fillFields` carry it with **no change to the fill loop**.

- A standalone **checkbox** is a boolean: its own label is the question; `boolOf` (select-match, DD1) turns the profile value into yes/no.
- A **radio group** (grouped by `name`) is one-of: the group's purpose comes from its **identity** (name/id/aria/**learned** — *not* a radio's own label, which is its option "Yes"); the winning option comes from `bestOption` over the radios' labels.
- The emitted value is `'yes'`/`'no'`, which drives the DOM mesh's **existing** checkbox/radio set (`archaeology.js handleMutate`, DD1) — a radio set checked unchecks its siblings natively.
- A group whose purpose is unknown, or whose value names no option, is **left for the element picker** (JA1/JA3) — never a silent wrong pick (§1.2).

## Reuse (§8.6 reuse before build)
Nothing new was invented for the write: `boolOf`/`bestOption` already existed (DD1), the DOM mesh already set checkbox/radio state, and the per-site learn-loop already teaches a group the patterns miss. CR1 is matching only.

## Proof (Clear Glass's own engine, never Playwright)
`tests/modules/test-autofill-radio-checkbox-glass.test.js` **4/4**:
- **CR-01** a radio group (Yes/No), a checkbox, and a non-boolean radio ("3-5 years") each resolve to the right option.
- **CR-02** §1.2 — an undecidable checkbox value, a radio value naming no option, and an unknown group are all left.
- **CR-03** a learned pick (JA1) names an opaque group, and then it fills.
- **CR-04** end-to-end in a real browser: query → `matchFields` → `mesh.mutate` — the right radio selected, the checkbox ticked, the opaque group untouched. This proves archaeology's real label extraction (radio label = option, name = group), not an assumption.

No regression: the DD1, learned, fill-active, select-match, dropdown-fill and clear-glass-autofill suites stay green (44 tests).

## Map & spec
Phase `CR1` in `docs/2026-10-19-gig-autofill-and-learn-phasemap.spec`; addendum in `clear-glass/spec/clear-glass.spec`.
