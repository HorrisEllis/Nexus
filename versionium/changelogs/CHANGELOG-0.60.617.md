# 0.60.617 — chunked: a plan reads signatures from the phase's words; Ollama keeps a model loaded

James, 2026-11-20: "Chunk dude. Signal to noise. Maybe keep deekseek stay loaded. Everything chunked, decomposed"

## What changed
The second real build through the ladder (EMB3, run phrun-mwoylks4-btbp) crashed after 26 min. The Ollama tape showed why: DeepSeek 16b sent nothing within the 300 s first-token limit on ~6,000-token planner prompts (7.7 GB RAM free; it needs ~10.5 GB with a large prompt), then Ollama's runner failed (HTTP 500 on tokenize).
- **derivePlan** (lib/phase-plan.js) names a NEW file's exports from each `name(params) -> result` its phase writes: to the file of that name, else to the phase's one new non-test file; never guessed onto another. The plan needs no model, and the Emerge rung gets a skeleton of small briefs (about 700 tokens each, the size that answered all day).
- **keep_alive**: Ollama's door asks Ollama to keep a model loaded (ollama/config.js `KEEP_ALIVE`, 30m; `OLLAMA_KEEP_ALIVE` overrides, empty restores Ollama's 5 min). DeepSeek loads in ~38 s on his PC: paid once per build, not per call.

test-emerge-rung 11/11 (ER-11 new); test-run-ready 10/10. test-plan-lands, test-thread and test-workshop-thread do not start on Windows, before and after (a file URL in their ESM import).

## Files
- lib/phase-plan.js, ollama/config.js, ollama/lib/ollama-client.js, tests/modules/test-emerge-rung.test.js
