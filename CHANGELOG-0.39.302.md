# 0.39.302 — 2026-10-02

James: "Yes, then I can use idearium to build anything needed. I mean look at docs."
James: "Also what about shadow space reasoning for the debugging? That's what needs to be prioritized. Idearium. And clearglass."
James: "like anything you can do, enterprise grade code, highest leverage, to help with the jobs or earn money."

## The delivery checker: does the work do what was promised?
You don't read code, so every piece of work has to prove itself in words you can check. Now it can.

**End-state conditions.** Each condition is one promise in plain words plus a check a machine can run:

| Kind | What it checks |
|---|---|
| file | the file exists (and contains this text) |
| command | the command succeeds (and prints this) |
| tests | the project's tests pass |
| page | the app is started, and the page answers with the right status and shows the right text |

The app is always stopped afterwards, even if a check fails.

**Shadow space first.** Before anything runs, the whole end state is declared as what *should* exist. Afterwards, every promise that isn't met comes back as an absence: a gap in Nexus's gap field, with the promise's own words and the cause attached. The debugging starts from "this was expected and isn't there", not from a guess.

**Every failure has a mode and a plain cause:**
- a file missing, or present without the expected text;
- a command failing or timing out;
- tests failing, or no tests at all;
- the app not starting;
- a page unreachable, answering with an error, or missing its text.

The modes are kept, ready for failure mining (FM1).

**The proof report**, written into the repo as `proof/PROOF-REPORT.md`, for you and for the client:
- READY or NOT READY, and how many promises were met;
- a row per promise;
- "What is missing, and why";
- the evidence.

It ends with: *"Every line above was checked by running it, not by reading it."* Each run is also kept in the repo's history.

**The agent only proposes.** Give it the brief and it suggests checkable conditions; nothing runs until you send them to the check.

- **API:** `POST /api/repos/:uuid/deliver/check`, `GET /api/repos/:uuid/deliver/check` (the last run), `POST /api/repos/:uuid/deliver/conditions` (the agent's proposals).
- **CLI:** `idearium deliver check <repo> <conditions.json> [--start "npm start" --url http://127.0.0.1:3000/]`, `idearium deliver last <repo>`, `idearium deliver conditions <repo> "<brief>"`.

## Found while building
- **Files written beside a repo were lost.** Idearium rebuilds a repo's working folder from its store, so the first version's report and history disappeared between calls (caught by the end-to-end drive). The report and runs now go through Idearium's repo layer: they're part of the repo, versioned with it, and read back from it.

## Wired
- **Code:** `idearium/repo/proof-run.js`.
- **Loom:** mapped in `loom/maps/one-idearium-map.js`. Rebuilt from an empty registry: 2751 components, rejections unchanged at the baseline 10 / 109. Real wires `lib/shadow.js` → proof-run → idearium's API.
- **Event contract:** `idearium.proof-run.settled` is declared in `idearium/event-taxonomy.cjs`, which is new, holds only what this release added, and validates against the shared shape on load. Declaring all the events idearium already emits is EV0.
- **Versions:** Idearium 4.25.0, with `proof-run` 1.0.0 in the module list.
- **Map:** `docs/2026-10-02-emerge-field-memory-build-phasemap.spec` 1.5.0 adds this phase (PR1) and maps the rest of your loop:
  - PR2: screenshots through Clear Glass;
  - LB1: the end-state lab, where agents iterate in a sandbox with feedback, change strategy when stuck, stay within a budget, and never merge on their own;
  - FM1: failure modes mined into `.failure_mode` nodes;
  - MS1: mental simulation of a strategy before spending attempts.

## Proof
- `tests/modules/test-proof-run.test.js`: **7/7**, on a real fixture project:
  - every condition kind, met and unmet, with modes, causes and evidence;
  - paths outside the project refused;
  - a real app started, its pages checked, and its port free afterwards;
  - an app that never answers, and page checks with no start command;
  - the shadow's absences matching the unmet promises exactly;
  - the report's wording;
  - writing through a repo layer, and a failing writer never claiming files it didn't write;
  - the agent's proposals parsed, never run;
  - the wiring.
- **End to end through the real Idearium server:** a spec made in the workshop and saved into a new repo, then a delivery check through the API: 2 of 3 met, with the missing README reported as a missing file. The last run was read back from the repo. An empty list was refused (400), an unknown repo got 404, and too short a brief was refused.
