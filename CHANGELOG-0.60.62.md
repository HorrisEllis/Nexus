# 0.60.62 - 2026-10-15

James: "should not rely on raid." (the red line in Run macro: "RAID denied dispatch: proof required, none supplied for 'chat'") · "also need that macro or automation template for the chatgpt listener/scraper"

## What I found
- Run macro sent every step out to Guardian (`/command`) and back into Clear Glass, with no `source`. RAID read that as an anonymous caller (`_default`, proof required) and denied it. The same route made macros depend on Guardian being up, to drive a browser that Clear Glass already owns.
- The coder's reading of "should not rely on raid": a macro the person runs in Clear Glass should not go through RAID at all. Agents calling `browser_action` keep Guardian + RAID; that is the system deciding for itself (AXIOMS 5.2/9.1), not James clicking Run. To confirm.

## What changed
- `macro.run` takes an optional `runStep`; `macros:run` in `clear-glass/src/ipc/bridge.js` supplies the driver in process (`BA.driverCall` maps a step to the same payload Guardian built). A non-driver step (dom_query, url_listen) still takes the Guardian path and fails loud if it cannot.
- Template **ChatGPT chats: read new ones to a file** (Automation): chat list from the sidebar, each chat not seen before opened, scrolled to the top, messages (role, id, text) saved as one JSON line per chat in `chatgpt-chats.jsonl`.

## Proof and honest limits
- `test-macro` RS-01..03 (no browser_action call when runStep is given; a failing step stops with its error; driverCall mapping); `test-chatgpt-scrape-template` CGS-01..04. Template, automation and scroll tests still pass.
- NOT verified in real Clear Glass: the Run dialog with a real tab, and ChatGPT's current selectors (`a[href^="/c/"]`, `[data-message-author-role]`). A chat already read is skipped even if it has new messages. Real drive-test pending.
