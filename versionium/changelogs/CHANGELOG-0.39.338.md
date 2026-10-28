# 0.39.338 — 2026-10-05

James: "What if instead of just a tool, it's a compartment, like the work surface is in COS. Right? It would be like ask a question or or a intent or whatever. And then predetermine what context is needed. So make like prerequisites. Then uh, use those as a checklist for context. And then then use that to build the the uh, the work set index."
James: "Yeah, the, the prerequisites, the questions, right? That way, then if it can't, if it can't find context, then it'll, it'll just ask me the rest, or reference the past conversations"

The idea is James's: prerequisites first, a checklist for context, and ask him or look in past conversations for what's missing. Mapped first as SB38 in `docs/2026-10-05-build-from-the-spec-phasemap.spec`.

The coder's input, given before building and recorded in the phase:
- **Not a COS compartment per question.** Gathering context only reads, so it needs no isolation. A compartment is for a task that writes and runs: a build, or an order.
- **Nexus makes the checklist, not the 3B model.** The model is the weakest link at deciding what it needs.
- **Every item can be checked.**

James answered on the prerequisites and on what happens to missing items. He didn't answer on the compartment, so that is left as proposed.

## The questions first
Before each send, `lib/context-prereqs.js` does this, with no model involved:

1. **Intent**, from the question's words: explain · change · debug · build.
2. **Target**: what the Code tab's search ranks first.
3. **Checklist** for that intent:

   | intent | needs |
   |---|---|
   | explain | the code · what it uses · what uses it |
   | change | the same · its tests · **what it should do once changed** |
   | debug | the code · what calls it · its tests · **the exact error** |
   | build | what exists like it · **where it goes** · **what done looks like** |

4. **Each item is looked for:**
   - **in the index** (the chunk cards);
   - **in past conversations**: this repo's agent first, then copilot (your general chats).
5. **Anything not found is asked, never guessed.** It becomes a `? …` line in the new editable `prereqs` block (Settings → Prompt, placed just before the question), and the agent is told to ask you. Each one is also recorded as a gap through `lib/shadow.js`, so intelligence sees what the agents keep lacking.

Your answer becomes a past conversation. The next time the same thing is asked, it's checked off with ↺ instead of asked again.

The Agent tab's preview shows the same checklist. The send reports it under `ctx.prereqs`.

## Found while testing
The first cut searched **every** agent's past conversations, and one project's conversation answered another project's question. Past conversations are now this repo's agent, then copilot, never another project's. PQ-04 pins this.

## Proof
- **`tests/modules/test-context-prereqs.test.js`, 7/7**, on a repo indexed by the real pipeline:
  - **PQ-01:** intents.
  - **PQ-02:** an explain question is fully checked off from the index, with nothing asked.
  - **PQ-03:** a vague change question asks what it should do; one that says it is checked off.
  - **PQ-04:** an answer from an earlier conversation (the real memory store) is found, not asked; another project's conversation is not taken.
  - **PQ-05:** an unmatched question asks which part you mean, and each absence is recorded as a gap.
  - **PQ-06:** the block sits before the question, with its `?` lines; switched off, it's not sent.
  - **PQ-07:** the real dispatch sends it and reports it.
- **Every suite that touches** repo-agent, the prompt blocks or shadow: 34 suites, all green. A 35th file, `test-economy.more.js`, prints no result with or without this change, so it isn't a standalone test.
- **Loom:** `nexus.lib.context-prereqs`, with its real edges (code-intel, agent-memory and shadow in, repo-agent out). The registry was regenerated from scratch, with nothing lost.
