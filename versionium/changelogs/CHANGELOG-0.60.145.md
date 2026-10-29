# 0.60.145 — 2026-10-18

James: "alright the gates need context. needs persistence, needs to survive restarts, reuse contracts, jobs and responses."

Then, while it was being built: "its also in clearglass, cleardriver"

Mapped first in `docs/2026-10-16-durable-work-timeline-phasemap.spec` addendum (f), as TL2a.

## Read first: what a gate already kept across a restart

| What | Where | Since |
|---|---|---|
| The **contract**: its plan, its passed gates (by hash), and re-running only what went stale | `cortex/core/raid/contract-gates.js` openCheckpoint; `savedPlan` | TL1a |
| The **failure**: what the gate's last check said, which goes with the next try | the carry box | TF1 |
| The **steps**: the brick's run state (tool calls, files read and changed) | `lib/run-state.js` | GW2 |
| The **replies**: every attempt at the gate | `lib/work-journal.js` | 0.60.143–144 |

Contracts were already reused, so nothing changed there.

## What was missing

- **Context.** The next attempt was told what the check said, but not what the attempts before it wrote, thought or changed.
  An agent outside the tool loop never saw the run state at all.
- **Reuse.** If a gate's reply was finished, or still being written in its tab, when Idearium stopped, the next build asked
  for it again from nothing: a second job, and the first reply wasted.

## TL2a

- **`lib/gate-context.js`**:
  - **`context` and `note`.** One block, capped at 2600 characters, built from the journal and the brick's run state:
    - each attempt before this one, and how it ended;
    - the files already changed;
    - the last steps;
    - the tail of the last reply.

    It goes in the gate's next message, after any restart and on any agent.
  - **`reuse`.** Runs before an attempt dispatches. It takes the gate's newest Guardian job that no attempt has handled:
    - if it is **finished**, its reply is adopted from Clear Glass's Responses index, through `repo-agent` `findLate` and
      `adoptLate`. That is the same `_finish` a dispatch runs, and it runs once per `responseId`.
    - if it is **still being written**, it is waited for (up to 10 minutes), then adopted.
    - if it is still being written after that, the gate is asked again, and the attempt says why.
  - **The run log as a second witness.** If the gate has an outcome row after the job started, that reply was already
    judged and is not taken again. This covers replies journaled before the handled marks existed.
  - **`handled`.** After every attempt, the gate's jobs so far are marked handled (`work-journal` `mark`), so a reply is
    never used twice.
- **Route:** `GET /api/repos/:uuid/agent/feed?gate=<key>` now also returns the note the next attempt carries, and the reply
  it would reuse.
- **Command:** `repo feed <repo> --gate <key>` prints both.
- **UI:** a reused attempt's row in the Plan's run history says "↺ reused" and "reused job …'s reply — not asked again",
  plus "carried this gate's context (N ch)" when the context went with it.
- **Not reused:** Ollama replies. They are not in the Responses index.
- **Loom:** new wires from `lib/gate-context.js` to `lib/work-journal.js`, `lib/run-state.js` and `lib/repo-agent.js`; from
  `idearium/api/index.js` to `lib/gate-context.js`; and from `lib/gate-context.js` to Clear Glass's Responses index.

## "its also in clearglass" — a duplicate, his call (TL2a-4)

Clear Glass already keeps every chat's reply and thinking as it streams: `clear-glass/src/downloads/chat-ledger.js`, since
0.39.278, in `<downloads root>/ledgers/<chatKey>.jsonl`. It is append-only and sits beside the `.response` files.

The work journal from 0.60.143 keeps the same text again, per job, on Idearium's side. It was built without reading the
ledger first, which misses §8.6 (reuse before build). So one stream now has two records.

The coder's recommendation, to be decided by him:

- the journal stays as the per-gate **index**: job, gate, attempt, handled, status;
- the ledger is the text's one home: the journal points at its `chatKey` and turn;
- reuse falls back to the ledger when Guardian's `.response` is missing.

## Proof

| test | result |
|---|---|
| `test-gate-context` | 6/6 |
| `test-work-journal` | 4/4 |
| `test-contract-phase-build` | 14/14 |
| `test-test-first` | 5/5 |
| `test-repo-agent-late` | 17/17 |
| `test-qa2-real-run` | 5/5 |

What `test-gate-context` covers:

- **GC-01:** the note is rebuilt after a restart.
- **GC-02:** a finished reply is reused once, from the real Responses index.
- **GC-03:** a reply still being written is waited for, then reused; past the wait, the gate is asked again.
- **GC-04:** a reply the gate already judged is not reused.
- **GC-05:** the wiring in `makeAttempt`.
- **GC-06:** the Plan's history row.
