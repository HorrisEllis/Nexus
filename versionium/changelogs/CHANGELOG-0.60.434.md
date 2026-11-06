# 0.60.434 — CIE15 third slice: axioms natively

James, 2026-11-06: "just keep going."

- **Axioms:** `axiom NAME { … }` natively. It is recorded and checked at once, then checked after every top-level statement, at that
  statement's line.
- **Null fields:** a constraint that reads a null state field opens an evidential gap, and the state doesn't change.
- **Error lines:** the embedded world reports its errors at the caller's line, as the prelude does.
- **Result:** `examples/axioms.eg` natively equals the interpreter in stdout, stderr and exit status. 4 of 8 examples.
- **Suites:** native 100/100, selfhost 16/16, lang 166/166, differential 19/19.
