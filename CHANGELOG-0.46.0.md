# 0.46.0 — UI1: the screens, the tape with Ollama, agents with every command

James: "always add backend js first, then the ui. can you do that. make sure you build the ui. then make sure the ollama additions stay with ollama. then make sure the agents have accesss"

The idea and the direction are James's; the code is the coder's.

- **The rule.** `docs/CLAUDE.md` now has an "Order of delivery" section:
  - every capability lands as backend JS → API route → command → UI, all in the same phase;
  - code lives with the system it serves;
  - agents get every command a person has.
- **The UI.** Open a repo and press **Tasks**. The drawer now has six views. The three new ones:
  - **Phases:** each phase marked done, ready or blocked, with why its last run stopped shown on the phase, its runs, and **▶ build**.
  - **Versions:** every commit, with when it was made, what changed and by whom.
  - **Machine:** the memory store by table (size, append segments, row cap, archive), and the Ollama tape. Open a run to see each call's seed, tokens/s, load time, what was asked and answered, any failure, and how to replay the run.
  - Idearium reaches cortex and ollama for this through `GET /api/nexus/store` and `/api/nexus/tape[/:run]`.
  - Tested in Clear Glass: `tests/probe/repo-drawer-views-glass.js` 13/13.
- **Ollama keeps its own code.** The tape moved to `ollama/lib/tape.js` (it was `lib/ollama-tape.js`). Its routes are in ollama's own command index.
- **Agents have access.** `nexus.command.tool` is now in every tool scope: agents in the `project` scope had no Nexus commands before. Its description, copilot's tool guide and the MCP `nexus_command` all name the new commands.
