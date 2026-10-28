**Don't make every build run the full import first.** That puts minutes of work in front of every build to satisfy a check that guards the wrong thing. Split the two needs and handle each on its own terms.

**What good looks like**
- Minimal: every build can be undone, and nobody has to run the import by hand to get a snapshot.
- Optimal: the snapshot costs seconds. The planner reads a registry that matches the repo as it is now, and indexing runs only when the files have changed.
- Exceptional: the index updates incrementally, only for changed files. A build says plainly which index version it planned from, and refuses or rebuilds the index only when the registry is missing or stale.

**Constraints**
- Wall: a build must be reversible, so the snapshot has to come first.
- Wall: the planner needs a component registry to plan.
- Wall: a full index of a large repo takes real time.
- Obstacle: the snapshot step depends on atlas.json. A snapshot is a copy of the files (a git commit, a tarball, or content hashes). It doesn't need a summary of them.
- Obstacle: "index" means "the full import pipeline". Indexing could run on just the changed files.
- Obstacle: nothing records whether the index is fresh.

**What holds regardless**
- The bytes on disk are the truth. The atlas and registry are generated from them, so they can always be rebuilt and can go stale.
- Undo only needs the bytes.
- A plan made from a stale registry is wrong, even though nothing reports an error.

**Where the gaps are**
- Reversibility needs a snapshot of the bytes. Today that snapshot is blocked by a missing summary, which is the wrong dependency.
- Correct plans need a registry that matches the current files. Today nothing checks that, so an old atlas lets a build plan from stale components without any warning.
- What's missing: a freshness marker (a hash of the files the index was built from), an incremental path, and a check before planning. The current error also mixes two concerns: undo and understanding.

**Options**
1. Full import before every build (the team's proposal). It always works and is always fresh. But it costs minutes per build, and the snapshot stays coupled to the summary.
2. Decouple, then index only when stale:
   - The snapshot copies the files and never reads the atlas.
   - Before planning, compare the index's source hash with the current tree.
   - If it's missing, run the import once. If it's stale, re-index the changed files. If it's fresh, use it.
3. Build without a registry (plan from raw files). It's fast but plans blind. Rejected.

**Choice: option 2.**

**Testing it**
- Weakest assumption: re-indexing only the changed files gives the same registry as a full run. It can miss edges that cross files, such as a file whose imports didn't change while what it imports did.
  - Repair: also re-index everything that depends on the changed files, and run a periodic full rebuild that is diffed against the incremental result.
- Failure mode: the freshness hash misses changes made outside the system.
  - Repair: hash the working tree itself, not the system's own record of its writes.
- Failure mode: the first build on a new repo still waits minutes.
  - That's acceptable: it's paid once, said up front, and can run in the background at import time.

**What it rests on**
- Reversibility is a property of the files, not of the summary.
- The registry is generated from the files, so its correctness can be checked against a hash of them.

**What would prove it wrong**
- Incremental registries keep differing from full ones, so planning errors trace back to the shortcut. Then fall back to full indexing, but run it at the end of the previous build so it isn't paid at the start of the next one.
- The snapshot format truly needs atlas metadata to restore. Then the restore code should be fixed, not every build made to run the full import.
