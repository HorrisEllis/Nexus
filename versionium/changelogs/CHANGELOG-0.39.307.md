# 0.39.307 — 2026-10-05

James, with his log: "integration (failed: every route hop failed (ollama: truncated → gemini: truncated → chatgpt: truncated) … TRUNCATED:too_short); failure_modes (…)"
James: "i cant click guardian on the agent tab. this is getting overwhelming."

## Why every provider's answer was "too short"
For a spec section, the quality detector (`lib/seam/detector.js`) required the answer to be at least **40% as long as the prompt**. The old section prompt pasted every earlier section in full, so by integration (section 7) and failure modes (section 8) the minimum was kilobytes. Ollama, Gemini and ChatGPT were all rejected.

The only answers that passed were the ones that copied earlier sections back. That's how the DAW spec's echo grew: the detector was selecting for it.

**Now:** a spec section is judged as a section.
- It needs at least 200 characters, never a fraction of its prompt.
- It may end on a list item, a table row, a heading or bold text, not only on punctuation.

Prose cut off mid-sentence is still caught. Code files keep their 0.39.291 rule, and every other caller keeps its own.

## Why Guardian couldn't be clicked
Clicking Guardian with no Guardian agent chosen fell back to the default provider. Since 0.39.282 that's Ollama, so the click saved Ollama and the switch snapped back.

**Now:** Guardian resolves to a Guardian agent, in this order:
1. the current one;
2. the default, if it's a Guardian agent;
3. ChatGPT;
4. the first Guardian agent available.

If there are none, it says why.

## Proof
- `test-build-from-the-spec` passes **5/5**. BS-05 replays the 30 KB prompt with a normal-length failure-modes answer: it passes as a section, and the old rule still rejects it for other callers.
- `test-repo-agent-provider` passes **67/67**, with two new checks: clicking Guardian while Ollama is the default picks a Guardian agent, and the switch then reads Guardian.
- Unchanged and passing: `nexus-seam`, `test-detector-code-endings`, `test-pipeline-routing`, `test-reply-continuation`, `test-prove-loop` and `idearium-agent-routing`.
