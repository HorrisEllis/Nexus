# 0.60.285 — Idearium's history as nodes, one per unit; Versionium's release backfill off its own process

James, 2026-10-29, after pasting a full run log: "i want all the history in idearium saved as nodes per unit. like a .reponse, .input, all
of the taxonomy and expand if needed." · "what about .node types for each language/code block for each agent?"

Specced first: `docs/idearium-history-nodes.spec`. It compiles in emerge's kg-builder at full depth.
Mapped: `docs/2026-10-29-history-nodes-phasemap.spec`, with its DAG checked.

## What was lost before
Every exchange with a repo's agent was one row in `repo_agent_log`:
- the message cut at 4000 characters and the reply at 8000;
- the tool calls the agent made dropped;
- code blocks not kept apart from the text.

The row stays (the screens read it). The nodes are now the record.

## One exchange, as nodes
Written to `idearium/data/nodes/<type>/<id>.<type>`, where Idearium's own node registry indexes and validates them:

| node | holds |
|---|---|
| `.exchange` | the unit: repo, hat, provider, model, ok/error, time, and the ids of its parts |
| `.input` | the whole message |
| `.response` | the whole reply, never cut |
| `.tool_call` | one per tool the agent called: name, arguments, result, ok (a refused call is kept as failed) |
| `.code_block` | one per fenced block: language as written and normalized, code, lines, sha256, and the agent (provider, model, hat) |

A unit over 2 MB is capped and says so, with its size and hash.

## Decided by his axioms — his to overturn
- **HN_D1.** `.input` and `.response` are reused (his words name them). `.response`'s `jobId` is widened by a dated addendum: an
  Idearium exchange with no job uses its exchange id, and says so with `source: idearium.repo-agent`. New types only where none existed.
- **HN_D2.** On "what about .node types for each language/code block for each agent?": **one `.code_block` type**, with the language and the
  agent as fields, not a type per language or per agent. A type per language would be the same schema dozens of times (NC0: a language
  is data; §5.13: syntax is not architecture). "Every Python block Claude wrote" is a query:
  `repo history-nodes <repo> --lang python --provider claude`.

## Wired
- `lib/repo-agent.js` `_log` writes the nodes for every new exchange, with the whole reply and the tool calls. A write error is logged,
  never thrown into the dispatch.
- **Backfill:** `repo history-nodes <repo> --backfill` (POST `/api/repos/:uuid/history-nodes/backfill`) turns the old log rows into nodes.
  Replies the log had cut are marked `truncated: true`, not passed off as whole. A second backfill writes nothing new.
- **Read:** `repo history-nodes <repo> [--lang l] [--provider p] [--limit n]` (GET `/api/repos/:uuid/history-nodes`).
- Loom: `lib/repo-history-nodes.js` with its wires (repo-agent, the Idearium API, node-export).

## Open
- HN4: the rest of Idearium's history (runs, activity, notes) as nodes.
- HN5: a screen for them.

## Also fixed — the coder's regression from 0.60.278
His run log showed Versionium unresponsive for 1113 s at boot. 0.60.278 made the release sync backfill every release's commits
(`git log -p` over the whole history) inside Versionium's own process. Now:
- the boot sync records the recent releases and answers at once;
- the whole-history backfill runs in a child process (`versionium/lib/release-backfill-worker.js`, `syncInWorker`), one at a time,
  posted in batches;
- `{ all: true }` still waits for it, when asked.

## Proof
- test-history-nodes 5/5 (every node valid against its schema; the whole reply past 8000; the registry indexes them, none invalid;
  backfill honest and idempotent; read by language and agent; route and command).
- test-release-backfill-off-process 2/2 (the parent keeps ticking while the backfill runs).
- test-versionium-everywhere 7/7, test-substrate-spec 3/3, repo-agent suites (35, 44, 67, 33, 17) and node-registry 11/11 unchanged.
- Failing before and after this release, unchanged: test-node-schemas NS-003/NS-012 (failure_mode against ico.js), test-build-surface BS7-04.

## Seen in his log, not yet acted on
- Free memory about 9–14% while qwen2.5-coder:7b (5.2 GB) loads.
- Idearium misses heartbeats while the nexus-self sync walks 4801 files.
- A qwen2.5-coder reply that wrote its tool call as a ```tool text block was shown as the answer (`lib/agent-tools` runToolLoop takes a
  reply with no native tool calls as final).
