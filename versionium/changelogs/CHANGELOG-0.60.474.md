# 0.60.474 — one contract, RAID's: every request booked with Cortex, gate by gate

James, 2026-11-09: "All of it. Not just this systems. Litterally from input to an end state. Frameworks for copilot step by step. Coding one
chunking at a time, one primitive at a time. This is meant to completely reduce the amount of code drastically. Look at idearium" · then, to two
readings side by side: "Yes. This makes nexus programmable. Every point of failure can be mapped. Bottle neck made explicit. Every. Thing nexus
does, end state first, step by step, each gate checks, if it fails becomes a gap to fix to get the pipeline moving again. … Litterally anything nexus
does could be run in the pipeline. One step and gate at a time."

## Decided (PC_D11, his)
A request's contract is RAID's executable `.contract` v2, booked with Cortex by route. I read his yes as option (a), my recommendation, and said so.
COS's pipeline orchestrates the request and keeps its files. The separate `contract.contract` written that morning is gone: one contract system,
not two.

## Built
- **RAID by route** (`cortex/core/raid/contract-v2-door.js`, through `cortex/boot.js`):
  - `POST /api/raid/contracts/v2` books a contract;
  - `GET /:id` reads its gates, whether it's complete, and why;
  - `POST /:id/evidence` moves the contract as far as its evidence takes it. A gate is checked only once its evidence is recorded, so no attempt is
    spent early;
  - `POST /:id/gates/:gate/check` and `split`;
  - `GET /:id/gates/:gate/packet`.

  Files go in Cortex's books (`cortex/data/contracts/v2/`, not committed). An agent's booking is refused.
- **COS's requests:**
  - Each request's contract is drafted in Emerge (one task gate per step) and booked by the door.
  - A step met is recorded as its evidence.
  - Met is RAID's answer.
  - With Cortex down, the request still runs. The files say whose verdict it was, and that the books are waiting.

## Proof
- `node tests/modules/test-raid-contract-door.test.js`: 3/3.
- `node tests/modules/test-cos-pipeline.test.js`: 15/15. CP-14 runs against the real RAID logic behind a stand-in Cortex.
- `eg test cos/pipeline/test/runs.test.eg`: 6/6.
- test-contract-gates: 20/20, unchanged.

## Next, in order
- A step's agent gets RAID's packet. A gate too big for its agent is split by RAID: one chunk, one primitive at a time, reusing verified primitives
  first.
- The input-to-end-state framework for copilot:
  1. input;
  2. intent;
  3. context;
  4. the contract drafted;
  5. split;
  6. writers (the free web agents through Guardian);
  7. `eg check` and `eg test`;
  8. evidence;
  9. RAID's status, looping until the end state holds.

  A failure becomes a gap.
