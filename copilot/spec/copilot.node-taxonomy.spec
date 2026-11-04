# Node type → system map — Copilot

## Legend
WRITES / READS / VIA LOOM / PARTICIPATES / NOT USED — same as Guardian/Versionium.

| Type | Status | Grounding |
|---|---|---|
| `intent` | WRITES — founding source for the taxonomy's REAL promotion | `hooks/copilot.hooks.js`'s real `copilot-prompt` hook declares `seam.intentId: "ask\|build\|diagnose\|navigate\|note\|tool\|action"`, and `copilot/intents.js` implements real dispatch for each (`classifyIntent()`, `route()`, `handleNavigate`/`handleNote`/`handleTool`/`handleAction`). This is the evidence that promoted `.intent` from `OPEN` to `REAL` in the main taxonomy. |
| `input` | WRITES — half the real union | `copilot/cli.js`'s real `POST /api/prompt` body (`{prompt, channel, sessionId, provider}`) — one of the two shapes `schema.input` unions. |
| `output` | WRITES — half the real union | `copilot/cli.js`'s parsed `/api/prompt` reply (`{ok, response, error, toolResult, denied, reason, context}`) — the other half of `schema.output`'s union. |
| `input` (second mode) | PARTICIPATES | Copilot's own meta-CLI router (`MODULE_CLI` in `copilot/cli.js`) injects argv directly into other systems' spawned `cli.js` processes — a second real injection mode, noted on `schema.input` but not separately schema'd. |
| `tool` | USES — shares the loop | `copilot/tool-runtime.js` wires the same shared `lib/agent-tools` registry guardian and ollama use — confirmed via `guardian/tool-runtime.js`'s own "nobody owns the loop" header. |
| `capability` | WRITES | `copilot/registry-components.js`, same `_c()` convention. |
| `command` | WRITES | Same registry, route-shaped entries. |
| `component` | VIA LOOM | Confirmed — `'copilot'` is in `capability-map.js`'s real `SYSTEMS` map. |
| `hook` | VIA LOOM | Same scan. |
| `wire` | VIA LOOM | Same scan. |
| `node` | VIA LOOM | Same scan. |
| `spec` | WRITES | `copilot/spec/copilot.spec`. |
| `system` | IS ONE | `copilot` is a real, named system in `NEXUS_MAP.md` and `capability-map.js`'s `SYSTEMS` map. |
| `injection` | WRITES — found undocumented here, real, 118 files on disk | `copilot/tool-runtime.js`'s `makeNcpCallModel`'s inner `callModel` — a real, per-call AUDIT RECORD of whether priming/tool-guide injection happened for one outbound NCP dispatch (`primed`, `injectedSystemPrompt`, `injectedToolGuide`, `toolCount`). Records an event that already happened. Not to be confused with `inject_rule` below — checked directly before building that type, not assumed distinct. |
| `inject_rule` | WRITES — real, new 2026-09-19 | `copilot/lib/inject-config.js` (new) — real, editable configuration for the five real context-injection sites in `copilot/server.js`: `_injectUserModel`, `_injectSessionHistory`, `_injectRecallContext`, the inline CORTEX MASTERMIND append, and `tool-guide.js`'s `toolGuide()`. James: "make it into the node type... this needs to be configurable, editable." One real node per site (`data/nodes/inject_rule/<id>.inject_rule`); `enabled:false` skips that site's own network calls entirely, not just its output — proven end to end (seed, idempotent re-seed, real edit read back, partial-merge of `limits`, unknown-id fails loudly). Governs what gets injected; `injection` above records that it happened. |
| Everything else in the 32 | NOT CHECKED EXHAUSTIVELY | Copilot is the largest system checked so far (30+ files: `adaptive-fulfillment.js`, `axiom-manager.js`, `lifeline.js`, `self-model.js`, `user-model.js`, etc.). This pass checked the highest-signal files (`intents.js`, `registry-components.js`, `tool-runtime.js`, `cli.js`) — it did not sweep every remaining file for every remaining type. Marking the rest "not used" here would be an assumption, not a finding — leaving them unlisted rather than guessing. |
