# 0.60.262 — "fill this in for me" fills again

James, 2026-10-26, asking the co-pilot on a Fiverr gig editor: "fill this in for me". It answered "Did not fill: matchGigFields: domFields
must be the dom_query array", twice.

## Why
Clear Glass reads a page's fields through a small script it injects into the page (the dom mesh, `window.__cgDomMesh`). That tab did not
have it, so the field query came back `undefined`. The gig fill passed that straight to the matcher, which threw.

The profile fill had the same gap. It only caught an `{ error }` answer, not an empty one.

## What changed (FQ1)
`DomArchaeology.queryFields` is now the one way every fill reads a page's fields:
- If the tab has no dom mesh, it injects it once and asks again.
- If the tab still cannot answer, it says why: "reload the tab".
- If there is no tab, it says to open one.

The gig fill and detect, and the profile fill and detect, all use it. A page that answers nothing is now an error that is said, never a
thrown type error.

## Proof
`clear-glass/test/field-query.test.js` runs in real Electron:
- A page starts with no dom mesh.
- The mesh is injected, the page's 3 fields come back, and the gig's 3 parts match.
- A missing tab gives "no tab for …".

Other suites:

| Suite | Result |
|---|---|
| clear-glass-autofill | 16/16 |
| autofill-learn-pick | 5/5 |
| cg-agent-doors | 7/7 |
| autofill-transfer | 5/5 |
| gig-file | ok |

## Not covered
Fiverr's description box is a rich text editor, not an input or a textarea. A fill types the title, tags and package fields, and lists
what is left to copy by hand, as before.
