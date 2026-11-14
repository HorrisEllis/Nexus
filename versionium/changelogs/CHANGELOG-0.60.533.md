# 0.60.533 — Nexus reaches Ollama on his PC: its listen address is no longer dialled

Found on James's PC, 2026-11-14, proving 0.60.532's `ask @ollama` in COS's Console (his words of that release: "the console in cos, is
supposed to hook into each system, and agent"). Copilot answered "ollama unavailable" while Ollama was running and answering on
127.0.0.1:11434 (61.66 tokens/s measured the day before).

## Found
- His `OLLAMA_HOST` is `0.0.0.0:11434`. That variable is Ollama's own: it tells Ollama's **server** where to listen (every interface).
- Nexus read the same variable as the address to **dial**: `ollama/config.js` (the bridge, its client, its routes, vector memory),
  `ollama/ollama-runtime.js`, and the agent tool `lib/agent-tools/tools/ollama/generate.js`. 0.0.0.0 is not an address a client reaches on
  Windows, so every call to Ollama through Nexus failed, and the bridge reported "ollama offline".
- So on his PC, nothing in Nexus could use Ollama: the co-pilot's Ollama way, the pipeline's Ollama rung, the framework trial.

## Fixed (OA1)
- `ollama/config.js` `clientAddress()`: a listen-everywhere address (0.0.0.0, [::]) is dialled on this machine's loopback; any other value
  is used as given. The runtime and the agent tool follow the same rule.

## Proof
- `node tests/modules/ollama-runtime.test.js`: 9 passed, 0 failed (H1: eight addresses).
- With his environment: `ollama/config.js` gives `http://127.0.0.1:11434`.
- On his PC, through COS's Console: stated in the map's addendum after the bridge restarts on this release.

## His, not changed by the coder
- The bridge's default model is `qwen2.5-coder:7b` (his 2026-09 choice, "new models. qwen3.5:9b qwen2.5-coder:7b"). Installed on his PC
  today: only `huihui_ai/qwen2.5-coder-abliterate:3b`. The bridge's own setting (`PUT /api/model`) names which one answers.

Coder's part: the diagnosis and the fix.
