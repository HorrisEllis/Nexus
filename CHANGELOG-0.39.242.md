# NEXUS 0.39.242 — the Responses index runs on JAA

**Date:** 2026-09-25 · clear-glass 3.13.0 → 3.13.1 · guardian 3.9.3 → 3.9.4

James, pasting 0.39.241's once-per-process line (`better-sqlite3 is not installed … index.db is skipped`): *"use jaa for the database"*.

## Before
- `clear-glass/src/downloads/artifact-chat-index.js` kept its index in `index.db` on better-sqlite3.
- better-sqlite3 is an optional native dependency, and its build needs a C++ toolchain your machine doesn't have.
- So the index **had never existed on your machine**. Every read fell back to scanning `responses/`.

## Now
- **The index is a JaaStore table** (`guardian/jaa-store.js`, the pure-JS store behind every `[jaa] Store ready` line) at `<compartment>/index-jaa/items.json`. It has the same fields as before:
  - `id`, `kind`, `provider`, `chat_id`
  - `agent_id`, `job_id`
  - `captured_at`, `content_hash`
  - `response_path`, `artifact_path`, `status`
- **Written at once.** `recordResponse` writes the `.response` file first (still the source of truth), then the index row, then flushes. It doesn't wait for JAA's 1.5 s debounce, because the readers are other processes: Clear Glass's Library and idearium's late-reply poll.
- **Read fresh.** `queryItems` reloads the table from disk before each read. Filters combine (agent AND job AND provider AND kind), newest first.
- **Self-healing.** If the index doesn't hold exactly as many items as `responses/`, it is rebuilt from `responses/` and read again. The mismatch could come from the index never having been built, a write that was lost, or files copied in by hand. **On your first launch this indexes every reply written without an index (all of 0.39.239–241).**
- **Last link kept.** If JAA itself fails, `responses/` is read directly.
  - Fixed on the way: that direct read used to return unreadable files for filtered queries, including another agent's query.
- `jaa-store.js` gains `opts.settings: false`, so a store that isn't guardian's own doesn't get guardian's default settings rows.
- An old `index.db` is left where it is and not read.

## Proof
- **`test-artifact-index-jaa` 9/9** (new), in the test sandbox:
  - no better-sqlite3 anywhere in the module
  - pre-existing, never-indexed replies are indexed on the first read, newest first
  - only `items.json` in the index folder
  - a write is on disk at once
  - **a second process running guardian's real writer writes, and this process sees the row on its next read**
  - filters combine
  - a deleted index is rebuilt with nothing lost
  - an unreadable file is indexed as unreadable
  - a JAA failure falls back to `responses/`
- **Mutation checks:** each change below was made in turn, and each made its own test fail:
  - removing the immediate flush
  - removing the count-rebuild
- **Regression:**
  - test-downloads-responses 15
  - test-code-artifact 46
  - test-repo-agent-late 15 (LR-04 now rebuilds after it edits a source file under the index)
  - clear-glass-library-ui 45
  - clearglass-library-window probe 25/25
  - jaa-db 53
  - jaa-store-multiprocess 1
  - jaa-flush-lock 7
  - jaa-selective-load 8
  - version-sync 30
  - record-discipline 9

## Not changed
- **`clear-glass/src/cookies/vault.js` still tries better-sqlite3 first.** It falls back to its JSON store, which is what runs on your machine. It's the other better-sqlite3 user, and a candidate for the same move.
- **The root `package.json` still lists better-sqlite3 as optional.** Nothing in the index needs it now.
