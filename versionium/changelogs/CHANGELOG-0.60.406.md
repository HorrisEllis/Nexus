# CHANGELOG 0.60.406 — EAS4 L1: the spec compiler through Emerge's door

> Renumbered from 0.60.389 on merge (2026-11-05): main took 0.60.388–0.60.404 for other work built in parallel. Main's 0.60.389 keeps its own changelog.

James, 2026-11-05: "One primitive per gate. Compounds, each layer."

James, 2026-11-05, asked whether to take up the small-model benchmark now or after EAS4: "After EAS4".

## Checked before the switch
A caller whose answer changes is stopped, and the difference is named (MOD-EAS-CALLERS). The lib/emerge copy and the emerge/ copy of
`compile()` were run on three specs: SPEC_COMPILER.spec, substrate.spec and belief-loop.spec (50, 78 and 70 files, T1, skipCortex). They
differ in one line only: the compiler's version stamp in `src/index.ts` and `src/types/index.ts` (v1.1.0 from lib/emerge, v1.13.0 from
emerge/).

## Built (in Emerge, through its door)
- `emerge/emerge/lib/compiler.js`: component `emerge.compiler`. The spec comes in as text, and the emitted files go back as text,
  because a caller in another system shares no folder with Emerge. Each call works in a fresh folder, on the local host: no Cortex
  ("Emerge depends on nothing above it", his, 2026-10-28).
- Its nodes: capability `emerge.compiler.spec`; command `emerge.compiler.compile`, with its expectation stated in the node (`expects:`
  in, out, fails); route `POST /compiler/compile`; event `emerge.compiler.compiled`. Its entry is in Emerge's own registry.
- `emerge/emerge/tests/compiler-door.test.js`: CD-01 to CD-04. CD-02 checks that the door returns, byte for byte, the files `compile()`
  writes on disk.

## Callers
- **Moved:** `lib/spec-collect.js`'s compiler template now posts to Emerge's door (`lib/nexus-client.js`, :4900). If Emerge is down, the
  template says so and proposes nothing (SP-08d). SP-08b starts Emerge on :4900 when nothing serves the port, as COS would.
- **Stopped, its difference named:** `idearium/compiler-bridge.js`. By default it runs Cortex's preflight and writeback inside
  lib/emerge's compile, and Emerge's compile has no Cortex, so moving it would change its answer. The coder's reading, by §5.15 and his
  2026-10-28 rule: Idearium calls Cortex itself around the door. That is to be done as its own step, with the difference shown first.

## Also
- The CLI and agents reach it: route `POST /api/emerge-system/compile` (Idearium, to Emerge's door) and the command row `emerge.compile`
  (`emerge compile <file.spec> [--tier 0|1]`). There is no screen for it yet; the UI is deferred, said here (order of delivery).

## Proof
- Emerge: compiler-door 4/4, lang-door 8/8, nesting 5/5, skeleton green.
- `test-spec-pipeline` 13/13.
- Census: 1120 crossings, unchanged.
- Emerge's lock taken again: 352 files.
