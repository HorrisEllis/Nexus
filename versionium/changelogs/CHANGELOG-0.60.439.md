# 0.60.439 — optional parameters; the first JavaScript deleted from Emerge

James, 2026-11-07: "I feel optional parameter's is always good." (decision CIE_D4, his)

- **Optional parameters:** `fn f(a, b = default)`. A missing argument takes its default, evaluated at call time after the parameters before
  it. A required parameter can't follow an optional one.
- **Where:** both parsers, the checker (arity ranges), the interpreter and `eg build`. Natively, `native/defaults.eg` gives a function one
  entry per shorter arity.
- **`sort_by`** moved into `lang/core/prelude.eg` as `fn sort_by(xs, f, dir = "asc")`, written in Emerge for both backends. Bootstrap build
  16.
- **Deleted:** the interpreter's JavaScript `sort_by` and its comparer (12 lines). The first JavaScript removed from Emerge.
- **Archived:** `lang/cie/sort.eg` (the native stopgap from 0.60.438) and its embedded copy, now duplicates.
- **Not native yet:** a lambda with defaults, and a module function with defaults called with fewer arguments through its module. Each is
  refused by name.
- **Suites:** native 104/104 (every example, `sort_by.eg` and `optional.eg`), selfhost 16/16, lang 166/166, differential 19/19.
- **Line totals, honestly:** 12 JS lines deleted for good; 30 added to the four JS backends, which leave with the interpreter at CIE11.
