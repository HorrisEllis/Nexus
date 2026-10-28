# 0.60.9 — 2026-10-13

James:
- "speccing, mapping, like needs to do the complex parts of the project. like spec, map, read, like anything that needs complex reasoning. now i want to test the pipeline using the intent routing, like have you hooked that in?"
- "just anything ollama cant do. like find anything that needs complex reasoning in idearium. also want to reduce as much as possible"

**Before this release:** intent routing was hooked into the repo agent's chat only.

**Now:** it is hooked into the one door every caller uses, `lib/model-door.js` (`POST /api/route`). That covers chat, the workshop and architect pages, and chunk builds. Routed through the door with a chain of `ollama:small:3b > claude > chatgpt`:

| Job | First hop |
|---|---|
| `page:workshop` (spec) | claude (reasoning) |
| `page:architect` (map) | claude (reasoning) |
| `spec-plan` | claude (reasoning) |
| `build:file.spec`, `build:file.md` | claude (reasoning) |
| complex chat | claude (reasoning) |
| `build:file.js` | ollama |
| `page:void` | ollama |
| plain chat | ollama |

Only what Ollama can't do goes to a big agent. Rules that keep it from overriding you:
- A kind with learned outcomes keeps its learned order.
- A spec block that names its own agent is never overridden.
- `routing.reasoner` names the reasoning agent.
- `routing.reason_route: off` turns the whole thing off.

**Proof:**
- `test-reasoning-route` 12/12, including DR-01–03 at the door.
- `test-model-door` 8/8. Its learning test caught the first version overriding a learned order; that is fixed.
- `test-pipeline-routing` and the repo-agent suites are green.
