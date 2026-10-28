# 0.39.351 — 2026-10-05

James: "i like it but, can we have this hooked into the plan and work surface panel"

CT5 done (mapped first as CT5 in `docs/2026-10-05-code-tab-and-one-router-phasemap.spec` 1.1.0). The Code tab is hooked into the Plan and the work surface.

- **The plan in the Code tab.** A strip above activity shows:
  - the plan's progress and its current step, with its gates (the same gate bar as the Plan panel);
  - the runs that touched the open file, with each run's state.

  Each one opens the Plan panel focused on that run.
- **"change it".** The docked agent now has two sends:
  - **ask:** an answer. Nothing is written or snapshotted.
  - **change it:** a Manage edit of the open file. It sends the picked lines, your words, the chunk on the card as related code, and the model you picked. That means a Versionium snapshot first and a run on the Plan, and the Plan panel opens on it. The change lands as a diff card in the Code tab and in the Plan panel's work surface.
  - Manage (`idearium/api/build-surface.js`) now passes the picked backend, agent and model to the agent.
- **Live.** The Code tab repaints on the same events as the Plan panel (`codeSurfaceOnEvent`, called from `app.js`): runs, manages, injects. A phase that lands a change shows without a click. Another repo's events are ignored.
- **Work surface → Code.**
  - Every work-surface card has "open in Code". It isn't shown when that file is already open there.
  - The files in a run's ledger in the Plan panel are links into the Code tab.
- **Pushback, built that way.**
  - The Plan panel stays the one plan. The Code tab follows it and does not carry a second copy, because two copies would drift.
  - Not every ask is a run: a question needs no snapshot.
- **Tests.** `test-code-tab` 13/13:
  - CT-03: Manage passes the picked model through idearium's real router.
  - CT-20 to CT-23, driven in Clear Glass: the plan strip and its runs; "change it" as a Manage edit with the Plan opening on it; an event repainting the tab; a card and a ledger file opening in the Code tab.

  The coding-flow probe's W3 now counts the new button: 15/16. W4 fails the same way without this change. Unchanged and passing: work-surface 16/16, draft-review 12/12, step-gate 18/18, build-verify 11/11, the manage-workbench probe 13/13.
