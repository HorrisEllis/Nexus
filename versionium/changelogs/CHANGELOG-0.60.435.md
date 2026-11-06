# 0.60.435 — CIE15 fourth slice: whatif natively

James, 2026-11-06: "just keep going."

- **`whatif { … }`** runs natively. The world is snapshotted, the branch runs, and everything is put back, including the generator, the
  ledger, and the state after an error. One `whatif` entry is kept, and the block's last expression is its value.
- **Result:** `examples/whatif.eg` natively equals the interpreter. In `language.eg` the branch's draw is the world's next draw, and the
  entry matches hash for hash.
- **Census:** 5 of 9 examples. A correction: earlier releases said "of 8", but the census has always counted 9.
- **Suites:** native 100/100, selfhost 16/16, lang 166/166, differential 19/19.
- **Still refused:** `matches`, `kind`, `test` blocks, `sort_by`.
