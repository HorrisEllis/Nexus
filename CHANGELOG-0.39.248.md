# NEXUS 0.39.248 — the boot vitals check passes

**Date:** 2026-09-25 · guardian dispatcher (no API change)

The boot "VITALS CHECK FAILED — 2 of 9" had two items: "delivered to zero clients" and "provider toggle". 0.39.247's handoff suspected its own dispatcher changes. **Neither came from them.** Both fail identically on 0.39.236.

## 1. `dispatcher-stale-socket` ("delivered to zero clients")
- **What the test found:** its checks passed 2/2. DSS-001 *is* the "never falsely marked delivered" check, and it held.
- **Why it still showed as FAIL:** the process never exited. `_armCompletionWatch` in `guardian/lib/dispatcher.js` arms a per-job watchdog timer, and DSS-002 delivers a job, so the timer kept the process alive until it expired. The vitals runner timed the test out and reported FAIL.
- **Fix:** the timer is `unref()`'d.
  - Inside guardian it still fires exactly as before, because guardian's HTTP server keeps that process up.
  - It just no longer holds a process open by itself.
  - The test now exits in under a second.
- **Watchdog suites green:** mesh-client 14, job-correlation 120, one-tab e2e 8.

## 2. `copilot-provider-toggle` T-018 ("provider toggle")
- **Why it failed:** it read a fixed 900-character slice of `copilot/server.js`, and the block's comments had grown past that, so it failed on correct code.
- **Fix:** it now reads to the block's own end, and also asserts the direct path never falls through to `lifeline.route()`. 20/20.

## Result
`tests/verify-ncp-agents.js`: **9/9, exit 0** (was 7/9).

## Housekeeping
- **0.39.241–0.39.247 were never committed** (git ended at 0.39.240). They're now one baseline commit, "v0.39.247 as delivered", with runtime `data/` excluded, so this release's changes can be told apart from them.
- **Version drift from 245–247, all synced here.** Each of those releases bumped one place and left the rest:
  - **System:** `lib/version.js` and `package-lock.json` read 0.39.244; `package.json` and the changelogs read 0.39.247. Now 0.39.248 everywhere.
  - **Idearium:** `package.json` read 4.5.0 (0.39.246); `index.js`, its spec and `lib/version.js` read 4.3.1. Now 4.5.0 everywhere.
  - **Guardian:** `lib/version.js` and the registry read 3.10.0 (0.39.247); its spec read 3.9.5. Now 3.10.0 everywhere.
  - **A brittle check:** version-sync's idearium check pinned the exact wording of an old spec comment. It now requires what it names: the version plus a stated reason (release, PATCH or MINOR).
  - Result: version-sync 30/30 and record discipline 9/9, where both failed on 0.39.247 as delivered.

## Not done — waiting on you
**ChatGPT reply detection.** The job reached its one tab and was submitted, and ChatGPT opened `c/WEB:…`, but the userscript saw `reply 0ch · anchor: no reply node yet`. The reply selectors in `guardian/userscript-chatgpt.js` no longer match the live page, and it has to be mapped from that page, not guessed. In the ChatGPT tab, after it has answered something, open DevTools and run:

```js
[...document.querySelectorAll('[data-message-author-role]')].slice(-3).map(e=>({role:e.dataset.messageAuthorRole,id:e.dataset.messageId,len:e.innerText.length,cls:e.className.slice(0,80)}))
```

If that returns `[]`, run `document.querySelector('main').innerHTML.slice(-4000)` instead.
