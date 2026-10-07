# 0.39.361 — 2026-10-06

James: "tasks need time stamped. phases need chunked i feel like. at least for small ollama models." · "like needs to learn from this: routing and adapting" · "Failure modes and faults are still first class data." · "I want to get that pipeline working. Idearium."

The first real phase build ran today, on BL15. The agent's reply would have wiped a 648-line file; James applied it, then reverted it. Then every rung of the ladder timed out on a 16,613-character request. This release makes that pipeline work end to end for small models:
- spec → phase → one file per request → proof on the proposed code → Apply;
- it learns from every run, and every failure is kept.

Built and mapped as build-from-the-spec 1.23.0–1.24.0.

## Every task timestamped (SB50)
- **Each Plan step shows:**
  - when it was mapped, started, last run and closed;
  - while building, how long the run has gone ("building 3m 10s").
- **Each activity row shows** date and time, how far into its run it came (+span), and "chunk i/n" when chunked.

## A phase built in chunks (SB51)
- **When chunking happens.** A build whose ladder starts on a local model is sent one file at a time. That's `routing.chunk_phases: auto`; `always` and `never` also work.
- **What each request holds:**
  - the phase in brief;
  - this file;
  - the files already written, with their exports;
  - the invariants trimmed.

  It is never more than 2,400 characters, and each goes in its own fresh session. Its shadow expects only its own file.
- **A chunk that doesn't land stops the run,** naming it: "chunk 1 of 2 (lib/notes.js) did not land — the run stops here". Later chunks are not sent.
- **The proof runs once,** after the last chunk, on the whole phase.

## Proven on the code it proposed (SB52)
- **The bug.** Driving the pipeline end to end showed a phase marked *proven* while both its files on disk were empty placeholders. In review mode the code is only a proposal, and running an empty test file passes.
- **The fix.** The proof now runs in a scratch copy of the repo, with this run's proposals laid over it (`lib/proof-overlay.js`). Your files are never touched before Apply.
- **What the Plan says:** "✓ proven on the proposed code (2 files) — nothing is in your files until you Apply".
- **Very large repos** (over 300 MB) are proved on disk, and the Plan says so.

## Safety on the reply
- **Refused before it's proposed:** a code block that is only a path, or that would cut a 40+ line file to under a tenth of its size and under 20 lines. BL15's `-648 +1` would be refused with the reason.
- **Change cards count the whole change.** BL15's −648 had read −400.

## The work surface, without git
- **Reverted and rejected cards:**
  - start collapsed and are left out of the totals ("1 undone");
  - check the file for you: "✓ reverted — the file is back exactly as it was (648 lines)", or a warning with the line counts if it isn't.
- **Each card names the agent of its run** ("by chatgpt").
- **Files, Code and Manage talk about snapshots, not commits.**

## The ladder learns (AR1)
- **`lib/agent-record.js`** keeps each agent's phase-build record: landed, proven (×2), undone by you (×2 against), failed and why, and its size limit (at least 2 size-shaped failures at or above a size, never landed there).
- **The ladder is ordered by it** before every build:
  - agents past their limit go last;
  - the best record goes first;
  - agents tried fewer than 2 times sit at 0.5;
  - with nothing learned, the order is exactly as configured.

  `routing.ladder_learn: false` turns it off.
- **The Plan shows each run's route,** with why each agent sits where it does. A new section, "agents · what Nexus has learned", shows the table (`GET /api/routing/agents`).

## Faults are first-class data (AR2)
- **Every phase fault is a `fault_log` record**, written through `lib/fault-log.js`. The failure modes:
  - no-snapshot, timeout, empty, provider-down, …
  - wrote-nothing, missed-files, blocked, tool-errors
  - unproven, no-proof
  - ladder-exhausted, chunk-stopped
  - reply-collapse
  - undone (an agent's change you reverted or rejected)

  Each record carries the agent, phase, request size, error and cause.
- **Before a build,** the phase's past faults go to the agent ("WHAT WENT WRONG ON THIS PHASE BEFORE", 600 characters at most) and onto the Plan.

## Proof
- **New suites:**
  - `test-chunked-phase-build` passes 8/8. It runs the real pipeline: a real skeleton repo expanded from its spec, its phasemap, the real build route, a Versionium stub, and only the model stubbed.
  - `test-agent-record` passes 30/30.
- **Extended:**
  - `test-repo-inject` 83/83;
  - `test-work-surface` 22/22.
- **Updated, because the build loop now takes a request per chunk** (behaviour unchanged):
  - `test-escalation-ladder` 9/9;
  - `test-draft-review` 12/12;
  - `test-shadow` 16/16.
- **Unchanged and passing:**

| Suite | Result |
|---|---|
| test-pipeline-routing | 19/19 |
| test-prove-loop | 7/7 |
| test-phase-actually-builds | 6/6 |
| test-build-surface | 13/13 |
| test-build-surface-2 | 3/3 |
| test-repo-expand | 7/7 |
| test-one-idearium-phases-nodes | 21/21 |

## Not yet
- **The proof's retry is too big for a small model.** When a proof fails, it asks the same agent again with the whole phase's request plus what was unmet. For a chunked run it should send only the failing file's chunk.
- **The draft review is skipped for chunked runs.** It reads a whole reply.
- **Nothing has run against a live Ollama model yet.** Every check above stubs the model.
- **Timeouts are still fixed (90s for guardian agents),** and a reply that arrives late is lost.
