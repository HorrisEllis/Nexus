# 0.60.620 — smallest first

James, 2026-11-20: "yes do that, smallest first."

## What changed
The sixth build (EMB3, run phrun-mwpax54i-jgyi) reached test-first and crawled. Measured: DeepSeek 16b, kept loaded by 0.60.617, held 7 GB of his 16 GB (llama-server 7,016 MB; Nexus's Node systems 1,922; this coder's app 1,445; Firefox 836), leaving 0.4 GB free: the PC paged, and even the 3b could not answer "ok" in 60 s.
- **Keep-alive by size** (ollama/config.js, ollama/lib/ollama-client.js): a model at or under `KEEP_ALIVE_MAX_B` (4) billion parameters, read from its tag (`:3b`, `:16b`, `:30b`), stays loaded for `KEEP_ALIVE` (30m); a bigger one is unloaded as soon as it answers (`KEEP_ALIVE_BIG`, `0`). Each overridable by its OLLAMA_ variable.
- **The test written first, smallest first** (idearium/api/index.js): with the Emerge ladder set, its smallest model writes the test, asked bare; each bigger one on the ladder takes over if the smaller gives no usable test. The test is still kept only if it fails on today's tree. Not independent of the coder when the same model codes the first gap: said on the row.
- COS's resource manager already proposes stopping the largest non-critical system under memory pressure, for him to take or drop: unchanged.

test-emerge-rung 11/11.

## Files
- ollama/config.js, ollama/lib/ollama-client.js, idearium/api/index.js
