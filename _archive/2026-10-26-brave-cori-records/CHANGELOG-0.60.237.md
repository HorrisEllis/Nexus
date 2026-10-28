# 0.60.237 — 2026-10-24

James: "okay warp and emerge. / spec compiler, ide, and idearium"

He had asked "emerge, warp, and idearium merge?". The coder counted who requires what: warp is used by nine systems, and emerge never uses
warp. Inside Idearium, all nine would depend on the system at the top, so the coder advised against the three-way merge. He chose warp and
emerge as one system, with the spec compiler and the IDE going to Idearium. Map: `docs/2026-10-24-emerge-warp-system-phasemap.spec`.

## EW1: emerge is a system, with warp folded into it

- `lib/nexus-self/systems.js` gains `emerge` (dirs emerge, warp), the 16th system. Core gives up its `emerge` tag.
- `lib/system-boundary.js`: FOLDED warp → emerge, superseding 0.60.236's warp → kernel (kept).
- **The language is not a crossing.** This was decided by his axioms (§5.9, §0.0, §1.2). A use of the runtime surface is kind `language`:
  `warp/core`, `warp/dispatch`, `warp/plugins`, `warp/index.js` and `emerge/core`. It is not ratcheted and does not block sovereignty.
  warp's own README: "Nothing in `core/`, `dispatch/`, or `plugins/` imports anything outside this folder."
- **Proof:**
  - components, ollama and cos stay sovereign;
  - emerge has 4 ways out and 5 ways in;
  - the ratchet adds no crossing (its three are the pre-existing SB-06 ones).
- The README lists the 4,195 phase nodes per map folder, not one line each.

## Found, not fixed

- `emerge/core/history.js` and `level.js` require `intelligence/rfr2`, so the core is not yet zero-dependency.
- Regenerated, the README would be 585 KB, over GitHub's 512 KiB, from the growth of "Every release" and "Every phase". The committed
  README is left as it is (493 KB), and RG-02 stays red until the inventory is split.
- The phase graphs were written after EW1's code, not before.

## Next

EW2: the compiler's four callers outside Idearium (lib/build-pipeline.js, lib/spec-collect.js, guardian/server.js, copilot/module-builder.js)
are designed out before EW3 moves it.
