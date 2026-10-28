# NEXUS 0.39.241 — late replies reach the Agent tab; the Library is a Clear Glass window (Ctrl+J)

**Date:** 2026-09-25 · clear-glass 3.12.1 → 3.13.0 · idearium 4.2.1 → 4.3.0 · guardian 3.9.2 → 3.9.3

James:
- *"idearium Agent tab picking up a late reply from the Responses index, so it stops showing 'thinking…' when a reply arrives after copilot's wait has ended."* (0.39.239's open item)
- *"the download manager in clearglass."*
- *"need control j to popout a window like the screenshot. thats what it was supposed to look like, the settings ui but with the library. at least make the library style consistent with the rest of clearglass."*

## 1. Late replies reach the Agent tab

**Before.**
- When copilot stopped waiting on guardian, the tab kept the error (or sat on "thinking…" for the whole 320 s wait).
- The provider tab kept typing. Guardian finished the job and filed the reply into Clear Glass's Responses index under `repo-<uuid>`.
- Nothing read the reply back. Its `@learn` lines were never recorded and its code was never injected.

**Now.**
- **`lib/repo-agent.js`**
  - `_finish()` is the one path a reply goes through: `@learn`, `.inject`, exchange log. `dispatch()` and the new `adoptLate()` both use it.
  - `findLate({ repo, since, message })` is read-only. It returns the newest reply filed under this compartment's agent id at or after `since`, whose recorded prompt contains the message, and that hasn't been adopted yet. It skips replies that are only a tool-loop turn (a bare `` ```tool `` block).
  - `adoptLate(...)` runs that reply through `_finish` once. The exchange log stores its `responseId`, and a second call returns the logged exchange without doing the work again. It refuses a reply that belongs to another compartment, or that was captured before the exchange began.
  - `dispatch()` returns `awaitLate: { agentId, since }` in two cases: a guardian dispatch fails, or idearium's own wait on copilot times out. It does not return it when copilot refused the connection: no job was ever created, so there is nothing to wait for.
  - `agentIdFor(uuid)` is now the single source of the `repo-<uuid>` id.
- **Idearium routes:**
  - `GET /api/repos/:uuid/agent/late` finds a late reply.
  - `POST /api/repos/:uuid/agent/late` adopts it.
  - Both are registered in `idearium/registry-components.js`.
- **The Agent tab** (`idearium/ui/js/app.js`):
  - A read-only poll runs every 5 s alongside the dispatch.
  - If a reply lands while copilot is still waiting, it replaces "thinking…" straight away. The dispatch then settles it.
  - If copilot gives up, the line reads "copilot stopped waiting — watching the Responses index". Polling continues for up to 15 min. The first matching reply is adopted, and the line is marked "late — from the Responses index".
  - A reply is never adopted while the dispatch is still in flight, so it is never processed twice.

## 2. The Library is a Clear Glass window, styled as Settings

**Before.**
- `ui/library/` was a page on the orchestrator's :9000 with its own orange terminal styling.
- It opened inside an agent browser window, with the URL bar (the first screenshot).
- Ctrl+J opened a small dropdown in the browser window instead, and only when focus was on the toolbar, never on the page.

**Now.**
- **`clear-glass/renderer/library.html` loads Settings' own `settings/settings.css` and `settings/core.js`.** It is the Settings UI: same frame, rail, panes, rows, buttons, modals and toasts, from the same code.
  - `core.js` `boot(opts)` now takes `groups`, `defaultId`, `cssBase`, `close` and `search`.
  - Settings calls it with no options, so Settings is unchanged.
  - For the Library, the rail search box filters the list on screen, as in Firefox's Library.
- **Areas.** One JS and one CSS file per area in `renderer/library/sections/`, each CSS scoped to its area:
  - **Downloads** (first; Ctrl+J lands here):
    - Rows as in the Firefox Library screenshot: a file-type tile, the name, "99.3 MB — claude.ai — 11:56 AM", and a 📂 button that shows the file in its folder.
    - Click the name to open the file. There is a progress bar while downloading, and Failed/Canceled are shown in words.
    - The agent tab each download came from is shown.
    - The list updates live while the window is open.
    - It also carries the **Download Listeners** form, moved from the retired dropdown.
  - **Responses**, **Bookmarks**, **History** (grouped by day), **Accounts**, **Passwords**, **Autofill**, **Macros**: the old tabs' behaviour, on the Settings components.
  - Opening a bookmark or history entry navigates its agent window. The old page's `target=_blank` would have opened a bare Electron popup.
- **`openLibraryWindow(area)`** (`src/main/index.js`):
  - Frameless and single-instance, with the preload.
  - Loads `library.html#<area>`.
  - An open Library is focused and switched to the requested area.
- **Ctrl+J from anywhere.**
  - An `app.on('web-contents-created')` `before-input-event` hook covers the browser chrome and the page inside it: a page's keystrokes never reach `browser.js`.
  - Ctrl+Shift+J is still DevTools.
- **Doors into the Library:**
  - ☰ → **Downloads Ctrl+J** opens it at Downloads.
  - ☰ → **📚 Library** opens it.
  - The tray's **⬡ Library** opens it.
- **New IPC:**
  - `window:openLibrary`
  - `window:closeLibrary`
  - `downloads:openFile`: completed downloads only, through `shell.openPath`.
  - The registry grows from 99 to 102, and `interaction-contract.json` is regenerated.
- **Retired:**
  - `ui/library/`
  - `browser.js`'s Downloads dropdown (`_renderDownloadsPanel`, `#downloads-panel`)

## Fixed on the way

- **Every delete and edit in the Library silently failed. This includes the old page.**
  - The bridge's CORS preflight named no methods. Browsers then allow only GET, HEAD and POST cross-origin, so every DELETE, PUT and PATCH was refused before it reached :7702.
  - Affected actions: remove a download; delete a bookmark, history entry, account, password or autofill profile; edit a profile.
  - `Access-Control-Allow-Methods` now lists them. Found by the new probe.
- **Log flood when better-sqlite3 is missing** (your log from 19:12:20 on).
  - `artifact-chat-index.js` tried the module on every read and printed two stack traces per call. `/cli/downloads/responses` reads the index twice, so each refresh printed four.
  - The module is now tried once per process, the reason is kept and said once, and `responses/` is read directly.
  - Guardian's writer no longer warns "not indexed" on every reply for the same reason.
- **A test wrote into the real tree.**
  - `test-code-artifact.js` left `data/guardian/code-artifacts/w1…w4` behind.
  - `guardian/lib/code-artifact.js` now honours the test sandbox and `NEXUS_DATA_ROOT`, as every other store has since 0.39.236.

## Proof

- **`test-repo-agent-late` 15/15** (new).
  - The only fake is a stub copilot that stops waiting. Everything else is real: `dispatch()`, guardian's writer `recordAgentResponse` into the real Responses index, `findLate` and `adoptLate`.
  - It steps over old replies, other agents' replies, replies to other questions and tool-only turns.
  - Adoption is once, and another compartment's reply is refused.
  - Our own timeout awaits a late reply; a refused connection doesn't.
  - The Agent tab's watcher, extracted verbatim from `app.js` and run in a vm, settles the line in all three orders.
  - **Mutation checks:** each of the following was reverted in turn, and each reversion failed its own test:
    - the adopted-exclusion
    - the once-guard
    - `awaitLate`
    - the message match
- **`tests/probe/clearglass-library-window.js` 25/25**, in headless Chromium.
  - Setup: the real `library.html` against the real bridge on :7702, started in-process with only `electron` faked. Behind it are the real DownloadsStore, BookmarkStore, HistoryStore, AutofillStore and Responses index, seeded.
  - Accounts and macros come from two stand-ins, because their backends need a running Clear Glass.
  - `window.ClearGlass` is built from the real preload's namespaces.
  - What it checks: every area renders; search filters; the name opens the file; the folder button works; remove really removes; listeners add; Response View works; ✕ calls `closeLibrary`; `#history` opens History; no page or console errors.
  - Screenshots were taken of each area.
- **`tests/probe/clearglass-menu-library.py`**, on the real `browser.html` and `browser.js`:
  - The ☰ Library row gives `openLibrary()`.
  - The Downloads row gives `openLibrary('downloads')`.
  - No errors.
- **Suites updated to the move:**
  - `clear-glass-library-ui` 28 → 45 (rewritten; includes a jsdom run of the list-search mode)
  - `test-downloads-responses` 15
  - `test-cg-settings-ui-files` UF-05
  - `test-clear-glass-idle-vs-open` CGI-009 (3 show hooks)
- **Source pins moved by the refactor:**
  - `test-guardian-job-correlation` 120
  - `test-phasemap-diagnosis-facts` 10
  - `test-repo-agent-learn` 33
- **Regression:**
  - test-repo-agent 35
  - repo-agent-provider 41
  - repo-agent-node 44
  - code-artifact 46
  - screen-qa-ui 27
  - version-sync 30
  - record-discipline 9
  - test-test-sandbox 28
- **Full `tests/modules/run-all.js`, per suite against the untouched 0.39.240:**
  - The only differences are the four pins above (now fixed) and `queue.test.js`, which passes 51/51 alone and failed once under full-suite load.
  - These fail identically on 0.39.240:
    - `test-registration-shape` (missing `bridge/registry-components.js`, the same file your boot log names)
    - `test-cg-settings-ui-files` UF-01 (expects 14 sections, there are 16)
    - `test-cg-accounts-portal-settings` UI-05
    - `test-clear-glass-idle-vs-open` CGI-005

## Open

- **The full suite still writes into the real `data/`.** On 0.39.240 it left 84 files (ledger-store, guardian ledger/memory, cortex ledger); 77 here. The suites that do it don't go through `lib/test-sandbox.js`'s resolvers.
- **Accounts and Macros in the Library** were checked against stand-ins, not the running options store or macro tool.
- **A late reply adopted after a page reload isn't picked up.** The Agent tab's transcript lives in memory. The reply is still in the index, and `POST …/agent/late` can adopt it.
