# 0.60.15 — 2026-10-13

James: "each block in a .contract file(literally contract as the file extension.) using yaml file, each gated as steps, each chunk or gap can be gated for the llm to need less context window." · Approving the design: "extend Nexus's existing .contract system and make it executable, rather than create another planning format alongside it." His four acceptance conditions are below, each with its proof.

## .contract v2 (`cortex/core/raid/contract-gates.js`)

This keeps the same file type and node envelope as v1 (`BUILD_CONTRACT_SCHEMA`). Every v2 field is optional, so a v1 contract still loads as v1.

**What a v2 contract holds:**
- **outcome:** what must change, why, and the gates that prove it is done.
- **refs:** paths with a content hash and, optionally, a line range.
- **invariants:** each with a check.
- **gaps:** what is missing, where it was looked for, which gates it blocks, and what resolves it.
- **gates:** context, task, verification or phase. Each has `depends_on`, `requires`, `actions` and `pass_when`.
- **state:** each gate's status, its evidence, the hashes it passed against, and its attempts.

**Conditions are machine-checkable or they never pass.** The kinds are `test`, `exists`, `evidence` (with an optional regex to match), `gate`, and the executable checks `CK-001`, `CK-002` and `CK-060`. A free sentence is reported as "unverifiable".

**Gate states:** BLOCKED, READY, RUNNING, PASSED, FAILED and STALE. SKIPPED only applies to a gate marked optional. Completion is derived from the gates, the gaps and the invariants; it is never declared.

**Commands** (every agent has them; there is no screen yet):

| Command | What it does |
|---|---|
| `contract new` | starts a new v2 contract |
| `contract gates` | shows every gate's state and why |
| `contract packet <gate>` | gives the minimal context for one gate |
| `contract check <gate>` | verifies a gate against real evidence and records the result |
| `contract evidence` | records evidence a condition reads |
| `contract status` | complete or not, and exactly why |

## His acceptance conditions, proven

1. **Backward compatibility:** all 30 real legacy contracts in `cortex/input`, `cortex/output` and `guardian/input` load as v1, validate, evaluate as legacy, and are not rewritten (CC-01).
2. **Evidence-driven evaluation:** no recorded evidence means FAILED; wrong evidence means FAILED; a free sentence is unverifiable; a failing test fails; the retry limit stops further attempts and escalates. Real evidence passes (CC-03–05b).
3. **Reliable invalidation:** a changed ref makes exactly its gates, and the gates downstream of them, STALE. An edit outside a ref's line range invalidates nothing, and unrelated gates keep their result (CC-06, CC-06b). As James put it, a hash proves the content is a given version, not that it's correct; the checks prove that.
4. **Self-hosting:** `docs/contracts/ct0-executable-contracts.contract` was run gate by gate with `contract check`. Its five gates were context, evaluator, commands, verify and self-host. Verify ran the 11-check suite, which exited 0. The evaluator derived "complete" (`test-contract-ct0-self` 2/2).

## Mapped next

CT1 is dynamic chunking: a gate that's too big for its agent's context, or that failed twice, splits into child gates that are recorded in the contract.
