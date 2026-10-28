spec:
  meta:
    name:     glass-frame
    version:  1.0.0
    date:     2026-10-26
    release:  "0.60.258"
    uuid:     glass-frame-phasemap-v1-0000-2026-1026-jamesbrooks-001
    owner:    "clear-glass (src/main/glass-frame.js, renderer/glass-frame.html, the provider, sign-in and popup windows)"
    voice: "The ideas and the calls are James's. `james:` is his, verbatim. `does:` is the coder's reading, his to correct."
    origin: >-
      James, 2026-10-26, with a screenshot of the ChatGPT "Log in or sign up" window in its Windows frame: "alsO I CANT OPEN dev console in a
      popup window. also the popup windows need to match the rest of the ui."
    earlier_words: "2026-10-15: \"can you make all pop ups from clear glass look like this\" (CS1, 0.60.54); 0.60.45: \"popup windows in clearglass should look nice like the browser, borderless windowed.\" CW1 (docs/2026-10-12-browser-providers-and-work-phasemap.spec) mapped a chrome view over the page and left it open: Electron did not run in the coder's container then."
    axioms: "docs/AXIOMS-v3.1.md — §0.1 evidence (both designs tried in Electron 42 under xvfb before building), §8.6 reuse (Settings' title bar look, CS1's dark base, the BrowserWindow calls callers already make), REVERSIBILITY (CG_NATIVE_POPUPS=1 brings back the OS frame), §1.2"
    traced_2026_10_26: >-
      (1) The dev console: CS1 removed every popup's menu (removeMenu), and Electron's F12 / Ctrl+Shift+I shortcut lived in that menu. Only the
      main window had its own key handler. (2) The look: a BrowserWindow's own page always fills the window (its contentView is not the page;
      tried, the page stayed full height), so a title bar cannot sit above it. A frameless BaseWindow with two WebContentsViews can: tried,
      a window.open popup made through createWindow keeps window.opener and closes its frame with window.close().

  decisions:
    GF_D1_how:
      status: DECIDED 2026-10-26 by his axioms
      chosen: "A frameless BaseWindow: the Clear Glass bar (34 px, Settings' look: mark, back, reload, title and host, devtools, minimize, maximize, close) over the site's view. A GlassWindow object answers the BrowserWindow calls callers already make, so host.js and login-portal.js change one line each. Where Electron has no BaseWindow (a test's stub) or CG_NATIVE_POPUPS=1, the dark OS frame of CS1 stays."

  phases:
    GF1_the_frame:
      status: DONE (0.60.258)
      depends_on: [GF_D1_how]
      files: [clear-glass/src/main/glass-frame.js, clear-glass/renderer/glass-frame.html, clear-glass/renderer/glass-frame.js, clear-glass/src/preload/glass-frame.js, clear-glass/src/providers/host.js, clear-glass/src/accounts/login-portal.js, clear-glass/src/main/compartment-window.js, clear-glass/src/providers/attention.js, clear-glass/src/main/index.js]
      does: "Provider windows (host.js), sign-in windows (login-portal.js) and every site's window.open popup (compartment-window.js createWindow) are Glass frames; attention.js counts them as windows (its popup check)."
    GF2_devtools_everywhere:
      status: DONE (0.60.258)
      depends_on: []
      files: [clear-glass/src/main/glass-frame.js, clear-glass/src/main/index.js]
      does: "F12, Ctrl+Shift+I and Ctrl+Shift+J open the page's DevTools (detached) in every window, set once at creation (web-contents-created); the bar has a </> button; the main window uses the same handler."
    GF3_proof:
      status: DONE (0.60.258)
      depends_on: [GF1_the_frame, GF2_devtools_everywhere]
      files: [clear-glass/test/glass-frame.test.js, clear-glass/test/glass-frame.electron.js, clear-glass/test/window-frame.test.js, clear-glass/package.json, loom/maps/economy-map.js]
      does: "Real Electron under xvfb: the page sits below the bar (566 of 600), the bar shows the page title and its buttons reach the window, F12 opens DevTools, a site's popup is framed with its opener and closes itself. Maximize needs a window manager and is not checked here."
