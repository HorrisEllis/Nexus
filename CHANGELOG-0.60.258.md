# 0.60.258 — Popups in the Clear Glass frame, and DevTools in every window

James, 2026-10-26, with a screenshot of the ChatGPT "Log in or sign up" window in its Windows frame: "alsO I CANT OPEN dev console in a
popup window. also the popup windows need to match the rest of the ui."

Map: `docs/2026-10-26-glass-frame-phasemap.spec`. This builds CW1, which was mapped and left open when Electron could not run in the
coder's container. It runs there now, under xvfb.

## Traced
- **The dev console.** CS1 (0.60.54) removed every popup's File/Edit/View menu. Electron's F12 / Ctrl+Shift+I shortcut lived in that menu,
  so it went too. Only the main window had a key handler of its own.
- **The look.** A BrowserWindow's own page always fills the window. This was tried: the page stayed full height. So no title bar can sit
  above a site's page in one. A frameless BaseWindow holding two views can. This was tried too: a `window.open` popup keeps its opener and
  closes its frame with `window.close()`.

## What changed
- **GF1, the Glass frame** (`clear-glass/src/main/glass-frame.js`, `renderer/glass-frame.html`).
  - **The bar:** the Clear Glass title bar, in Settings' look. It carries the mark, back, reload, the page title and host, `</>`
    (DevTools), minimize, maximize and close. It is 34 px tall, the page sits below it, and you drag the window by it.
  - **Where it applies:**
    - provider windows, like the ChatGPT one in the screenshot (`host.js`);
    - sign-in windows (`login-portal.js`);
    - every site's popup (`compartment-window.js`). "Continue with Google" works as before.
  - **How:** a `GlassWindow` answers the same calls a BrowserWindow did, so each caller changed one line. Attention counts frames as
    windows, so its focus-theft guard still sees sign-in popups.
  - **Fallback:** `CG_NATIVE_POPUPS=1` brings back the dark OS frame, and so does an Electron with no BaseWindow.
- **GF2, DevTools everywhere.** F12, Ctrl+Shift+I and Ctrl+Shift+J open the page's DevTools, detached, in every window. One handler is
  set as each window is created, and the main window uses it too.

## Proof
`clear-glass/test/glass-frame.test.js` drives real Electron under xvfb and checks:
- The page is 566 of 600 px, below the 34 px bar.
- The bar shows "Log in or sign up", the page's title.
- The bar's buttons reach their window.
- F12 opens DevTools.
- A site's popup is a frame. Its page is 386 px with its opener kept, and its `window.close()` closes the frame.

Other suites:
- provider-host-load 5/5, provider-host-one-tab 7/7, attention-focus 7/7, signin-window-quiet, login-portal-elsewhere and google-signin
  56/56 all pass.
- window-frame WF-05 is updated (a popup is now a frame). WF-06 still fails as before, because `float-cli.js` is unlisted.
- compartment-window and accounts-portal-settings fail as on 0.60.257.

## Not checked
- Maximize: xvfb has no window manager.
- His Windows machine: how the frame drags and snaps there is to be seen.
