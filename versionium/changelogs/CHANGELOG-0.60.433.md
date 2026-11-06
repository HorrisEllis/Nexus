# 0.60.433 — CIE15 second slice: record, gap, promote and the seeded generator natively

James, 2026-11-06: "just keep going. how are the benchmarks so fatr?"

- **`world.eg`:**
  - the seeded generator (mulberry32, the interpreter's), with `random()` and `uid()`;
  - `record`, with the runtime's reserved kinds refused;
  - `gap`: its types and pressure checked, and `gap.opened` signalled;
  - `gaps()`;
  - `promote`: a false proof is refused and opens a logical gap.
- **`front.eg`** parses `record`, `gap` and `promote`. **`lower.eg`** lowers them. The world itself is never lowered.
- **`test/world/language.eg`:** the same random number, uids, gap ids and 7 ledger hashes natively.
- **`examples/idearium.eg`** natively equals the interpreter: 3 of 8 examples now.
- **Suites:** native 99/99, selfhost 16/16, lang 166/166, differential 19/19.
- **Still refused:** `axiom`, `matches`, `kind`, `test` blocks, `whatif`, `sort_by`.
