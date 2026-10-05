# 0.39.337 — 2026-10-05

James: "what if it builds a temporary, index of context, copies the relevant context to it, one by one until it synthesize it into it into only what it needs."
James: "I know it's a fucking problem. This is a real problem when I push it. So, so, uh, as I said, uh, in index, but we do JAA or uh, JSON. Probably just a JSON file. So it's synthesizing. Find the context one by one, put it in an index, and then synthesize it into, into just what it needs. Signal to noise."

The idea and the design call (a JSON file, read one by one, synthesized) are James's. Mapped first as SB37 in `docs/2026-10-05-build-from-the-spec-phasemap.spec`, then built.

## The problem
An Ollama tool loop re-sent the **whole run** every round: the prompt, every reply, and every tool result in full, with nothing capped. That went into a 6,144-token window that Ollama truncates from the front. The more context an agent found, the sooner it lost the persona and the question.

## The working set
`copilot/lib/workset.js` keeps **one JSON file per run**, owned by copilot: `copilot/data/worksets/<id>.json`. It is git-ignored, and in tests it lives in the sandbox (`COPILOT_WORKSET_DIR`).

1. **One by one.** Each tool read goes into the file with its raw result kept whole.
2. **Signal, picked without a model.** A small model's summary drops things, so none is used. For each read Nexus keeps:
   - what identifies it: chunk id, file:lines, name, signature, what it uses, what uses it;
   - the lines that carry the **question's own words**.

   A read of 1,500 characters or less is kept whole, because an agent editing a short function needs every line. The noise stays on disk, never in the prompt.
3. **Synthesized.** Every later round is the prompt plus the working set, cut to a 6,000-char budget: most relevant first, a line never repeated, cuts counted. The agent re-opens any chunk by its id.
4. **Provenance.** The answer is written to the same file as everything it was drawn from. The Agent tab's reply carries `workset { id, file, reads, ids, files }`.

The synthesis is framed by a **new editable block**, `workset` (Settings → Prompt): "What you have found so far …". Switch it off and you get the old behaviour.

This is **Ollama only**. A browser tab (ChatGPT through Guardian) keeps its own conversation and is sent each result once, as before. Guardian's path is untouched.

## Measured
Five tool reads of about 20 KB each, one answering line buried in them:

| | before | after |
|---|---|---|
| the last round sent | 119,260 chars | **1,601 chars** |
| the whole run sent | 358,032 chars | **5,331 chars** |

The question was in every round, and the answering line reached the model.

## Proof
- **`tests/modules/test-copilot-workset.test.js`, 4/4:**
  - **WS-01:** distil keeps identity and the matching lines, drops the noise, and keeps a small read whole.
  - **WS-02:** the five-read run stays within budget and keeps the question and the answer line. The old path was measured alongside.
  - **WS-03:** the JSON file holds every raw read whole, its signal and the answer, in the sandbox.
  - **WS-04:** the repo agent sends the block and the question for Ollama only.
- **Also green:**

  | Suite | Result |
  |---|---|
  | copilot-tool-runtime | 12/12 |
  | guardian-tool-runtime | 5/5 |
  | tool-call-listener | 9/9 |
  | agent-tools-and-graph | 13/13 |
  | agent-tools-every-backend | 4/4 |
  | composed-prompt | 20/20 |
  | registry-harness | 7/7 |
  | agent-context-always | 5/5 |
  | test-sandbox | 39/39 |
  | repo-agent-late | 17/17 |
  | agent-index-ready | 4/4 |
  | version-sync | 30/30 |

- **Loom:** `nexus.copilot.lib.workset` is mapped with its real wires: `tool-runtime → workset` (a conditional require the scanner can't see, so it's declared by hand) and `workset → test-sandbox`. The registry was regenerated from scratch, with nothing lost.

## Versions
- copilot 3.8.0 (new module)
- idearium 4.29.4
- prompt blocks 1.5.0
