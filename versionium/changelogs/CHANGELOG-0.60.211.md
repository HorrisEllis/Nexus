# 0.60.211 — zoom controls on the toolbar; the start page's agents load reliably

James, 2026-10-22: "can you integrate that into clearglass, its a basic funcaiton of any browser." · "why remove the agents from new tab?"

Owned by: clear-glass/spec/browser-shell.spec (dated addendum).

## Zoom
- **Zoom has been in Clear Glass's core since 0.60.183** (`src/core/zoom.js`):
  - the zoom steps, the same as Firefox's;
  - the level remembered per site;
  - Ctrl + / − / 0 and Ctrl + scroll;
  - the level badge in the address bar;
  - the ☰ menu's Zoom row.
  The old plugin was archived then and isn't loaded.
- **A correction to 0.60.210's notes.** They described the Zoom plugin's commands being offered for pinning. Those commands came from the
  test fixture, which registers the archived plugin, not from your install.
- **What was missing** was a place on the toolbar. **Zoom controls** is now a built-in tool you can pin from Customize toolbar:
  - − and + step through the same core zoom;
  - the level in the middle resets to 100% when clicked.
  The ☰ menu keeps its own Zoom row, so the tool isn't listed twice under Tools.

## The start page's agents
- **Nothing removed them.** `newtab.js` hasn't changed since 0.60.180.
- **The bug:**
  - The page read the agent list once, when it opened.
  - If that read failed early, while the window was still starting, or came back empty, the section said "Guardian's provider host is not
    answering" until you opened another new tab.
  - That message was also wrong: the list comes from Clear Glass's own provider host, not Guardian.
- **Now:**
  - The message says what actually failed.
  - The agents are read again every 3 s while the page is open, until they appear.
  - Only that section is redrawn, so typing in the search box and any open panel are left alone.
  - The first attempt redrew the whole page and closed open panels; BST-07 caught it.

## Proof
- tests/modules/test-browser-shell.test.js 28/28, all in Clear Glass:
  - **BST-22**: an empty agent list says it's retrying, and the agents appear without opening another tab.
  - **BST-23**: pinned zoom controls draw their icons; + raises the level, also shown in the address bar; the level click resets to 100%;
    the menu doesn't list the tool twice; it's offered in Customize toolbar.
