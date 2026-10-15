# 0.60.67 — 2026-10-15

James: "Next." — WB0 and SF4 of the pipeline he asked for: "make sure all builds use warp" · "need the agents to use the spec compiler? like the yaml."

## WB0: which builds go through WARP, measured (`lib/build-paths.js`, CK-255)

The census reads the build code, finds every agent call (`RA.dispatch`, `dispatchToNcpAgent`, `buildChunkWithAgent`,
`warpFn`), and names the function or route it sits in.

| Build path | WARP |
|---|---|
| spec-chunk build | yes (direct only when WARP cannot load) |
| codegen plan, new-spec plan, expand | yes |
| phase build (2 call sites) | **no** |
| proof repair | **no** |
| draft review | **no** |
| RAID worker brick | **no** |
| officiator synthesis | **no** |

- The Agent tab chat and the rejection notice are named as not builds.
- An agent call nobody classified fails the census, so a new build path cannot hide.
- **CK-255** runs it: it's in the check catalogue, so it has its route, `checks run CK-255`, and Settings → Checks.
  It is red today and stays red until WB1/WB2.
- **Found by its first run**: two units I had named from memory (`repo.plan.draft`) were really `speceng.codegen` and
  `speceng.create`. That's why the list is measured, not typed.

## SF4: a collected spec compiled

- `lib/spec-collect.js compileToProposals` runs the spec compiler's T0/T1 (zero tokens) in a temp folder. Each file it
  emits becomes a **proposed** `.inject`, reviewed like any other. A file the repo already has is skipped and named.
- **On request**: `POST /api/repos/:uuid/specs/compile`, `repo compile-spec <repo> <path.spec> [--into folder]`, and a
  "compile" button on a collected spec in the Agent tab.
- **At once**: setting `specs.compile_on_collect`, off by default, because a scaffold landing in a repo unasked is a
  big change. `specs.compile_into` picks the folder.
- **Measured**: on the test spec the compiler's T0 emitted the 9-file tree and T1 emitted nothing. Not investigated here.

## Found and fixed while shipping (my own regression)

The addenda I had been appending to specs since 0.60.63 were plain text. In a spec that is YAML, an addendum has to be
a `#` comment. Six specs that parse on main no longer parsed:
- `cos/spec/check-catalogue.spec` — the check catalogue itself stopped loading (test-check-catalogue went red);
- `docs/spec-compiler.spec`, `docs/warp.spec`;
- `idearium/spec/idearium.spec`, `idearium.repo-roadmap.spec`, `nexus-repository-system.spec`.

Fixed: exactly the lines I added are now `#` comments, and all six parse again. BP-05 now checks those six, so this
can't recur silently. `loom.spec`, `copilot.spec` and the phasemaps were never YAML, so they're unchanged.

## Proof

- `tests/modules/test-build-paths.test.js` 4/4:
  - BP-01 Nexus's WARP / not-WARP split;
  - BP-02 nothing unclassified;
  - BP-03 a planted new build path is caught as unknown;
  - BP-04 CK-255 red from the catalogue, every item with file and line.
- BP-05: the six specs parse as YAML.
- `test-check-catalogue` 7/7 (its pinned count and runner list now include CK-255).
- `test-spec-pipeline` 10/10:
  - SP-08 proposals only, an existing package.json not overwritten;
  - SP-09 the route, and a phasemap refused;
  - SP-10 compile-on-collect, off by default.

## Waiting on James

WB1, how WARP sits on the build path: wrap each build's agent call (cache → axiom gate → keep what passes) while the
ladder and RAID still choose who answers, which is the coder's recommendation; or let WARP's cascade pick the agent.
