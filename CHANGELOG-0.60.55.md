# 0.60.55 - 2026-10-15

James: "i dont [want] anything missed. then it only logs the chaturl once unless it has new data, maybe check the previous chat url once, but use it as an edge for a stopping point for catching up. look deeply at clearglass, the atlas, .spec, the code, look at all of it. make sure you add extensive settings for all of this, expand the settings the best you can."

## The plan (`lib/chat-crawl-plan.js`, 18 tests)
Pure logic for the background reader of his own chats; the caller supplies the chat list it saw and each visit's result.
- **Backfill** visits every chat once. It is done only when the list was loaded to its end, no chat is pending, and none has failed. A chat that fails every try stays in the audit with its reason; `audit().nothingMissed` is true only when nothing is outstanding.
- **Catch-up** looks at the list on a timer (no chat visited). A chat is visited only when it is new or its `updated` changed. The list is newest-first, so the first run of unchanged, logged chats is the stopping edge; that chat is re-checked once, and if it changed the walk goes on past it. A periodic full comparison catches a chat that changed without moving up.
- **Pace and stops:** one chat at a time, a random wait, an hourly and daily cap, quiet hours. A signed-out account, a captcha or challenge, three failures in a row, and a rate-limit message each stop it with the reason (the rate-limit cool-down doubles). It never retries in a loop. The state is plain data, so a restart continues where it stopped.

## The settings (`lib/chat-crawl-settings.js`, Settings -> Chat capture)
39 settings in 9 groups, in one table that drives the defaults, the limits and the Settings rows. Per account: its own switch and its own limits and exclusion lists. Everything starts off. Out-of-range values are clamped and the change is said. Not run through a model.

## Not built, said plainly
`clear-glass/src/chats/crawler.js`, the part that opens a background tab, scrolls and reads. Until it exists the switches are saved and do nothing; the Settings page says so at the top. Whether long chats load lazily, and how each provider reacts to automated visits, are unverified. Nothing here was seen in Electron.

Context read for this release: the Clear Glass atlas, `chat-ledger.js` (the DOM-mutation ledger that already exists and the crawler will feed), the window and settings code, and the person model.
