# NEXUS 0.39.275: the dependency graph reads what the specs say

**Date:** 2026-09-28 · base: 0.39.274 · idearium 4.9.0 → 4.9.1 · loom 1.5.0 → 1.5.1

Two dependency edges written in the 2026-09-28 phasemaps were not being read:

- `staging-self-heal` S4 wrote `depends_on: [S3, C1]  # why`. The reader took the last item as `C1] # why`, so the edge to C1 was lost and S4 could show as ready while C1 was still open.
- `graph-build-context-settings-memory` B1 wrote `depends_on: [B0, staging S0]`, a phase in another spec. Nothing resolved it, so it became an `unresolved_dependency` that ordered and blocked nothing.

## What changed

**`loom/scanners/phasemap-map.js` — `_list()`**
- A flow list ends at its own `]`. What follows is a YAML comment, not another item.
- A block or bare list has no `]`, so only a ` # …` tail is cut there.

**`idearium/repo/roadmap.js` — `buildRoadmap`**
- A dependency written `<map words> <phase>` is resolved in a second pass, after every map is read and before layering.
- It resolves only when the words name exactly one *other* map and that map has exactly one phase with that id or key.
- The dependent map can be listed before the map it waits on.
- A bare key is never looked up across maps: two phasemaps written the same day reuse C0, C1, L1, A1 and X1.
- Anything less exact stays an `unresolved_dependency`, as before.
- A resolved edge feeds ordering, layers, `blocked_by` and `ready` like any other.

## Tests

`tests/modules/test-moce-roadmap.js` 39 → 43 (DG-1..DG-4):
- DG-1: a `# comment` after a flow list keeps both edges, through loom's parser and through the roadmap.
- DG-2: `staging S0` resolves and orders the dependency first.
- DG-3: a bare key stays in its own map, and an ambiguous (`phasemap C1`) or unknown (`staging C9`) qualifier stays unresolved.
- DG-4: the two real 2026-09-28 specs in `docs/`: B1 waits on staging S0, and S4 waits on C1.

## Records

- **Version:** `package.json` and `lib/version.js` (system 0.39.275, `services.idearium` 4.9.1, `services.loom` 1.5.1). Loom's other sync points moved with it: `loom/registry-components.js`, `loom/interaction-contract.json`, `loom/spec/loom.spec` (meta.version and version_history).
- **Specs:** dated addenda in `loom/spec/loom.spec` and `idearium/spec/idearium.repo-roadmap.spec`.
- **Atlases:** `docs/atlases/idearium-atlas.md` (the roadmap's three ways of reading a dependency) and `docs/atlases/loom-atlas.md` (`phasemap-map`'s internals were "not read"; now described, plus the 1.5.1 history row).
- **No new route, component or spec**, so no registry, contract-route or SPEC-REGISTRY change.

## Noted, not changed

- The fix arrived tagged `§0.39.274`, which this tree already uses for the Clear Glass co-pilot change. The tags in `roadmap.js` and `test-moce-roadmap.js` now read `§0.39.275`.
- Drift found before this bump and left as it was: `idearium/package.json`, `idearium/index.js` and `idearium/spec/idearium.spec` still say 4.7.0 while `lib/version.js` says 4.9.x, and `tests/modules/version-sync-and-registry.test.js` pins 4.7.0. Clear Glass (3.17.0 pinned) and guardian (spec/registry 3.14.0 vs 3.15.0) drift the same way. `package-lock.json` reads 0.39.263.
- `loom/spec/loom.spec` does not parse as YAML (line 37, `- method: GET  path: /api/hooks`). It did not before this change either.
