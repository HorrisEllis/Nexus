# 0.60.29 — 2026-10-13

James: "All the phases need to be mapped to files and dependencies. With nexus and all projects."

## Measured first

On Nexus's own phasemaps there are 1,351 phases, 777 of them open. Of the open ones:

| | phases |
|---|---|
| name their files (`files:`) | 370 |
| write file paths in their text, but list none | 184 |
| write no path at all | 223 |
| have no `depends_on` | 195 |

The text can't be read for files. The phases that do list their files are a ground truth to test against: only 27% of
the paths in their prose are among their files (172 of 644). The rest are files they read, mirror, or were checked
against. Phrases that sound like building ("add", "new", "write") score 23%.

That also meant 0.60.28's "plan without a model", which took paths from the text when `files:` was missing, would have
rewritten reference files. **Fixed:** it now plans only the files a phase lists.

## How phases get mapped now

Idearium → a repo → **Phases** → **⇄ map files & dependencies**. It runs in the background, and its line shows the
progress and then the result. It works the same on Nexus and on every project.

1. **The agent is scored first.** The agent the door picks (Ollama first) maps phases whose files are already listed,
   with those lists hidden. It is scored for precision and recall. Its answers are written only when its precision
   reaches 0.8 on at least 5 phases. Otherwise they are kept as proposals, and the line says why.
2. **Code gathers the facts, the agent decides.** Each request covers a few phases, with every path they mention
   marked as existing, new (its folder exists) or impossible. The agent answers which files each phase creates or
   changes. Code checks every answer: paths must be safe, and a file must exist or sit in a folder that exists.
3. **Dependencies come from the files, by code.** A phase depends on the nearest earlier phase in its map that changes
   the same file.
   - Hub files don't count. `idearium/api/index.js` is named by 118 phases and `app.js` by 57, so sharing one says
     nothing about order.
   - A false `depends_on` blocks a phase until another is done, so it isn't added on weak evidence.
4. **Only what's missing is written.** `files:` and `depends_on` are added to a phase block that lacks them; nothing
   already there is changed. Each line carries a comment saying who mapped it and the measured precision, or which
   shared file the dependency comes from.
   - Every changed map goes in one write. For Nexus that is one apply through the apply gate: snapshotted and
     reversible.
   - A map that parsed before and wouldn't after is refused.
5. **Resumable.** A second run asks nothing again for phases already mapped.

Phases written on one line (`ID: { … }`) can't take a key in place. Nexus has 33. They aren't sent to the agent, and the
line says so.

Where else:
- **Command:** `repo map-phases <repo>`, and `repo map-phases <repo> status` for progress.
- **Route:** `POST /api/repos/:uuid/phases/map` starts it; `GET` returns progress and the report.
- **Settings:** Idearium → Settings → repos: `map_min_precision`, `map_min_scored`, `map_batch`, `map_done` (map done
  phases too; off by default).

## Applied to Nexus in this release

13 `depends_on` lines were added to open phases in 4 maps, by code alone, each derived from a file the two phases share.
Every map still parses and keeps its phase count. For example:
- EX0 → SC0, both change `cortex/core/raid/contract-gates.js`;
- JB6 → JB4, both change `clear-glass/src/autofill/store.js`.

**Not applied here:** `files:` for the 407 open phases that list none. That is the agent's job, scored first, and it
runs on your machine with Ollama. Doing 407 by hand is the bulk work the agent rule keeps off the most expensive agent.
Press the button once you've updated.

## To confirm with James

- **The trust threshold:** precision 0.8 on at least 5 known phases.
- **Done phases:** left out by default.
- **Hub files:** files named by at least max(8, 2% of the phases naming files) aren't used as dependency evidence.

## Proof

- `test-phase-mapping` 12/12.
  - The pure functions:
    - the brief hides a scored phase's files;
    - answers are checked by code;
    - precision and recall;
    - dependencies from files, and hub files are not evidence;
    - only missing keys are added, and the map still parses.
  - The job, with a stand-in agent:
    - an agent that takes a reference for a target scores 0, and nothing of its is written;
    - a trusted agent's files and the derived dependency are written;
    - a re-run asks nothing again.
  - The real route on a real project repo: started, ran in the background, and wrote into that repo's phasemap.
- `test-run-ready` RR-10 now says text paths are not planned.
- Unchanged and green:
  - contract-phase-build 8, chunked-phase-build 15, plan-code-run-attention 40;
  - loom-phasemap 7, phasemap-status 14, phasemap-diagnosis 10;
  - cg-command-index 2, loom-map 19.

Not yet: a run on your machine, or a look at the new button in Clear Glass.
