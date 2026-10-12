# 0.59.15 — 2026-10-12

James: "Okay but any of the agents need to be able to do that too for the agent switching. Like guardian is the source of truth for browser agents."

0.59.14 told only Claude Code how to work inside Nexus. That was the wrong place: an agent switched in mid-task (by the ladder, or by Guardian when a browser tab is down) would lose it. Every backend already shares one tool loop and holds `nexus.command`. What differed was the instructions.

## One instruction, every agent

- **The instruction:** `INSIDE_NEXUS` in `lib/agent-tools/tool-guide.js` (guide 1.4.0).
  - **Read** anything through `nexus.command.tool`: file, grep, log, census, `activity --status failed`, nerve, perf.
  - **Change** Nexus only through `repo ask <the system's repo> "<the change>"`. It lands as a proposal, James approves it, and the apply gate writes it, recorded and reversible.
  - **Applying, stopping systems and passwords** are his.

- **Who it reaches:**

| Reader | How it gets the text |
|---|---|
| `toolGuide()` (copilot's tool loop, repo agents, Ollama) | the guide opens with it wherever `nexus.command.tool` is in scope |
| `guardian/tool-runtime.js` (Guardian's browser agents: claude, chatgpt, gemini, …) | added to its system prompt; until now that loop listed tool names and **no guide at all** |
| the Clear Glass pane (`_buildCgContext`) | every backend the pane switches to: ollama, copilot, guardian |
| Claude Code (`ASK_PREAMBLE`) | the same text, no longer its own copy |

- **No agent is hard-wired as the builder.** 0.59.14 made Claude Code send every fix as `--provider claude-code`. Now `flags.provider` is optional:
  - left out, the repo's own agent ladder builds the change, and Guardian decides which browser agents are live
  - named, it can be `ollama`, `claude-code`, or a Guardian provider
- **The `nexus.command.tool` note** now names census, nerve, log, file, grep and `glass open`, and says a repo command's first word is its repo (0.59.13).

## Tests

- `test-copilot-claude-code` passes 5/5. CC-05 is new and checks each place against its real prompt builder:
  - the tool guide opens with the text where `nexus.command` is in scope, and not elsewhere
  - Guardian's loop carries it
  - the pane's context carries it
  - Claude Code's preamble carries it
  - no agent is hard-wired as the builder
- These still pass:

| Suite | Result |
|---|---|
| `test-tool-guide` | 7/7 |
| `test-guardian-tool-runtime` | 5/5 |
| `test-copilot-tool-runtime` | 12/12 |
| `test-composed-prompt` | 20/20 |
| `test-agent-tools-and-graph` | 13/13 |
| `test-code-tools` | 28/28 |
