# 0.60.2 — 2026-10-12

James asked for the following:
- "can you merge with the main branch? can you merge all of the if theyre additive?"
- "when popups happen, can you have it be the same ui as the cos ui? like the screenshot but for agent providers?"
- "the chatgpt popup said there was a problem with cookies when i tried to login with google. can we build the actual cookie vault using jaa? that way we can have actual account routing, and hat specific accounts. intent routing? … needs to be in guardian maybe? or using raid? like chatgpt doesn't need a login currently."
- "the popup for when an account needs to login, using the element picker to set the input, have it use the actual element picker or guardian picker. can you also have the picker mapped to the scripts injected for the interaction field or the x y z coords for the elements?"

## Merge

- `main` (with PR #52, 0.60.0) is merged into this branch. The merge was clean.
- Every other `claude/*` branch was already contained in this one, so nothing else needed merging:
  - new-session
  - charming-lamport
  - nexus-idearium-overview
  - vibrant-edison

## Account routing — Guardian decides, Clear Glass switches, the JAA vault keeps the cookies

**What already existed:**
- Clear Glass is the account authority: NexusOptions accounts, asked through `guardian/lib/cg-account-authority.js`.
- Clear Glass has a JAA cookie vault (`src/cookies/vault.js`, encrypted, `account_cookies`).

**What was missing** was the choice. Every NCP job ran as whoever the provider tab happened to be signed in as.

**`guardian/lib/account-routing.js` (new, JAA store, tables `account_rules` and `account_route_log`):**
- A rule says: for this provider, a job with this **hat** / **intent** (its command) / **repo** runs as this account.
- `route(job)` picks the account:
  - The most specific rule wins: the more fields it names, the more specific. Ties go to priority, then to the newest rule.
  - A job that names its own account keeps it, and the log says which account the rule would have chosen.
  - When no rule applies and the job names no account, nothing changes.
- Every choice is logged with why. Only the account and the reason are logged: no cookie and no secret.
- Routes:
  - `GET` and `POST /api/accounts/rules`. A POST is refused with `unknown_account` when Clear Glass does not know the account.
  - `DELETE /api/accounts/rules/:id`
  - `POST /api/accounts/route`: a dry run, not logged.
  - `GET /api/accounts/route-log`

**`guardian/lib/dispatcher.js`:**
- Before a job is typed, the routed account is passed to Clear Glass.
- If the switch fails, the job fails with the reason (`gate: 'account'`). A job never runs as an identity it was not routed to.

**`clear-glass/src/providers/account-switch.js` (new):**
- There is one tab per provider, and jobs run there one at a time, so an account switch happens between jobs.
- `use(provider, account)` does the switch:
  1. Checks the account: it must be linked to the provider (the authority) and must have a saved sign-in. If either check fails, the tab is not touched.
  2. Saves the tab's current cookies under the account it was signed in as. If that account is unknown, it saves them as a vault snapshot, so nothing is lost.
  3. Replaces the session's cookies with the routed account's cookies and reloads the provider's tabs.
- `capture(provider, account)` saves a sign-in.
- Routes: `GET` and `POST /providers/:id/account`, and `POST /providers/:id/account/capture`.

**Vault fixes:**
- **Restore removed nothing.** It called `cookies.remove(url, '')`, and a cookie name is required, so nothing was removed.
- **Restore set cookies Chromium refuses.**
  - It set a domain on `__Host-` and host-only cookies.
  - It dropped `sameSite`.
  - It turned session cookies into persistent ones.
  - Now `cookieSetArgs` handles each case.
- **Only one domain came back.** An account saved per domain restored only the newest domain's row. Now every site comes back.
- **New:** `capture()` saves one encrypted row per site, and `accounts()` lists saved sign-ins without their values.

**Where it lives:**
- Guardian decides, because it has the job, its hat and its intent.
- Clear Glass holds the identity and the cookies.
- RAID is untouched: it still chooses the provider, and this chooses the account within that provider.

## Google's CookieMismatch on ChatGPT's "Continue with Google"

Two causes, both on the provider session (`persist:ncp-<id>`):
1. **Every response was rewritten**, including Google's and OpenAI's sign-in pages. That included responses carrying `Set-Cookie`, and Google's sign-in sets a test cookie and reads it back on the next page. Now only the provider's own pages are touched (CSP is removed so the userscript can reach 127.0.0.1). Every other response passes through unchanged (`callback({})`).
2. **The session's user agent said `Electron/…`** and the app name. Only the default session had been scrubbed. Google refuses embedded browsers it can identify.

## ChatGPT works signed out

- `loginOptional` is a provider fact, recorded in:
  - `schema.provider`
  - `lib/agent-facts-hash.js`
  - chatgpt's node
- A ChatGPT tab that lands on a sign-in page is sent back to its chat. You are asked to sign in only if it lands on a sign-in page again.
- The panel also offers **Use without signing in**.

## The attention popup is the COMPARTMENT OS window

- The title bar matches `idearium/ui/js/window-chrome.js`:
  - the ▣ glyph, then **COMPARTMENT · AGENT**, then the title
  - — collapses the window to its title bar
  - ▢ widens it; double-clicking the title bar does the same
  - ✕ hides the tab
- The toolbar matches `desktop.html`:
  - a state pill: *sign in* or *map the chat* (amber), *not connecting* (red)
  - the account the tab runs as
  - which repo it is for
  - then the buttons: I've signed in · Use without signing in · Pick input / send / reply · Reload
- If accounts are linked, you can choose which account this sign-in belongs to and click **Save sign-in to vault**.

## The picker is Clear Glass's own check, and every pick has x, y, z

**The pick:**
- The pick records the node's xpath.
- It also records the anchor, which says where the element sits:
  - `x, y, w, h`
  - `rx, ry`: its centre as a fraction of the viewport
  - `z`: its layer in the stack of elements at that point
  - `zIndex`, `depth`, `tag`, `role`
- The selector is then made and checked by `clear-glass/renderer/selector-check.js`. That is the check the Clear Glass picker's assign flow runs, and it checks the selector the way the userscript reads it.
- **When the check finds no unique selector** for an input or send button (the claude send selector matched 27 elements):
  - The picker's own selector is saved with its anchor, marked `uniqueBy: 'anchor'`.
  - A reply is never saved that way, because the userscript reads the last match.

**Guardian:**
- The selector map carries the anchors in `GUARDIAN_SELECTORS`.
- Picking the same selector again at a different place now records the new anchor. Before, it was "unchanged" and the new place was lost.

**`guardian/userscript-field-map.js` (new shared prelude, `window.NexusFields`):**
- Every provider script uses it: claude, chatgpt, gemini, deepseek and perplexity.
- `injectText` calls `type()` first, and `submit` calls `press()` first.
- Only a verified pick is used.
- When a selector matches several elements, the one nearest the anchor wins.
- When a selector matches nothing, the element at the anchor's point is used, but only if it is the same kind (an editable box for input, a button for send).
- Otherwise the script's own lookup runs, as before.

## Tests

- `test-accounts-picker-cos` 40/40.
- `test-plan-code-run-attention` 40/40 (unchanged).
- The sandbox now redirects `GUARDIAN_ACCOUNTS_DIR`.
