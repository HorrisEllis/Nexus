# 0.60.118 — 2026-10-17

James: "i want the code tab better. like you have on the right. outputs for proposals and artifacts. changes  for the
worksurface and workspace. background tasks for anything else running in the repo. i want the panels completely seperate
from each other, collapasable, organized and updated in real time. maybe buttons for agent tools, for the repo, to execute.
replayable proceedures? i love the context panel they need to be sperated panels though, bot just a space, but tabs on the
collapsable panels. like how you click the tab on the right of the screen. i want to eb able to open all of them, or none of
them."

DK1 + DK2 of `docs/2026-10-16-code-tab-rebuild-phasemap.spec` (addendum_c). His decisions, recorded as his: each panel is
its own panel with its own edge tab; any number open, all or none; collapsible; real time; the five panels below. The
coder's readings, to confirm: the panels stack in one column beside the rail (rather than each floating like the Plan
window); "artifacts" means Guardian's saved code blocks; "workspace" means the files not in the last version.

## The dock (`idearium/ui/js/code-dock.js`, new)

- **One rail on the right edge.** The Plan's tab comes first (its window is unchanged), then Outputs, Changes, Tasks,
  Context and Tools. Each tab shows a count or a live dot.
- **Each panel opens and closes alone.** `all` and `none` sit at the rail's foot.
- **Open panels stack beside the rail.** Each has its own header: fold ▾ ▸, reload ↻, close ×. Which panels are open and
  folded is remembered per browser (a view preference; nothing else is kept in the browser).
- **The panels:**
  - **Outputs:** the agent's proposals as diff cards with Apply / Reject, the settled ones, and Guardian's latest
    artifacts. Guardian keeps artifacts by chat, not by repo, so the panel says they come from every chat.
  - **Changes:** the workspace (files that differ from the last version, by state) and the work surface's change records
    (who made each change, and why).
  - **Tasks:** everything running in the repo. It repaints from `idearium.repo.task` with no fetch.
  - **Context:** the Plan's Context card, now its own panel. The card stays in the Plan too.
  - **Tools:** the repo's agent tools as buttons, grouped. A tool outside the repo's scope is disabled. Its arguments open
    as JSON, and ▶ runs it. Procedures are listed with ▶ replay; a run's tool calls, or a single call, can be kept as one.
- **Real time:** only the open panels reload, once per burst of events, and only on the events that concern them. An
  event for another repo changes nothing.

## Tools and procedures (`lib/repo-procedures.js`, new)

- **A person runs a tool through the agent's own door:** copilot `/api/tools/run`, with this repo's tool scope enforced.
  A button can do no more than the agent can.
- **A procedure is a `.procedure` file** (a new node type, with its schema in `lib/node-schemas/schema.procedure`). It
  replays in order; the first failing step stops it and is named. Every replay is kept on the file. Archiving moves the
  file aside, never deletes it.
- **Kept from a run:** the run's tool calls become a procedure. The run state keeps each call's arguments cut at 110
  characters, so a call whose arguments were cut is left out and named, never guessed. Failed calls are skipped.
- **Routes:** `POST /api/repos/:uuid/agent/tools/run`, `GET/POST /api/repos/:uuid/procedures`,
  `POST /api/repos/:uuid/procedures/from-run`, `POST /api/repos/:uuid/procedures/:id/replay`,
  `DELETE /api/repos/:uuid/procedures/:id`, `GET /api/repos/:uuid/artifacts`.
- **Commands** (every agent has them through nexus.command): `repo tool <repo> <tool> --args '{…}'`,
  `repo procedures <repo>`, `repo procedure <repo> replay <id> | from-run <runId> | remove <id>`.
- **Events:** `idearium.repo.tool.ran`, `idearium.repo.procedure.saved`, `idearium.repo.procedure.replayed`, declared in
  `idearium/event-taxonomy.cjs`. Loom wires are in `loom/maps/run-state-map.js`; routes are in
  `idearium/registry-components.js`.

## Proof

- `tests/modules/test-repo-procedures.test.js` 7/7.
- `tests/modules/test-code-dock.test.js` 9/9. DK-01 runs through idearium's real router against a stand-in copilot.
  DK-10..17 are driven in Clear Glass: one rail, each panel alone, all, none, fold, the Outputs cards, the Changes states,
  tasks live with no fetch, a tool run, a replay, a call kept, and events scoped to the repo and the open panels.
- `test-code-tab` 16/16, `test-inject-screen` 14/14, `test-node-export` 10/10, `test-projects-overview` 7/7 (no route
  collision).
- Failures that are the same without this change: `test-event-contracts` EC-05 (other systems' undeclared emits),
  `test-cli-route-commands` CL-07 (it needs Guardian running), `test-node-schemas` NS-003/NS-012.

## Not done, said

- Not seen on his machine yet; the tests drive the real files in Clear Glass, not his running page.
- Artifacts are not tied to a repo: Guardian stores them by chat.
- A procedure replays tool calls only, not chat turns or gate moves.
