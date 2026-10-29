# 0.39.376 — CM2: every command, for copilot and every agent

James: "Yes. And copilot. Copilot is the entrance of nexus. Like I want it to be able to do anything, nexus can. Like look at nexus nerve and tv ui and the interaction field. Like I want it to be able to navigate the ui, check when something didn't work when I click it and run diagnostics. But worry about that after."

James: "Oh and spotlight, but you're almost out of tokens so don't forget to map."

The idea and the direction are James's; the code is the coder's.

## Built
- `lib/agent-tools/tools/nexus/command.js` — `nexus.command.tool`: ONE tool over CM1's ONE table (`idearium/cli/route-commands.js` SPEC). A new command row is a new agent capability, with nothing added to the tool. `action: "list"` gives every command with its usage; `run` takes the command, the repo (a uuid or name; a repo agent's own repo by default), args and flags.
- What stays the person's is refused with how they do it: a row's `personOnly` covers approving a proposal and stopping, starting or restarting a Nexus system. The check reads only the words, so the refusal comes before anything is looked up.
- Every act is attributed to the caller: `approvedBy` is set to the agent, so the activity log names who did it.
- Answers are trimmed to 12,000 chars for a small model. A long list is cut and says how to narrow it.
- Claude Code: the MCP server gains `nexus_command`, which is the same tool. `claude-code-backend` passes the repo as `NEXUS_MCP_REPO`, so a run inside a repo knows its repo. `repo-agent.js` names the tool in the prompt and stays inside RH-006's budget.
- Registered in lib/agent-tools, the tool catalog (the about group) and the tool guide.

## Mapped, not built
In `docs/2026-10-07-compartment-control-and-activity-phasemap.spec`, each phase reuses what already exists:
- **UN1:** Nexus's own surfaces in the interaction field.
- **SP1:** one spotlight.
- **DC1:** noticing a click that did nothing.
- **DX1:** diagnosing it.

## Proof
- **New suite:** test-nexus-command-tool 7/7.
- **Neighbouring suites, all green:** agent-tools-and-graph 13/13, agent-tools-every-backend, claude-code-backend, cli-route-commands 8/8, code-tools 28/28, event-contracts, nexus-mcp, registry-harness (RH-006), tool-guide, tool-layers-and-pane-memory, raid-approve-tool.
