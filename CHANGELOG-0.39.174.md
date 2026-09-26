# NEXUS 0.39.174 — MCO3 repo snapshots (§33), plus two bugs found wiring them

Merged onto 0.39.173. Spec: `idearium/spec/idearium.repo-snapshot.spec`
(written first, §8.5).

## MCO3 — done
`idearium/repo/snapshot.js` records source hash, git commit, atlas / chunk
index / graph versions, dependency state, environment, test state and
verification state, and commits it to versionium under system
`idearium.repo` (branch `repo-<uuid>`).

- `POST /api/repos/:uuid/snapshot`, `GET /api/repos/:uuid/snapshots`,
  `GET /api/repos/:uuid/snapshots/:commitId`.
- Unknown is never zero: all nine keys are always present, and one that
  cannot be determined says `available:false` with a reason.
- atlas.json and chunks/index.json declare no version, so their identity is
  the file hash (`declaredVersion:null`). graph.json's declared version is
  recorded.
- `sourceHash` is re-derived from disk, so `fresh:false` says the indexes
  describe older source.
- `gitCommit` needs a `.git` inside the repo dir; git is never allowed to
  walk up into NEXUS's own repository.
- Gate: one real commit, read back through versionium `getState()`, carries
  all nine keys. `tests/modules/test-mco3-repo-snapshot.js` 38/38. Also run
  over real HTTP against a booted versionium (a copy of the tree).
- The phasemap assumed an existing repo-scoped commit to extend. None
  existed (idea snapshots commit ideas/specs/gaps), so this adds one on the
  unchanged `engine.commit()`.
- Not done: MCO-B (per-file snapshot/delta) is still NOT STARTED, so a repo
  snapshot cannot restore files. No UI yet. The repo's own runtime is
  owned by its Compartment and is recorded as null.

## Bugs found and fixed
1. `idearium/index.js` `commitSnapshot`, `restoreSnapshot` and
   `diffSnapshots` called system `cortex`, which answers every
   `/api/versionium/*` with 410 since versionium became sovereign. Idea
   snapshot push/restore/diff could not work. Repointed at `versionium`.
   Push confirmed over real HTTP.
2. Repo snapshots under system `idearium` would have appeared in the idea
   snapshot list and restoring one would blank ideas/specs/gaps. They use
   their own system, and `restoreSnapshot` refuses a repo-snapshot state
   before stashing or mutating anything.
3. `RepoLayer.materialize()`'s PRESERVE list predated `graph.json` (MCO1),
   `verification.lazy.json` (MCO2) and `.nexus-ci.json` / `.nexus-ci-runs`
   (CI), so every materialize deleted them. Added. The test derives the
   list from a real pipeline run, so the next artifact a phase adds fails
   it; it fails on the unfixed code.

## Housekeeping
- MCO2 phasemap status corrected to DONE (test re-run 18/18).
  `test-mco2-verify-deepening.js` and `test-mco3-repo-snapshot.js` are now
  registered in `tests/modules/run-all.js`.
- `lib/version.js` `services.eravos` 3.0.0 -> 3.17.0 to match
  `eravos/spec/eravos.spec` (172's catalog swap); precommit §5.4 was
  blocking on it at 173. Judgment call, verified only as far as
  `eravos/server.js` reading that value as its VERSION. Revert if
  the spec is the wrong side.
- `package-lock.json` version synced to 0.39.174 (it still read 0.39.172 at
  173; the bump script only updates package.json).

## Verification
Run here: test-mco3-repo-snapshot 38/38, test-mco2-verify-deepening 18/18,
test-repo-graph 53/53, test-loom-phasemap-status 12/12, precommit-check.
Not run: the full `run-all.js`.
