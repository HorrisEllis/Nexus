# 0.55.0 — 2026-10-10

James, from a live run: "claude failed — timed out after 90000ms — waiting at gate 7/8 \"reply appears\" (claude): 114 mutations, no reply text read yet … climbing to deepseek (rung 4 of 4; derived: no Ollama models listed or installed — the chain's agents)" · "the build surface is supposed to be showing in idearium. removed deepseek coder v2."

## Browser agents were cut off at 90 seconds (HP7)

The repo agent gives a browser agent 5 minutes. Copilot used those 5 minutes only for its own call to guardian and never passed them on. Guardian's `askSync` therefore fell back to its own 90-second default. Every browser-agent job that went through copilot was cut off at 90 seconds, whatever the caller allowed.

In the log, Claude was mid-reply at that point (114 page changes), and the ladder climbed past it. `copilot/lifeline.js` now sends the wait to guardian, 5 seconds under the caller's, so guardian reports the gate it stopped at before the caller stops listening.

## The build surface shows again (HP6)

The Build button in the Phases tab's detail pane started the build but never opened the Plan panel. The button on the phase card always did. This was my regression from the RS10 rebuild. A build from either button now opens the Plan panel on its run.

## The ladder says why Ollama is missing (HP8)

"No Ollama models listed or installed" read the same whether Ollama was empty or not answering. The run's route now says which:
- **The bridge didn't answer:** "Ollama left off: " followed by the bridge's error.
- **Ollama answered with nothing installed:** it says no models are installed.

## Note

The "deepseek" rung in that log is guardian's DeepSeek browser agent, not the Ollama model you removed.

## Tests

| Suite | Result |
|---|---|
| test-hardening-pass (HR-06, HR-07 new) | 7/7 |
| test-lifeline-guardian-timeout (LT-006 new) | 6/6 |
| test-escalation-ladder | 9/9 |
| test-phases-tab | 5/5 |
| lifeline-fluid-routing | 6/6 |
| test-lifeline-ask | 5/5 |
