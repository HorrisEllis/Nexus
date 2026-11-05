# CHANGELOG 0.60.388 — EAS4 L0: evaluate's caller moved into Emerge, with no new crossing

James, 2026-11-05: "Primitive based coding?" · "Would also set expectations. One primitive per gate. Compounds, each layer."

James, 2026-11-05, on whether Emerge is a system in Nexus or a separate repository: "A."

## What was done
- `emerge/emerge/core/admit.js`, new: `admitFrom(constraints)` turns Emerge's constraints into `admit(link)` for WARP 2's
  `Engine({ admit })`. It is an L0 compound on `./constraint` (`evaluate`, the primitive), and its header states its expectation: what
  it takes, what it returns, and that a gap is never a pass. It is exported from `emerge/emerge/core/index.js`.
- `lib/warp/adapters/emerge-field.js` is archived in `lib/warp/adapters/_archive/`, with a README saying why (§0.3). Its one caller,
  `tests/modules/test-warp2.test.js`, now uses Emerge's core.
- WARP itself is unchanged. The engine still takes `admit` from its caller, and `warp/` requires nothing of Emerge. Dated notes were
  added to `lib/warp/spec/warp.spec` and to the comment in `lib/warp/core/Engine.js`.

## What was tried first, and refused
The coder's first plan, as told to him: add Emerge's `core/constraint.js` to `lib/system-boundary.js` PRIMITIVES, and have the lib adapter
require it. The boundary ratchet counted that require as a new upward edge (lib → emerge: the kernel depending on a system, §5.9), because
PRIMITIVES only names a blocker; it does not exempt an edge. The change was reverted before it was pushed. The adapter went instead to
the system it serves (§5.15).

## Proof
- `test-warp2` 7/7, `test-emerge-core` 6/6 and `test-emergence-and-warp-suites` 198/198 (the same before and after).
- `lib/system-boundary.js` census: 1120 crossings before and after (system 152, upward 250, kernel 718). `check()` adds no edge from
  this change.
- `test-system-boundary` is 8 passed / 2 failed both before and after. The two failures (SB-06, SB-08) come from
  `cos/manager/autopilot-door.js` edges that predate this release.

## Left (EAS4)
L1 compile, L2 build and L3 run become command nodes behind Emerge's door, each with its stated expectation. Then the six callers switch,
t2-gate's 52 lines that exist only in the lib copy are ported, phase-specs moves into Emerge, and lib/emerge is archived.

## The coder's drift, found and fixed in the same release
`test-substrate-spec` SS-02 had failed since the EAS_D5–D7 records (commits 7965c12e and 40c8bc29, 2026-11-05). The coder wrote those
decisions after `order:`, under a new top-level key. The phase reader took them as part of EAS5's body; their `chosen:` made EAS5 read as a
decision, so the test found no EAS5. They were moved, unchanged, into `decisions:`, and EAS5's .phase was written again. SS-02 passes
(3/3).
