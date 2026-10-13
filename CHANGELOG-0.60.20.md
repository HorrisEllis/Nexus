# 0.60.20 — 2026-10-13

James: "start lean? why not just have that a toggle? i want to test it now" · "no, i dont do cli. i dont have access to it. since running nexus is one cmmand" · "idearium for the lean toggle" · "not floating menu button. fragmented" · "it needs to tell the agent its been rejected. stuck in limbo"

**Context.** His first real phase build stalled. With every service up, memory fell to 6.6% free. Copilot held the planner's request, and the connection dropped ("copilot :3750 unreachable — ECONNRESET"). The build then fell back to a whole-phase run that produced a placeholder file, marked incomplete. He rejected that file. The agent's chat was left waiting on a tool result that never came.

## Lean mode: one switch, in Idearium

- **Where:** Idearium → Settings → Routing → **Lean mode**. It is one switch. Nothing is added to the command line or to a floating menu.
- **On:** it stops architect, diagnostic, eravos, intelligence and intelligence-consumer right away, through the supervisor (autopilot `/control`).
- **At boot:** the choice is saved (`<data>/autopilot-boot.json`, which is state and never committed), and `npm run start:all` reads it. It is still one command; the held services never start.
- **Off:** it starts them again.
- **Kept running either way:** Idearium, copilot, Guardian, Ollama, Versionium, Clear Glass, cortex, orchestrator and loom.
- **Also available as:**
  - `GET/POST /api/system/lean`;
  - the command row `system.lean` (every agent has it);
  - `lib/lean-mode.js`, which both the route and autopilot read.

## A build is never reworded first

The "reword" prompt block rewrites a request in new words before it goes to a browser agent. It no longer runs on phase builds (`phrun-…` sessions). On his machine it ran the 7b model for 97 seconds on a 17 KB build prompt while memory was at 7%.

## Rejecting tells the agent

When he rejects an agent's proposal, that agent is told in its chat, in the background:
- what was rejected, and the reason if he gave one;
- that nothing was written and the run is over;
- to answer in a line or two with what it would do differently.

The answer goes to the repo's activity log. `tell: false` on the reject request skips it.

To confirm: the message goes to the repo agent's chat. With one ChatGPT tab, that is the conversation the run used.

## Proof

`tests/modules/test-lean-mode.test.js` 7/7. Most of its checks read the source to confirm the wiring. Not yet proven: the toggle used live on his machine.

## Noted, not done

The coder wrote a `start:lean` npm script, which he rejected ("i dont do cli"). The tool call that held it was interrupted, but it had already been written. It was removed before this commit and never shipped.
