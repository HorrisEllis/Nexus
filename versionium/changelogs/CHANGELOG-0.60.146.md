# 0.60.146 — 2026-10-18

James: "okay only one record. maybe use it as a contract ledger for each contract."

He was answering TL2a-4. The coder had found that 0.60.143's work journal kept the same reply text that Clear Glass's chat
ledger already keeps. The coder recommended keeping the journal as a per-gate index and making the chat ledger the text's
one home. His decision has two parts: one record of a reply, and the journal used as a ledger for each contract.

The details are the coder's reading, to be confirmed. They are in `docs/2026-10-16-durable-work-timeline-phasemap.spec`
addendum (g).

## The contract ledger (`lib/work-journal.js` 2.0.0)

- **One ledger per contract.** Each contract has one append-only file, `data/work/<repo>/<map>::<phase>.ledger.jsonl`. A
  job with no gate (an Agent tab chat) goes in the repo's `agent.ledger.jsonl`.
- **What each line records:**
  - `job` — its gate, attempt, run and session;
  - `link` — the chat ledger turn its reply is written in;
  - `frame` — each event, with no text;
  - `text` or `think` — only when no other record holds the reply;
  - `handled` — an attempt judged it;
  - `moved` — its gate became known, so it continues in its contract's ledger.
- **`jobs.index.json`** maps each job to its ledger. It is a projection, rebuilt from the ledgers when it is missing.
- **Nothing lost (§0.3).** The job folders written by 0.60.143–0.60.145 are still read.
- **The API is unchanged:** `record`, `list`, `get`, `gates`, `mark`, `reusable`. So the gate context, reuse, the Code tab
  restore and `repo feed` work as before. New: `ledger(repo, contract)`, through `GET agent/feed?contract=` and
  `repo feed <repo> --contract <map>::<phase>`.

## One record of a reply

- **A browser agent's reply.** Its text and thinking live only in Clear Glass's chat ledger
  (`clear-glass/src/downloads/chat-ledger.js`), which the page writes as it streams. Each job now carries its `chatId` and
  `turn`, and its text is read from there.
  - The five userscripts send these: ChatGPT and Claude 10.12.4, DeepSeek and Gemini 10.10.4, Perplexity 10.9.4.
  - `guardian/lib/ncp-handler.js` passes them on.
- **A turn the chat ledger does not have.** This happens with a tab outside Clear Glass. Three seconds after the job ends,
  the reply is written once in the contract ledger instead, with the reason.
- **An Ollama reply** has no chat ledger, so its exact deltas are the ledger's own text.
- **Guardian's `.response`** (the Responses index) stays Guardian's own record of a job's answer (§10.1). Reuse reads it;
  it is not copied.
- **On screen.** A restored reply says where it was read from: "read from Clear Glass's chat ledger".

## Found and fixed

- **The thinking never reached Idearium.** `guardian/server.js`'s `/events` feed passes only the keys on its list
  (`_FEED_KEYS`), and `thinking` was not on it. So the thinking 0.60.142 streamed reached Guardian's bus and stopped there.
  The 0.60.142 tests checked Guardian's bus and the page separately, never the hop between them. Now `thinking`,
  `thinkingLen`, `chatId` and `turn` pass through.
- **Three test pins the coder broke in 0.60.142–0.60.144.** The coder had not run these suites:
  - `test-agent-feed` AF-09 and AF-11;
  - `test-live-stream-and-gates` GS-10.

  Each pinned an exact line that those releases changed. They are now updated to the current lines, and each still checks
  what it was written to check.

  Earlier in this session the coder called them "failing on main" without checking whose change broke them. That was
  wrong: they were the coder's.

## "is that all added to the pipeline?"

James asked this once the ledger was built.

- **The contract builds already had it.** `routing.contract_build` is on by default, and every brick goes through
  `makeAttempt` with its gate. So contract builds already got the gate context, the reuse and the contract ledger.
- **The other builds did not.** With the contract switched off, the whole-phase build and the file-by-file build
  dispatched with no gate.
  - **Fixed:** each of those attempts now has a gate key, `<map>::<phase>::file.<file>`, or `::phase` for the whole phase.
    The dispatch names it, so its replies land in its contract's ledger and its next attempt carries the context and
    reuses a reply already paid for.
  - Only a real brick keys the brick's run state, as before.
- **CI runs no tests.** `.github/workflows/release.yml` builds and checks the release zip; `cos-app.yml` builds the COS app.
  The tests are registered in `tests/modules/run-all.js` and run locally. Whether CI should run them is his call (below).

## The drawbridge, kept

The first version of the ledger required Clear Glass's code directly (`lib/work-journal.js` →
`clear-glass/src/downloads/chat-ledger.js`). That is a new crossing between systems, and his drawbridge rule forbids it.
`test-system-boundary` SB-06 caught it.

Now a linked reply's text is read through Clear Glass's own route, `GET :7701/cli/downloads/ledgers/:chatKey`
(`clear-glass/src/ipc/bridge.js`), with the new async `read()`. If Clear Glass is not reachable, the reply reads
"chat-ledger (Clear Glass not reachable)", and the text is never filled in from elsewhere. SB-06 and SB-08 pass again.

## The full suite, compared

Totals: 6579 passed, 98 failed (32 of them known gaps), and 2 files crashed.

Every one of the 35 files with a failure was run on its own, both here and on main before today's four releases
(`6e00a448`):

| what | files |
|---|---|
| fail the same way before today | 31 |
| failed only here: fixed in this release | `test-system-boundary` (the crossing above) |
| failed only here: an intermittent run, passes when rerun | `test-cos-compartment-template` |
| failed only here: caused by a state file in this container | `test-agent-facts` GA-01, `test-route-eligibility` RE-07 |

About that state file: `guardian/data/nodes/provider/_ledger.jsonl` is ignored by git and dated 13 October. Both tests read
every file in that folder as YAML, so a JSON-lines file breaks them. With the file moved aside, both pass, and it was put
back unchanged.

Already failing before today, reported here, not fixed:

- **The flight recorder carve** (FS-01 to FS-06, CV-14): it leaves out `guardian/jaa-store.js`, which
  `products/flight-recorder/lib/project.js` needs.
- **The atlas references.**
- **Version sync:** 17 failures.

## Proof

| test | result |
|---|---|
| `test-work-journal` | 5/5 |
| `test-gate-context` | 6/6 |
| `test-agent-feed` | 19/19 |
| `test-live-stream-and-gates` | 13/13 |
| `test-contract-phase-build` | 14/14 |
| `test-repo-activity` | 24/24 |
| `test-chat-transcripts` | 31/31 |
| `test-back-and-forth` | 18/18 |
| `test-userscript-protocol-parity` | 12/12 |
| `test-nexus-wake` | 34/34 |
| `test-agent-live` | 5/5 |
| `test-live-everywhere` | 3/3 |
| `test-system-boundary` | 10/10 |
| `test-qa2-real-run` | 5/5 |
| `test-test-first` | 5/5 |
| `test-repo-agent-late` | 17/17 |

What WJ-05 checks:

- a linked reply is never copied, and comes back from the chat ledger after a restart;
- a missing turn is written once;
- a job moves into its contract's ledger;
- an old folder is still read;
- `/events` and `ncp-handler` pass the new fields on.

## To do on his machine

Reload the provider scripts (the new versions above). Until he does, a job carries no `chatId`, so its reply is kept in the
contract ledger, as before.
