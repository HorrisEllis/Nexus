# 0.60.642: the first phase written by the smallest model

James, 2026-11-23: "nexus is meant to make coding with small llms possible." · "We need to get this coding for what it is. Nexus has everything, either right now or planned." · "each step builds upon the last"

`EMB3_the_autocorrect` is built and landed: `idearium/lib/autocorrect.eg`, 13 functions. The 3b wrote 11 of their bodies; 2 lines came from the plan with no model. It rewrites the JavaScript habits Emerge refuses (`!`, `&&`, `||`, `===`, `!==`, a line's `;`) and leaves quoted text alone.

- **How:** small pieces, each a fresh prompt under 1,600 characters; passed pieces kept on disk so each run builds on the last; the COS builder's new `--pieces` door runs them through the rung's compile, build and the phase's 10-example test.
- **Before:** 146 tries at one large function, no pass.

Bias, named: the coder split the phase and worded its pieces while watching the failures, and a harness made mechanical repairs. Nexus splitting a phase by itself is not yet shown. The 3b's license is research-only.
