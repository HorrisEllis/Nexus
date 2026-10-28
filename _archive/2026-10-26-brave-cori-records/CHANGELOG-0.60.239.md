# 0.60.239 — 2026-10-24

James: "spec compiler, ide, and idearium" · "we don't need to do anything that's not, more, like, redefining those boundaries, right? … I just
want to get this, just get to the point where COS becomes, like where we could get to the point where we could integrate COS"

His direction, recorded in the COS spine map: boundaries only until COS can be integrated. The genesis self-heal system, the COS distro and the
README split come after. The CB agent fixes are deferred too unless one blocks the boundary work.

## EW2 + EW3: the spec compiler is Idearium's

- **Moved whole** by `git mv` (history kept) to `idearium/spec-compiler/`: the compiler, `chunk/`, `cortex-query/`, its Idearium
  client, `version.js`, `SPEC_COMPILER.spec`, `verify.js` and its tests. Nothing else used any of them. emerge keeps the language and
  has its own package.json.
- **The kernel's one door: `lib/spec-compiler-port.js`.**
  - In the Idearium process, Idearium provides the compiler at boot.
  - From any other process, it posts to `POST /api/compiler/{compile,pipeline,t2}`.
  - The routes write only inside the tree or the temp folder.
  - The command is `compiler <compile|pipeline|t2> <spec>`.
  - If Idearium is down, it says so.
- **The four callers outside Idearium now use the port** (they used to require the compiler): `lib/build-pipeline.js`,
  `lib/spec-collect.js`, Guardian's `/build`, and copilot's module builder.
- `emerge/siso` counts as the language: it is the bus every compiled Emergence module requires.

## Proof

- **Real run:** a separate process reached a booted Idearium through the route, and Idearium compiled `SPEC_COMPILER.spec` into 26 files.
  `/etc/passwd` was refused.
- **Census:** emerge has 0 ways in. copilot, guardian and idearium each have one fewer way out. No new crossing.
- **Ratchet baseline:** 540 → 481. The 59 lines no longer in the tree are recorded in its closed list; most were closed earlier and never
  taken out.
- **Tests:** test-spec-compiler-port 4/4 (new); test-phase-specs 7/7, test-phase-specs-tag 7/7, test-substrate-spec 3/3,
  test-spec-pipeline 12/12, test-emerge-direct-compile and test-system-check-emerge-stale-entry (each still has one earlier failure:
  `_archive/2026-09-06-emerge-consumer-retired` is not in the tree). The compiler's own tests: 38 of 40; the 2 failures are earlier ones
  (one reads `/mnt/user-data/uploads/causal-nexus.spec`).

## Next

EW4: the Emerge IDE into Idearium.
