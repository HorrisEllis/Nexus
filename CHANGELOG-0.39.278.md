# NEXUS 0.39.278: tools as layers, a co-pilot pane that remembers, every chat streamed live into the download manager

**Date:** 2026-09-29 · base: 0.39.277 · MINOR: new routes (/cli/downloads/ledger, /cli/downloads/ledgers) and IPC
channels (copilot:history, copilot:newConversation)

James: *"can you move and wire these in correctly? you ran out of tokens. working on getting copilot and clearglass
solid. maybe use the download manager in clearglass for the chat ledgers. also said guardian is polling, but it
shouldn't be, live streams the dom mutation live to the download manager, that way we don't lose progress. including
you expanding elements for your thoughts. exposing the tools to the agents is where i hit a wall, but also need to
make them aware that the conversation will capture the code written automatically."*

The previous turn left three files (tool-layers.js, chat-store.js and their test) and none of the edits that connect
them. They are placed and wired here, and the rest of the request is built on top.

## Tools as layers

- lib/agent-tools/tools/nexus/tool-layers.js: nexus.tools.tool (layer 1, the categories: id, title, count, a few
  names) and nexus.tools_expand.tool (layer 2, one category's tools grouped by owning system, each with its summary,
  guide note and typed parameters). Layer 3 is calling a tool by name, as before. Both read the live registry, and a
  tool the agent may not call is not shown (the tool-config gate, and the run's allowedTools).
- lib/agent-tools/tool-catalog.js: a Code (repo) category, first: idearium.code_*, idearium.repo_chunks and the five
  loom harness tools, apart from the generic Files tools. New categories(), expand(), systemOf(). 126 tools, 13
  categories, none in Other.
- Every repo agent gets them: in the harness first message (listedTools), always in scope (ALWAYS_IN_SCOPE), and in a
  newly forged repo hat (REPO_TOOL_SCOPE). Guide notes added (tool-guide 1.3.0).
- **Agents are told the conversation captures their code.** The harness first message ends with CAPTURE_NOTE
  (lib/repo-agent.js): the chat is captured as it is written (replies, code, thinking), and a fenced block with its
  path goes into the repo (the .inject protocol, which the composed prompt already states), so code is never repeated
  just to save it. Layer 1 and the Code category carry the longer form of the note.
- The harness first message stays under 3,000 characters (RH-006; 0.39.277 was 2,873). Its "More tools" line used to
  list the twelve category titles; it now names the layer tools instead (nexus.tools.tool lists the categories
  itself), and the two layer tools get no separate guide lines. RH-006's pattern is updated to match.

## The co-pilot pane remembers

- clear-glass/src/copilot/chat-store.js: the pane's conversation in Clear Glass's own JAA store (cg_copilot_chat,
  cg_copilot_conv), one current conversation per window, at most 400 turns each. Conversation ids get a random tail
  and turn timestamps are strictly increasing, so /new right after a message and turns stored in the same
  millisecond keep their identity and order.
- src/copilot/bridge.js: the recent turns go with every call, whichever backend answers (copilotHistoryTurns 10,
  copilotHistoryChars 4,000, oldest dropped first and the prompt says so). They are read before the new message is
  stored, so a message is never repeated inside its own history. "Nothing answered" is not stored as the assistant's
  turn. copilotRemember off keeps nothing. Every turn is mirrored into the chat ledger as provider copilot.
- Layered tool surface by default (copilotToolSurface 'layered'): Clear Glass's own actions by name plus the two
  layer tools, and the orchestrator is no longer fetched on every turn. 'full' restores the whole capability prompt.
- Renderer: replies are escaped before they become markup (formatReply). A raw reply in innerHTML became a stored
  injection once replies are kept and replayed. The pane restores its conversation on open; /new starts another and
  keeps the old one.

## Every chat, streamed live into the download manager (no polling)

- clear-glass/src/downloads/chat-ledger.js: one append-only ledger per chat (ledgers/<chatKey>.jsonl under the
  downloads index root, the clearglass-downloads-index COS compartment). Each delta is one line, per turn: whole text
  or appended text, and thinking the same way. A torn last line is skipped on replay. An append at an offset the
  ledger does not hold is refused with the lengths it holds, and the page resends the turn whole. readChat() lists the
  code blocks, with the path on the fence.
- Routes (clear-glass/src/ipc/bridge.js): POST /cli/downloads/ledger, GET /cli/downloads/ledgers,
  GET /cli/downloads/ledgers/:chatKey. Each chat is one downloads-list entry (kind chat-ledger), in progress while
  generating.
- guardian/userscript-chat-stream.js: a shared prelude (loaded by providers/host.js next to nexus-wake). The page's
  MutationObserver coalesces a burst (150ms), reads the chat with the provider's reader and sends only what changed
  since Clear Glass acknowledged. It is not marked sent until Clear Glass answers, retries with backoff, and flushes
  on pagehide. Collapsed thinking toggles ("Thought process", "Thought for …") are opened once each, and the Claude and
  ChatGPT readers keep their text apart from the reply. The prelude uses no interval.
- All five provider scripts: the 5s re-attach interval is a MutationObserver on the page body; the job stream
  (GUARDIAN_CHUNK) reads on the transcript's own mutations instead of a 500ms interval. The settled versioned
  transcript and job completion from it are unchanged.

## Fixed in passing

- tests/probe/live-stream-chromium.js and tests/probe/transcript-push-chromium.js have failed since 0.39.268:
  _nexusGetFullChat calls _replyText, which the probes did not extract. Both now extract it and pass on Clear Glass's
  engine and on Playwright's Chromium (8/8 and 10/10). The live-stream probe now wires the transcript's
  MutationObserver to _txStreamKick, as the userscript does.
- guardian/userscripts.yaml said 10.8.0 / 10.7.0 while the scripts said 10.11.1 / 10.8.2. It is synced to the
  scripts' own @version.

## Proof

- test-tool-layers-and-pane-memory 14/14 (the previous turn's file, unchanged except that it points the ledger at a
  temporary root).
- test-chat-ledger-stream 16/16 (new): ledger append, replay, resync, torn line, thinking, code blocks; the stream core
  against the real ledger (Clear Glass down, a lost ack, thinking, generating, a state-only delta); no provider script
  polls the chat; the prelude is loaded; agents get the capture note; the pane mirrors into the ledger.
- tests/probe/chat-stream-chromium.js 7/7 on Clear Glass's own engine (run by CS-07): progress is in the ledger while
  the reply is still streaming, 6 coalesced posts for 12 changes, the thinking toggle inside the turn opened and its
  text kept apart, the composer's "Thinking" button never clicked, and generating → false recorded.
- Updated for the Code category: test-code-tools CT-401 (group 'code') and CT-402 (listedTools includes the layers).
- Updated for the stream: test-live-stream-and-gates GS-11 (150 ms, _txStreamKick, no setInterval; userscript
  versions) and test-chat-transcripts TX-18 (versions bumped together).
- Regression: 77 existing test files that touch the changed code, run on 0.39.277 and on this tree. None got worse.
  Four that failed on 0.39.277 now pass: test-chat-transcripts 31/31, test-live-stream-and-gates 13/13, and both
  probes. The other 11 failing files fail identically on both trees (among them test-nexus-wake 31/3,
  test-one-tab-e2e 5/3, test-composed-prompt 19/1, test-guardian-agent-registry 10/1, clear-glass-accounts 11/1).
- Loom: node loom/bootstrap.js from an empty registry declares the chat-ledger map with no failures (3 components,
  6 hooks, 4 wires). Still-unresolved endpoints go from 112 to 114. The two new ones are tool-layers.js's require()s
  of lib/agent-tools/index.js and tool-guide.js, whose export hooks are already missing (the same gap already leaves
  loom/harness.js's edge to index.js unresolved). That gap predates this change and is not fixed here.

## Limits

- The thinking toggles are found by their label. That has not been checked against the live claude.ai or chatgpt.com
  DOM.
- Gemini, Perplexity and DeepSeek have no verified human-turn selector, so their ledger holds the newest reply as
  turn 0. Every version is still a line in the file.
- Tampermonkey installs have no prelude, so they keep the settled transcript only.
- Sovereignty: the ledger is Clear Glass's and is written only by Clear Glass (over its route). The page posts
  straight to it and guardian's server is not in the path.
- The job stream in the provider scripts still reads the whole chat per burst (as the 500 ms poll did), but only when
  the page changed.

## Files

- New: lib/agent-tools/tools/nexus/tool-layers.js, clear-glass/src/copilot/chat-store.js,
  clear-glass/src/downloads/chat-ledger.js, guardian/userscript-chat-stream.js, loom/maps/chat-ledger-map.js,
  tests/modules/test-tool-layers-and-pane-memory.test.js, tests/modules/test-chat-ledger-stream.test.js.
- Changed: lib/agent-tools/{index,tool-catalog,tool-guide}.js, lib/repo-agent.js, lib/repo-hat.js,
  clear-glass/src/copilot/{bridge,tools}.js, clear-glass/src/api/settings.js, clear-glass/src/ipc/bridge.js,
  clear-glass/src/preload/index.js, clear-glass/src/providers/host.js, clear-glass/renderer/{browser,copilot-cli}.js,
  clear-glass/renderer/settings/sections/copilot.js (a Conversation pane: remember, turns, budget, tool list),
  guardian/userscript-{claude,chatgpt,gemini,perplexity,deepseek}.js, guardian/userscripts.yaml, loom/bootstrap.js,
  tests/modules/{test-code-tools,test-registry-harness,test-live-stream-and-gates,test-chat-transcripts}.test.js,
  tests/probe/{live-stream,transcript-push}-chromium.js, tests/modules/run-all.js,
  docs/atlases/{clear-glass,guardian}-atlas.md, clear-glass/spec/clear-glass.spec, guardian/spec/guardian.spec,
  lib/version.js, package.json, clear-glass/package.json (3.18.1 → 3.19.0; lib/version.js said 3.17.0).
