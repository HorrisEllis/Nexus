# HANDOFF — 0.39.273 → next session

**Base:** `nexus.zip` (0.39.273, built on 0.39.272).
**Map:** `docs/2026-09-27-idearium-codebase-toolkit-phasemap.spec` (CB1–CB6, each gate with its proof).
**Contract:** `docs/code-intel.spec`.
**What shipped:** `CHANGELOG-0.39.273.md`.

Read `docs/CLAUDE.md` first.

## The toolkit, in one paragraph

A repo idearium holds is cut into structural chunks by `lib/code-intel/chunker.js` (2.0.0). The import pipeline then writes a card for each chunk (`indexes/cards.json`) and a BM25 index (`indexes/search.json`).

`/api/repos/:uuid/code/*` (`idearium/repo/code-api.js`) reads those, and it writes through `lib/code-edit.js`: plan, diff, syntax check, then `.inject`s via `lib/repo-inject.js` and RepoLayer. Agents use eleven `idearium.code_*.tool` tools (`lib/agent-tools/tools/idearium/code.js`). People use the repo's **Code** tab.

## Still open from 0.39.272 (untouched here; see `docs/HANDOFF-0.39.272.md`)

1. The Clear Glass loom map (`loom/maps/clearglass-whole-map.js`).
2. The 0.39.272 spec addenda: the clear-glass, copilot and repo-prompt-blocks specs, plus the new opportunity, context-atlas and cg-learning specs.
3. The 0.39.272 tests: context-atlas, cg-learning, opportunity additions, and `/cli/invoke`.
4. Pane learning (`/api/learned/observe`).
5. The live checks on James's machine.

## Next for the codebase toolkit, in order

1. **Live, with a real small model.** On James's machine:
   - Open a repo, and on its Agent tab ask: *"find where X happens and change it to Y, then check it"*.
   - Watch that the agent calls `code_search`, then `code_chunk`, then `code_edit`, then `code_check`.
   - Watch the review-mode stacking: after two edits there should be one pending inject.
   - Nothing here was run against a real model. The tools ran against the real RepoLayer and inject trail, a real HTTP server, and a sandboxed live Idearium.
2. **Older hats.** A hat forged before 0.39.273 gets the eleven code tools on its next persona refresh (`toolsAdded` in the result; nothing is removed). Until that refresh, in `project` scope it has only the six read-only ones (`ALWAYS_IN_SCOPE`). The default `harness` scope allows every tool either way.
3. **Wire `nexus.lib.agent-tools` into loom.** `lib/agent-tools/index.js` has no component in a fresh registry (its `.export` is in STILL UNRESOLVED on 0.39.272 too). When `copilot-capability-map.js`'s declaration lands, add the consumer edge from the code tools. It is stated in `loom/maps/idearium-codebase-map.js`.
4. **Pending proposals in search.** A review-mode proposal is not indexed until it is applied. `code_read` shows it; `code_search` does not.
5. **Deletes on Nexus repos.** The apply gate only writes. Deleting a live Nexus file needs a gate operation of its own.
6. **Tests without a compartment.** `code_check` runs tests only inside the repo's COS compartment. A dropped (non-imported) repo has none, so `check` reports `couldNotRun` with the reason. Decide whether such repos should get a compartment on first check.
7. **Optional: semantic search.** Search is lexical (BM25 with prefix expansion). The cards and term vectors are cached per chunk hash, so embeddings can slot in beside `search.json` without touching the chunker.

## Decisions to keep

- **Every agent write is an inject.** Review mode stacks; auto mode is all-or-nothing per call; a Nexus repo needs James's approval.
- **An agent never approves its own proposal.** `code_changes` only lists, reverts, or withdraws.
- **A syntax error introduced by a write is refused** unless `force`.
- **Cards say how each reference was found** (`import`, `same-file` or `name`). They are never presented as a call graph. `graph.js`'s `calls` stays unsupported.
- **Chunk ids come from kind + qualified name.** Changing a chunk's name changes its id, which is intended. Adding code above it does not.

## Version bookkeeping

- `lib/version.js`: system 0.39.273. New modules: code-intel, code-edit, code-api and code-tools, all 1.0.0. `package.json` follows.
- The idearium service version (4.7.0) and copilot's were not bumped. That is the same four-sync-point drift noted in 0.39.269 and 0.39.272.

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
