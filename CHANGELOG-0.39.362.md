# 0.39.362 — 2026-10-06

James: "we could have each compartment in idearium support axioms, conditions, or end state. like for example, use the least amount of code with the highest levarage that achieves the end state" · "good? also agents need to use the work surface. the work surface could also stream the dom mutator,"

Built as build-from-the-spec 1.25.0: CH1, WS1 and WS2.

## Each compartment has a charter (CH1)
- **Where it lives.** `charter.spec` at the repo's root (`lib/charter.js`). It is versioned and snapshotted like the phasemaps.
- **Axioms** are rules every change follows. They go into every agent request, whether a whole phase or one chunk. A new charter starts with "use the least amount of code with the highest leverage that achieves the end state".
- **Conditions** must always stay true. They are checked in every phase's proof, on the proposed code; a change that breaks one is unproven.
- **The end state** is what done looks like. It is checked after each proven phase (with what is proposed) and by hand. Where a charter has one, it is the Plan's main progress bar ("end state 1/2", each check ✓/✗), with the phase count under it.
- **Leverage.** The least-code axiom is measured: each proven run records the lines it added per check passed, and the Plan shows it.
- **Editing.** A "charter" section on the Plan edits it, with save and "check the end state". A charter that doesn't parse, or a condition with no check, is refused with the reason.
- **Routes:** `GET` / `PUT /api/repos/:uuid/charter`, `POST …/charter/check`.

## Agents use the work surface (WS1)
- **`idearium.work_surface`** is given to every repo agent, and appears in the catalog's Code group with a guide note:
  - **view:** the cards the person sees (status, +/−, diff, the run that made it) and the charter;
  - **prove:** checks the pending proposals, as proposed, against the charter's conditions and end state, and a phase's conditions when given. What's unmet comes back with evidence. This is what an agent calls before saying it's done (`POST /api/repos/:uuid/worksurface/prove`);
  - **withdraw:** takes back its own pending proposal.

  It never applies: approving stays the person's.

## The work surface streams the writing (WS2)
- **Forming cards.** Each file an agent is writing becomes a card while it writes, fed by the same live feed as the Agent tab (a browser agent's DOM mutations and node anchor, or an Ollama model's text):
  - its path and lines as they arrive;
  - "writing" while its fence is open;
  - "written — landing" once it closes;
  - gone when the real card lands.
- **The header** says who is writing, the mutation count and the node anchor.
- **Cost.** Each feed frame repaints only the forming cards.

## Proof
- **`test-chunked-phase-build` passes 14/14:**
  - the charter end to end on a real repo: the axiom in both chunk requests, its condition in the proof, the leverage recorded, the end state 1/2 with the proposals and 0/2 on the files alone;
  - the agent's tool, called over HTTP into the real API.
- **`test-work-surface` passes 27/27.** WS-30 to WS-34 load the real `work-surface.js` and feed it a reply mid-stream.
- **Updated:**
  - `test-code-tools` 28/28: the tool count is now 12;
  - `test-agent-record` 30/30: the charter text sits before the precedent in the request.
- **Unchanged and passing:**

| Suite | Result |
|---|---|
| test-agent-tools-and-graph | 13/13 |
| test-composed-prompt | 20/20 |
| test-tool-guide | 7/7 |
| test-copilot-tool-runtime | 12/12 |
| test-opportunity | 28/28 |
| test-code-tab | 16/16 |
| test-agent-live | 4/4 |
| test-agent-feed | 19/19 |
| test-live-stream-and-gates | 13/13 |
| test-build-surface | 13/13 |
| test-prove-loop | 7/7 |
| test-escalation-ladder | 9/9 |
| test-shadow | 16/16 |
| test-draft-review | 12/12 |

## Not yet
- **Leverage doesn't steer anything yet.** It's recorded and shown, but the agent record doesn't use it for routing, and an unusually large proposal isn't flagged on its card.
- **No chunk tells the agent to use `work_surface prove`.** Small models in chunked builds answer with fenced files and no tools; the tool is for agents that run the tool loop.
- **A Nexus repo's charter can't be saved from the Plan.** It has to be proposed through the approval gate.
