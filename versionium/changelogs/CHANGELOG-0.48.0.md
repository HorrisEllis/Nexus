# 0.48.0 — agent settings in Settings → Agents; the agent in the Code tab

James: "no. all agent settings and options in the options tab under agents. the agents tab should maybe merge with the code tab."

The idea and the direction are James's; the code is the coder's.

## Settings → Agents
Every agent setting now lives under Settings → Agents, drawn natively with no iframe:
- **Behaviour:** who answers, its Ollama model, which tools it may use, and what happens to the code it writes.
- **Prompt:** every block the agent is sent.
- **Hat & tools:** the persona, the tools it carries and what it has learned, with teach, export, import and forge.
- **Models:** whether Ollama is wired in.

## No Agent tab
- The Code tab's docked agent is now the repo's agent, with one conversation that is kept when you leave the tab.
- Its slash commands (`/help`, `/tools`, `/debug` …) work there.
- One line at the top says who it is, how much is indexed and what it has learned, with **options ↗** to Settings → Agents.
- Its proposals are the Code tab's diffs. Anything that opened the Agent tab now opens Code.

This reverses 0.47.0's option sections in the Agent tab.

## Proof
`tests/probe/idearium-one-surface-glass.js` 18/18, on the real page.
