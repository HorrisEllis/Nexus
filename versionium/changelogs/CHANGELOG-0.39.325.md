# 0.39.325 — 2026-10-05

James: "agents always need context, not optional. also running the pipeline the agent should be able to do. like context isnt optional its vital"

From his screenshot: the Agent tab showed 2133 files · 17332 chunks indexed, while the agent answered "has not been indexed yet", and every question that named no file was sent with "context: none". Mapped first as SB32 and SB33 (build-from-the-spec 1.13.0).

- **SB32, the persona is re-grounded on every send.** A hat's persona is written when the hat is forged; one forged before indexing kept saying there was no index. `lib/repo-agent.js` `_grounded()` compares the persona with the live index on every send, then refreshes it, or re-composes it for that send.
- **SB32, context is never empty.** In order:
  - a file the question names → its card;
  - else a search of the question's words, with filler like "tell me about" dropped. A system's atlas comes first and carries its opening, so "tell me about idearium" gets the Idearium atlas;
  - else the project's map: files, chunks, top folders.
- **SB33, the agent runs the pipeline.** `idearium.repo_chunks.tool` has `action:"reindex"` (POST `/api/repos/:uuid/reindex`). The route refreshes the persona when the pipeline finishes. An unindexed persona tells the agent to run it, not to ask for it.
- `tests/modules/test-agent-context-always.test.js` 4/4 (registered). `test-repo-chunks-tool` 11/11, updated: the action list has reindex, and an unindexed persona names the tool only to run the pipeline. The other agent tests are unchanged and pass: repo-agent, provider, node, learn, late, hat-memory, coder-link, registry-harness, tool-guide, agent-tools-and-graph, code-tools, registry-drives-build.
