# 0.60.437 — CIE15 fifth slice: kinds, templates, spawn and despawn natively

James, 2026-11-06: "I hit my usage limit while you were working, but it has reset now. Please continue from where you left off."

- **Kinds:** `kind`, with parents and typed state, flattened at compile time. `component … is K`.
- **Templates:** `template T(params) is K` becomes a factory whose handlers, hooks, constraints and lens functions close over the parameters.
- **Instances:** `spawn` and `despawn`, the latter with unwire and despawn entries. Instances can be wire ends (`wire prev.give -> next.take`).
  `is_kind()` and `instances()` work, and a stale handle is refused with the interpreter's message.
- **Checks:** the initial state is checked at declare, so a boundary is refused at spawn. Typed state is checked at declare and before every
  commit.
- **Result:** `examples/primitives.eg` natively equals the interpreter line for line, its 22 ledger entries hash for hash. 7 of 9 examples.
- **Suites:** native 102/102, selfhost 16/16, lang 166/166, differential 19/19.
- **Left:** `matches` (a regex engine in Emerge) and `sort_by` (optional parameters, his call).
