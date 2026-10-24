# 0.60.237 — 2026-10-24 — RF2 batch 2: every folder is inside one of the 15 systems

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

## Proof
- **Audit over every move since `main`:** 424 files, 525 static paths, **0** pointing anywhere new.
- Loom and registry tests match `main` (12 files). The refactor tool's tests pass AM 5/5.
- Full suite: see the PR.

## Still to say
- **Sovereign is not the same as moved.** Of the 14 systems, 2 have no crossing into another system. Closing the rest is the
  drawbridge work (DB6: crossings move to routes, one pair at a time).
- **Loom's bootstrap rejects wires carried over from its earlier registry.** They name components by ids from before the moves, for
  files that no longer exist. Loom's tests match `main`. The pruning of such wires is a separate fix.
