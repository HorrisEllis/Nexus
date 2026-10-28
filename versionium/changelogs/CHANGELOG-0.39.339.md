# 0.39.339 — 2026-10-05

James: "do it. we could use that for more than coding. coudl use it for debugging, dom in clearglass, or any data fed into a pipeline"
James: "im saying for anything it wants to learn. agnostic tool for context"
James: "don't just agree. im not looking to add noise. can i build from inside nexus now?"

## One agnostic context tool
`lib/context-prereqs.js` is now an **engine with domains**. Every domain gets the same steps:
1. its own source;
2. past conversations, from this repo's agent then copilot;
3. otherwise, ask James, with the gap recorded.

| domain | for | the checklist |
|---|---|---|
| `code` | a question about a repo (SB38, unchanged) | the code · what it uses · what uses it · tests · what it should do |
| `data` | any record fed into a pipeline | the fields the caller needs, each a path and the question to ask if it's absent |
| `topic` | anything else | what it is · where it lives · what it connects to · what was said before, from every store Nexus keeps |

`learn()` picks the domain from what it's given.

**`nexus.learn.tool`** gives any agent (Ollama, ChatGPT, Copilot) the checklist, the context found for each item, and the questions to ask. The `context-tools` prompt block names it in one line.

## The checklist builds the working set
- An Ollama run's working set (SB37) now **starts from the checklist**: items already found go in as the first reads.
- A code read ticks off a missing target.
- Each later round opens with the checklist: complete, or what's left to ask.
- The first round's prompt already carries the checklist, so the working set isn't sent until a real read is in it. Nothing goes twice.

## Kept to what was asked
- The DOM and debug domains were mapped, then removed again before any code was written. `registerDomain()` takes them when they're wanted; mapping them now was paperwork.
- The first message still fits under 3,000 characters (RH-006).

## Proof
- **`tests/modules/test-checklist-workset.test.js`, 6/6:**
  - **CW-01:** the working set is seeded from the checklist.
  - **CW-02:** an Ollama run with no duplicate in round one, the target ticked by a code read, then complete.
  - **CW-03:** a pipeline record's missing field is asked.
  - **CW-04:** `learn()` finds a topic in Nexus's own specs and asks what it can't find.
  - **CW-05:** the tool answers.
  - **CW-06:** the domain is picked automatically, and a new domain runs through the same engine.
- **Every suite that touches** repo-agent, the prompt blocks, the tool loop, the agent tools or the working set: 49 suites, all green. TL-01 needed the new tool categorised (Memory & thinking).
- **End to end, build inside Nexus:** `test-prove-loop` 7/7 (a real idearium server: spec → files → a failing round → repaired → proven) and `test-build-from-the-spec` 5/5.
- **Loom:** the registry was regenerated from scratch, with nothing lost. `nexus.lib.agent-tools.tools.query.learn` is wired from naming and context-prereqs, and context-prereqs from context-atlas.

## Versions
- copilot 3.8.1
- idearium 4.29.6
- prompt blocks 1.6.1
- context-prereqs 1.1.0
- workset 1.1.0
