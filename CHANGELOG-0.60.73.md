# 0.60.73 - 2026-10-16

James: "good embedded check isnt working, need to fix that for good."

## What was wrong
The check ran once (or only when the queue had items), trusted the model list, and stayed decided: Ollama starting after Nexus was never noticed, "listed" meant "working" even when the model could not load, the address was hardcoded, and tf-idf and neural vectors were compared with each other.

## What changed (lib/vector-memory.js, lib/local-vector-index.js)
- Real probe: reachable, model pulled, and a test embedding of the right size. Each failure has its own reason, shown in status.
- Re-check every 30 s on an unref'd timer; recovery upgrades tf-idf items to neural without a restart.
- Every vector is tagged; search only compares like with like and reports what it skipped.
- OLLAMA_HOST honoured; NEXUS_VECTOR_INDEX_DIR overrides the index dir.

## Tests
EC-01..10 against a fake Ollama that goes down and up. The pipeline test now uses a temp index.

## Limits
Not run against real Ollama from here. A tf-idf item is upgraded from its 200-char snippet, not the full text.
