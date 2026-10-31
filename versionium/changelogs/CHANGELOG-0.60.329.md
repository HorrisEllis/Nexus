# 0.60.329 — autopilot's door, answered by COS (MG16)

James, 2026-10-31:
> "go"

This follows his "okay we need the orchastration completed".

## Built

- **`cos/manager/autopilot-door.js`:** every route autopilot serves on :7799 is answered by COS's manager in the same shape, so no caller
  changes (MG-003).
  - `/status`, `/spawn/:name`, `/control/:name/:op` and `/touch/:name` come from COS's supervisor, using autopilot's state names
    (online, dormant, circuit_open, held).
  - `/idle`, `/ledger`, `/graph`, `/contract-map`, `/tables`, `/files`, `/run-tests` and `/warp` use autopilot's own handlers, extracted by
    script so they are identical.
- **`/tables` and `/files` read other systems' stores directly.** They are legacy crossings, kept only for old callers:
  - each reply carries `X-Nexus-Legacy` naming its replacement;
  - each call is counted with its caller, at `GET /api/cos/legacy-callers`.
- **MG_D14 (decided by his axioms):** until the handover, those handlers exist in both autopilot and COS. Moving them now would make lib
  depend on COS, a new crossing. MG17 archives autopilot's body and ends the copy.

## Proof

- `tests/modules/test-cos-autopilot-door.test.js` **4/4**:
  - every route in autopilot's own source is answered, none 404;
  - `/status` is in autopilot's shape;
  - `/control` and `/spawn` reply in autopilot's shapes;
  - legacy calls are counted with their callers.
- `test-cos-supervisor` 8/8.

## Next

MG17, the handover: autopilot launches COS and steps aside. That is the step that changes his machine.
