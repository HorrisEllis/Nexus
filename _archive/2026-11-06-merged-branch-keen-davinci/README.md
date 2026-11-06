# Merged branch claude/keen-davinci-rqxxpb (2026-10-26), kept (§0.3)

James, 2026-11-06: "Merge everything that’s not on main. Then delete"

This branch numbered its releases 0.60.261–0.60.269 (the Fiverr gig fill: FQ1–FQ4, FD1, FD2, FW1, FW2, AF3, RC1). Main had already used those
numbers for other releases (versionium/changelogs/CHANGELOG-0.60.261.md …), so the branch's changelogs are kept here under their own names,
not at the root where they would read as main's. Merged with main winning every clash: where the branch and main changed the same lines,
main's lines stand; what only the branch had came in.

Kept here too, not in the live tree: the branch's Fiverr gig fill in Clear Glass (src/autofill/inline.js and its changes to gig.js, matcher.js,
copilot/verbs.js, dom/archaeology.js and the .gig files). Merged as is, those lines broke main's later rebuild of the same flow (GT4–GT6,
GF1–GF4, AC1): test-gig-features and test-gig-fill-menu failed. Main's files stand; the branch's own tests for its version are kept here with
inline.js. The full branch stays in git history (its commits are merged).
