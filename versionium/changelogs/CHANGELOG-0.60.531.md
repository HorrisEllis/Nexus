# 0.60.531 — the TV's co-pilot bar wakes copilot instead of showing "Failed to fetch"

James, 2026-11-14, with a screenshot of Nexus's home (:9000), its co-pilot bar reading "Co-pilot bridge error: Failed to fetch": "thats a
problem also the console is supposed to hook into each system, and agent"

## Found (on his PC)
- Copilot starts on demand under COS's supervisor and was asleep (`copilot=declared`, nothing on :3750). The bar calls
  `http://127.0.0.1:3750/api/prompt` directly, so the browser's raw network error was shown and nothing woke copilot.
- The same fault as 0.60.524 (the Emergence page and Intelligence), in a second place.
- Waking it by COS's route (`POST /api/cos/systems/copilot/touch`) had it answering its health in 2 s.

## Fixed (CBW1)
- `lib/ui/tv-shell/index.html`: a refused ask wakes copilot through COS's own route, waits for its health (25 s) and asks again. COS's manager
  not answering, or copilot not starting, is said with where to look. A copilot that was reached and is slow is not "woken": its timeout stands.
- `_wakeOnDemand(name, port)` is there for the page's other direct calls (11 in this page reach a system by its port).

## Proof
- `node tests/modules/test-cos-ui-starts.test.js`: 4 passed, 0 failed. CS-04 runs the page's two functions: refused → touch → health → asked
  again and answered; COS down said; a timeout not woken.
- On his PC: the route woke copilot (2 s). The bar itself, in Clear Glass, on his screen: not yet seen by the coder.

## Mapped, not built
- "the console is supposed to hook into each system, and agent": added to SC10 (the Console reaches every system's door). Agents are new to
  SC10: which agents and through what (Guardian's agents, the co-pilot, Ollama's models) is recorded there as his to say.

Coder's part: the diagnosis and the fix. That it is a problem is his.
