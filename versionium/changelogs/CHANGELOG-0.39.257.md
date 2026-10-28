# NEXUS 0.39.257: the repo agent gets every tool; plain-language CLI; the graph in context

**Date:** 2026-09-26 · copilot 3.5.2 → 3.6.0 · idearium 4.6.1 → 4.7.0 · Versionium `vtm-fc71e0ef` (parent `vtm-d2b95239`, 0.39.256)

James: *"the toolscope for the agents tab. need the full capabilities, with the /help and tool awareness … debugging, using the intelligence system … context on by default and wire in the graph"*. Asked which tools: *"i want everything, at least for now."*

## Changed
- **Tools.** Before this, the repo agent sent copilot a plain prompt, so it had no tools at all.
  - Ollama and browser-agent dispatches now run copilot's real tool loop (`/api/prompt` with `body.tools`).
  - Every tool (102) is allowed by default; `/scope project` narrows to the hat's own set. Either way it is enforced.
  - The hat is the agent's identity.
  - File tools work in the repo's own files (`lib/agent-tools/tool-root.js`), or in NEXUS with `where:"nexus"`.
  - Each tool call is shown under the answer.
- **CLI.** `/help` is regrouped in plain language, with aliases and a "did you mean" for typos. New: `/tools`, `/scope`, `/debug`, `/debug <question>`, `/graph`, `/run`, `/test`, `/diagnose`.
- **`/debug`** reports without a model: syntax, unresolved imports, recent failures, and the intelligence system (`intelligence_query`, `fault_log`, `diagnose`).
- **Graph.** A question that names no code gets the project map from `graph.json`. Matched code comes with how its files connect.
- **Copilot:**
  - `GET /api/tools/list` and `POST /api/tools/run` are new.
  - A failed tool-loop round is now a failure carrying its `jobId`, not the answer text.
  - lifeline no longer re-sends the prompt when a round fails.
  - `.injection` nodes are covered by the test sandbox.
- **Loom:** the new modules are seen with their consumers as wires by the source-map scanner; they enter the stored registry on its next bootstrap re-scan.

## Tests
- **test-agent-tools-and-graph:** 13/13; 13 mutations, each caught.
- **Regression:** 32 suites run. test-repo-agent, test-repo-agent-provider and test-repo-context were updated for the intended changes.
- **Pre-existing, identical at HEAD:** copilot-provider-toggle T-012, test-node-schemas NS-003/012, repo-context "names a function", tool-guide T-001, user-model-everywhere T-005, work-queue WQ-016, lifeline T-004/005.
- **Tree:** restored and diffed to zero; the only data writes are the Versionium records.

## Not done
- **Not proven live.**
- **0.39.258 is still to build:** learning from outcomes and corrections; COS/RAID for Run.
