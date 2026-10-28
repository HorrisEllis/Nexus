# 0.39.369 — 2026-10-07

James: "I also want to have a full extensive activity log in each repo."

## AL2 — the Activity log view
The Tasks drawer now has two views: **Background tasks · Activity log**. It's still one drawer, not a second panel. The log view reads the repo's durable log from 0.39.368.

- **Rows by day, newest first.** Each row shows its time, an icon, its kind, its title and who did it:
  - ✓ ok, ✗ failed;
  - ◇ proposed, ◆ applied, ⊘ rejected, ↶ reverted, ◈ staged;
  - ↷ skipped, ▸ started.
- **Filters:**
  - a chip per kind (task, phase, inject, fault), with its count;
  - **failed**, to show only failures;
  - **by actor:** the agent, a provider, or *person*, meaning you;
  - word search.
- **"older…"** pages back.
- **Opening a row** shows its detail:
  - the reason a proposal was undone;
  - a task's files, tools and error;
  - its hat, ref and time.
- **Live:** every row written arrives at the top as it happens (SSE `idearium.repo.activity`), when it matches the filters.
- **A task's start row reads ▸.** It's an event, so it never shows a spinner that would make a finished task look like it's still running.

## Proof
**`tests/probe/repo-tasks-drawer-glass.js` 11/11**, run through Clear Glass's own engine (`clear-glass/src/driver/glass.js`), never Playwright. The page loads the real `repo-tasks.js` and its CSS, and the two routes are served by the real `repo-activity` and `activity-log` modules.

The scenario is from your log:
- phase BL15: the 3b wrote nothing, the 7b was skipped for memory, ChatGPT is writing;
- a proposal and its revert;
- a fault;
- 85 earlier chats.

The probe checks:
- the Tasks count and the phase;
- the log's first page of 80 rows, and "older…";
- the day headings;
- the inject chip;
- a row's detail;
- failed only;
- search;
- a row arriving live;
- no page errors.

The screenshot also caught two layout faults in the harness, both fixed: a missing charset, and the icon column wrapping.
