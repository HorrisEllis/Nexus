# sort.eg, archived 2026-11-07 (a duplicate, reported)

`lang/cie/sort.eg` (0.60.438) gave the native compiler `sort_by` while Emerge had no optional parameters: lower.eg rewrote `sort_by(xs, f[, dir])`
to it with "asc" filled in. On 2026-11-07 James chose optional parameters ("I feel optional parameter's is always good."); `sort_by` moved into
`lang/core/prelude.eg` as `fn sort_by(xs, f, dir = "asc")`, written in Emerge for both backends, and the interpreter's JavaScript `sort_by` was
deleted. This file then did the same job twice, so it is kept here (§0.3), not in the running code. `native/sort_text.eg` was its embedded copy.
