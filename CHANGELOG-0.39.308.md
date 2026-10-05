# 0.39.308 — 2026-10-05

James: "the agents hat should be created with the repo."
James: "I'm worried about how it's been expanded wheathet it's been additive or not."

## The hat comes with the repo
**Before:** a repo's agent (its hat) was only made the first time someone used the Agent tab.

**Now:** every repo made with a compartment gets its hat when it's created. That covers the workshop, Create repo, imports, codegen and the spec library, because every one of them goes through the same creation step. A repo with no compartment still gets no hat, as before. If making the hat fails, the repo is still created and the reason is logged.

## Was it additive?
**Yes, as far as git can see.** From the start of the git history (0.39.258, Sept 25) to now, across `idearium/` and `lib/`:
- no file was deleted;
- no route was removed: 138 routes then, 255 now;
- one function was replaced on purpose: `gitField`, when Versionium took over repo history in 0.39.263.

Anything before Sept 25 lives only in the release zips.

## Proof
- `test-build-from-the-spec` passes **5/5**. BS-04 now checks that a workshop save creates the repo's hat, and that a repo with no compartment still gets none.
- All 12 hat and agent suites pass, along with the workshop, spec library, codegen, workspace and architecture suites.
