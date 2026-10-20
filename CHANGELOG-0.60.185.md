# 0.60.185 — 2026-10-21 — One ☰ menu, Firefox's menus for the UI, the menu at the page's own point, bookmarks by the site's account

James, 2026-10-21, with five screenshots: "bookmarks are meant to be able to link to the accoubt being used for the relative site not the
providers. and remove the bookmarks from the menuconsolidate the menu, use playwright to test each ui feature in the menu. use the library for
the bookmarks, context menu for the clearglass ui like the last 2 images, but matching the them eand dynamic to the click  v. the right clikc
on dom is still not accuraate. still missing snowflake from tghe ocntext menu"

The asks are his. The coder's part: the readings marked below, the code.

## Readings (to confirm)
- **"use playwright to test":** the tests run in Clear Glass's own driver, which has the same API as Playwright. Your rule of 2026-10-05 is
  "No playwright. That's literally what clearglass was born from." (AXIOMS §4.1; CG-001b fails any file that loads Playwright). If you meant
  real Playwright this once, say so.
- **"the account being used for the relative site":** the accounts that are signed in to that site.

## Built
- **One ☰ menu (BS17).**
  - **One model:** it is built from a single list in `renderer/shell/menus.js`, with drawn icons in Firefox's groups:
    - New Tab, New Window, Open Page with Snowflake;
    - your account;
    - Bookmarks, History, Downloads, Library;
    - Plugins and Add-ons, Site Settings, Background Tabs, Import from Firefox;
    - Print, Find, Zoom;
    - your unpinned tools;
    - Customize Toolbar, Settings.
  - **Bookmarks:** the bookmarks list is out of the menu. "Bookmarks" opens the Library at its bookmarks.
  - **Tested row by row:** every row was clicked in Clear Glass and its effect checked. That found a real bug: "Plugins and Add-ons" opened
    its panel and the same click closed it again. Fixed: a row's action now runs after the click has finished.
- **Firefox's menus for Clear Glass's own UI (BS18).** In the window's theme, chosen by where you right-click:
  - **a tab:** New Tab, Reload, Duplicate, Bookmark Tab…, Move to Background, Close, Close Other Tabs, Reopen Closed Tab;
  - **the tab strip:** New Tab, Reopen Closed Tab;
  - **a bookmark:** Open, Open in New Tab, Open in New Agent Window, Edit Bookmark…, Copy Link, Delete, Open All, Manage Bookmarks;
  - **the bookmarks bar:** Open All Bookmarks, Add Bookmark…, Manage Bookmarks;
  - **the address bar:** Undo, Cut, Copy, Paste, Paste and Go, Select All;
  - **the toolbar:** Unpin;
  - **everywhere but the address bar:** Menu Bar ✓, Bookmarks Toolbar ▸ (Always Show / Only Show on New Tab / Never Show, kept), and
    Customize Toolbar….
  - **Not offered, said:** Add Folder, Add Separator, Select All Tabs and vertical tabs. The bookmark store has no folders, and the tabs
    share one page.
- **The right-click lands where you clicked (BS19).**
  - **Why it was still off:** 0.60.183 asked the operating system where the mouse was. On Windows, display scaling and the window frame can
    disagree about that.
  - **Now the page itself reports its click point.** The webview's preload sends the page's own click point, and the window adds the
    webview's position and the page zoom. Both sides are in CSS pixels, so no OS scaling enters.
  - The OS pointer is the fallback, for example in a frame the preload doesn't run in.
  - The menu records which point it used (`data-source`), so a future screenshot tells us.
- **Snowflake in the right-click menu (BS19).** A page right-click now offers "Open this page with Snowflake". Before, it was only on links.
- **Bookmarks by the site's account (BS20).**
  - **What it offers:** the bookmark dialog lists the accounts signed in to this site first ("signed in here", with which sign-in cookie).
    It reads each account's own session for this site's cookies, names only, never a value.
  - **Provider accounts:** they count only on their own site, so a Claude account is offered on claude.ai but not first on other sites. The
    rest are folded under "Other accounts".
- **Reinstall while Snowflake is running (SF9).**
  - **The cause:** your Network screenshot showed EPERM. On Windows, a folder whose tor.exe is running cannot be removed, and the install
    removed it first.
  - **The fix:** the in-use folder is now left alone and the new install goes beside it. The old one is cleared once it is free.

## Measured
- `test-browser-shell` 24/24 in Clear Glass:
  - BST-17: every ☰ row and every tool row clicked; Zoom + changes the readout; no page error.
  - BST-18: the tab, bookmark, bookmarks-bar, address-bar and toolbar menus; Duplicate adds a tab; Delete removes the bookmark; the
    submenu's Never hides the bar and is kept.
  - BST-19: the menu sits at the page's point, not the pointer or `params`; Snowflake's page row is there.
  - BST-20: the account signed in to news.com comes first; provider accounts are folded; no cookie value.
- `test-snowflake` 11/11 (SFW-12: an in-use folder is left; a free one is replaced; other errors still throw). `test-adblock` 13/13.
- Neighbouring suites:
  - the Library UI is 44/45; its Ctrl+J check failed before this change too;
  - specs compile at full depth, the DAG is clean, loom 19/19.

## Not done, said
- Not run in a real Electron window here. To confirm in yours:
  - that the menu lands on the pointer on your display;
  - Paste in the address bar (clipboard permission);
  - the account list on a site you are signed in to.
