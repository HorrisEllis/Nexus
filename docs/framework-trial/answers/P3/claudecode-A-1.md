**Don't make every build run the full import. The real defect is that the snapshot depends on the atlas, and it shouldn't.**

**1. The snapshot needs the files, not a summary of them.**
A snapshot exists so a build can be undone. That only needs the repository's actual bytes at that moment. In practice that is one of these:
- a git commit on a hidden ref, or a `git stash create` SHA;
- a worktree copy;
- a tarball of tracked and untracked files, with a manifest of hashes.

None of these needs a generated description of the files. Gating rollback on the atlas puts an unrelated, slow and fallible step in front of the safety net. If the import fails, times out or has a bug, you get no snapshot and no build, even though the repo could have been copied in a second. So: take the snapshot straight from the working tree, always, as the first step, before anything writes. That includes the import pipeline itself, if it writes into the repo.

**2. The planner does need the registry, and it needs a current one.**
Here the team's instinct is partly right. A planner that reads the component registry shouldn't plan blind. But "the atlas exists" is the wrong test. A registry built last week exists and is wrong. The real requirement is freshness:
- Stamp the atlas and registry with the commit SHA, or a tree hash, they were built from.
- At build time, compare that stamp with the current tree.
- If they match, reuse the registry at no cost.
- If they differ, re-index only the changed files and their dependents. That is usually seconds, because most commits touch few files.
- If nothing was ever indexed, run the full import once. Say so in the run log ("first index, ~N min"), don't hide it.

This is the same pattern build tools use (Make, Bazel, incremental TypeScript): key the cache on content, rebuild only the delta.

**3. Why "always run the full import" is worse:**
- Minutes per phase, multiplied by every phase and every retry. Builds become slow enough that people start reaching for a skip flag.
- Every import failure becomes a build failure.
- It still doesn't fix the coupling. Rollback would still depend on indexing.
- It wastes compute re-deriving what hasn't changed.

**4. Ordering per build:**
1. Snapshot from the working tree. This step has no dependency on indexing.
2. Freshness check, then an incremental or full index.
3. Plan.
4. Apply.
5. Verify. On failure, restore from step 1.

If indexing fails, refuse to plan, with a clear reason. The snapshot is already safe, and nothing has changed.

**Recommendation:** Decouple the snapshot from the atlas: snapshot from git or the filesystem, unconditionally. Make indexing a separate, cached precondition of the planner only. Key it on the tree hash, update it incrementally, and run the full import only on first use or when the hash can't be trusted.

**Main reasons:**
- Reversibility should never depend on a slow, fallible derived artifact.
- What the planner needs is a fresh registry, not just an existing one.
- Incremental indexing gives that freshness at a fraction of the cost.

**Risks and uncertainties:**
- **Incremental indexing can miss cross-file effects.** Examples: a renamed export, or changed config that alters how modules resolve. Invalidate dependents through the registry's own edges, and force a full re-index periodically or when config files change.
- **Large binaries or untracked files** can make a filesystem snapshot heavy. Decide explicitly what the snapshot covers, and report anything it excludes.
- **The atlas may hold metadata the snapshot was secretly relying on**, such as an ignore list or which files belong to the project. Check what the snapshot code actually reads from it before you cut the dependency.
