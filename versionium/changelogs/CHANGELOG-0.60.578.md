# 0.60.578: the test DeepSeek writes is taken

James, 2026-11-18: "get it working please." · "get the pipeline working today."

Found in NM1's run (through COS's pipeline, on DeepSeek) and the Ollama line's metrics nodes: the build failed at "write the test first".
- One DeepSeek call: "ollama sent nothing for 120000 ms before its first token" — the 10.5 GB model loading cold with ~6 GB free.
  `ollama/config.js`: RAW_FIRST_TOKEN_MS 120 s → 300 s (OLLAMA_RAW_FIRST_TOKEN_MS still overrides).
- Three DeepSeek replies (113-207 s) came back but "the reply had no code block": cut before the closing fence.
  `lib/test-first.js` extract: an opened fence with no close is the code to the end of the reply.

Proof: extract on a cut reply returns the code; on prose, nothing; test-tf-already-done 4/4. Not proved: NM1 landing (run next).
