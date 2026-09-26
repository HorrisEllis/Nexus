# NEXUS 0.39.194 — the compartment agent is handed the code it needs

James: get the agents working, per compartment, with a repo hat that learns the project over time.
The models are small (0.6B–3B on a 4 GB GPU), and a small model is weakest at planning a lookup.
So the agent no longer has to look.

## What changed
- **`lib/repo-context.js`** — dispatch-time retrieval from the repo's OWN chunk index. Question words
  (split inside camelCase/snake_case, stopwords dropped) are scored against each chunk's symbols, file
  path and body. Top matches go in the prompt with a **hard budget** (4 chunks, 3000 chars, 1200 per
  chunk; env-overridable), each labelled `file:lines · symbols · runtime proof: passed|failed|none|stale`
  (0.39.193's proof, marked stale when the chunk changed).
- **`lib/repo-agent.js`** — the prompt is now persona, then the retrieved code, then the question.
  The result and the exchange log record `context {chunkIds, files, chars, dropped, reason}`: which chunks
  the agent was given, so a later outcome can be tied to them. `noContext` and `contextOptions` override.
- The idearium route already passed `repoDir`, so `POST /api/repos/:uuid/agent/prompt` gets this now.

## Guarantees, tested
- **Scope by construction:** an agent is only ever handed its own repo's code (asked for another repo's
  function by name: not in the prompt). A poisoned index pointing outside the repo reads nothing.
- **No match, no block:** a question that names nothing in the code adds nothing and records why. Nothing
  is invented.
- **`/api/agent/switch` still has zero calls** (the 0.39.188 constraint).

## Verification
`test-repo-context` 16/16: real repos through the real pipeline, a stub copilot that records the prompt,
so the assertions are about what went over the wire. Existing agent suites still pass
(34 / 44 / 11 / 35). Registered in `run-all.js`.

## Not verified / limits
- **Not run against a real copilot or a real ollama model.** Whether a 0.6B–3B model answers better with
  this block is the open question; nothing here measures it.
- Retrieval is keyword/symbol scoring, not semantic: it finds what a question **names**, and misses one
  that describes behaviour without naming anything. No call/dependency neighbours yet (the graph is
  file-level and not joined to chunks).
- The Agent tab does not show the retrieved context yet.
- **The hat still learns only from recorded corrections** (`RH.learn`). Nothing is learned automatically
  from how the agent is used. Which chunks were given for which question is now logged, which is what
  automatic learning would need.

## About your screenshots
The `qwen3-abliterated` folder holds one file, `0.6b`, 981 bytes: that is the manifest (a small pointer
file); the weights are in `models\blobs`. So you have the 0.6B qwen3, the qwen2.5-coder family (tag not
shown) and deepseek-coder-v2 (tag not shown). `ollama list` gives the exact tags.
