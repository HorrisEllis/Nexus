# 0.60.432 — CIE15 first slice: .., expect, upper and lower natively

James, 2026-11-06: "yes. get emerge complete. js removed completely."

- **`..` as a value** compiles to `range(a, b)`.
- **`expect cond[, msg]`** parses natively and runs as `rt_expect`, with the interpreter's three messages word for word.
- **`upper` and `lower`** are native builtins for ASCII text. Text outside ASCII is refused by name until the Unicode case tables land.
- **`test/world/language.eg`** natively equals `eg run`. native.test 99/99; selfhost 16/16, stages byte-identical.
- **Next refusals in the examples:**
  - `matches` (a regex engine to build in Emerge);
  - `promote`;
  - `sort_by` (needs optional parameters: his call);
  - `record`, `axiom`, `kind`, `whatif`.
