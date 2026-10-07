# 0.39.368 — 2026-10-07

James: "I also want to have a full extensive activity log in each repo."

## AL1 — a repo's durable activity log
`lib/activity-log/compartment.js` writes **one durable row per thing that happened** in a compartment. Each row is written at the point where the thing already happens; nothing is pieced together later.

| Kind | Written by | What it is |
|---|---|---|
| `task.<kind>` | `lib/repo-activity.js` | An agent wearing the hat started or ended a call: chat, build, review or repair. The end row carries its time, files, tools and error. |
| `phase.<state>` | the same, from every phase-run row | building, escalating, skipped (memory), proven… |
| `inject.<event>` | `lib/repo-inject.js` `_write()`, the one place every proposal changes status | Every event in a proposal's history: proposed by the agent; **applied by the person or by 'auto'**; rejected or reverted by the person, with the reason; staged |
| `fault.<class>` | `lib/fault-log.js` | Any fault with a repo on it, recorded as failed so failures are first class |

Each row holds: `{ compartment, kind, status, actor, hat, title, ref, detail, ms, ts }`. The `ref` field points at what the row is about (a task, a run, a proposal, a fault), so a view can open it.

**How to read it:**
- **The route** is `GET /api/repos/:uuid/activity`, with these filters:
  - `?kind=`, matching a prefix: `inject` gives every inject event;
  - `&actor=` and `&status=`;
  - `&q=` for words;
  - `&before=` to page back, and `&limit=`;
  - `&facets=1` for counts by kind, actor and status.
- **Live:** each row goes out over SSE as `idearium.repo.activity`, a declared event.

Before this, an apply didn't record who did it. Now every apply records `approvedBy`:
- `'auto'` when the repo's mode wrote it, which counts as the agent's act;
- the person, through the API or the page.

## Found while building
**`lib/activity-log/index.js` already existed** (2026-08-04). It logs each *system's* events from the ledger fan-in into cortex's `event_log`.

My first version was a new file, `lib/activity-log.js`. It shadowed that module, because Node resolves the file before the folder, and the existing module's suite dropped to 0/6. Both the per-system log and this per-compartment one now live in the same folder:
- `index.js`: per system, unchanged;
- `compartment.js`: per compartment, new.

The existing suite is back to 6/6, and BrainOS (BO1) will read both.

## Proof
- **New: `test-compartment-activity-log` 6/6**, run through the real API with a Claude Code stand-in on a review-mode repo. It covers:
  - the call's start and end rows;
  - its two proposals, made by the agent;
  - the person applying one and rejecting the other with a reason;
  - a phase skip, and a fault recorded as failed;
  - newest first, the filters, word search, paging back, facets, and a 404 for an unknown repo;
  - another process reading the same rows after a flush.
- Unchanged and passing:

| Suite | Result |
|---|---|
| test-activity-log (the system log) | 6/6 |
| repo-inject | 83/83 |
| repo-activity | 24/24 |
| nexus-inject-approval | 9/9 |
| claude-code-backend | 6/6 |
| event-contracts | 8/8 |
| work-surface | 27/27 |
| agent-record | 30/30 |
| nexstore-writers | 3/3 |
| code-tools | 28/28 |
| agent-feed | 19/19 |
| repo-agent | 35/35 |
| phase-proof | 7/7 |
| chunked-phase-build | 14/14 |
