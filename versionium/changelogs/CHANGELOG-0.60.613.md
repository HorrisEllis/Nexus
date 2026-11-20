# 0.60.613 — the ladder, smallest model first, and his framework per gate

James, 2026-11-20: "the smaller we can get llms in ollama coding the better. emerge should have the ability to make tiny models capabile, one primitve at a time, one line, one word." · "framework per step. or pipeline. like i want it to use my framework." · "My whole framework" · "get it working end to end. zoom out, and use my framework."

## What changed
EMB2 expanded.
- **The ladder.** `createRung({ ladder: [{ name, ask }] })`: the smallest model fills every gap. A gap it cannot fill, and for which no gap in between can be named, climbs to the next model, told every earlier try (the lesson). Each attempt and each gate tag names its model.
- **His framework per gate.** Each gate's brief carries the steps of his framework for that gate, read from the executable block of `docs/innovation-toolkit.framework`, so the method is his text, editable in his file: diagnose (why a gap is stuck) carries his Sections 3 and 4; the test carries Section 10, hostile verification. `framework.gates` sets which steps each gate uses.
- **A failed test is the next gap.** The module's functions under test are reopened, each told the test's words and his Section 10; after `rounds` reopenings on one rung they climb the ladder. Held when every rung is spent. The whole-module loop is no longer run after a skeleton.

Measured on his machine (docs/BENCHMARKS.md): the 3b (qwen2.5-coder 3b) filled both gaps of the file-identity fixture in Emerge that compiled on the first try, 13 s in all; the bodies were wrong and the test failed. With DeepSeek 16b above it, the run escalated, linked `isAvailable` in, and still failed the test: held, 414 s.

gaps.test.eg 10/10, test-emerge-rung 10/10 (ER-10 new: the ladder, his framework in the diagnose gate, a failed test reopening then holding).

## Files
- idearium/lib/emerge-rung.cjs: the ladder, frameworkSteps, methodOf, the test as a gap
- tests/modules/test-emerge-rung.test.js: ER-10
