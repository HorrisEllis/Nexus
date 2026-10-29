# 0.60.16 — 2026-10-13

James: "everything can be broken down into smaller pieces, with gates between. dynamic chunking for smaller agents or if the agent is struggling?" · "like this is meant to be agent tools. like the chunking. for data ingestion … also learns better boundaries overtime, nuance, uses nexus to hold the complexity"

## CT1, dynamic chunking (`cortex/core/raid/contract-gates.js`)

- **`split`** splits a gate into child gates, one per ref or per action.
  - Each child keeps its own conditions and gets an evidence key of its own.
  - The parent becomes a phase that passes only when every child has passed, and its own conditions still hold.
  - Downstream gates are unchanged. The split is recorded in the contract.
- **`shouldSplit`** says when to split: the gate's packet is over the agent's learned size, or the gate has failed twice. A gate with one ref and one action is already the smallest piece; it says so instead of splitting.
- **Learned boundaries.** Every `contract check` records the agent, the kind of work, the packet size and whether it passed, in the JAA table `contract_boundaries`.
  - `budget(agent, kind)` is the size that agent passes reliably, kept under its first failure.
  - While the agent is untried, the budget is null, not a guess.
- **Agent tools:** `contract split` and `contract budget`.

## Seen working

Editing the evaluator made CT0's own contract go STALE: every gate named the file that changed. Re-running its five gates passed them again, and the evaluator marked CT0 complete.

## Mapped

CT2: ingestion as contracts. A source (a page Clear Glass reads, a zip, a repo) becomes refs, with one gate per piece. Pieces split to the size each agent has learned, and Nexus holds the whole; each agent only ever holds one piece.

Proof: `test-contract-gates` 15/15, `test-contract-ct0-self` 2/2.
