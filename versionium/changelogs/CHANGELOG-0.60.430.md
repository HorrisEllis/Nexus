# 0.60.430 — CIE14 (a): lenses frozen natively

James, 2026-11-06: "yes. get emerge complete. js removed completely."

- **`freeze(v)`** is a builtin in both backends. Natively it sets bit 256 of the kind word through the whole value. A write into a frozen value
  is refused with the interpreter's own message. The four places that read the kind word mask the bit.
- **`world.eg`'s lens** (`state_of`) returns a frozen copy. `examples/counter.eg` natively equals the interpreter line for line, the
  read-only lens error included.
- **The compiler is rebuilt.** Stages 0, 1 and 2 are byte-identical (9f2aa3db…). Native self-compile takes 0.84 s, against 15.2 s
  interpreted.
- **`lang/MAP.md`** is regenerated (`freeze/1`).
- **Placed:** the let-write refusal goes to CIE6 (the checker in Emerge), and stderr to CIE11. Newlines inside a map literal are his call.
- **Suites:** native 96/96, selfhost 16/16, lang 166/166, differential 19/19, ledger 21/21, contract 8/8.
- Metrics are in `docs/BENCHMARKS.md`.
