# 0.60.94 — 2026-10-16

James: "Every thing the agents do. Needs to determine dependancies, spec, phase, then chunk."

James: "Yes chunk type. When I said brick I was using a metaphor"

James: "pickest the highest leverage, structural change. axioms in the docs are law"

He delegated the pick. The coder chose **FN0**, the agent work funnel
(`docs/2026-10-16-agent-work-funnel-phasemap.spec`). It turns §3.3 (map before build) from a rule the coder follows into
something every agent does by construction. The rest reads from it: FN1–FN4, the GW27 nodes, IH6, and the refactor tool.

## What changed

- **`lib/work-funnel.js` answers a request in his order, with no model:**
  1. **Dependencies:** the files the request names, defines, or calls by a module's plain name ("the officiator"), with
     what they require and what uses them.
  2. **Spec:** the specs that own those files (their system), then the specs of the phases that map them.
  3. **Phase:** the open phase whose mapped files overlap the request's most. A finished phase is never picked.
  4. **Chunks:** that phase's plan, written by Nexus itself (`derivePlan`). One `chunk` per file, of kind `build`
     (his decision: the unit is the chunk).

  A step with no answer stops the funnel there and says why. The later steps are never guessed. A plain question
  ("explain …") is answered directly, without the funnel.
- **Route and command:** `POST /api/repos/:uuid/funnel { request, intent? }` and `repo funnel <repo> <request…>`.
- **Decision recorded:** the refactor tool is **[A]**, the proposal engine. He delegated this one too, and the coder
  chose it under the axioms: §0.3, §3.3, §0.4, and user autonomy (the reasons are in
  `docs/2026-10-13-projects-raid-and-gates-phasemap.spec`).

## Measured on Nexus itself

The whole tree and every phasemap take about 1 second.

| Request | Result |
|---|---|
| "change lib/run-state.js …" | all four steps resolve: dependencies, specs, GW2, 5 chunks |
| "fix the officiator …" | `cortex/core/raid/officiator.js` by its plain name, cortex.spec, RQ27, its chunks |
| "build … idearium/lib/projects.cjs" | stops at phase: no open phase maps it |
| "change the warp-rung …" | stops at phase: only finished phases map it (WB1, WB2), so a new phase comes first (FN2) |

## Proof

- `tests/modules/test-work-funnel.test.js` 8/8. A fixture repo has each stop planted:
  - explain does not enter;
  - all four steps resolve;
  - it stops at dependencies, at spec, and at phase (where only a finished phase maps the file);
  - a plain word names a module;
  - the plain-line form;
  - one request through the real router.
- Loom suites, build-surface, projects-overview and build-paths: green.

## Not built yet

- **FN1:** every entry point (the Agent tab, copilot, the officiator, phase builds) goes through the funnel.
- **FN2:** what is missing gets made first (the spec, a phase on his yes, the chunks).
- **FN3:** each answer is saved as a node.
- **FN4:** the screen.
