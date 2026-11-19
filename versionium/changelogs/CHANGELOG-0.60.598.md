# 0.60.598 — the Ollama bridge no longer leaks a socket per health check

James, 2026-11-19: "Try again" · "I would rather nexus codes after 7 months."

## What changed
the Ollama bridge leaked a socket on every health check: checkOllama (about every 10 s) and ollama-runtime's check read only the status code and never drained the body, so each check left its connection open. Found in NM1's run at 10:15–11:09: 3,221 established connections on the machine, 1,546 of them the bridge (pid 5972) to Ollama, and Windows refused new sockets: every rung failed "copilot :3750 unreachable — connect ENOBUFS". Both checks now drain the body (and a timeout destroys the request). Proven with a fake Ollama: 50 checks left 50 connections open before, 1 after. The leak likely fed the morning's instability too (socket and memory pressure); not measured apart. Also seen in that run: retries_per_rung 2 works (rung 2 and 3, try 2), lean mode found nothing in Nexus to stop or unload.

## Files
- ollama/lib/ollama-client.js (checkOllama), ollama/ollama-runtime.js
