# 0.39.326 — 2026-10-05

James: "im not saying the atlas. im saying the graphs, chunking, the code tab, all of it, actually look at the context retrival."

Mapped first as SB34 (build-from-the-spec 1.14.0). What I found when I read the retrieval:

- **What was sent.** The default (harness) scope sent only the registry card of a file the question named. It never used:
  - the chunk index, or the Code tab's search (`lib/code-intel`: BM25 over every chunk's name, doc, path and body);
  - the chunk cards (what each chunk uses, what uses it, its tests);
  - memory and the other stores' graphs (`lib/context-atlas`), which only ran with their block switched on, and it is off by default.
- **What reached the model.** The prompt only rendered context of kind "card". Code and map context went to blocks that are off by default, so they were dropped. SB32's map (0.39.325) never reached the model either.
- **The graph was wrong.** `lib/registry-harness.js` read the graph's inverse edges (`depended_on_by`) as requires, so every dependency looked required both ways.

Now, on every send, in budgets a small model can hold:

1. a file the question names → its registry card;
2. the Code tab's search → the best chunks, each with its card and the lines that matched, plus the top chunk's code;
3. the graph around the top file: what it requires and what requires it, each edge once;
4. memory and graphs (`context-atlas`), always. When its block is on it is already in `{atlas}`, so it is not sent twice;
5. nothing found → the overview from the index: files, chunks, folders, most-used files, entry points.

The "all" and "project" scopes keep their own retrieval first (chunk text, glyphs, runtime proof, the caller's budget) and fall through to the above when it finds nothing. Every kind of context now reaches the prompt: code and map go to their own blocks when those are on, otherwise to the always-on context block.

Tests:

- `test-agent-context-always` 5/5, on an index built by the real import pipeline. A question naming no file gets the chunk whose code answers it, with its card, its code and the graph, in the prompt. An unmatched question gets the overview. Memory is searched with its block off.
- Unchanged and passing: repo-context 16/16, repo-agent, provider, node, learn, late, hat, harness, code-intel, code-tools, code-edit, tool-guide, loom.
