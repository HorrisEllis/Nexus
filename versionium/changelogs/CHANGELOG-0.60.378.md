# CHANGELOG 0.60.378 — CE7: COS borderless; where the agent features are (CE_D3)

James, 2026-11-02: "Also where are the agent features. Also make it borderless."

## Borderless (CE7, built; in COS 0.4.0, the exe not yet released)
- COS's window has no Windows frame and no title bar. Windows still draws its own minimize, maximize and close over the top right
  (Electron's titleBarStyle hidden with titleBarOverlay), so snap layouts, Aero snap and double-click to maximize keep working. Close still
  follows his choice (tray or quit, CE1).
- The cockpit's top bar, and the gap above it, drag the window. Its buttons stay clickable. The bar ends where Windows' buttons begin.
- The first Clear Glass shot showed Go to spilling out of the bar and the title squeezed to "O…". The room now comes from the meters
  (numbers kept; bars drawn on wide windows) and the manager's pill (shortened, full text in its tooltip).
- The app's preload marks the page; the same cockpit opened in a browser is unchanged.
- The way back: tray menu → The window → With Windows' frame (applies when the window next opens). settings.frame: none | windows.
- Files: cos/app/window.js (frameOptions), cos/app/settings.js (frame), cos/app/desktop/main.js, cos/app/desktop/starting-preload.js,
  cos/app/desktop/starting.html, cos/ui/shell/page.css, cos/ui/shell/page.js.

## The agent features (CE_D3, mapped, the order his)
- COS's UI has none yet: only the proposals agents raise (Proposals, the Overview count).
- They live in Idearium (the repo agent: prompt, feed, stream, history, memory, tools, settings, gate, about 30 command rows; the page
  agents AC5) and in Copilot (the agent suite and switch). The round table (lib/roundtable.js) and the council (lib/agent-council.js)
  have no route of their own.
- His 2026-10-31 words for COS ("cli interface for the round table, be able to address specific agents … deploy agents to systems … like a
  drone", MG_D17) were recorded and never turned into phases. The coder's recommended order is in docs/2026-11-02-cos-enterprise-phasemap.spec
  CE_D3.

## Proof
- test-cos-app-window 9/9: CW-08 (frameOptions, the setting, main.js and the preload follow it) and CW-08b (Clear Glass: the marked
  cockpit drags by its top bar, its buttons are no-drag, at least 138px left for Windows' buttons, Go to inside the bar, the title readable;
  a browser unchanged).
- On Windows unverified until his run.
