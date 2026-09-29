# NEXUS 0.39.267: Ollama explained, copilot says what it's been up to, one hat on any backend

**Date:** 2026-09-27 · base: 0.39.266

James:

> *"i have no idea what ollama is doing."* · *"look at copilot"* · *"i want to be able to talk to copilot and ask what its been up to. agents tab in idearium is meant to build chunks, entire code bases. the agent hat is meant to be agnostic, ollama/guardian/copilot."*

## Map

- **All of Ollama's work in James's boot log was copilot's self-test.** 162 calls in 26 minutes, all `adversarial-probe`, 6 per minute. That is 529 s of generation, about a third of wall time. The model never sat idle for 5 minutes, so it never unloaded; that is the 1.9 GB `llama-server.exe`.
- **Nothing else in Nexus called Ollama.** Vector memory couldn't, because its health check used the wrong method.
- **Copilot had no way to say what it had been doing.** The records existed (the 0.39.266 activity log, the scheduler, triggers, chat_log, repo_agent_log), but nothing read them together.
- **Chunk and codebase builds never wore a hat.** The repo Agent tab wore the repo hat on ollama, copilot or guardian. The build path (spec-engine → WARP → `buildChunkWithAgent`) sent a bare, fixed system line, had no copilot option, and kept its own provider list. Four lists existed, and they disagreed.

## Ollama: the self-test (`copilot/adversarial.js`)

- **What was wrong:**
  - Each run sent 5 hostile prompts through `pingBoth`, meaning intuition and Ollama analysis. `analysis.answer()` catches every error and returns fallback text, so the analysis side could never fail. That was 5 generations per run that could detect nothing.
  - `_running` was reset only on success, so one throw disabled every later run silently.
- **Fix:**
  - The hostile prompts test intuition only. The status cross-check still asks Ollama: **1 call per run** instead of 6.
  - The run interval is now **10 min**, set by `NEXUS_ADVERSARIAL_INTERVAL_MS`; `0` turns it off.
  - `_running` is reset in `finally`.

## Intuition was crashing (`copilot/intuition.js`)

- **What was wrong:** the self-test flagged a violation every run, and it was right:
  - `ROUTE_RE` has two alternatives. "what is / find / look up X" fills group 3, but the code read group 1, so it threw.
  - `_getBP()` was called 6 times but defined only in `copilot/server.js`. Every blueprint answer threw ReferenceError: systems, components, CLI, SEAM, "what is X" and self-awareness.
- **Fix:** read group 1 or group 3, and give intuition its own lazy blueprint loader.

## Vector memory never reached Ollama (`lib/vector-memory.js`)

- **What was wrong:**
  - `_checkOllama()` sent `POST /api/tags`. Ollama serves that path on GET only, so every boot printed `ollama:✗` and embeddings used the TF-IDF fallback.
  - Once the check failed, nothing ever checked again.
- **Fix:**
  - The check uses `GET /api/tags`.
  - It also requires `nomic-embed-text` to be pulled; if it isn't, it logs `ollama pull nomic-embed-text`.

## "What have you been up to?" (`copilot/lib/activity-recall.js`)

- **Asked in any copilot chat**, the answer comes from records, not a model (intent `activity`, `modelUsed: data-only`). Examples:
  - "what have you been up to"
  - "what's ollama been doing in the last hour"
  - "/activity"
  - "who is using ollama"
- **What it reads:**
  - Ollama calls grouped by caller: count, time, failures, model, last call;
  - the self-test;
  - questions answered, and who answered them (intuition, ollama, escalations to Guardian);
  - Idearium agent dispatches: hat, backend, failures;
  - scheduled tasks and triggers;
  - the stream.
- **Windows:** "last hour", "last 3 hours", "today", "this week"; the default is 6 h.
- **Questions that mention Ollama** get only the Ollama part.
- **The same data** is served at `GET :3750/api/activity?hours=N` (`&text=1` adds the sentence form).
- **Matching:** checked before the greeting fast path. Ordinary questions ("what have you done to my file", "what is ollama") fall through.

