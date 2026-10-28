# 0.60.143 — 2026-10-18

James: "We need persistent data look at the last commit."

The last commit was 0.60.142. It streamed the agent's thinking and reply live into Code › changes and into the open file.

Mapped in `docs/2026-10-16-durable-work-timeline-phasemap.spec` addendum (d), as TL1's first slice.

## What was lost

Every live frame of an agent's reply lived in two places, and both were memory:

- the page's `AGENT_FEED` map (`idearium/ui/js/app.js`);
- `lib/repo-activity.js`'s task list.

Guardian's response sink (`guardian/lib/response-sink.js`) writes the `.response` node only when the reply ends. So a
reload, an Idearium restart, or a Clear Glass close in the middle of a reply lost the reply and the thinking so far. The
page then said "the agent is not writing". It is the same loss as the 17 spec chunks (TL0), on the path he was watching.

## TL1b — the reply on disk as it streams

- **`lib/work-journal.js`** keeps one folder per agent job: `data/work/<repo>/<job>/`.
  - `reply.response` is a `.response` node (`lib/node-export.js`) holding the reply and the thinking so far. It is
    rewritten atomically (tmp + rename, as `lib/run-state.js` does) on every frame that changes it. A crash leaves the last
    whole file, never half of one. The once-a-second DOM pulse is not a write.
  - `timeline.jsonl` is append-only, one line per event: dispatched, each chunk's length, gates, complete, error. It holds
    no text; the text is in the node.
  - The reply merges by the page's own rules: a restated reply replaces, a repeated tail is dropped, Ollama's deltas append.
  - A frame that arrives after the job ended stays off the reply. An open job with no frame for 15 minutes reads `stale`,
    never `live`.
- **Both doors write to it.** Guardian's feed (`onFeed` in `idearium/api/index.js`) and Ollama's
  `POST /api/repos/:uuid/agent/stream`.
- **Route:** `GET /api/repos/:uuid/agent/feed` lists the newest jobs; `?job=<id>` returns one with its timeline. It is in
  `idearium/interaction-contract.json`.
- **Command:** `repo feed <repo> [<job id>] [--limit n]`. Every agent has it through `nexus.command`.
- **UI:** the first time the page looks at a repo, it reads the newest job back from disk. The live view says "restored
  from disk · <status>", with the reply and the thinking. A live frame that arrives afterwards wins.
- **State stays out of git.** `data/work/` was added to `.gitignore`.
- **Loom:** `lib/work-journal.js` → `lib/node-export.js`; `idearium/api/index.js`, `app.js` and the command row → the route
  (`loom/maps/build-surface-map.js`).

## Mapped in the same release: the product for debugging

James: "can we spec the product for debugging. the intelligence system crystalization  memory, rewind engine, versionium,
cos, rfr2, cos, runtime deviation and friction detection, gap detection, diagnostic system? look at the specs. after that.
should the chunks, contracts, phases, dependancies all have syncronized ids or uuids, also in relation to the job. also what
about using the dependencies to map gaps in codebases or repose, files or code"

The map is `docs/2026-10-18-debugging-product-phasemap.spec`, registered in `docs/SPEC-REGISTRY.spec`. Nothing in it is built.

**What was found.** Each system already answers one part of "what went wrong, why, and how do I go back":

| system | what it answers |
|---|---|
| crystals and `fix_map` | has this happened before, and what fixed it |
| the rewinds | how to go back |
| Versionium | what changed, and caused by what |
| COS | where it can be reproduced safely |
| RFR2 | the conditions it happened in |
| the detector | how far the reply deviated |
| diagnostic and phase faults | friction, and failures before |
| `gap-field` | what is missing |

None of them asks the others, because each keys its records by its own id:

- a Guardian job: a random uuid;
- a run row: `phrun-<ts>-<rand>`;
- a contract brick: `b<n>.<file>`, which is positional;
- a change: a random uuid;
- a commit: a Versionium uuid.

**Ids (D10, decided by his axioms):** synchronized by a shared key, not one shared uuid.

- A thing that is (a phase, a chunk, a contract, a dependency) gets a key derived from its place in the map:
  `<repo>/<map>::<phase>[::<chunk>]`.
- A thing that happens (a job, an attempt, a change, a commit) keeps its own id and carries that key and its attempt.
- A chunk is named for what it is, never its position.

The axioms: §10.1, §5.14, §1.1 and §7.6; the identity primitive; and PC2, his "not linear".

**Dependencies as gaps (D11, decided by his axioms):** yes. Every dependency edge whose far end is missing, or does not
provide what is used, is a gap, found without a model. Five readers already see these edges:

- `component-store`: unresolved requires;
- `repo-carve`: missing files;
- `test-first` and `code-intel`: names used but not exported;
- `phase-deps-gate`: unknown `depends_on`;
- loom's scanners: declared but not served.

None of them reports to the gap field. DBG4 makes them report through `lib/gap-field.js`, for any repo or a single file.
It is the first slice, because it depends on nothing else.

**Still his (DBG0c):** whether the debugger is the flight recorder grown (the coder's recommendation), a second product,
or debugging for Nexus itself.

## Proof

| test | result | what it shows |
|---|---|---|
| `test-work-journal` | 3/3 | WJ-01: after a restart (memory dropped), the reply and the thinking come back byte-identical. WJ-02: the real router, the route and the command. WJ-03: in Clear Glass, a page opened after the reply was written shows it again. |
| `test-agent-live` | 5/5 | |
| `test-live-everywhere` | 3/3 | |
| `test-plan-pieces` | 4/4 | |
| `test-change-record` | 7/7 | |
| `interaction-contract` | 39/39 | |
| `test-build-surface` | 13/13 | |
| `test-build-surface-2` | 3/3 | |

### Failing before this change, and still failing

- `test-cli-route-commands` CL-07 needs a running Guardian. It fails the same way with this change stashed.
- `test-test-sandbox` names `test-cos-app-runtime` and `test-projects-overview`, neither of which this release touches.

## Open

- **TL2, resume at boot.** The next request does not yet carry what the journal holds.
- **Ids.** The journal is per Guardian or Ollama job. It is not yet tied to a work id across a phase's attempts. See the id
  question in `docs/2026-10-18-debugging-product-phasemap.spec`.
- **`data/run-state/` is not in `.gitignore` either.** It was left as it is, because "state in git" is IM0a, his open call.
