# 0.60.236 — 2026-10-24 — RF2 batch 1: ten folders moved into the systems that use them

James, 2026-10-24: "yes start rf2, security goes with remote desktop" · "need the systems soveriegn".

## The mover (`lib/architecture-apply.js`)
One move at a time, in four steps:
1. **plan** every tracked file of the folder, and rewrite **only what it can prove** points at it:
   - relative `require`/`import` paths;
   - static `path.join`/`resolve` calls;
   - string literals that are real repo paths;
   - a `.spec`'s contract fields (`path:`, `files:`…).

   History is never touched (docs prose, CHANGELOGs). Bare-name mentions are listed, not rewritten.
2. **apply**: `git mv`, so each file keeps its history. The ratchet baseline's file names are renamed in place.
3. **check**: every touched `.js` parses, every rewritten path resolves, and the boundary ratchet has no new crossing.
4. **keep** the move as one commit, or roll it back. `git revert` undoes any move.

## Applied
| folder | to | why |
|---|---|---|
| `jaa/`, `seams/` | `_archive/2026-10-24-retired-systems/` | nothing uses them (his axioms, §0.3: archived, not deleted) |
| `service/` | split: `guardian/guardian-service.js`, `cortex/cortex-service.js`, `idearium/idearium-service.js` | **not dead**: each file is a hand-run launcher for one system, so each went into its system |
| `auth/` | `orchestrator/auth/` | only orchestrator uses it |
| `mesh/` | `guardian/mesh/` | only guardian uses it |
| `architecture-spec/` | `idearium/architecture-spec/` | only idearium uses it |
| `erosmancer/` | `clear-glass/erosmancer/` | clear-glass starts it. The npm workspace and 4 lockfile keys were renamed, identical to npm's own regeneration |
| `security/`, `remote-desktop/`, `tablet/` | `cos/` | **his decision**: COS's front end |

The sovereignty census now counts **27** systems, down from 36.

## Found and fixed on the way
- **The mover skipped files inside a moved folder that never name it.** `remote-desktop/signal.js`'s `require('../lib/nano-ws.js')` was
  caught by the check, and the move was rolled back. The fix: a file inside the folder is always read. Every earlier move was then
  audited: 127 moved files, 196 static paths, none pointing anywhere new.
- **A `.spec`'s `path:` fields are live.** The architecture spec's 10 fields now name the new place, with a dated addendum.
- **The atlases follow.** Their generated halves were regenerated, and their hand-written folder trees were updated with a dated note.
  Atlas refs pass 49/49 (`main` had failures).

## Proof
- Every test that references a moved folder was run against clean `main`. Each result matches `main`, except two that improved:
  `test-genesis-and-architecture-spec` 7/7 and atlas refs 49/49.
- The ratchet has no new crossing.
- Phase files: 0 drift.

## Next
The 12 folders that go into `lib/`: `cockpit`, `contracts`, `hooks`, `meta`, `sentinel`, `siso`, `ui`, `emerge`, `emergence`, `warp`,
`nexus` and `cli`.
