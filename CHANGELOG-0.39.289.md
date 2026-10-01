# 0.39.289 — 2026-10-01

James: "please get the agents building more stable. ollama has been known to cut off blocks, unless you fixed that."
James: "if it gets cut off, what about injecting the cut off part into the agent, and having it finish it. like the compounding."
His phase build: "ollama · 46s · blocked: empty — 0 non-blank character(s), at least 1 required".

## Why Ollama cut off or came back empty — found in `ollama/lib/ollama-client.js`
- **A 45 s total timeout on a request that was not streamed.** A local model writing a whole phase was killed at 45 s, which is the "46s · blocked: empty" above. Generation is now streamed:
  - the timeout counts silence (no token for 45 s), under a 10-minute cap on the whole generation;
  - copilot's wait for the job now follows that cap (it was 90 s);
  - the repo agent's wait for an Ollama reply now follows it too (it was 90 s).
- **Thinking models came back empty.** qwen3, deepseek-r1 and similar can spend their whole budget thinking, and their reply was read as empty. Now, thinking with no answer means it is asked again with thinking off.
- **Cut-offs looked complete.** Ollama's "stopped at the token limit" signal was thrown away, and the limit was 2,048 tokens. The limit is now 4,096, and a cut reply is continued.
- **A missing model looked like an empty reply.** An error sent as the last line without a newline was skipped; it is now reported as an error.

## A cut reply is finished, not thrown away — `lib/reply-continuation.js`
- The part already written is kept. The agent is shown the end of it and asked to continue from exactly there. The two parts are stitched together: a repeated overlap is removed, and a code block opened a second time is dropped.
- Up to 3 rounds in the Ollama bridge and 2 in spec chunk dispatch. The chunk records how many rounds it took. A reply still cut after the last round is reported as cut.
- Spec chunks on any provider are continued before the detector judges them, so a provider is no longer marked failed because of one cut.

## James's voice
- James: "can you make it a rule to quote me, in the versions, changelogs, like i want my voice to be here. I have no job, or portfolio. i want this as much me as possible. you're the coder."
- This is now a rule in `docs/CLAUDE.md`: every version line, changelog and phasemap origin opens with his words, verbatim.

## Mapped (`docs/2026-10-01-idearium-agent-ready-master-phasemap.spec` 1.1.0)
Everything else James asked today, each item quoted in his words:
- a blocked build gets actions;
- a phase build writes code;
- Idea and Phases in one tab;
- the phasemap out of Files, and a file tree you can sort and restructure through the registry;
- the registry chunk in an imported repo's chunking;
- the Code tab about the code, with search moved to Files;
- the plan and work surface as docked panels with an edge tab;
- the context cascade (project → memory → Clear Glass web search);
- chunking for data ingestion;
- Clear Glass: several accounts on one site, private windows, a drag wrapper, and a URL bar that resizes with the window;
- file tools to merge zips, apply patches and drop files in safely;
- the promote-to-spec template catalogue (web app, Android, desktop, bots, scrapers …);
- Run in an isolated copy, and more environments.

Tests: `tests/modules/test-reply-continuation.test.js` 7/7 (with a fake Ollama: cut-off, thinking-only, idle timeout; chunk dispatch finishing a cut reply); `test-ollama-activity` 5/5.
