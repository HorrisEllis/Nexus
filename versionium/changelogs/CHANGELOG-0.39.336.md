# 0.39.336 — 2026-10-05

James: "like its not working. the tool. the agents job is to find context. ollama, copilot, guardian agents need to be able to use the agent tools."
James: "like they need the tools, all of them."

## What his two screenshots showed, traced in the code
- **The Ollama agent could not call any tool. The path was missing three ways:**
  1. Copilot's tool loop sends an Ollama round to the bridge **without the tool schemas**. His log reads `tool-loop · generate`, so a native tool call could never come back.
  2. The prompt's call syntax (the `tool-syntax` block) went to **guardian only**.
  3. Copilot read only native `tool_calls`, never a call the model wrote.

  So the 3b model answered from nothing, and its "reindex" ended up in `@learn` and an empty code block. Sending the native schemas wouldn't have helped: that's 126 tools and 138,542 characters of JSON against a 6,144-token window.
- **The ChatGPT agent (Guardian):** the loop itself worked, since it reads the rendered ```` ```tool ```` block. But the prompt said only "You have real tools available". ChatGPT has its own function tools, so it looked there and said "the project-specific idearium.* tools … are not actually exposed in this session".
- **The code tools** read `/api/repos/:uuid/code/*`, which still found the repo's directory the old way: the bug SB35 fixed for context.

## Fixed
- **One call protocol for every agent that runs the tool loop:** Ollama, Guardian, and the copilot position, which resolves to one of those two. Claude Code keeps its own tools.
- **The `tool-syntax` block**, still editable in Settings → Prompt, now says:
  - find the context first;
  - the tools **run in Nexus, not in your built-in tool list**, so never call them unavailable;
  - how to write a call, with a real example: `idearium.code_search.tool`;
  - that Nexus sends the result back as the next message.
- **Ollama:** copilot now reads a call the model writes, using the parser the browser agents already used (`_findToolCalls`: a ```` ```tool ```` block, or a known tool's bare `{"name": …}`). That's copilot 3.7.2.
- **The code tools' reads** use `_agentDir`: the directory that holds the index, indexed on demand.
- **Old defaults upgrade.** A repo that stored an old default text, which the Settings save does for every block, now gets the new one. Text James wrote himself is kept.
- **`context-tools` corrected.** It said "Context is not pasted", which hasn't been true since SB34. It now names memory only. The first message still fits under 3,000 characters (RH-006).
- **Process note.** Mapped as SB36 in `docs/2026-10-05-build-from-the-spec-phasemap.spec`, but built before it was mapped: traced live from the screenshots and fixed in the same pass. Recorded as drift.

## Proof
- **`tests/modules/test-agent-tools-every-backend.test.js`, 4/4**, against a real idearium server:
  - **AT-01:** the Ollama and Guardian prompts say where the tools run and how to call one, and list the code tools. An old stored default upgrades; his own text stays.
  - **AT-02:** an Ollama reply that writes a ```` ```tool ```` block runs the real `idearium.code_search.tool`, and the next round carries `[tool result — idearium.code_search.tool]` with `src/retry.js`.
  - **AT-03:** a browser reply as the rendered page gives it (no backticks) runs `idearium.code_chunk.tool`. The tab is sent only the result.
  - **AT-04:** the first tool call indexed a repo that had none.
- **Against the old code,** AT-01 and AT-02 fail.
- **Also green:**

  | Suite | Result |
  |---|---|
  | composed-prompt | 20/20 |
  | registry-harness | 7/7 |
  | copilot-tool-runtime | 12/12 |
  | guardian-tool-runtime | 5/5 |
  | tool-call-listener | 9/9 |
  | tool-guide | 7/7 |
  | agent-tools-and-graph | 13/13 |
  | agent-context-always | 5/5 |
  | agent-index-ready | 4/4 |
  | repo-context | 16/16 |
  | version-sync | 30/30 |

  CP-102 and CP-402 had pinned "Ollama gets no call syntax". That assumption was wrong, so both now pin the opposite, with the reason.
- **Loom:** the registry was regenerated from scratch. Nothing was lost, and 8,569 `registeredAt` were kept.

## Found, not touched
`copilot/spec/copilot.spec` is not valid YAML: its routes section uses `- method: POST  path: …` on one line. This predates this change.
