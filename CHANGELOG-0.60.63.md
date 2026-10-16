# 0.60.63 - 2026-10-16

James: "chatgpt the thing we talked about earlier, that indexes novel one by one" · "continu"

## What I read
The chat crawler of the personal-chat-import map: "log each chat, by url, one by one until it's done ... only logging novel data, but each one interconnected." To confirm; if you meant another earlier chat, tell me which.

## What changed
- `clear-glass/src/chats/crawler.js` runs `lib/chat-crawl-plan.js` (the plan and 39 settings were 0.60.55). It reads the list, visits one chat at a time at the plan's pace, reports, and saves state after each visit, so a restart resumes.
- Stops: a login wall, captcha/challenge or rate limit on a list read or a visit pauses the account with the reason; nothing is dropped, failures are listed.
- Backfill off: existing chats are skipped with the reason "before capture began", then only new chats are read.
- Plan: `keepSkipped` so a crawler skip is not revived like a removed exclusion.

## Proof and honest limits
- `test-chat-crawler` CR-01..09, CR-03b (fake ports); `test-chat-crawl-plan` still 18/18.
- NOT built: the Clear Glass ports (background tab on the account's session, the reading workflow per chat, the ledger's `settled`). Nothing crawls yet; the first real check is one account, ten chats.
