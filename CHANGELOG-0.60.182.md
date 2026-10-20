# 0.60.182 — 2026-10-21 — Co-pilot decides what to look at

James, 2026-10-21: "can you have the dom, cookies, and picks buttons migrated into copilot so he does it automatically when he needs it."

His call. The coder's part: what the chips really did, and the rules.

## Found
- The **Cookies** chip did nothing. `ctxCookies` was toggled and never read.
- The **DOM** chip defaulted to on, so the whole page went with every message, even "what is 2 + 2".
- **Picks** went only when that chip was on.

## Built (BS12)
- **`src/copilot/context-need.js`**: `need()` decides for each message, by rules and before any model is asked:
  - **the page**, when the message is about it: this page/site/form, here, read, summarise, click, fill, find, a field or button, prices
    or plans;
  - **your picks**, when there are some and the message points at them (this, that, it, picked, selected), or you picked moments ago;
  - **a sign-in cookie summary**, when the message is about signing in: logged in/out, session, account, cookie, expired. It gives
    names, domain and hours to expiry only, read from the page's own session; never a value.
- **The bridge** (`copilot/bridge.js` send) applies it. Co-pilot's tools (`readPage`, `pageMap`, `dom.query`, `cookies.health`) still let it
  fetch more on its own.
- **The pane:** the chips are gone (their ids are kept), and the composer is just the text box, the mic and Send. Under a reply, one faint
  line says what it looked at ("looked at: the page · your picks"). `/ctx dom|picks|cookies on` still forces one.

## Measured
- `test-browser-shell` 13/13. BST-12 checks:
  - "summarise this page" → the page; "what is 2 + 2?" → nothing; "fill this in" with a pick → page and pick;
  - old picks not pointed at → nothing; "am I logged in here?" → page and cookies;
  - a forced `/ctx` still works; no cookie value is ever in the summary.
- The co-pilot suites are unchanged: agent-surface 16/16, copilot-verbs 9/9, copilot-no-api 6/6, claude-code 5/5, nexus-ask 6/6,
  pane-memory 14/14, page-session 6/6, field 13/13 and more.
