# 0.60.299 — four rules every system follows; one exe runs Nexus; his update system read and probed

James, 2026-10-30:
> "the plan it to rebuild nexus at somepoint. in my emerge coding language. from the bottom up in my own language. almost everything in nexus is my own. I love architecture."
> "oh and add to the architecture spec that each system needs schemas to use for expected system behavior. also i want .benchmark nodes for the sigma deviations from baseline to record into ..."
> "like every single step is a gate. the success of the previous, triggers the next, with retry logic including increasing the timing little by little ..."
> "it will be what runs nexus. replacing powershell. just one exe."

## Architecture spec 0.12.0 → 0.13.0 (`docs/architecture-spec/architecture-spec.spec`, ADDENDUM 2026-10-30)

- **A. Behaviour schemas.** Each system has `<system>/schemas/behaviour/*.schema`. Each one names an input, the events it must emit, its outputs, its time envelope and its invariants. They are the "expected" side of the baseline and the oracle for its tests.
- **B. `.benchmark` nodes.**
  - A deviation from baseline past sigma is written as a node. Intelligence owns and writes these nodes.
  - Intelligence links the node to the events that came before the dip.
  - COS's load balancer acts on the node and names it.
  - Builds on `intelligence/baseline.js`, `schema.sigma_record`, `rfr2`, `causal`, and `cos/watchdog`.
- **C. A data pipeline door per system.** Pipes are declared in each system's contract. One router checks both ends' contracts before it delivers, and records every hop.
  - The router being COS's is a reading, to confirm.
  - `schema.pipeline` is already taken by Clear Glass's site pipelines. The suggested name for this one is `pipe`.
- **D. The dependency gate.**
  - Every step is a gate, and each dependency is a `.dep` node carrying an id and a contract id.
  - Retries come with a slowly growing delay.
  - Failures are recorded as failure modes, diagnosed by Intelligence, and escalated.
  - Each step is written to disk before it runs, so a chain survives a restart.
  - Builds on his gate walker, `step_chain`, `gate` records, the `.contract` gates, `phase-dag`, and self-heal escalation.
  - What "escalating if its not critical" means is to confirm.

Test: GA-01 accepts version 0.13 (`test-genesis-and-architecture-spec` 7/7).

## One exe (`docs/2026-10-15-cos-app-phasemap.spec` addendum)

- **What already exists:** the exe, the release-zip drop, switch and rollback, the off/ask/auto policy, and GitHub as the release source.
- **His update-system.zip:** read in full and probed with in-memory transports. It has two defects:
  1. Its duplicate check uses the payload hash. Two identical pings arrive as one.
  2. A stale or failed ack triggers an immediate resend, again and again: 28,773 pushes in 300 ms.
- **The suggested role, to confirm:** GitHub for releases; his system as the push channel between machines over Bridge, after both fixes.

Spec text only. Nothing is built.
