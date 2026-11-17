# 0.60.554: copilot, the door every model call goes through, is always on

James, 2026-11-17, with his screenshots of Idearium (Models: "copilot's door: not routing — copilot unreachable"; Tasks: every "Write ONE file" failed on a browser agent): "its wasting my tokens."

## Found (his screenshots)
- Idearium → Settings → Models showed the Ollama bridge reached, and copilot's door "not routing: copilot unreachable, connect
  ECONNREFUSED 127.0.0.1:3750". Every caller there prefers Ollama.
- Idearium's Tasks showed every "Write ONE file" failed on a browser agent:
  - "copilot :3750 unreachable";
  - "no chatgpt tab open";
  - "stopped at gate 5/8, tab takes the job (gemini)".
- The planner was on its 4th attempt in the Claude tab.
- The cause:
  - COS ran copilot "on demand" and stopped it after 10 idle minutes.
  - Idearium's build calls copilot at 127.0.0.1:3750 directly, not through COS, so nothing started it again.
  - Every model call goes through copilot (its door decides the route, and Ollama is reached through it). So with copilot down there was
    no route to Ollama, and the build ladder climbed to the browser agents, which cost his tokens.

## Fixed
- `copilot/compartment.json`: `onDemand` is `false`, with the why next to it. Copilot is always on.
- He can make the same change now, without waiting for the update: COS → copilot → Configuration → "Start on demand, stop when idle" off,
  then Start.

## Proof
- `test-cos-supervisor` 8/8.
- `test-compartment-declarations` CD-01 and CD-02 fail before and after this change (cortex's args; the 13 declarations). Pre-existing,
  said, not touched.

## Not yet (said)
- **The planner ran in the Claude tab because the routing put it there.** Idearium → Settings → Routing & fallback decides it.
- **Only one model is installed:** `qwen2.5-coder-abliterate:3b`. That is too small to plan a phase, so a local planner needs a bigger
  model in Ollama.
- **The idle stop is still a trap for any other system Idearium calls directly.** The lasting fix is for callers to reach systems through
  COS, which starts what it is asked for (the PC16/IF map).
