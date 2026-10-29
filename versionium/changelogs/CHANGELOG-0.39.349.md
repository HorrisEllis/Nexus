# 0.39.349 — 2026-10-05

James: "the code tab the agent tab, work surface, like full activity, enterprise grade?" · "its just the code tab is meaningless. what about uncommited changes?"

CT3 done: the Code tab is the work surface (`idearium/ui/js/code-surface.js`, `css/code-surface.css`). It is built from what already existed; it stores nothing.

- **Left: the files.**
  - States come from the Files tab's own check (`file-manage.js`, `GET …/files/state`): modified and new files are marked, a file that exists only as a proposal is greyed, and a file with a change waiting has a dot.
  - "changed only" shows just what differs from the last version.
- **Middle: the file.**
  - Its lines, with each chunk marked where it starts (`code-api` outline). Click a line number to pick it; shift-click widens the pick.
  - The agent's change to the file sits above it as a diff, with Apply / Reject (`work-surface.js` cards and actions). With no file open, every change the agent made is listed.
  - Search by meaning or exact text stays.
- **Right: the chunk card and the agent.**
  - A chunk's card shows what it uses, what uses it, and its tests.
  - The agent is docked. It names the model copilot's door would choose, through the new `GET /api/repos/:uuid/agent/route`. A provider set in Settings shows as pinned, and the door is not asked.
  - Any other hop can be picked. It is sent with its backend and model (`agent/prompt` now passes `model`), with the open file and picked lines as context. The reply says which model answered.
- **Bottom: activity.** One strip that folds: the agent's tool calls (failures in red) and the changes.
- **Moved, not lost.**
  - The old `renderRepoCode`, `codeRunSearch` and `codeOpenChunk` in `app.js` are replaced by `code-surface.js`.
  - Manage reads the Code tab's search from `CS`.
  - `work-surface.js` tells the Code tab after Apply, Reject, Revert and Promote.
- **Pushback, built that way.** The Agent tab stays. Its history, late replies, approvals and settings are a whole surface. The docked agent asks the same agent through the same route.
- **Tests.** `test-code-tab` 8/8:
  - CT-01 and CT-02 go through idearium's real router against a stand-in copilot.
  - CT-10 to CT-15 are driven in Clear Glass, covering the greyed and marked files, the diffs, Apply, the chunk card, the docked agent's pick and context, and activity.

  Unchanged and passing: work-surface 16/16, model-door 8/8, repo-settings-ui 7/7, route-contracts 4/4, interaction-contract 39/39, build-surface 3/3, and the manage-workbench probe 13/13.

  The build-surface probe's BS10 (environment rows) fails the same way without this change.
- **Loom.** `code-surface.js` is mapped with its three wires (`loom/maps/build-surface-map.js`). The map now declares an export hook for a dependency the scan gave none, which also resolved two older wires there. Still unresolved: 113 → 112.
- **Next.** CT4: the Ollama check in Settings.
