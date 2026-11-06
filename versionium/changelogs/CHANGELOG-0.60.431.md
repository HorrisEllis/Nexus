# 0.60.431 — CIE4 built: components, hooks, wires and the contract natively

James, 2026-11-06: "yes. get emerge complete. js removed completely."

## Built (docs/2026-11-06-cie-eg-build-phasemap.spec CIE4_native_components, slice c; CIE4 now BUILT)
- **`lang/cie/world.eg`:**
  - components: the register entry and the derived uuid;
  - in and out hooks with shapes, checked at `send`, at `emit out` and on delivery;
  - wires (out → in, and signal → hook);
  - the contract: normalised and hashed by `contract.eg`. Its `gate.max_steps` and `checkpoint_every` are honoured, its hash goes in genesis
    and every checkpoint, and its roads are wired after the later of the contract and the last compartment;
  - `components()` and `Name.version` / `.hooks` / … .
- **`lang/native/front.eg`** parses `component`, `contract`, in and out hooks, shapes, `boundary`, `send`, `wire` and `emit out`.
  **`lower.eg`** lowers them. The compiler carries `contract.eg`.
- **`lang/cie/contract.eg`** sorts roads with the prelude's `sort` and writes its canonical form with `ledger.eg`'s `ecf`, since `sort_by` and
  `json` aren't native. One writer of the canonical form, and the hash is unchanged.

## Proof
- native.test 98/98:
  - `test/world/components.eg` natively equals the interpreter, 10 ledger entries hash for hash;
  - `examples/components.eg` equals it line for line.
- selfhost 16/16, stages byte-identical (72df0919…). lang 166/166, differential 19/19, ledger 21/21, contract 8/8.

## Census and next
- 2 of 8 examples equal natively. The other six are refused by name: `..`, `expect`, `record`, `axiom`, `kind`, `whatif`.
- CIE15 is written for them.
- JavaScript removed so far: 0. Emerge's JS is 22,736 lines (+42, all test cases and one `def`); `.eg` is 10,006 (+907). The JS falls at
  CIE11.

Metrics in `docs/BENCHMARKS.md`. That includes the coder's stale-main mistake on the way, recovered with nothing lost.
