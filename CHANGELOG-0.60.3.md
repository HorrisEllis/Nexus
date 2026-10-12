# 0.60.3 — 2026-10-12

James asked:
- Fix fiverr's "It needs a human touch · PRESS & HOLD" (PerimeterX) in a plain Clear Glass tab.
- "i was talking to chatgpt in the code tab and it switched to gemini, can we, if the url of the chat is different, … inject the previous response … i want persistence across chats, and providers."
- "make sure you are following the axioms in the docs folder and raids constituitoin. woulrouting throug raid be better? more stable?"

## A human tab reads as plain Chrome (`clear-glass/src/contexts/session-headers.js`, `src/main/index.js`)

**Response headers.** Every response on every site used to have its CSP and X-Frame-Options removed. Now headers are rewritten only where Nexus needs it:
- frames (`subFrame`)
- the provider pages (registry hosts)
- localhost

Everything else, including a top-level page a person browses, passes through untouched. The PNA request header is added to localhost requests only (`needsRewrite()` is pure and exported).

**User agent.** The default session's UA no longer carries the app's name token ("Clear Glass/x.y"). No Chrome sends one.

**GPU.** `CG_GPU=on` turns hardware acceleration back on. With it off, WebGL reports "Google SwiftShader", which bot detectors read as headless or as a VM. It stays off by default because this machine's GPU crashes led to turning it off.

**What is not changed:**
- The press-and-hold challenge is for a person to complete. Nothing automates it.
- The remote-debugging port and `window.__cg` stay; other Nexus features use them.

## RAID decides with real health in every process (`cortex/core/raid/index.js`)

**The problem.** Only cortex's process ever polled agent health. RAID decisions made anywhere else saw every agent offline and always answered `claude` (LAW_III). That affected:
- guardian's `/command auto`, which also passed no health at all
- the officiator: "no real agent response (forAgent=claude)" every 20 s
- idearium's chunk-dispatch

**The fix.**
- `ready()` polls once and keeps polling (an unref'd timer) in whichever process asks.
- The officiator, chunk-dispatch and guardian call it before deciding. Guardian now passes `_health` and `_weights`.
- A decision taken on unread health says so (`healthUnread`).

## The conversation carries across providers (`lib/repo-agent.js`, `lib/repo-prompt-blocks.js` 1.7.0)

- `repo_agent_log` now records which provider answered.
- A new editable prompt block, **conversation**, is filled when the agent answering now is not the one that answered last: another provider, the door moved on, or a fallback.
- It carries the last turns, oldest first, within a budget.
- If the same agent answers again, nothing is sent. Build chunks have their own session and are not given the chat.

## Tests

- `test-repo-agent-provider`: guardian's `field-map` prelude (0.60.2) is not an agent. The test's list had not been updated.
