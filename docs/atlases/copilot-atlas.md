# copilot — Sovereign Co-Pilot System

> **v3.5.0 (active)** · port 3750 · intelligence, separated deliberately from guardian's dispatch

**Author:** James Brooks (Erosmancer) · rheon.world

---

## What It Is

Copilot receives intent, assembles context, routes to RAID, and returns a response — the intelligence layer, kept separate from Guardian's dispatch layer on purpose. Its own spec: *"Guardian is dispatch. Co-pilot is intelligence. They are separate. If Guardian goes down, the co-pilot can still answer from Cortex memory."* Every exchange is tracked hook-to-hook through CFR.

---

## Quick Start

Not confirmed this session.

---

## Architecture

### Boundaries (documentation clarity)

| Term | Definition | Distinguished from |
|---|---|---|
| Copilot | intelligence — assembles context, classifies intent, can answer from Cortex memory alone | `guardian` — dispatch: routes to a provider and returns the raw result. See `guardian-atlas.md`'s own Boundaries entry, the same distinction from the other side |

---

## The Modules

---

### request-response

**id:** `copilot.request-response`

**What it does**

Handles one exchange end to end: receives a `CopilotRequest`, classifies intent, assembles up to 7 context layers, and returns a `CopilotResponse` naming exactly which component/hook handled it and how many tokens were used.

**Real schemas**, from `copilot.spec`'s `core.schemas`:

```
CopilotRequest:  { uuid (requestId), sessionId, prompt, channel, channelName,
                    uiState (NEXUS_UI_STATE snapshot from browser), ts }

CopilotResponse: { requestId, ok, text, modelUsed ('data-only'|'ollama'|'claude'|'chatgpt'|...),
                    intent, fromGrammar, componentId, hookId, tokensUsed,
                    contextLayers (0-7), ui (optional spotlight/navigate instructions), ts }

CopilotSession:  { sessionId, userId, channel, startedAt, ... (not fully read) }
```

`fromGrammar` is worth noting: it's a boolean flag distinguishing a response the grammar/router answered deterministically from one that actually reached a model — a real, cheap way to tell "did this need AI at all" from the response shape alone.

**Commands / How to use it / HTTP routes**

Not read this session — only `meta` and the start of `core.schemas` were pulled.

**What it connects to**

- `guardian` — dispatch target once intent is classified and context assembled
- `cortex` — memory fallback when guardian is unavailable

**Bus events emitted**

Not read this session.

---

## Modules Not Yet Built

Not determined — this spec's `gaps`/`history` sections not read this session.

---

## Version History

**Source:** NOT YET WIRED TO VERSIONIUM — hand-maintained below. This
is a real gap, not a neutral state: Versionium's own purpose is to be
the automatic, live source for every system's version history via
`GET /api/versionium/history?system=copilot`. Whether copilot actually
reports to Versionium was not checked this session — flagged as an
open question, not assumed either way.

Not read this session.

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). Part of the rheon.world / NEXUS ecosystem.


## `/api/prompt` passes the Ollama model on (3.5.2, v0.39.253)

The `backend: 'ollama'` branch of `/api/prompt` called `lifeline.dispatchToOllama` without `body.model`, so a caller's chosen model never reached the bridge. `_tryOllama` already sends `opts.model` to `/api/jobs`. It is now passed, trimmed, for Ollama only; unset sends nothing, so the bridge's default applies as before. The reply carries `model_used`. The caller is idearium's per-compartment Ollama model (idearium atlas, 4.6.0).

## Callers get the tool loop; failed rounds stay failures (3.6.0, v0.39.257)

- **`POST /api/prompt` with `body.tools`** (`{ scope: 'all' | [names], identity, repoDir, maxIterations }`) runs the real tool loop for the chosen backend: `runViaAgent` for a browser agent, `run` for Ollama.
  - The scope is enforced (`runToolLoop` `allowedTools`).
  - The caller's identity replaces "the NEXUS co-pilot".
  - `context.repoDir` roots the file tools (`lib/agent-tools/tool-root.js`).
  - The reply carries `toolCallLog` and `tools`.
  - Without `body.tools`, nothing changes. Idearium's repo agent is the first caller.
- **`GET /api/tools/list`:** `lib/agent-tools/tool-catalog.js`. Every tool is in a named group, with its plain summary and the guide's "when to use"; `?q` searches and `?scope` marks what is in scope.
- **`POST /api/tools/run`:** one tool through `executeTool`, refused outside the caller's scope.
- **Fixed: a failed round was returned as the answer.** When a round's dispatch failed, the loop returned the text `[NCP dispatch failed — no response …]` as its answer. Now:
  - the round carries guardian's reason (its gate sentence) and the `jobId`;
  - `runToolLoop` ends the run as a failure, and `/api/prompt` answers 502 with the `jobId`;
  - lifeline's explicit-agent path returns the failure instead of re-sending the prompt as a new job.
- **Tests no longer write `.injection` nodes into the real tree:** they now follow `lib/test-sandbox.js`.
