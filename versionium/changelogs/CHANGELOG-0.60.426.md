# 0.60.426 — CIE4 slice a: the world in Emerge, hash for hash

James, 2026-11-06: "actaully keep remove js from emerge." · "lets code what we can using emerge, that way we can have a good test. maybe
everything from this point should be emerge?" Whether everything from here on is Emerge is his to confirm; it is not recorded as a rule yet.

## Built (docs/2026-11-06-cie-eg-build-phasemap.spec CIE4_native_components, slice a; cie-eg.spec MOD-NATIVE-SYSTEM)
- `emerge/emerge/lang/cie/world.eg`: the interpreter's world, written in Emerge. The native compiler already accepts every construct it uses.
  - compartments with state;
  - hard and soft constraints (soft ones add to spent);
  - signals, delivered first in, first out. A handler's signals are held until it commits, and dropped if a constraint rejects it;
  - patterns ending in `*`, unrouted signals, and the storm limit;
  - the genesis entry with its chain id, and checkpoints. The ledger is written through `lang/cie/ledger.eg`.
- `lang/test/world/counter.eg` (the reference, run by `lang/runtime.js`) and `counter.world.eg` (the same program on `world.eg`).
- native.test 'world': all three runs give the same output and the same 10 ledger entries, hash for hash: the interpreter on the reference,
  `world.eg` interpreted, and `world.eg` compiled native. native.test 94/94.

## Found
- The native compiler lets a map change through a `let` or a parameter. The interpreter's checker refuses that. Native is laxer, and that
  gap is to close.
- Newlines inside a `{ … }` map literal are treated as spaces, so a multi-line lambda written inside one runs its lines together. The
  lowering (slice b) has to lift handlers out to top-level `let`s.
- `compartment`, `on`, `emit` and `state` are keywords, so `world.eg` names its functions `declare`, `listen`, `signal` and `state_of`.

## Fixed, mine
- OC12 (#270) named no `spec:` or `blocks:`, which failed test-substrate-spec SS-02 on main. It now names both; 3/3.
- #273 changed phase graphs under `emerge/` without retaking Emerge's lock. The lock is retaken in this release.

## Next
- Slice b: the native front end turns `compartment` / `on` / `emit` into `world.eg` calls, so `counter.eg` compiles as written.
- Slice c: components, hooks, wires, the contract block and the gate.
