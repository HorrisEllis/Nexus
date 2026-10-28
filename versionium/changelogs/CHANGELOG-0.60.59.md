# 0.60.59 - 2026-10-15

James: "downloads any files into the sandbox, shows in the downloads library, a safe pipeline. okay, can you consolidate the settings? if you havent? and the dark mode on the popups"

## Settings, consolidated (the second pass)
The first pass (0.60.54) merged Accounts, Provider tabs and Agent mesh. Looking again, **Privacy & data** held a pane that only pointed at **Site settings** (the same data twice), and **Browser fingerprint** was two panes on a page of its own. They are now one page, **Privacy & sites**: saved passwords, clear data, the per-site list and defaults, and the fingerprint switch.
- `core.js`: a section with `into: '<host>'` renders inside its host. Its old id still works as a link or a bookmark (`#sites` opens Privacy & sites at the sites part). This is the same mechanism the upcoming Network section will use.
- The "Open Site settings" pointer pane is deleted. The two child stylesheets are re-scoped to `body[data-areas~="..."]`.
- Not merged, and why: Downloads vs Agent suite › Download listeners are related (save location vs what happens to a file) but not duplicates; Automation and Macros stay separate pages.

## Dark popups (the second pass)
0.60.54 darkened the window frames. Still light before this: native lists, scrollbars and date pickers (no `color-scheme`), and the state-bookmark name prompt, which used `window.prompt`. **Electron has no `window.prompt`**, so that button threw and never saved a bookmark. Now `:root { color-scheme: dark }` in the shared theme, and a dark in-page prompt (`askText`).
- Side effect to know: `nativeTheme = dark` (0.60.54) also tells web pages the user prefers dark, so sites that support it render dark. That is a visible change for pages, and a small fingerprint signal. Say if you want it off for page content.

## Mapped, not built (NP16, docs/2026-10-15-clear-glass-network-posture-phasemap.spec)
A quarantine in front of the existing downloads pipeline: files from a protected route land in the compartment, show in the Library marked quarantined, get cheap deterministic checks, and are released by a click, a CLI verb or a rule. A folder plus checks, not a VM: stated in the map.

## Proof
`test/privacy-merge.test.js` PM-01..05, `test/dark-popups.test.js` DP-01..04 (jsdom and static scans; **the real look in Electron is unverified**), and the earlier settings, window-frame and macro tests still pass.
