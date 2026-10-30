# 0.60.294 — the new gig's subcategory finished; every key and click paced like a person's, through ErosmancerOS

James, 2026-10-30, with a screenshot of a new gig's Overview (PROGRAMMING & TECH chosen, SELECT A SUBCATEGORY left, the title empty):
> "the drop down didn't work fully. it was a new gig. also needs to use delays between key clicks, erosmanceros is for all copilot and
> guardian agents. any input not from me."

## Why the subcategory was never picked (traced and bisected)

0.60.291 (GG1) wrapped the category in a retry, and its second try re-picked with the built-in pick. On a new gig, his node macro had
already chosen the category. The built-in pick then looked for a dropdown showing "SELECT A CATEGORY", which was gone, so it failed, and the
subcategory was never picked.

The same retry made delivery re-pick after his macro had already gated it. `test-about-and-nodes` AN-03 had been red since 0.60.291, and
the coder's regression lists missed it.

The title is not traced: the screenshot alone does not show why it stayed empty. The fill's row for the title says why on his machine.

## Fixed (GF5)

- When his gated node macro runs, its own gates are the part's gate: no second check, and no built-in re-pick.
- When the macro stops part way, the built-in pick reads the page and picks only what is still unchosen.
- A gate read that the page does not answer at all is recorded as unchecked, never retried as closed.

## Every key and click like a person's (EI1)

- **Typing.** Every key the driver types, for every caller (the fills, macros, workflows, pipelines, Copilot, agents), goes like a
  person's:
  - ErosmancerOS types it when it is wired.
  - Otherwise the keys go in one at a time, 45–140 ms apart, with a 220–520 ms pause every 8–16 keys.
  - A whole value is never put in at once. `setValue`, `insertText`, `type` and `typeAt` all go this way.
- **Clicks.** A left click goes through the same human pointer the dropdowns use: ErosmancerOS's curve when wired, otherwise a curved path
  with Electron's input.
- **Reporting.** The path taken is said in the result (`via`, `viaWhy`).
- **A real bug found on the way:** an email field has no caret to move, and the first version threw on it.

**Not changed, and his call:** agents' long prompts into AI chat boxes (Guardian's userscripts, the mesh agent page). Typing a long prompt
key by key takes minutes.

## Proof

- `test-fiverr-overview-and-a11y` 6/6. In FO-04, in Clear Glass, his macro chooses the category and stops; the fill picks only the
  subcategory, and the page shows both.
- `test-about-and-nodes` 4/4 (AN-03 green again).
- `test-pipeline-gates` 7/7. In PG-07, in Clear Glass:
  - typing "James Brooks" fires one input per key;
  - every gap is at least 30 ms, with a pause every few keys;
  - ErosmancerOS is used when it is wired;
  - when it is down, the keys are paced and the result says why.
