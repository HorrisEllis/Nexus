# 0.59.14 — 2026-10-12

James: "Can you build the capability? Like first I thought of using you as copilot, then you would have full range of the system. Then I was trying hey nexus. So you could talk to copilot and build fix what's not working, improve what needs to improve."

Before this, a cloud session's safety check blocked one design: letting a chat page run commands that change Nexus. That design would turn text scraped from a web page into actions on his machine. This release takes the safe route instead: Claude Code becomes the co-pilot, running on his own machine.

## Claude Code as the co-pilot

The co-pilot pane has a fourth backend, **claude-code**. Choose it with the toggle or with `/backend claude-code`.

- **Where it runs:** on his machine, under the account its `claude` is signed into, in the Nexus folder itself (not a copy).
- **What it can read:** every file (Read, Glob, Grep), and the live system through every `mcp__nexus__*` tool: `nexus_status`, `nexus_gaps`, `nexus_jobs`, `nexus_loom_query`, and `nexus_command` (census, activity, perf, log, file, grep, `repo …`).
- **What it can't do:** write a file itself. Edit, Write and Bash are not allowed.
- **How a fix lands:** it sends the fix to Idearium (`nexus_command "repo ask" <repo> "…" --provider claude-code`). The change becomes a proposal, James approves it, and the apply gate writes it (`lib/nexus-self/apply.js`). The apply is recorded, atomic, snapshotted and reversible. Applying, stopping systems and passwords stay his.
- **Memory:** one Claude session per pane conversation, resumed turn after turn. `/new` starts a fresh one, and a session that's gone restarts by itself.
- **The code:** `lib/claude-code-backend.js` `ask()`, beside the build-time `run()`.
- **Windows:** `claude.cmd` is started through a shell. The MCP config goes in a file, because JSON in an argument doesn't survive a Windows shell.
- **Settings:** `copilotClaudeModel`, `copilotClaudeTimeoutMs` (default 10 minutes).
- **Requires:** `claude` installed and signed in on the machine.

Checked against the real `claude --help` for these flags: `-p`, `--output-format json`, `--allowedTools`, `--mcp-config`, `--resume`, `--model`.

## Tests

- `test-copilot-claude-code` passes 4/4 and is new. It uses a stand-in `claude` and checks four things:
  - the read-only tool set
  - the preamble goes only into the first turn, and later turns resume the session
  - a dead session restarts, and a missing `claude` says how to fix it
  - the pane routes to Claude Code without asking any other model, with one session per conversation
- These still pass:

| Suite | Result |
|---|---|
| `test-claude-code-backend` | 6/6 |
| `test-cg-copilot-verbs` | 9/9 |
| `test-nexus-ask` | 6/6 |
| `test-repo-agent-provider` | 67/67 |
| `test-event-contracts` | 8/8 |
