# 0.60.428 — CIE4 slice b: compartments compile natively, as written

James, 2026-11-06: "the moment js is removed from emerge it becomes the replacement. focus on that first. no more js, we focus on .eg" · "next. how much more?"

## Built (docs/2026-11-06-cie-eg-build-phasemap.spec CIE4_native_components, slice b)
- `lang/native/front.eg` now parses three things it used to refuse: `compartment` (id, intent, state, hard and soft constraints, `on`,
  `fn`), a top-level `on`, and `emit`. It uses the JS parser's grammar for compartments. `component`, `template`, `emit out` and the others
  are still refused by name.
- `lang/native/lower.eg` rewrites them into calls to `lang/cie/world.eg`. It does the same for `Name.state`, `Name.fn()`, `spent()`,
  `ledger()` and `ledger_verify()`. This is the rewrite written by hand in 0.60.426.
- `lang/native/emerge.eg` carries `world.eg` and `ledger.eg` inside the compiler (`world_text.eg`, `ledger_text.eg`), the way it already
  carries the runtime and the prelude.
- `lang/native/bin/emerge` rebuilt: stages 0, 1 and 2 are byte-identical, sha256 7d094db6c48785aa….
- `lang/cie/world.eg` gains `verify()`.

## Proof
- native.test 'compartments natively, as written': `lang/test/world/counter_ledger.eg` compiled natively prints what the interpreter prints,
  9 ledger entries hash for hash. native.test 95/95.
- selfhost 16/16. That includes `front.eg` parsing every example the way the JS parser does.

## Found
- **Lenses aren't frozen natively.** A lens is a plain copy natively, not a frozen copy. `examples/counter.eg` differs in exactly one line:
  the read-only error the interpreter raises when a lens is written. The state itself is safe. Frozen values natively are the gap to close next.
- **The version is held twice.** The genesis entry names the build, so `native/emerge.eg` holds VERSION "1.13.0" beside `package.json`. The
  'world' cases fail if the two drift.
- **No unrouted notice natively.** A native program doesn't print the interpreter CLI's unrouted notice (stderr) yet.

- **Graphs couldn't see `.eg` files.** `lib/phase-files.js` had no `.eg` in its path pattern, so every Emerge file was invisible to every
  phase's graph. CIE4's graph had listed only `native.test.js`. `.eg` is added (one word, a fix to existing code). The five maps that name
  `.eg` files are regenerated. Graph drift across all maps stays at 603, all of it from before this release.

## Measured (docs/BENCHMARKS.md)
- Stage 0 (the interpreter running the compiler on itself) took 15.9 s of wall time.

## How much more (the coder's estimate, given when he asked; to be checked against the work)
About 20 sessions to no JavaScript in Emerge:
- CIE4 slice c: 1
- CIE5 (test blocks natively): 1
- CIE6 (the checker): 2
- CIE7 (observe and gaps): 1
- CIE8 (the spec compiler, 6,197 lines): 3–5
- CIE9 (the tests in .eg): 2–3
- CIE13 (processes, time, files): 2
- CIE10 (the door): 1–2
- CIE11 (retire the interpreter): 1–2
- CIE12 (Windows): 2–3

22,694 lines of JavaScript remain, against 9,099 lines of .eg, before this release.
