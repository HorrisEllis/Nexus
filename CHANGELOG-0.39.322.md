# 0.39.322 — 2026-10-05

James: "next"

SH1 is partly done (emerge map 1.7.17).

- **`lib/shadow-space.js`:** where a generated change acts before it is real.
  - It's a COS workspace branch of the repo (a git worktree) with the step's shadow declared on it (`lib/shadow.js`: what must exist afterwards).
  - Writes go into the space only; a path outside it is refused.
  - `commit()` runs the test inside the space itself, then settles the shadow.
  - If both hold, the change is merged into the real tree, fast-forward only.
  - Otherwise the space is discarded and the real tree is untouched. Each absent file becomes a gap with the step as its cause.
- **Found and fixed:** `self_repair`'s `promote` trusted a `testResult` the caller handed in, so a model could pass `{ passed: true }` without running anything. Now only a pass that its own `test()` recorded since the last `propose` opens `promote`. The tool guide says so.
- `tests/modules/test-shadow-space.test.js` 5/5 (registered).
- Not yet:
  - idearium's codegen writing through a shadow space;
  - one record shared with WARP 2's expectations (EM2);
  - the shadow read on agent replies (MR9).
- Loom: 2 new components, nothing lost. Unresolved declarations went from 114 to 116. Both new ones are the known missing agent-tools `.export` hook class, now reached by the new test, which requires `self-repair.js`.
