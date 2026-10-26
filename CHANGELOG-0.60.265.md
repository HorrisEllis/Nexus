# 0.60.265 — Fiverr's gig editor: each box known by the heading beside it

James, 2026-10-26, on Fiverr's gig editor, sent a screenshot showing no chip and no "Autofill this page" in the menu. The co-pilot's
answer to "fill this in for me" was: "Filled the gig …: nothing matched. Left to copy by hand: title, category, tags, …".

## Why nothing matched
Fiverr's boxes have no label of their own. "Gig title", "Search tags" and "Positive keywords" are headings in the row's other column. The
field reader only knew a box by its own attributes and its `<label>`, so neither the fill nor the chip could tell what a box was for.

## What changed (FQ4)
- **The field reader** gives each field a context: the nearest heading before it inside its row. It looks up to 6 levels, and takes
  short text only.
- **The gig matcher** reads that context at medium confidence. It sits after the field's own label, so a field that has a real label
  keeps it.

## Proof
`clear-glass/test/field-query.test.js` builds a page laid out like Fiverr's and runs it in real Electron:
- the title box reads "Gig title";
- the tags box reads "Positive keywords";
- the gig fills `title=build an AI agent workflow` and `tags=ai agent, automation`.

Other suites:

| Suite | Result |
|---|---|
| clear-glass-autofill | 16/16 |
| autofill-learn-pick | 5/5 |
| cg-agent-doors | 7/7 |
| screen-qa | pass |
| autofill-inline | pass |
| gig-file | pass |

## The missing menu item
"Autofill this page" is main's 0.60.259 (AF2-UI). His copy is older than main, so the 0.60.264 zip, made against main, could not bring it.
He gets a full copy instead.

## Not checked
Fiverr's real page. Category is Fiverr's own dropdown widget, still copied by hand.
