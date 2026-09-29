# NEXUS 0.39.273: Idearium, solid for building codebases

**Date:** 2026-09-27 · base: 0.39.272 · map: `docs/2026-09-27-idearium-codebase-toolkit-phasemap.spec` · contract: `docs/code-intel.spec`

James: *"I want idearium solid for building codebases. Fully built, enterprise grade. Agent tools completely solid, all context is easy to search and understand for each chunk."*

## What was wrong (measured on 0.39.272, before any change)

The chunk layer was run over idearium's own source (376 files, 3,584 chunks):

- **1,054 chunks began at a nested function.** The symbol regexes matched at any indentation (`^\s*function …`), so a helper inside a function became a chunk boundary and cut the enclosing function mid-body. The pipeline's header said it "never cuts mid-body"; it did.
- **984 chunks ended with the next function's doc comment.** Each chunk's purpose sat in the wrong chunk.
- **Chunks were unbounded.** The p90 was 48 lines, and the largest was 1,253 (the API's handler switch was one chunk).
- **Many languages had no symbols.** JSX and TSX were detected but had no patterns. Go, Rust, Java, C#, Kotlin, Swift, PHP, Ruby and C/C++ were each one whole-file chunk. Markdown was one chunk per file.
- **Chunk ids were `sha(repo:file:INDEX)`.** Adding one function renumbered every id below it.
- **The body of the code was not searchable.** Search was token overlap on symbol names and file paths only.
- **Agents could only write whole files.** To change one line of a 3,000-line file, a model had to reproduce the other 2,999. In review mode, a second proposal for the same file was computed from the committed file, so it silently dropped the first.
- **Edits to large imported files wrote truncated content.** An imported file over `max_chunk_bytes` (200 KB) has a truncated chunk. Injects were proposed against that chunk, so applying one wrote the truncation over the real file.

## Chunks (`lib/code-intel/`, chunker 2.0.0)

Every line now gets a structural depth, a bracket depth, and a flag saying whether it starts a statement. The flag comes from a real scanner for strings, template literals with `${}`, regex literals, comments, char literals, raw and triple strings, Python brackets and triple quotes, and markdown fences.

Chunks are cut only at statement starts of the level being chunked:

- **Docs attach.** A declaration's doc comment, decorators and attributes open its own chunk. A banner comment one blank line above counts. A file header that begins the file stays the file's preamble.
- **Size is bounded.** A unit over 150 lines is split at its own members: a class at its methods (`RepoLayer.materialize`), an object at its keys, a function body at its statements, a switch at its cases, and markdown at its sub-headings. This is recursive. Only a single indivisible statement, like a 400-line template string, is cut at blank lines, and it is marked `forced`.
- **Small neighbours merge.** Imports, variables and loose statements become one block. One-line helpers group into one chunk and keep every symbol.
- **Every line is in exactly one chunk.** This is checked. A plan that fails the check falls back to windows and says so.
- **Ids survive edits.** A chunk's key is its kind plus its qualified name (with an ordinal only among same-named chunks), and its id is derived from the key.

**Languages:** JavaScript, TypeScript, JSX, TSX, Python, Go (receiver methods become `Type.method`), Rust (impl blocks, and lifetimes are not strings), Java, Kotlin, Scala, C#, C, C++, Objective-C, PHP, Swift, Dart, Ruby, Elixir, Lua, CSS, SCSS, JSON, YAML/.spec, SQL, shell, HTML and markdown.

**Measured after the change**, on the whole tree (2,621 files, 24,204 chunks):

| | before (idearium's 376 files) | after (all 2,621 files) |
|---|---|---|
| cuts in the middle of a statement | 1,054 of 3,584 chunks | 0 unforced. The 35 forced cuts are all inside giant template strings, and each one is marked. |
| doc comments split from their declaration | 984 | 0. What remains are 10 file headers kept as their file's preamble, plus 3 comments that trail the code above them with no blank line, which by rule stay with that code. |
| chunks over 150 lines | 13 over 200, the largest 1,253 lines | 0 unforced (the largest is 150 lines) |

`test-code-intel` CI-601 holds these figures on idearium's own source.

**Pipeline:** `import-pipeline.js` uses the plan. Chunk JSON gains `key, kind, name, qualifiedName, parent, declLine, signature, exported, defines, language, forced, chunker`. `files.json` entries carry the chunker version. A file chunked by another version is re-chunked once, and unchanged files are not re-planned. The incremental re-index of 376 files takes about 1 s.

## A card for every chunk (`indexes/cards.json`)

Each card holds:

- kind, qualified name, signature, and doc comment
- a one-line summary (the doc's first sentence, or what the chunk uses and what uses it)
- the chunks before and after it, and its parent
- whether it is exported, and the module specifiers it uses
- **uses** and **used by**, each entry labelled with its basis:
  - `import`: bound by `import`, `require`, a `createRequire` alias, `await import`, `require(x).m`, or a lazy getter `_x().m`, and resolved to the file in the repo that defines it
  - `same-file`: defined by another chunk of the file, including `this.method` resolving to the class's own method
  - `name`: a distinctive code name defined at top level in exactly one other file of the same language family; this is the weakest basis
- **tests:** the users that live in test files, plus the runtime proof when one exists

This is not a call graph. `graph.js` keeps `calls` declared unsupported, and the addendum in `idearium.repo-graph.spec` says why.

## Search (`indexes/search.json`) and grep

- **Search** is BM25 over four weighted fields: name ×4, doc and signature ×2, path ×1.5, and the code itself ×1.
  - Identifiers are indexed whole (`materializequiet`) and split and stemmed (`materialize`, `quiet`). A prefix of a word counts at half weight (`ident` matches `identifier`).
  - Naming a chunk ranks it first. An implementation outranks its test unless the question asks for tests. Lists of exports are demoted.
  - Hits come with a summary and the lines that matched. Term vectors are cached by content hash, so an incremental import re-vectorises only what changed.
- **Grep** takes a literal, a regex, whole-word or case-sensitive pattern, a path glob, and up to 10 lines of context. It returns the chunk each hit is in and states when it truncated.
- **Retrieval:** `lib/repo-context.js` now ranks dispatch-time retrieval with this index, with a precision gate. Each retrieved chunk carries one line saying what it uses and what uses it.

## Changing code: `/api/repos/:uuid/code/*` (`idearium/repo/code-api.js`, `lib/code-edit.js`)

**GET:** `overview`, `tree`, `search`, `grep`, `chunk`, `outline`, `read`, `definition`, `changes`.

**POST:** `edit`, `write`, `delete`, `move`, `batch`, `check`.

**Edit forms**

All the edits in one call refer to the file as the agent last read it, so line numbers stay valid for the whole call.

- **Exact text** (`{old, new}`): must be unique, or given `occurrence` or `replaceAll`. If the text is not found exactly, a unique match that differs only in trailing space or indentation is accepted. The replacement is re-indented line by line, and the reply says how it matched.
- **Line ranges**, with an optional `expectText` guard.
- **Inserts** before or after a line, or at the start or end of the file.
- **A whole chunk by id.** This is refused if the chunk's text changed since it was indexed.

**What a write checks**

- **Refusals say where:** the closest lines, every line a duplicate appears on, and which edits overlap.
- **Syntax guard:** each changed file is checked with `node --check` (ESM detected), `JSON.parse`, Python `ast`, or brace balance for other languages. A write that introduces an error is refused (422), with the line, unless `force`.
- **`expectHash`:** refuses to write if the file changed since it was read.
- **`dryRun`:** returns the diff and the check without writing.

**The inject trail.** Every write is an `.inject` (`lib/repo-inject.js`), so every change keeps its history and its undo.

- **Review mode:** the change is proposed. A later edit to the same file stacks onto the pending proposal. `read` shows that pending version and says so.
- **Auto mode:** each call is all-or-nothing. If one file fails, the ones already applied in the call are reverted. The repo is re-indexed once per call.
- **Nexus repos** still need James's approval.

**`batch`:** up to 50 operations across files. All are validated first, so nothing is written if any fails. Later operations see earlier ones.

**`move`:** returns the lines that still name the old file.

**`check`:** runs the syntax check, then the tests that use the changed files. Those are the test chunks that use them, plus the registry's covering tests, run in the repo's COS compartment. The verdict is in `passed`.

**Self-healing index:** a repo indexed before this release gets its cards the first time any code route is called.

**Inject and RepoLayer additions**

- `op: 'delete'` for injects: refused for a missing file, and on the Nexus gate.
- `apply` and `revert` take `{ defer }`.
- `currentOf()` returns the content an inject is proposed against.
- `RepoLayer.readTextFile()` returns an imported file's real bytes, and `_current` now uses it (the truncation fix).
- `RepoLayer.deleteTextFile()` removes the source bytes, the manifest entry and the chunk. Before this, a deleted imported file stayed on disk and in the index.

## Agent tools (`lib/agent-tools/tools/idearium/code.js`)

**The eleven tools:** `idearium.code_map`, `code_search`, `code_grep`, `code_chunk`, `code_read`, `code_refs`, `code_edit`, `code_write` (create, replace, delete, move), `code_batch`, `code_check` and `code_changes` (list, revert, or withdraw your own proposal; approval stays with the person).

- **Answers are compact:** each result gives the chunk id, `file:lines`, and a one-line summary. Anything left out is stated.
- **The repo comes from the run's context**, so the model never passes it.
- **Scope:**
  - Every new repo hat gets all eleven (`REPO_TOOL_SCOPE`).
  - The six read-only tools are always in scope (`ALWAYS_IN_SCOPE`).
  - A hat forged before 0.39.273 gets all eleven on its next persona refresh (the automatic one after an index, or `POST /api/repos/:uuid/hat/refresh`). Tools are only ever added, never removed, and the refresh result names them in `toolsAdded`. This matters because the refreshed persona tells the agent to use these tools, so its scope has to allow them.
- **The harness scope's first message** lists map, search, chunk, read, edit, write, check and `loom.find`, plus one line naming the rest. It is still under 3,000 characters. `loom.read` and `loom.write` stay registered and allowed; they are no longer listed.
- **Also updated:**
  - The persona and the card prompt block (1.1.1) name the new tools.
  - The tool guide is 1.2.0, with a note for each tool.
  - The catalog puts all eleven in "Files & code".
  - `idearium.repo_chunks.tool` points to the new tools.

## The repo's Code tab

A new tab next to Files lets you:

- search by meaning or exact text
- open any chunk's card (summary, signature, doc, uses and used-by with their basis, tests, runtime proof, and neighbours) with its code
- follow any use by clicking it

It reads the same API the agents use.

## Registry, specs, tests

- **Loom map:** `loom/maps/idearium-codebase-map.js` is registered in `loom/bootstrap.js` (10 components, 17 hooks, 23 wires). On a fresh bootstrap the STILL UNRESOLVED count is 112, the same as 0.39.272. The one edge not declared (lib/agent-tools/index.js → the code tools) is stated in the map: that consumer has no component in the registry yet.
- **Specs:**
  - New: `docs/code-intel.spec` and the phasemap, both registered in `docs/SPEC-REGISTRY.spec`.
  - Addenda: `idearium/spec/idearium.spec`, `nexus-repository-system.spec` (chunk schema, indexes, events), `idearium.repo-graph.spec` (cards are not edges), and the registry-harness phasemap (the listing change).
  - The Idearium atlas covers the Code tab, the tools and the cards. Its reference test is at 0 dead references.
- **New tests**, registered in `run-all.js`:
  - `test-code-intel` (38)
  - `test-code-edit` (20)
  - `test-code-tools` (28): the API on the real RepoLayer, the tools over real HTTP, and the hat refresh adding the tools
- **Existing tests updated:**
  - `test-registry-harness` RH-006 reflects the new listing.
  - `test-repo-context` was 4 failing on 0.39.272 and is now 16/16. Its dispatch tests assumed the pre-0.39.266 scope and prompt block, and now set them explicitly. The proof label accepts "passed", since the lazy pass runs tests. The stale-proof check now looks at the changed chunk.
- **Versions:** `lib/version.js` system 0.39.273. New modules: code-intel, code-edit, code-api and code-tools, all 1.0.0. `package.json` follows.

## Limits, stated

- **This is a scanner, not a parser.** JSX text containing an apostrophe, or other unbalanced constructs, fall back to indentation structure, and the plan says so.
- **Cards find references by name.** Each one says how it was found. None of this is type resolution or a call graph.
- **Search is lexical (BM25).** There are no embeddings.
- **A pending proposal is not in the search index** until it is applied. `code_read` shows the pending version.
- **Tests run only inside the repo's COS compartment.** A repo without one is reported as "could not run", never as passed.
- **Deletes in a Nexus repo are refused**, because the apply gate only writes files.
- **Chunk ids change once, on upgrade.** Each repo is re-chunked the first time it is indexed by 0.39.273 (on its next write, its next chunk run, or its first code call).
  - A `proof.json` computed before then refers to the old ids, so every chunk reads "none recorded" until the next proof run (`POST /api/repos/:uuid/proof`, or the lazy pass after an import).
  - Glyphs are recomputed.
- **Not run live:** no real small model has driven these tools on James's machine. Everything here ran against the real RepoLayer and inject trail, a real HTTP server, and a sandboxed live Idearium, but not against his models.

## Regression (this sandbox, same machine, both trees)

`node tests/modules/run-all.js`:

| tree | passed | failed |
|---|---|---|
| 0.39.272 | 4,280 | 123 |
| 0.39.273 | 4,376 | 118 |

Compared suite by suite:

- **No suite got worse.**
- **What changed:**
  - the three new suites are green (38, 20 and 28 tests)
  - `test-repo-context` went from 12/4 to 16/0
  - `test-cg-bookmark-account-state` timed out on the 0.39.272 run and passed on this one; nothing here touches it
- **What did not change:**
  - The same 42 suites crash in both trees. These are environment failures here (no Electron, no services).
  - `test-repo-agent-late` and `test-autopilot-boot-gates` time out in both.
