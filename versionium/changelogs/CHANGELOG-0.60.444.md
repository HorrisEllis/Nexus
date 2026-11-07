# 0.60.444 — CIE8 slice a: the spec compiler stops reaching into Emerge

James, 2026-11-07: "yeah move it, until we have something to slot in the gap it will leave. then we could even invent something ground up,
thats another point of emerge. build towards a world a bit more me." · then: "as long as its removed from emerge."

The decision is his (CIE_D7): the spec compiler leaves Emerge for Idearium, until Emerge has something of its own to fill the gap. The cut into
slices and the code are the coder's.

## Built (docs/2026-11-06-cie-eg-build-phasemap.spec CIE8, slice a)
- `emerge/emerge/compiler/emerge-check.js`: the compiler asks Emerge whether Emerge source compiles through Emerge's command line
  (`cli.js lang-check --source`), never its code. It reaches Emerge the same way `idearium/lib/emerge-rung.cjs` already does.
  - It finds Emerge through `$EMERGE_CLI`, else beside itself, else by walking up.
  - It caches each answer.
  - It strips the `file:line:col: error:` prefix, so the messages match the old in-process check word for word.
- `emit-emerge.js` and `t2-gate.js` no longer require `../lang`. Nothing in `compiler/` requires Emerge's language now.

## Found
- The map named a cycle between `chunk/` and the compiler. It was only a comment: `chunk/index.js` never requires `compiler/`. So `chunk/` is
  simply part of the compiler's family, and it moves with it.
- The first cut detected Emerge's command line by searching `cli.js` for the text `lang-check`. Emerge registers its commands as nodes, so
  nothing was found, and the compiler fell back to emitting unchecked code. 5 tests failed. Fixed before merge by detecting the files
  (`cli.js` with `lib/lang.js`).

## Cost, said before it is paid again
- `build-spec.test` went from 0.7 s to 27 s, and `target.test` from 0.1 s to 7 s: 74 checks at about 95 ms each. Each check boots Emerge, then
  starts `lang-check`.
- Slice b removes most of it:
  - Emerge's running door over HTTP, with no boot per check;
  - the builtin probes batched into one program, since the checker reports every error with its line.

## Proof
- `test/target.test.js` 11/11 and `test/build-spec.test.js` 18/18, the same as before the change.
- Emerge's npm test and `test:system` are green; lang 166, native 109, selfhost 16.
- Four probes compared, the old check against the new, with the same answers.

## What is left (slice b)
- `../siso`, `../version`, and Emerge's own users of the compiler: `lib/compiler.js` (the door's `/compiler/*`), `verify.js`, `build-spec.js`,
  `events-compiler.js` and the compiler's tests.
- Then the move itself.
