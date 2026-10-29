# 0.60.17 — 2026-10-13

From the review James brought: "the split should be triggered by more than context overflow or two failures … a parent must not pass merely because its children individually pass … test … a dependency cycle, a child whose inputs become stale mid-execution and a parent whose children all pass but whose integration fails." · And James: "include from copilots tools, brainos, and clearglass automatation, and pipeline workflow and macros, and frameworks and programmable. like a lot of this exists"

## CT1, refined

- **Four split triggers.** A gate splits for:
  - context: its packet is over the agent's learned budget;
  - capability: it has failed twice;
  - verification: a condition can't be checked as written, so each action becomes one verifiable piece;
  - dependency: several actions over several refs can progress independently.
- **Every child carries the original requirement:** the parent gate, the outcome and the actions.
- **Integration is a first-class gate.** A split parent passes only with its own integration check (or `<gate>.integrated` evidence), and `validate` refuses a split parent that has none.
- **Adversarial tests:**
  - a dependency cycle is refused (CC-15);
  - a child whose input goes stale mid-execution holds its parent back (CC-16);
  - children that all pass with integration unproven leave the parent FAILED, and once integration is proven it passes (CC-17).
- **A real bug, fixed.** CC-16 found that STALE didn't stick: the next evaluation turned a stale gate back into READY. It now stays STALE until the gate is re-verified.

## SC0, the scheduler (`contract run`)

Every READY brick runs, with independent ones at the same time, through `lib/agent-tools` `executeTool`. That is the one registry that already holds the copilot's tools, Clear Glass automation and macros, `run-pipeline` / `run-chain` and `nexus.command`; no new runner was added.

Each output is recorded as evidence, then the gate is checked, and this repeats until nothing is READY. A brick whose kind of work has no executor is set aside and reported, never looped on.

EX0 (mapped): agent, glass, pipeline and phase executors, each an adapter onto what already exists.

Proof: `test-contract-gates` 20/20. CT0 went stale on these edits and was re-run through its own gates; it is complete.
