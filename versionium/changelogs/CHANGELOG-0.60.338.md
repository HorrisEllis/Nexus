# 0.60.338 — COS manages Loom's compartment (LM6)

James, 2026-11-01:
> "loom is already in a compartment. it needs to be managed by cos"

## Found

Loom's compartment (`nexus-self-loom`, LM4's wall) existed and worked, but only test LI-08 ever started Loom in it. The live boot, by
autopilot and then by COS's supervisor after MG17, ran `node loom/server.js` as a bare process beside the compartment, with no wall.

## Built

- **Loom declares its own compartment and wall** in `loom/compartment.json`: `runtime.process.compartment` is `nexus-self-loom`, and
  `boundary` is mode enforce, allowing only its folder, the kernel and `node_modules`. This equals the census's `boundaryFor('loom')`.
- **COS's supervisor starts any process that declares a wall behind it**: `cos/compartment/boundary.js` preloaded, with `COS_BOUNDARY`
  built from the declaration.
  - The spawn line on the ledger says it runs walled, and in which compartment.
  - Every line the wall writes (a refusal, an audit, or "the wall is NOT up") becomes a `wall` line on the ledger.
  - The supervisor's view carries `walled`, `compartment` and `wallMode`; the Overview tags the card "walled".

## Proof

`tests/modules/test-cos-walled.test.js` **3/3**:
- WL-01: the declaration equals the census's wall.
- WL-02: a walled process's reach into another folder is refused and ledgered.
- WL-03: the real Loom, started by COS's supervisor, runs behind its wall and answers `/health`, and the wall refused nothing at boot.

`test-loom-into-cos` 8/8, `test-cos-supervisor` 8/8, `test-compartment-declarations` 5/5, `test-cos-ui` 6/6.

## Versionium

This sandbox cannot reach his Versionium. On his machine, the boot sync records this release.
