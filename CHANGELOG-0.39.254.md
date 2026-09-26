# NEXUS 0.39.254: the download manager logs every agent chat, one versioned record per chat

**Date:** 2026-09-26 · guardian 3.11.1 → 3.12.0 · clear-glass 3.14.1 → 3.15.0 · userscripts chatgpt/claude 10.6.0, gemini/perplexity/deepseek 10.5.0 · Versionium `vtm-99a6abef` (parent `vtm-8b55aba2`, 0.39.253) · git `b22c398`

James: *"we were working on getting the download manager logging agent chats."* The earlier conversation's work was never committed; this tree was clean at 0.39.253. Asked, he chose:
- **Trigger:** a full-transcript sync.
- **Record:** one per chat, versioned.
- **Scope:** every provider chat, including *"the userscripts for my browser. i want nexus to help remember. persistent memory for ai agents."*

## Mapped
- **A chat reached the downloads index only when a job completed** (`ncp-handler` → `response-sink` / `code-artifact` `recordAgentResponse`).
  - The attached 0.39.253 log shows four ChatGPT jobs, each stopped at `submitted` → `dom (4 mutations)`. None completed.
  - `guardian/data/nodes/response/` held zero `.response` nodes.
  - A chat James opens by hand is never a job.
- **The page's full-chat reader already existed and never depended on reply detection.** `_nexusGetFullChat()`, used by `GUARDIAN_SYNC_REQUEST`, reads `data-message-author-role` on ChatGPT. Its answer went only to whoever called `/sync`; nothing recorded it.
- **`userscript-chatgpt` `chatId()` stopped at the colon of `/c/WEB:<uuid>`**, so every ChatGPT chat read as `WEB`. A per-chat record would have merged them all into one.
- **`userscript-memory.js` is not persistent memory.** It posts turns into cortex *working* memory, which decays. It was left unchanged; see below.

## Built
- **Userscripts** (all five providers) push `GUARDIAN_TRANSCRIPT` when the chat settles and its transcript changed.
  - **Settle:** no change in `<main>` for 5 s, or after 60 s at most. They watch `<main>`, not `<body>`, because their own panel lives in `<body>` and would keep the chat from ever settling.
  - **Delivery:** a push is marked sent only after guardian answers, so a closed guardian means "sent later", not lost.
  - Sync results now carry `agentId`.
- **`guardian/lib/chat-transcripts.js`** is the one writer. It records every `GUARDIAN_TRANSCRIPT` and every `GUARDIAN_SYNC_RESULT`; `ncp-handler` only puts them on the bus.
  - **Whose chat:** the tab's agent stamp, else the job that ran in that chat (`guardian.job.progress` carries its `chatUrl`), else what the chat was already filed under. None of these means it's James's own chat.
  - **Recall routes:** `GET /api/chats` (`?agentId ?provider ?q` text recall), `/api/chats/versions?key=provider:chatId`, `/api/chats/item/:id`.
  - Emits `guardian.chat.transcript.recorded`.
- **`clear-glass/src/downloads/artifact-chat-index.js`** gets `recordChat` / `listChats` / `chatVersions` / `collapseVersions`.
  - **Record:** kind `transcript`, `chat_key`, `version`, `transcript_hash`.
  - **Refusals, by name:** `no-chat-id`, `empty`, `unchanged`, `contained-in-latest`. The last means a partial or lazily-loaded read never replaces a fuller version.
  - **History:** every version is kept. The newest is the highest `version`, because two versions can share a millisecond.
  - `recordResponse` and `recordChat` share one write path.
- **Library → Responses** lists each chat once at its newest version. It opens a chat as a conversation, with a picker for earlier versions. `/cli/downloads/responses` collapses versions; `?versions=all` lists every version and `?chatKey=` shows one chat.

## Tests
- **`test-chat-transcripts` 20/20 (new, registered in `run-all.js`).**
  - The real `ncp-handler` → bus → writer → index, in a temp root.
  - The routes, the `server.js` wiring, every userscript, and chatgpt's `chatId`.
  - TX-20 runs `tests/probe/transcript-push-chromium.py` 9/9 in real Chromium: the userscript's own block on a `chatgpt.com/c/WEB:…` page, covering settle, streaming, a ticking panel, unchanged, guardian down, max wait and `home`.
- **`tests/probe/clearglass-library-window.js` 29/29** in real Chromium, with 4 new chat checks.
- **Mutation checks:** 11 guards reverted one at a time. Each was caught by its own test:
  - `contained-in-latest`
  - latest-by-version
  - agent carried forward
  - unchanged
  - job-chat agent
  - the handler case
  - sync recorded
  - `WEB:` chatId
  - `<main>` vs `<body>`
  - sent only on answer
  - max wait
- **Regression:** version-sync 30, record-discipline 9, artifact-index-jaa 9, downloads-responses 15, response-downloads 9, response-sink-passthrough 9, code-artifact 46, repo-agent-late 17, library-ui 41, userscript parity 12, mixed-content 21, replay-retired 3, ncp-handler-sr3 7, guardian-wake 16, cg-selector-assign 10, chat-sync-routing 8, repo-agent-provider 60.
- **Pre-existing, identical at 0.39.250–253:** nexus-wake NW-020/033/034.
- **`data/`:** `test-ncp-handler-sr3` and the response suites still write into it. The tree was restored and checksum-diffed to zero, and the new suite and probes write nothing. The only data writes are this release's Versionium record and its `event_log` line.

## Records
- **Specs:** guardian `built_2026_09_26_chat_transcripts`; clear-glass module `chat-transcripts-index` and version_history 3.15.0.
- **Atlases:** a section in each; the clear-glass version row.
- **Registry and contract:** 3 guardian components + contract routes; 2 bus events in `siso.emits`; clear-glass route descriptions.
- **Versions:** `lib/version.js`; `userscripts.yaml`, which had drifted to 10.1–10.2 and 1.0.0 and is now synced.

## Not done / known
- **Not proven live on James's machine.** Next time a chat settles, expect `[guardian/chat-transcripts] chatgpt:WEB:… v1` in the log, and the chat under Library → Responses.
- **gemini / perplexity / deepseek readers return the last reply only** (`partial: true`), so each of their versions holds one reply.
- **userscript-claude's reader is unverified.** Its selectors (`human-turn-content` / `assistant-turn-content` / `.font-claude-message`) were not checked against today's claude.ai.
- **No agent reads its memory back automatically yet.** The routes exist. Wiring them into co-pilot's tools, or into the repo agent's persona (the "introspect tool" in the 09-25 handoff), is the next step.
- **`userscript-memory.js` is unchanged, and it has three defects:**
  - Its chatgpt `chatId()` matches `/chat/` (ChatGPT uses `/c/`), so every ChatGPT turn files under `chatgpt:home`.
  - Its claude selectors are `human-message` / `assistant-message`.
  - It posts with page `fetch` rather than `GM_xmlhttpRequest`.
- **Not stored in the downloads *list*.** Transcripts appear under Library → Responses, not as rows in the Ctrl+J Downloads list. That list is capped at 500 entries and has no per-chat update, so every version would flood it.
