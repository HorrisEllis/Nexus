# James's machine-only Clear Glass, 2026-10-30 — kept whole (§0.3)

Sent as clear-glass-1.zip from D:\Backups\Downloads\nexus-0.60.297\clear-glass. Base: Nexus 0.60.297 (Clear Glass 3.24.0). Not on GitHub when
received: main was 0.60.316 by then (PR #194 GT1–GT3 spec, PR #195 DD1 dropdowns/checkboxes + PF1, PR #196).

What is only here (another session's work, never pushed):
- **macro-elements**: spec/macro-elements.spec, renderer/macro-elements/, test/macro-elements.test.js; his words in the spec: "the element picker is
  supposed to be linked to the macro ... a button that says log element for macro. then have it show up as an option in the macro editor."
- The files it changed, kept whole as they are on his machine (not merged): browser.html/js, settings macros.js/.css, site-profile-groups.js,
  dom/archaeology.js, ipc/bridge.js, macros/recorder-script.js and recording.js, options/store.js, preload/index.js, site-settings keys/readers.
- src/dom/select-match.js and src/autofill/portfolio.js as they were there; main has its own (DD1 and PF1), which may differ.

His machine lacks what main has: the Fiverr automation nodes (fiverr-gig-choose-category.macro, -choose-delivery.macro, the fill workflows,
fiverr-gig.pipeline), docs/gigs, and every change from 0.60.298 to 0.60.316. Not copied: data/ (his state).
Next: reconcile macro-elements onto main (mapped as SD0 in docs/2026-10-30-site-data-and-fiverr-dom-phasemap.spec), then update his machine.
