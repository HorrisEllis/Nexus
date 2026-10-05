# 0.39.346 — 2026-10-05

James: "i feel like it should use copilot regardless, have copilot figure it, and learn from it. failure modes, dynamically switch models, if its not equipped for the task, which i feel like raid is wired to do, agent switching and routing?" · "make sure ollama is all wired into idearium."

CT1, first half (`docs/2026-10-05-code-tab-and-one-router-phasemap.spec`).

- **Found.** Three routers already existed:
  - copilot's default;
  - RAID's router, which picks the system, not the model;
  - `lib/pipeline-routing.js`, the build's policy: learned per kind of job, breakers, failure classes, the chain.

  Idearium's pages (workshop, architect, void, deliver) used none of them. They followed the global default provider and never passed a model, so with Ollama they got the bridge's default model.
- **`lib/model-door.js`, new.** It is copilot's door to `pipeline-routing`'s policy, not a fourth router.
  - `POST /api/route { kind, preferAgent, policy }` returns the hops to try. Each hop has a provider, backend, agent and model, and each Ollama model is its own hop.
  - With enough outcomes for a kind of job, what has done it well goes first.
  - `POST /api/route/outcome` records each outcome in the economy ledger and the breaker.
- **`idearium/api` `_agentAsk`.** The pages now ask through the door, walk its route, and move to the next model when a hop fails in a class the policy falls back on (truncated, empty, timeout …). Every outcome goes back. The answer says which model gave it. The caller still sends its own prompt; copilot decides who answers, not what is sent (0.39.258).
- **Tests.** `test-model-door` 4/4 (registered).
  - MD-04: a cut answer from `small:3b` moves to `big:7b`, both reached Ollama with the model the door chose, and both outcomes went back.
  - Unchanged and passing: pipeline-routing 19/19, spatial-void, spec-workshop, architect, economy, agent routing.
  - `architect-spec-builder-theme` is 14/21 before and after this change.
- **Next (CT1, second half).** The repo agent and the spec engine through the same door.
