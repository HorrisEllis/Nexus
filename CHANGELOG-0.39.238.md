# NEXUS 0.39.238 — a reply watcher can no longer go silent

**Date:** 2026-09-25 · guardian 3.9.0 → 3.9.1 · userscripts chatgpt/gemini/deepseek/perplexity 10.3.0, claude/nexus-hey-claude 10.4.0

James, with the 2026-09-25 log and ChatGPT's reply on screen: *"this should be working. everything works the response getting to the end point. even the ids are good."*

## What the log showed
- 0.39.237 did its job: repo job `44d68e3d` waited for `repo-nexus-id-repo-933db1a8`'s own tab, one window opened, and the job was delivered to that tab, acked, and `submitted (button)`.
- Then nothing: no `reply-started`, no completion, no error.
- By 0.39.224's stage evidence, that means the watcher never saw reply text.
- The same "submit, then silence" appears in the 0.39.218 and 0.39.235 logs.

## Cause
- **Silent branch:** in every userscript's `checkStable()`, a `findResponseEl()` that found nothing rescheduled itself every 600 ms, forever. The no-reply deadline sat below that branch and never ran.
- **Fragile selector:** ChatGPT's `findResponseEl()` made that likely. It was one `querySelector` over `[data-is-streaming="true"], [data-message-author-role="assistant"]:last-child, .text-streaming`. That returns the first match in the document, and `:last-child` only matches a message that is the last child of its own wrapper.

## Fix
- **No silent watcher, in all six scripts** (chatgpt, claude, gemini, deepseek, perplexity, nexus-hey-claude):
  - With no reply element, one progress stage `no-reply-element` after 15 s.
  - A loud `GUARDIAN_ERROR` at the no-reply deadline that names selector drift.
- **ChatGPT reply selector:** the streaming element while it exists, otherwise the **last** `[data-message-author-role="assistant"]`. That's how the same file's chat reader already finds messages.
- **Userscript versions:** bumped, with the `@version` header and the `VERSION` constant aligned. They disagreed before, for example ChatGPT's header said 10.2.0 and its constant 10.1.0.

## What your next log will say
- `reply-started` then `job complete`: fixed.
- `no-reply-element`: ChatGPT's live page has no element the selector recognises. The DOM then has to be mapped from the live page (archaeology), not guessed here.

## Tests
- `test-guardian-job-correlation`: 120/120, up from 102.
  - 15 no-element cases across the five providers, on a 20× clock.
  - 3 cases on ChatGPT's real `findResponseEl`: last message, streaming element, empty page.
- **Mutation check:** against the 0.39.237 userscripts, all 16 new checks fail and the run hangs until killed. That's the silent loop itself.
- **Regression:**
  - replay-retired 3
  - dispatcher-agent-tab-trigger 10
  - provider-host-one-tab 7
  - version-sync 30
  - record-discipline 9
  - ncp-hostile-payload 5
  - chat-sync-agent-routing 8
  - userscripts-manifest exit 0

## Pre-existing, identical on 0.39.236 (not from 0.39.237)
- **The boot "VITALS CHECK FAILED" items:**
  - `dispatcher-stale-socket` passes 2/2 but never exits, so the vitals runner kills it.
  - `copilot-provider-toggle` T-018 fails.
  - `spec-engine-yaml-import` fails.
- `userscript-adapter-consistency` exits 1.

## Not done
- **Download manager.** `clear-glass/src/downloads/artifact-chat-index.js`, the "downloads manager as artifact + agent chat index" (`.response` files + `index.db`, 2026-09-17), has no caller and stores no agent or compartment id. A downloads list exists in Settings → Downloads (0.39.231), but there is no manager view that routes to a compartment. Next.
