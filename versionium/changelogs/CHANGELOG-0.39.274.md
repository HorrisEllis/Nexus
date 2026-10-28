# NEXUS 0.39.274: the Clear Glass co-pilot pane uses Ollama or Guardian, never an API

**Date:** 2026-09-27 · base: 0.39.273 · clear-glass 3.18.0 → 3.18.1

James, looking at the pane after sending "go to google.com":

> NEXUS copilot offline. No fallback API key configured — set one in NEXUS Settings.

His reply: *"nexus settings are depreciated. fix it. copilot, is either ollama or guardian. no api"*.

## What was wrong

- **The pane only knew one backup.** It sent every message to the copilot service (:3750). If that failed, the only fallback was a direct call to Anthropic's paid API with a key stored in Clear Glass settings. With no key saved, the pane gave that message, which pointed at a settings page that no longer exists.
- **`ollamaGenerate()` was broken.** It posted to `:3749/api/generate`, a route the NEXUS ollama service does not serve, so every call got a 404.
- **The greeting claimed "Co-pilot online"** before anything had answered.

## What changed (`clear-glass/src/copilot/bridge.js`)

**Where a message goes**

1. The copilot service (:3750) first, unless "Route through NEXUS co-pilot" is off.
2. If copilot is unreachable, the pane answers directly through the same two backends copilot would have used:
   - **Ollama**, through `ollama/ollama-runtime.js` (the same runtime every other NEXUS system uses). The model is the new Clear Glass setting `copilotOllamaModel`, or NEXUS's default model when that is empty.
   - **A Guardian agent** on :7820. The pane sends the prompt to `/command`, then checks `/jobs?id=` until the reply lands.

**Which backend goes first**

- When the pane's route is guardian, the Guardian agent is tried first, then Ollama.
- Otherwise Ollama is tried first, then Guardian.
- When a reply includes tool calls, the pane runs them and sends the results back to the same backend that answered.

**When nothing answers**, the reply lists all three backends and why each failed. For example: `copilot :3750 — ECONNREFUSED`, `ollama — …`, `guardian :7820 (claude) — …`.

**The API fallback is removed**

- No code path calls an external API any more.
- The settings keys `fallbackApiKey`, `fallbackModel` and `fallbackEndpoint` are gone. A key saved by an older build is deleted when settings load, and ignored if anything tries to save one.
- The "Offline fallback" settings pane is replaced by "When the co-pilot service is down", which has a single field: the Ollama model.

**Other fixes**

- `ollamaGenerate()` now goes through the Ollama runtime instead of the 404 route.
- The greeting no longer claims the co-pilot is online.

## Tests

- New: `tests/modules/test-cg-copilot-no-api.test.js` (NA-001..NA-006, registered in `run-all.js`).
  - With copilot down, Ollama answers, and so does Guardian.
  - Each backend covers for the other, and when all three are down the reply names them.
  - With routing off, copilot is never called.
  - A tool-results follow-up stays on the backend that answered.
  - The retired key fields are dropped and never exposed.
- Existing suites unchanged: `clear-glass-agent-surface` 16/16, `test-cg-accounts-portal-settings` 40/40.

## Registry and specs

- **Loom:** `clear-glass/src/copilot/bridge.js` is scanned, not hand-mapped. Its new dependency on `ollama/ollama-runtime.js` is a plain `require()`, so the source scanner wires it on its own.
- **Spec:** there is an addendum in `clear-glass/spec/clear-glass.spec`.
