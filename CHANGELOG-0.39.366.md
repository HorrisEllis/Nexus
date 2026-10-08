# 0.39.366 — 2026-10-07

James, with a screenshot of Claude Code's Background tasks panel: "the background tasks, i want that for each repo. any activity from an agent wearing the hat."

## One door, so one record
Every call to the agent wearing a repo's hat goes through `lib/repo-agent.js` `dispatch()`, whoever answers:
- a guardian tab (ChatGPT, Claude, Gemini…);
- Ollama through copilot's tool loop;
- Claude Code.

That door now records a **task** (`lib/repo-activity.js`). Nothing else had to learn about tasks: the phase build, the draft review, proof repairs and the Agent tab's chat are all tasks because they all call it.

| Task | What it is |
|---|---|
| **phase** | A phase build, from its first row to its proof. Its **attempts are its children**: each rung, each file of a chunked build. Every row of the run is a step on it: an escalation, a memory skip with its numbers, the proof. |
| **build** | One attempt: the rung and try, or the file it writes. |
| **review** | The draft review. |
| **repair** | A proof retry. |
| **chat** | A message from the Agent tab, or any other call. A fallback hop inside a call is its child. |

**While a task runs, what happens is a step on it:**
- the guardian tab's feed: dispatched, each gate, errors;
- each tool call, with ✓ or ✗ and the error;
- the reply growing. Chunks are counted, not each one a step.

**When it ends, it records:**
- done or failed, with the reason;
- how long it took;
- what came back: characters, the files it wrote, the tools it used.

**Its limits:**
- A task that says running but has had nothing for 15 minutes reads **stale**. It's said, never shown as live.
- A repo holds 150 tasks; a running task is never dropped.
- After a restart, the history comes from the repo's own exchange log (`repo_agent_log`).

## Where it shows
- **Tasks** sits at the end of every repo's tab bar, with the number running now. It opens a drawer in the manner of the Claude Code panel.
- **Each row shows:**
  - its state: spinner, ✓, ✗ or ◌;
  - its kind and title;
  - its provider and its time, which counts up while it runs;
  - a line below that says what it's doing now: for a phase, "2 attempts · 1 running · now chatgpt · gate reply waiting · writing · 2140ch".
- **Opening a row** shows its hat, session and size, every step with its time, what came back, and its attempts.
- **Filters:** all · running · failed.
- **Live:** every change arrives over SSE as `idearium.repo.task`. The list is `GET /api/repos/:uuid/tasks`.
- **Red means the task failed.** A skipped rung on the way doesn't count, while the phase carries on.

## Declared
- `idearium.repo.task` in idearium's event list.
- `provider.host.load_failed` (from 0.39.365) in Clear Glass's.

## Proof
- New: `test-repo-activity` 24/24. It covers:
  - kinds and runs from real session names;
  - history from the exchange log;
  - a phase holding its attempts: a failed attempt on a ladder doesn't end it, while with no ladder a failure does, and the proof ends it;
  - the tool call with its file and error;
  - chunks counted;
  - the memory skip;
  - fallback hops as children;
  - stale;
  - the per-repo bound;
  - the wiring.
- The drawer was rendered in Chromium with the scenario from James's log:
  - phase BL15: the 3b wrote nothing, the 7b and 16b were skipped for memory, and ChatGPT is writing;
  - a chat whose Claude tab didn't load;
  - a chat from the history.

  That render caught three faults, all fixed:
  - the title was crowded out;
  - a phase showed its last skipped rung as its provider;
  - the count said 2 for one phase.
- Unchanged and passing:

| Suite | Result |
|---|---|
| repo-agent ×5 | 196 tests |
| work-surface | 27/27 |
| registry-harness | 7/7 |
| chunked-phase-build | 14/14 |
| phase-proof | 7/7 |
| escalation-ladder | 9/9 |
| draft-review | 12/12 |
| shadow | 16/16 |
| code-tools | 28/28 |
| event-contracts | 8/8, after the two declarations |
| nexstore-writers | 3/3 |
