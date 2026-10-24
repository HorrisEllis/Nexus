# 0.60.241 — 2026-10-24 — RF2 batch 2: every folder is inside one of the 15 systems

James, 2026-10-24: "need the systems soveriegn" · "15 systems. the rest of the folders need to migrate."

His rule, 2026-10-05: "There is only 15 systems. Not 27."

## Moved into core (`lib/`)
`siso`, `cockpit`, `sentinel`, `meta`, `hooks`, `contracts`, `ui`, `warp`, `emergence`, `emerge`, `nexus`, `cli`. Each move was one
commit, checked (every touched file parses, every rewritten path resolves, no new crossing in the ratchet), and kept or rolled back.

**Every top-level folder is now inside one of his 15 systems.** The sovereignty census counts 14: the 15, with core as the kernel.
It counted 36 before RF2.

## Found and fixed on the way, each by a check
1. **The check blamed `emerge` for text that isn't a require.** `tests/nexus-full-audit.js` contains `"require('./pipeline')"`
   inside an `.includes()`, and it was already there on `main`. The check now blames a move only for a path that move moved, or
   rewrote in that same file.
2. **A ROOT-relative path inside a moved folder must still move.** The audit found `lib/cli/boot-systems.js`'s `DIAG`, the only one
   across 424 moved files.
3. **Guardian served `/ui/*` by joining the URL onto the repo root.** After `ui/` moved, every guardian UI asset would have returned
   404. It now joins `lib/`, and the URL stays `/ui/`. No static check could see this: the path is built from the request.
4. **Loom's `ui-map` read `/ui/home/*` links as repo paths.** The file is now `lib/ui/home/*`, and the URL stays.
5. **The refactor tool's own test fixtures had been rewritten** as if they were Nexus paths. They are restored.

Also updated:
- `docs/CLAUDE.md` names `lib/emerge/compiler/`.
- Loom was bootstrapped fresh.
- The atlases were regenerated and their hand-written paths updated (refs 49/49).
- The migration map's phases are marked DONE, kept as the record.

## Found by the full suite after batch 2, each fixed at its cause
6. **COS runs installed releases of any version.** An old release has `nexus/autopilot.js` and `cli/nexus.js`. A new one has
   `lib/nexus/autopilot.js` and `lib/cli/nexus.js`. `cos/app/runtime.js` (`entryOf`) and `cos/app/shell.js` take the first of the
   two that exists, so both still start.
7. **Some code builds a folder from a system's name** (`<name>/spec/...`). `lib/nexus-self/systems.js` gains `dirOf(name)` and
   `MOVED`. The callers use it: route-contract-check, vector-memory, precommit-check and the registration-shape test.
8. **Loom ids follow paths, so `nexus.auth` is now `nexus.orchestrator.auth`.** `movedId(id)` maps an id saved before the move to
   its id now. Architect's `lookup` follows it, so a stored `reuse` ref still finds its component (AR-02/03 prove it).
9. **The mover misread a bare `dir/` string as a folder path.** Each case is restored:
   - the git-branch prefix `nexus/` (cos/workspace, idearium/api);
   - the history root label;
   - `hooks/` in lib/repo-history.js. That one names *git* hooks, so it is a security skip; it now has a comment saying so.
   The mover itself now never rewrites a bare `dir/` literal.
10. **`lib/system-boundary.js` PRIMITIVES are regexes.** The mover does not rewrite regex source. Batch 2 had silently reclassified
    nexus-bus, warp core, siso, warp index and hooks as capabilities. Each pattern now matches with or without `lib/` (SV-08).
11. **Source-text tests** that read a require path were updated to the new paths. Tests whose fixtures had been rewritten were
    restored. `require.resolve` and stub strings were caught by a repair pass: 10 fixed, 2 bad rewrites reverted.
12. **`sentinel` is part of the kernel now**, not a system of its own. SV-08 names `components` as its sovereign example.

## Proof
- **Audit over every move since `main`:** 424 files, 525 static paths, **0** pointing anywhere new.
- Loom and registry tests match `main` (12 files). The refactor tool's tests pass AM 5/5.
- Full suite: see the PR.

## Still to say
- **Sovereign is not the same as moved.** Of the 14 systems, 2 have no crossing into another system. Closing the rest is the
  drawbridge work (DB6: crossings move to routes, one pair at a time).
- **Loom's bootstrap rejects wires carried over from its earlier registry.** They name components by ids from before the moves, for
  files that no longer exist. Loom's tests match `main`. The pruning of such wires is a separate fix.
