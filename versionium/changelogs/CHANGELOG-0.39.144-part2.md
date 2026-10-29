# 0.39.144 (cont'd) — DOM-based chat sync + artifact/chat index

Added on top of the merge documented in CHANGELOG-0.39.144.md:

## New: DOM-based chat synchronization
James: "why indexdb? why can't we manipulate the entire dom, what if we
had a cli for each agent, then we use that as a way to synchronize the
chats."

- `guardian/lib/chat-sync.js` — `requestSync(provider)`, deliberately
  copying `dispatcher.js`'s already-proven `_pingProvider()` shape (push,
  wait on a scoped bus event, timeout, zero-clients short-circuit).
- `guardian/lib/ncp-handler.js` — `GUARDIAN_SYNC_RESULT` case, mirrors
  `GUARDIAN_PING_ACK`'s existing pattern.
- `guardian/server.js` — `POST /sync` route.
- `guardian/cli.js` — `guardian sync <provider>` command, feeds the
  result into the artifact-chat-index compartment via `recordResponse()`.
- `guardian/userscript-claude.js` / `userscript-chatgpt.js` — real,
  verified full-transcript extraction (`_nexusGetFullChat()`, no 2000-char
  truncation unlike the existing `_nexusGetMessages()`).
- `guardian/userscript-gemini.js` / `userscript-deepseek.js` /
  `userscript-perplexity.js` — **honestly partial**: these three have no
  verified human-turn selector anywhere in the existing code, only
  `findResponseEl()` (assistant's last response). Sync here returns
  `partial: true` and the assistant's last response only, rather than
  guessing a selector with no evidence it matches the real DOM.

## New: ClearGlass downloads manager as a COS compartment
James: "make clearglass downloads manager, a complete artifact and agent
chat index... redundant backups, and fallback chains. index.db. and
.response." Also: "has to use cos."

- `clear-glass/src/downloads/artifact-chat-index.js` — runs inside a real
  COS compartment (the existing `database` archetype). `.response` files
  are the source of truth; `index.db` (better-sqlite3, WAL) is a
  disposable, regenerable accelerator. `queryItems()` enforces the
  fallback chain in code — any index read failure triggers
  `rebuildIndexFromResponses()` and retries once. `backupSnapshot()` uses
  the real, existing COS snapshot commands rather than a second backup
  path.
- `better-sqlite3` added to `package.json`.

## Found while testing, not assumed: this tree's own cos/ fixes are
## already better than the ones I wrote independently
Running `ensureCompartment()` end-to-end surfaced that `assignArchetype()`
was completely broken here too at first — same root causes I'd
independently hit and fixed in a separate working copy (missing `'exe'`
runtimeId, an undefined `ARCHETYPE` event contract, unregistered
archetype gates, a missing `archetypes` field on the system map). But
**this tree already had its own, more complete fixes for the same bugs**
(dated 2026-09-06, ahead of when I found them) — it also covers
`blueprint`/`playgrounds`/`plugin`/`vault` gates and a `qemu-windows`
runtime I hadn't touched. Verified by testing: did NOT overwrite this
tree's `cos/` fixes with my narrower version — re-ran the same
end-to-end smoke test (create compartment → assign `database` archetype
→ write a `.response` → query `index.db` → confirm idempotency) against
THIS tree's actual `cos/` code, unmodified, and it passed cleanly once
`better-sqlite3` was installed.
