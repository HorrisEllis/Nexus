# 0.60.54 - 2026-10-15

James: "can you make all pop ups from clear glass look like this" · "unless there is a point can you consolidate the provider and accounts settings sections in the settings for the settings.html" · "see? why the repitition?" · "after you fix the popups to dark to match the settings ui, and consolidate those three settings into one section in the settings."

## Popups (CS1)
`clear-glass/src/main/window-frame.js`. The Settings and Library windows draw their own title bar, so they are frameless and dark already. A window that loads someone else's page (the Google or ChatGPT sign-in, any `window.open` popup) cannot have a title bar painted into the page, so it keeps the OS frame and the frame is made dark: the app theme is dark, the background is `#08080d` before the first paint, the File/Edit/View menu is gone. `compartment-window.js` now covers a provider or sign-in window's popups too (it only covered webviews). The page inside is the site's own and is not restyled. Test WF-06 lists every `new BrowserWindow` and fails on one that is not accounted for.

## One section (CS2)
Accounts & sign-in, Provider tabs and Agent mesh are one section, Providers & accounts. Each provider's header holds its tab controls (status, start with Clear Glass, Show, Push userscript, Start/Stop, the one-press sign-in sync). Below the providers: Startup, then the mesh half (Running now, Try a dispatch, Routes, Jobs, Network nodes). Removed with a stated reason: the mesh "Agents" list, which repeated the provider rows. The old "no default" wording went with it: Accounts said dispatch uses the oldest account, the mesh said "no default"; both meant no starred account. Old ids (`#mesh`, `goto('providers')`) still land on the merged section.

## Proof and limits
WF-01..06, SM-01..05, and SM-06, which renders the merged section in jsdom with stubbed APIs (2 provider tab controls, startup, mesh half, no errors). None of this was seen in Electron: the dark title bar depends on Windows honouring the app theme, and the layout of the header controls is unseen. Those are the first things to look at.
