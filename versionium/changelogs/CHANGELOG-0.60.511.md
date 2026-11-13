# 0.60.511 — one primitive left that is not native, by Emerge's own count

James, 2026-11-13: "Like emerge should reduce friction between primitives.   It’s meant to be self aware." · told the six left on Emerge's
list were next, then process control: "Okay."

## Built
- `wrap_add`, `wrap_sub`, `wrap_mul` natively (`lang/native/rt.eg`): ints that wrap at 64 bits, where `+ - *` refuse. Anything but two
  ints is refused, in the interpreter's words.
- `ledger_proof(seq)` and `ledger_check_proof(proof)` natively: written in Emerge in the world (`lang/cie/world.eg` `proof`,
  `check_proof`, on `cie/ledger.eg`'s Merkle functions), reached by the lowering (`native/lower.eg`).

## Emerge, by its own count
122 primitives; 120 run interpreted and native; 1 only interpreted: `observe_gaps`.

## Proof
- One program (the wraps at both ends of 64 bits; 303 entries recorded, a proof of entry 2 under checkpoint 257, checked; a forged
  proof refused; an entry not there said): the same output interpreted and native. It is a case in `lang/test/native.test.js`.
- native.test 115/115; Emerge's suites 31, 14, 6; the compiler at a fixpoint (three builds byte-identical).
- `lang/cie/test/self.test.eg` 3/3, its ratchet lowered from 6 to 1.

## Not yet
- `observe_gaps`: it opens a gap for each proposal the observer makes, and its ledger entry must equal the interpreter's hash for hash.
  Left for its own slice.
- Process control (start, wait, stop): the next slice of CIE13.

## JavaScript, said
Two cases added to `native.test.js`. Nothing else.
