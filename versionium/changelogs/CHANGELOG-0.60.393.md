# 0.60.393 — MG32: COS's autopilot door through Cortex's and Intelligence's doors

James, 2026-11-05: "next". That came after the existing phases were checked, and MG32 was named as the phase Cortex's new door unblocked.

## What was wrong
COS's autopilot door (`cos/manager/autopilot-door.js`) read two other systems' files directly:
- Cortex's store (`cortex/memory/jaa-db.js`);
- Intelligence's field (`intelligence/cfr/field.js`).

These were the two crossings the boundary ratchet reported on main. They kept CT-07 and FM-07 red. In your words from the same day: "I can’t
just move a folder and have nexus run still that’s why they need to use the cli and api routes".

## Built
- `/graph` now reads through the routes:
  - Cortex's `GET /api/memory?table=&n=` (its registry's `memory.browse`), for event_log, bus_subscriptions, raid_trails,
    guardian_artifacts and idearium_spec_chunks;
  - Intelligence's `GET /api/intelligence/friction`, for the field's regime.
- With Cortex down, the answer says `cortex: 'down'` and why. The trails read as unreadable (never as empty), and the rest is answered.
- Removed a second require of Cortex's store (`_getJaaDB`) that nothing called.

## Proof
- `test-cos-autopilot-door` 5/5. AD-05 is new: it reads through stand-in routes, then with Cortex refusing the connection.
- `test-cos-compartment-template` 8/8 (CT-07 was red).
- `test-failure-modes` 9/9 (FM-07 was red).
- `test-flight-data` 9/9.
- The boundary census now adds nothing past its baseline: 402 → 400 edges.
