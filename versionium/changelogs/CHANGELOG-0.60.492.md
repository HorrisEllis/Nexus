# 0.60.492 — a build wakes the systems it needs (PC8 expanded)

James, 2026-11-11: "Just get it working"

## Why his first whole build made nothing
Run `phrun-mwbva4td-qyv7`: "copilot :3750 unreachable — connect ECONNREFUSED … nothing was sent to gemini" and "Ollama left off: ollama
bridge unreachable". Since 0.60.482 Copilot and the Ollama bridge start on demand. The build's callers woke neither:
- `lib/repo-agent.js` reached Copilot by its own HTTP, which wakes nothing.
- `lib/nexus-client.js` asked COS to touch `ollama`; COS knows it as `ollama-bridge` and answered 404.

## Fixed
- A refused connection to Copilot asks COS to start it, and the request is sent once more.
- The client asks COS's list which name runs a system COS does not know by its id. `wake(systemId)` is exported.

## Measured
Touched through COS, Copilot answered in 1,130 ms and the bridge in 1,025 ms.

## Not done, said
- **Not proved by a build.** Idearium was restarted to load it; the pipeline was not run again (the session reached its usage limit).
- COS refused one start for 15 s ("only 9.6% memory free (floor 10%)"); the client waits 6 s. Not changed.
- The evidence step and the missing wait for the build (0.60.491) are still open. The next steps are in the map's `handoff_2026_11_11`.
