# 2026-10-30 — the automatic write gates (0.60.292 UG2/UG3), archived

James, 2026-10-30, reading 0.60.292: "what? gates are for the pipelines for macro atuomation" · "considering what the context of what i
proposed., and the request. why, did you misread me? i also told to stop thimnking so fucking narrow"

These files are the code as it was at 0.60.292, kept here (§0.3) and taken out of the running code in 0.60.293:
- `clear-glass/src/driver/index.js`: `_gated`, called from `exec` after every write (type, setValue, insertText, typeAt, select, choose,
  check, checkAt). It read the element back, settled, retried, and failed the write with `GATE_CLOSED`.
- `clear-glass/src/dom/archaeology.js`: `_gateMutation`, called from `handleMutate` after a value write, which the general autofill uses.
- `lib/automation/engine.js`: `_gatedAct`, which gated workflow fill, select and tick automatically.
- `clear-glass/src/autofill/matcher.js`: carried the write gate into the autofill's filled and failed lists.
- `tests/modules/test-element-gates.test.js`: its UG-02 and UG-03 tested the above.

Why they went: in his system a gate is a block in a pipeline, a workflow or a macro, which the flow waits on (FP3, KB4, PL). It is not a
read-back hidden inside every write. What stayed is the gate as a building block:
- `clear-glass/src/page/element-gate.js`;
- the driver's `gate` action, which only reads;
- his picked gates per site or page;
- the gate steps.

See `docs/2026-10-28-gated-flows-phasemap.spec` (the UG2/UG3 addendum) and `docs/2026-10-29-pipelines-phasemap.spec` (PL6–PL11).
