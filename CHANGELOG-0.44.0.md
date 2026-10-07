# 0.44.0 — OR1–OR3: Ollama on tape

James: "can we use the rewind engine on ollama? like record ollamas process as a macro?" · "do it. tell me what that would do"

The idea and the direction are James's; the code is the coder's.

## Built: `lib/ollama-tape.js`
- **Every model call is a frame.** A frame records:
  - the model and its options;
  - a seed (always set, so the call can be run again the same way);
  - the prompt, system prompt, messages and tools, and the answer, each stored once by its content;
  - any tool calls;
  - Ollama's own timings (load time, prompt reading, generation, tokens/s);
  - the run, task and agent the call belongs to.
- **A run's frames, in order, are its macro** (`macro(run)`).
- **The cassette.** `NEXUS_OLLAMA_REPLAY=<run>` (or `all`) answers recorded calls from the tape, with no Ollama running. A call that was never recorded is refused and reported, never invented. `NEXUS_OLLAMA_REPLAY_MISS=live` lets such calls through to the model.
- **Where it's wired.** The tape covers all three places that call Ollama: `ollama-client` (generate, and chat with tools) and `ollama-runtime` (streaming). `loom/agent-suite` now uses the client first.
- **Escape hatch.** `NEXUS_OLLAMA_RECORD=0` turns recording off.
- **Tests.** test-ollama-tape 5/5, against a fake Ollama:
  - every call becomes a frame;
  - a run's macro reads back in order;
  - with Ollama stopped, the same answers come back and no call goes out;
  - an unrecorded call is refused;
  - nothing outside the client calls Ollama directly, except the standalone fallbacks.

## Not yet built
- **OR4:** live and what-if replay.
- **OR5:** model vitals, including reading the exact model digest.
- **Retention:** limits on how much the tape keeps.
