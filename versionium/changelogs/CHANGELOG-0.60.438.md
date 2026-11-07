# 0.60.438 — CIE15 built: every example natively

James, 2026-11-06: "continue" · "Please continue from where you left off."

- **`lang/cie/regex.eg`:** a regex engine in Emerge, with JavaScript's u-flag grammar. 92 cases judged by JavaScript's own RegExp: equal,
  interpreted and native. `text matches pattern` compiles to it in every program.
- **`lang/cie/sort.eg`:** `sort_by` in Emerge, stable in both directions, with the interpreter's errors. `sort_by(xs, f[, dir])` compiles to it,
  so native needs no optional parameters. Whether to add optional parameters to the language is still his call; it decides whether the
  interpreter's JS `sort_by` can be deleted.
- **Module names:** native now names a module's file relative to the main file, as the interpreter does.
- **Result:** every example (8, plus `modules/main` and `sort_by.eg`) natively equals `eg run`. native 104/104, selfhost 16/16, lang 166/166,
  differential 19/19.
