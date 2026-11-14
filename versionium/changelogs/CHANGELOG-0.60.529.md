# 0.60.529 — an input to RAID becomes a contract (RD9 slice b)

James, 2026-11-14: "input -> raid uses agent and contract tool with the schema or template listing the system, agent, what hat if applicaple, capability/command, the data from the compartment whether the contents of a file, zip or context synthesized from a dag, tags, dag to determin the conditions, etc. contract as the end state. already mapped this at one point" · told it was mapped in the request spine (RQ6, RQ7, RQ8, RQ21) and gathered into RD9: "yes built it"

## Built
`cortex/core/raid/contract-template.js`, one template:

| Field | What fills it |
|---|---|
| system | the system that owns the work (required) |
| agent | the agent RAID picks, and why (required) |
| hat | the persona any agent can wear, when one applies |
| capability / command | what is invoked (one of the two required) |
| data | from the compartment: a file (path, hash), a zip (path, hash, entries), or context from the DAG (source, hash) |
| tags | a closed grammar: `request: phase: gate: outcome: rung: kind: system: hat: input:` |
| dag | what must be known or done first (required) |
| outcome | the end state: what must be true when it is done (required) |

- Filled as RAID's executable contract (v2: outcome, refs, gates, gaps), with the older B1 fields (`forAgent`, `intention`, `system`,
  `endState`, `conditions`) mapped in, so either reader finds what it knows.
- **The DAG is the conditions.** Every DAG node is a gate; `outcome.done_when` is each of them passed. Two gates come first: `template`
  (every field answered) and `data` (what the compartment holds, as referenced).
- **Data is referenced, never copied:** a file or zip by its path and hash; context by its source and hash. The original stays the
  authority; a changed file makes the gates that used it stale (v2's rule).
- **Nothing is guessed.** A required field that cannot be filled is a gap, named in plain words, blocking the first gate, put to him.
  A file that is not there is a gap too.
- **Refused before booking:** a tag outside the grammar, a DAG node that names one not in the DAG, a loop.

`POST /api/raid/input` now drafts the input into this contract and books it through RAID's own v2 door; the `.input` node names the
contract it became, and the gaps. `GET /api/raid/contract-template` and `raid template` show the fields. The three routes are
declared in Cortex's interaction contract (the input routes were not, since 0.60.486).

## Proof
`tests/modules/test-raid-input.test.js` 6/6, right on the first run:
- RI-03: an input with a file: every field filled, the file by its hash, the DAG its gates (`template, data, read, write, prove`), done when
  each passes, booked, the `.input` node pointing at it.
- RI-04: a zip (path, hash, entries) and context (source, hash); no contents copied.
- RI-05: an input with nothing but words: booked with four gaps in plain words, each blocking the first gate; not complete.
- RI-06: a bad tag, a dangling DAG node and a loop, each refused and named.

RAID's contract suites unchanged: test-contract-gates 20, test-raid-contract-door 4, test-raid-runs-contract 7.

## Not yet
- Run against a live Cortex: here the route's functions are tested, not Cortex's process.
- RAID filling the DAG and the outcome itself from the words (RQ6's intent map, RQ7's obligations): today they are given in the input, or
  asked. The asking (RQ8: the gap as a question in the copilot pane) has no screen yet.
- Acting on the contract: COS runs a v2 contract as a pipeline already (PC12a); wiring the booked contract to start one is the next slice.

## JavaScript, said
`contract-template.js` is new JavaScript: Cortex's RAID is JavaScript and no Emerge port of RAID is mapped. It leaves with RAID's port.
