# 0.60.187 — 2026-10-21 — The pipeline's two open root causes, found and fixed at the cause

James, 2026-10-21: "Now back to the pipeline workflow and automation in idearium. Look at the phases for idearium and the pipeline." Then,
offered three orders for the open pipeline work and the BrainOS move: "Fixes, then graph (Recommended)".

The order is his. The coder's part: the tracing, the fixes.

## RC5 — where "Gemini said" got into file paths
- **Where it entered:** `lib/repo-inject.js` `fromReply`.
  - When a code block came back with no path the code could read, Nexus asked the agent "Reply with ONE line only: the path". It then
    took the first line of the answer as the file path.
  - From Gemini, that answer is the page's text, which starts with Gemini's screen-reader line "Gemini said". That gave
    "Gemini said tests/sp5-title.test.js". If the label sat on its own line, the target became just "Gemini said".
  - The safety check only refused absolute paths and `..`.
- **The cut-short names** (`tests/sp5-title.`) were answers read while Gemini was still typing. The transcript reader took the newest
  version without checking it had finished. No regex cut them.
- **Fixed at the cause:**
  - A speaker label at the start of a reply is removed in three places: where transcripts are read, where an answer becomes a path, and on
    the Gemini page itself.
  - An answer becomes a path only if it is one complete path. No spaces, no prose, a full extension, and no name ending in a dot or
    dash. Anything else is reported as unresolved, never guessed.
  - The transcript reader waits for a finished reply.
- RC4's guard at the write door stays as the second check.

## RC6 — the Ollama job with no owner, every ~90 s
- **The caller:** the diagnostic service's gap escalation.
  - Every 30 s it sent open high-severity gaps to the Ollama bridge. It named no owner, intent or answer budget.
  - So the bridge logged each one as "(ask)" and gave it the default 4096-token answer budget. 293 chars + 4096 + 256 rounds up to num_ctx
    5120, exactly the numbers in your log.
  - It marked each gap "investigating" through its own private copy of cortex's store. Cortex never saw that, so the gap came back open.
  - Its cooldown lived in memory and was forgotten on restart.
  - The bridge runs one job at a time, so the backlog ran back to back. Your "every ~90 s" was the run time, and the model never went idle
    long enough to unload.
- **Fixed:**
  - The bridge refuses a job that names no owner, and puts the owner in its log line. Every other caller in the tree already names one.
  - Diagnosis is background work and gives way to builds.
  - The escalation names itself and asks for 1024 tokens. It sends at most one escalation per sweep and keeps a six-hour cooldown on disk.
  - It sets a gap's status through cortex's new `POST /api/gaps/status`, because cortex owns that table.

## Measured
- `test-pipeline-root-causes` 10/10, four of them new:
  - **RC-07:** each bad answer shape from your log is refused or repaired.
  - **RC-08:** an unfinished transcript is skipped, and the Gemini page strips its own label.
  - **RC-09:** drives the bridge's real handler. An ownerless job is refused, and a named one is queued with its owner.
  - **RC-10:** the escalation's new shape, and the num_ctx arithmetic from your log.
- Two of my own mistakes were caught by these tests before release:
  - The first version put the owner check in the wrong bridge handler.
  - A second private store write was still left in the escalation's fallback branch.

## Not done, said
- Not run on your Windows machine. To confirm there:
  - the activity log shows the escalation as "for diagnostic.escalation", at most once per sweep and deferred while a build runs;
  - no new "Gemini said" folders appear.
