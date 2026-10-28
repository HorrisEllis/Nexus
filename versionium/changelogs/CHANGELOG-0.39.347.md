# 0.39.347 — 2026-10-05

James: "i feel like it should use copilot regardless, have copilot figure it, and learn from it. failure modes, dynamically switch models, if its not equipped for the task"

CT1 done: every model call Idearium makes goes through copilot's door (`lib/model-door.js`, which runs `lib/pipeline-routing`'s learned policy).

- **The repo agent** (`lib/repo-agent.js`).
  - In the copilot position it takes its provider and model from the door. The old `/api/prompt/resolve` is now only the fallback.
  - A copilot-routed answer that fails in a class the policy falls back on (cut, empty, timeout …) moves to the route's next hop, and the answer says so in `switchedFrom`.
  - Ollama with no model picked for the repo gets the door's model: the learned best for this kind of job.
  - Every outcome goes back to the door. The routing policy comes from Idearium (`setRoutingPolicySource`).
- **The spec build** (`idearium/api` `speceng.build`).
  - The route is planned at the door. The local plan runs only when copilot cannot be reached, and `routeVia` says which one decided.
  - `chunk-dispatch` reports every hop to the door (`opts.report`) instead of keeping its own breakers and ledger. One place decides, one set of breakers, one learning.
- **Tests.** `test-model-door` 6/6:
  - MD-05: the build's route walk reports each hop.
  - MD-06: the repo agent in the copilot position — `small:3b` answers cut, it switches to `big:7b`, and both outcomes go back.

  `test-pipeline-routing` 19/19, with PR-24 updated to the door. Unchanged and passing: repo-agent, provider, late, node, agent-context-always, registry-drives-build, repo-context, agent routing, build-surface.
- **Next.** CT2: "not equipped" learned from the verifiers (a constraint broken, a test failed, his dismissal), not only from crashes. CT3: the Code tab as the work surface. CT4: an Ollama check on his machine.
