# 0.60.166 — 2026-10-19 — CT1: COS is the gate's test environment

James, 2026-10-19: "then we need cos to work for test env." · "do not add apis. i dont have money for that."

Fourth brick of `docs/2026-10-19-solid-build-foundation-phasemap.spec`, bottom-up, free/local.

## Why
The quality gate (GQ, next) must run a phase's test in **isolation** — not in the build's own process, where a test could read
the build's env, hang it, or flood it. COS already has the machinery; it was only wired to the manual Run menu, never the build.

## The door
- **`cos/testenv/run-target.js runTarget({ root, testFile, timeoutMs, runtimeId, backend })`** — the one build-callable door.
  Reuses `cos/testenv/index.js run` (→ `cos/playground/sandbox.js SandboxRunner`): a child process with a **clean env** (no
  parent secrets), a **timeout**, and an **output cap**. Returns `{ passed, exitCode, signal, durationMs, killedByTimeout,
  killedByOutputLimit, stdout, stderr, backend }`. Refuses a test file outside `root` or a missing one.
- **Backend:** `process` by default — **portable**: this container, and any machine without KVM, cannot boot the VM, so the
  process sandbox is the default and the VM stays a local upgrade (`backend:'vm'` where `vmAvailable()` is true). Isolation here
  is **process-level** (clean env + timeout + output cap), stated plainly so a caller does not assume a full VM.
- No external services, no paid APIs.

## Proof
`tests/modules/test-cos-run-target.test.js` — CT 5/5, **real sandbox runs**: a passing test passes (CT-01); a failing one
reports not-passed with stderr (CT-02); a runaway test is killed by the timeout, not hung (CT-03); a secret set in the build
process is **not** visible to the sandboxed test (CT-04); a path outside root or a missing file is refused (CT-05).

## Files
- `cos/testenv/run-target.js` — new; `runTarget`, `vmAvailable`.
- `loom/maps/build-surface-map.js` — declaration + `cos/testenv/index.js` require edge.
- `tests/modules/test-cos-run-target.test.js`, `run-all.js` — the test, registered.
- `lib/version.js`, `package.json` — 0.60.166; phasemap CT1 marked built.

## Next
GQ1 — the SISO quality-stream: for a built unit, fan out the covering test (run through this door, in COS) + shape + catalogue +
lint, each a gate, residue named; then GQ2 makes the brick gate require behaviour, not just shape.