## One hat, any backend

**One list (`lib/agent-providers.js`)**

- The list is `copilot`, `ollama`, then every guardian agent that has a `guardian/userscript-<name>.js`.
- Aliases: `mistral`→`ollama`, `auto`→`copilot`.
- `resolve('copilot')` asks copilot's `/api/prompt/resolve`. If copilot can't answer, nothing is sent.
- **Readers:** agent-suite, WARP's cascade, repo-agent, and the UI (`GET /api/agent-providers`).
- Before this, perplexity and copilot were dropped by WARP's `KNOWN_PROVIDERS`, so those chunks cascaded through ollama first.

**Builds wear the hat (`idearium/agent-suite`, `idearium/api`, `idearium/spec-engine/warp-build-dispatch.js`)**

- `buildChunkWithAgent(prompt, { preferAgent, hat, model })`:
  - The hat's persona goes on top of the chunk prompt for guardian agents, and into the system prompt for Ollama.
  - `copilot` resolves to the real provider first, and the chunk records that provider, never "copilot".
  - The Ollama model is the repo's Agent-tab model.
- **`speceng.build`, and planning a codebase from a spec, go through `_buildIdentity(specUuid)`:**
  - A spec that is a repo's content wears **that repo's hat** and builds with **that repo's Agent-tab switch**.
  - A spec with no repo wears **the_builder**. So does planning a new codebase.
  - The response names the hat and where it came from.
- **Agent precedence:** `body.agent`, then a hand-picked chunk agent (now `agentPinned`), then the repo's switch, then the chunk's creation agent, then the spec's, then chatgpt.
- **Through WARP:** the hat and model ride on the record, so every attempt in the cascade wears the same hat. The hat is not part of the cache key.

**Per-chunk select (`idearium/ui/js/app.js`, `spec-engine.setChunkAgent`)**

- The list is loaded from `/api/agent-providers`, and copilot is included.
- A new first option, **default**, means the repo's switch and hat.
- A hand pick is pinned and normalized. `""` un-pins. An unknown name is refused.

**RAID reads the worn hat (`lib/agent-intent-contract.js`, `cortex/core/raid/contract-intake.js`)**

- A contract can carry `hat`. When it does, **that hat's** `allowedIntents` decide, whoever wears it.
- **The old rule**, "does any hat that names this agent allow it", made an agent's permissions depend on unrelated hats. Ollama could `build` only because the_clearglass_operator names it, and could not `forge` even while wearing the_builder.
- Contracts without a hat keep the old rule.
- `speceng.build` sends the hat on its RAID contract.

## Not changed

- **Copilot's global hat switch** (`self-model.setCurrentAgent`) still sets the agent to the hat's `baseAgent`. Wearing a hat on a chosen backend there needs a per-request backend parameter. That is the same limit repo-agent.js names; it is not built here.
- **Seeded hats keep their `allowedAgents`.** The build path doesn't enforce them, and never did.

## Tests

- `tests/modules/test-agent-hat-agnostic.test.js` **12/12**, against fake guardian, copilot and Ollama:
  - the list;
  - the hat on guardian, copilot→guardian and copilot→ollama;
  - nothing sent when copilot can't resolve;
  - unknown agent refused;
  - WARP carrying the hat;
  - the RAID hat check;
  - pin and un-pin;
  - the_builder for a spec with no repo;
  - the activity answer;
  - 1 Ollama call per self-test run.
- **The 56 existing test files that touch these modules**, run on 0.39.266 and on this tree:
  - No new failures. 49 pass here.
  - Seven fail identically on both: `test-raid-processnext-am1-gate` GATE-002, `test-composed-prompt` CP-101, `test-repo-context`, `idearium-loop` L3/L4, `test-guardian-job-correlation`, `test-node-schemas` and `test-one-tab-e2e`.
  - `run-all.js` times out on both.
  - `test-guardian-retry-novelty-installs` fails on 0.39.266 and passes here.
