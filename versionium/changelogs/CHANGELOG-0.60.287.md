# 0.60.287 — bidirectional causal chaining: his method of reasoning, as the planner

James, 2026-10-29:
> "Each problem needs to build a dag using reverse end state reasoning. Then dynamically chunk until the llm is capable or we have to switch"

Asked whether he meant working back from done:
> "Yes the same way I reason. Bidirectional causal changing."

And:
> "Make sure you put as much evidence of competence as possible not just noise."

## What changed

`lib/intent-flow.js` `causal()` builds the DAG from both ends:
- **Backward** from the end state: the components and tests his done-when names, then what each one uses, recursively.
- **Forward** from the change: the components his words name, then what uses each one, recursively.

Each node gets a role from which side reached it:

| reached from | means | in the contract |
|---|---|---|
| both sides | the causal path | a build gate per node, in build order: `change`, then `carry-to-end` |
| forward only | a side effect | put in the verify gate |
| backward only | a precondition | listed as holding; if it reaches a file that does not exist, asked |
| neither side meets the other | the change cannot cause the end | refused before any contract, with the reason (gap `disconnected`) |

**How the end is found.** The "so …" clause of what he types is the end; the rest is the start. Example: "change the money format so the
cart total shows euros" starts at money and ends at the cart.

`repo do` and the Do box both show the preconditions and the side effects.

Spec: `docs/project-spine.spec` MOD-CAUSAL-CHAIN, phase FA11. His decision: HL_D3 in `docs/2026-10-29-his-loop-phasemap.spec`.

## Mapped, not built

His loop, in his order:
- HL0 Nexus running on his PC;
- HL1 Fiverr on the live site;
- HL3 chunk-or-switch for every contract;
- HL4 tools by intent;
- HL5 every input field a gate;
- HL6 one record per application;
- HL7 portfolio page;
- HL8 calendar;
- HL9 email;
- GP1 Guardian as a COS plugin (that reading is to confirm).

## Evidence, not noise

- His rule is in `docs/CLAUDE.md`. A proof entry needs his words, the call he made, and a check a stranger can run.
- Two proof entries had no check; each got one: the phasemap count, and the command table count.

## Proof

- `test-intent-flow` 5/5. IF-05 shows his method:
  - the path money → pricing → cart;
  - receipts flagged as a side effect;
  - an untouched dependency kept as a precondition that holds;
  - a menu change refused because it cannot reach the cart.
- `test-substrate-spec` 3/3.
