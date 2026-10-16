# 0.60.64 - 2026-10-16

James: "build it."

## What I read
"It" = the Clear Glass side of the chat crawler (0.60.63 built the loop and left the page work). To confirm.

## What changed
- `clear-glass/src/chats/ports.js`: the crawler's page work is two automation workflows per account (read the chat list; read one chat), run by the real engine on the account's own session. Navigate, wait, scroll, read; nothing is typed, sent or clicked.
- Each chat is filed into the existing chat ledger, only the turns it does not already hold. A half-loaded chat is never filed as ok (the chat scroll fails the visit). A login wall or captcha stops the account with the reason.
- `clear-glass/src/chats/service.js`, `/cli/chats/crawl/*`, and the `chat-crawl` command: `chat-crawl start chatgpt:<id>`, `status`, `stop`. Refused while the account's switch is off; start and stop are a person's act.

## Proof and honest limits
- `test-chat-ports` PT-01..07 run the real automation engine against a fake chat site in jsdom: backfill to done, restart, novel-only, login and challenge stops, the service. `test-chat-crawler` 10/10, `test-chat-crawl-plan` 18/18, `test-net-routes` 24/24.
- `test-cli-route-commands` CL-07 fails the same way without my change (it needs Guardian running).
- NOT verified in real Clear Glass: ChatGPT's selectors, the account-to-session mapping, the sidebar being complete after scrolling. First check: one account, ten chats.
