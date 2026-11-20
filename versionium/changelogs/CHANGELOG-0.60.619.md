# 0.60.619 — the test written first is asked bare when its writer is Ollama

James, 2026-11-20: "Chunk dude. Signal to noise. ... Everything chunked, decomposed"

## What changed
The fourth build through the ladder (EMB3, run phrun-mwpaeqr9-1c0w) was planned without a model (0.60.618), then stalled 10 min in test-first: its writer, DeepSeek 16b, was asked through the project agent's persona and tools. `_askOllamaBare` (idearium/api/index.js) is now the one bare call to the Ollama system's job route (taped, the model kept loaded), used by the Emerge rung's gaps and, when the writer is an Ollama model, by the test written first: its brief alone, about 280 tokens for EMB3.

test-emerge-rung 11/11.

## Files
- idearium/api/index.js
