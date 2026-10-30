# 0.60.308 — no system has a data pipe door yet; the tutor that decomposes, adapts and learns

James, 2026-10-30:
> "just have hooks for the backend storage. like apis or urls for api routes. each system in nexus needs those data flow pipeline apis. do they?"
> "yes, i love my idea, dynamic deomposition. i want it to learn also, what about the ability to edit and expand emerge, like it can build as you expand you knowledge"

## Measured
- 12 of the 15 systems have an interaction contract, with about 520 routes between them.
- Data moves through each system's own one-off routes. No route shape is shared, and no system serves a data pipe door.

## Proposed: one door for every system, the same three routes (to confirm)
- `GET /api/<system>/pipes`: the pipes the system declares.
- `GET /api/<system>/pipes/:name?since=c`: records out, oldest first, from a cursor.
- `POST /api/<system>/pipes/:name`: records in, each checked against the pipe's schema. A refusal becomes a typed gap with its reason.

## Recorded: EW_D6, his
**The tutor is a sovereign system built on Emerge.**
- Lessons are one-idea atoms in a concept graph.
- A step that overwhelms someone breaks into smaller steps.
- It adapts to age and to measured overwhelm.
- Storage is hooks only: URLs to pipe routes.

**It learns, in three layers kept apart (to confirm):**
1. The tutor crystallizes the decompositions that worked.
2. The learner's own library grows.
3. Emerge itself grows only through `eg bootstrap`, and taking a learner's addition is his act.

Record only. Nothing is built.
