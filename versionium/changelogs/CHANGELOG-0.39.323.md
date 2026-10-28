# 0.39.323 — 2026-10-05

James: "still i want to make warp mine" · "no. i want warp 2" · "next"

EM2 is partly done (emerge map 1.7.18). WARP is now 2.0.0; `warp/CHANGELOG.md` has the detail.

- `warp/core`:
  - **Link:** cause → effect, with its field values. Every link has its cause, or is a root that says so and why.
  - **Expectation:** "this must cause that within N ticks", declared first. Fulfilled through any number of middle links, or broken; a broken one is a gap naming both ends.
  - **Ledger:** causal, hash-chained. A link's parent is recorded when it is known.
  - **Engine:** WARP's Axioms, then the constraints, before a link is real. A handler's emits are caused by the link it was handed.
- `warp/adapters/siso-gates.js`: a 1.x Stream runs unchanged and records into a WARP 2 ledger. An event emitted inside a gate is caused by the gate's input; one from outside any gate is a root marked "cause unknown (WARP 1.x)".
- `warp/adapters/emerge-field.js`: Emerge's constraints come first. It sits outside `warp/core`, because core imports nothing outside `warp/`.
- `tests/modules/test-warp2.test.js` 6/6 (registered). WARP 1.x 43/43 and Emergence 155/155 are unchanged, and every WARP consumer test re-run passes.
- Open:
  - 1.x's Event/Gate/Stream/StreamLog are still in `warp/core`;
  - Nexus's consumers run on 1.x directly, not yet through the adapter. They move one by one.
- `tests/kernel.test.js` 101/102: the one failure (`emerge/io` absent) was there before this change.
- Loom: 7 new components, nothing lost, unresolved declarations unchanged at 116.
