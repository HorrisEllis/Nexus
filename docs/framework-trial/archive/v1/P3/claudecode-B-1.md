**Don't put the full import in front of every build. Split the two dependencies hidden in that error and fix each one where it belongs.**

**1. End-state**
- Minimal: every build can be undone, and no build plans from a registry that is missing.
- Optimal: the snapshot never depends on derived data. The index is built once and then updated incrementally, so a build pays only for what changed.
- Exceptional: each build records which content hash its snapshot came from and which index version its plan read. Index staleness becomes a value you can check, not a guess.

**2. Constraints**
- Wall: undo needs the repo's state as it was before the build. Only the repo's own bytes can provide that.
- Wall: the planner needs a component registry that matches the current tree.
- Obstacle: the snapshot step requires atlas.json. That is a coupling choice, not a necessity.
- Obstacle: a full import takes minutes. A one-time full import plus incremental updates gets around that.
- Obstacle: the atlas and the registry come out of a single slow pass. They could be split, or cached per file.

**3. Invariants**
- A snapshot is a copy of the files (a git commit or tree hash, or a file copy). A summary of those files adds nothing to undo.
- A registry is only trustworthy for the content hash it was built from.
- The refusal is correct to stop. What's wrong is the precondition it checks.

**4. Working backward**
- Undo needs a snapshot that is cheap and independent. Today the snapshot is gated on the atlas. That is gap one.
- A correct plan needs a registry that is current for HEAD. Today nothing checks freshness: if a registry exists, the planner reads it even when it is stale. That is gap two, and the team's proposal doesn't address it. It just pays a rebuild every time to hide it.

**5. Negative space**
- No freshness stamp (source hash) is stored on the atlas or the registry.
- There is no incremental indexing path.
- The planner's behaviour when the registry is absent isn't stated. It may plan blind without saying so.
- Nothing measures how often import actually changes the output between builds.

**6. Options**
- A. The team's proposal: a full import before every build. It is correct but slow on every build. It wastes minutes when nothing changed, and it keeps the snapshot coupled to the atlas.
- B. Decouple and cache:
  - The snapshot reads the repo directly, with no atlas.
  - Before planning, compare the registry's stored source hash with HEAD. If they match, use it. If they don't, re-index only the changed files. If there is no index at all, run the full import once.
  - If indexing fails, the build stops and says why.
- C. Snapshot only, and let the planner run without a registry. Rejected: blind plans.

**Choice: B.**

**7. Attack**
- Weakest assumption: that indexing can be done incrementally. Some files have connections that reach across the whole repo, so a change to one can change edges elsewhere.
  - Repair: re-index the changed files plus everything the existing registry says depends on them. Fall back to a full import when the change set is large or the dependency graph is unknown.
- Failure mode: the hash comparison misses uncommitted changes.
  - Repair: hash the working tree, not just HEAD.
- Failure mode: the first build on a newly imported repo is still slow.
  - That is acceptable, and it is honest. Show it as "indexing, first time".

**8. Answer and grounds**
Decouple the snapshot from the atlas, and gate planning on a registry whose freshness has been checked, refreshed incrementally.
- What it rests on: undo needs bytes, not summaries, and a registry is only valid for the source hash it was built from.
- What would prove it wrong:
  - If an incremental re-index produces a registry that differs from a full import on the same tree, incremental indexing is unsafe. Then option A, or a faster full import, is the answer.
  - If the snapshot actually uses the atlas to decide what to capture (for example, which files are excluded), the coupling is real. Then move that rule into a cheap ignore list instead.
