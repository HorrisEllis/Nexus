# 0.60.31 — 2026-10-14

James: "and we have intent routing? that way the complex reasoning can be done by the bigger models or agents. like claude or deepseek? also multiaccount routing in clearglass, each tab can be a different profile?"

He was told:
- what already worked: intent routing since 0.60.8, and account chains since 0.60.25, on one tab per provider;
- what didn't: RT1, and PF1, a tab per profile.

The coder recommended RT1 first, then PF1. He answered: "yes we need to get it all working."

## RT1: a route is eligibility, then preference

Before, routing ordered agents by preference alone: the learned order, with the reasoner first. So an agent with a good score could be sent work it can't do at all, like browser work sent to a chat tab, or a 60,000-token job sent to Ollama's 16,000-token window, which silently drops the start.

Now hard requirements come first (`lib/route-eligibility.js`):

| requirement | where the fact comes from |
|---|---|
| tools (text, code, web, browser, files, shell, nexus) | Guardian's provider nodes (new `tools`), copilot's tools, claude-code's allowed tools |
| the job fits the agent's window | Guardian's provider nodes (new `contextTokens`), the window Nexus gives Ollama |
| it can answer now | Guardian's readiness (0.60.28): a sign-in wall, or every account resting |

- An agent that fails a requirement is removed, and the route says why. That holds whatever its learned score, and even when it was the preferred agent.
- A fact that isn't stated never removes an agent.
- A browser tab that isn't open isn't removed, because Clear Glass opens it when the job comes. It's only tried later.
- The learned order then decides among the agents that are left.

**Found while proving it:** the 3-hop cap ran before anything else. An agent that could do the job but sat 4th in the chain was never considered. Now eligibility runs over every candidate, and the cap comes after.

Every route now carries a record:
- its reason;
- the alternatives it kept, and the ones it rejected, with why;
- how confident it is (learned outcomes for this kind of job, or "untried");
- the fallback;
- what verifies the work.

When no agent can take a job, the route says so and gives every reason, instead of sending the job anyway.

## Where to see it

- Idearium: Settings → Routing → **Try a route**.
- `idearium route assess <request> --kind=agent:browser --tools=browser --tokens=40000`
- `POST /api/route/assess` (Idearium), `POST /api/route` (copilot).

## Proof

- test-route-eligibility 8/8. The map's proof: an agent without the browser tool is never routed browser work, even with 12 successes on that kind of job and even when preferred. The record lists each rejected agent and why.
- Door and routing suites green: model-door 8/8, reasoning-route 15/15, code-tab 16/16, ollama-check 8/8, guardian-stack-sim 11/11, agent-facts 5/5, contract-adapters 18/18.

## Not done

- Splitting or asking about a low-confidence intent (CK-236).
- The callers don't send `needs` yet, so they get only the window and readiness checks, and only when they pass a message or a size. Passing each build brick's packet size is the next small step.
- PF1 (a tab per profile) is next.
