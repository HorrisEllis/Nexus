# CHANGELOG 0.60.420 — the primitive factory, step 1: a project's own tests make verified primitives

James, 2026-11-06: "i want at some point to haveprimitives built and tested autonomously. using clearglass also for github repos. reusable
primitives saving to the component store." · "okay lets get this done. no more distractions"

## Built (CS0 expanded, not written again)
- `idearium/lib/primitive-tests.cjs`: finds a project's test files, reads what each one requires, and runs each test on its own.
  - Every test runs in a throwaway copy of the project, so the original is never written. It has a time limit and no keys in its environment.
  - Each result says why: passed · exited N with the error · needs npm X · timed out.
- `lib/component-store.js` `markTested`: each module a passing test requires is marked **verified**. The others are marked failed (with why)
  or untested. A failed test does not bar reuse, because the machine can be the reason.
- `components decompose --test` (route `test: true`), `components --verified` (`?verified=1`), and the drop panel's "run its tests" switch,
  verified-only filter and ✓/✗ marks.

## Proof
- `test-primitive-factory` 6/6.
- His Bridge-OS run for real: **45 tests, 35 passed, in 36 s.**
  - The code failures carry their own error (dht, steg, transport, mesh 3 of 32 checks).
  - The machine failures say so: Bluetooth hardware, a Windows-only scan, a boot test that timed out.
