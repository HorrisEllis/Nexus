# NEXUS 0.39.262: Nexus is one repo, its Home is the Nexus atlas, and Clear Glass replaces Playwright

**Date:** 2026-09-26 · clear-glass 3.15.0 → 3.16.0

James:

> *"playright? no what is that for? litterally have clearglas... also nexus is the repo, not 15, just nexus, then clicking inside of it, shows the rest of them in maybe architecture or no, the nexus atlas, wire that completely in as the homepage of the nexus repo, and everything referenced can be opened in idearium, including each system."*

## Nexus is one repo

**The library**
- The library shows one card, `nexus`, instead of 15.
- The 14 system repos are opened from inside it.
- While you are in a system, the compact list shows it under nexus.
- A filter that names a system still finds it.
- Back from a system goes to nexus; back from nexus goes to the library.

**The Home tab is the Nexus atlas**
- Nexus's Home renders `docs/atlases/nexus-atlas.md`, read from the immutable snapshot (`idearium/ui/js/nexus-atlas.js`, loaded after app.js).
- Every system is a block at the top, showing its files, versions, loom phases done/total, symbols, resolution and port. Clicking a block opens that system.
- Each `### <system>` module heading in the document gets a live line with the same numbers.
- The operational panels from 0.39.261 are in a collapsible section below: snapshot and sync, understanding, system graph, compartments, applied changes.

**Everything referenced opens in idearium**
- The page collects its references: code spans, file-tree lines, `:port`s and `*-atlas.md` names.
- They are resolved in one request, `POST /api/nexus-self/resolve` (`resolveRefs` in `idearium/repo/nexus-self.js`).
- What each kind opens:

| Reference | Opens |
|---|---|
| system name, `nexus.<system>`, `:port`, a system's directory | that system's repo |
| file | its system repo, Files tab, with the file open in the editor |
| `*.md` doc | rendered in place with a breadcrumb; its own references are live too |
| directory | its system repo's Files tab |
| `NEXUS/` | the nexus Home |

- Indented file-tree lines resolve as full paths: `guardian/` → `lib/` → `node-registry.js` is `guardian/lib/node-registry.js`.
- A bare name like `loom.spec` prefers the copy inside the system it is named after (`loom/spec/loom.spec` over `docs/loom.spec`). The other copies are listed in the link's tooltip.
- A path the snapshot does not have is marked struck-through with the tooltip "not in the snapshot". It is never guessed.
- A plain term such as `sigma` or `AX-013` is left as text.

**Each system's Home starts with its own atlas**
- It shows `docs/atlases/<system>-atlas.md`, found by the system's name or by the directory it owns (`ollama-atlas.md` for ollama-bridge), with its references live.
- A breadcrumb `nexus › <system>` sits at the top.

**New routes**
- `GET /api/nexus-self/atlas`: the document, per-system numbers, and architecture-spec's `nexus-atlas-aggregate` roll-up of every synced system's `atlas.json`.
- `POST /api/nexus-self/resolve`
- `GET /api/nexus-self/file?path=`: any text file of the immutable base, read-only.

**Also fixed:** the UI connected to the hardcoded `:4800` even when a different idearium served it. The idearium that served the page is now tried first.

## Playwright is gone: Clear Glass drives the pages

Playwright was a root devDependency for three probe scripts. Four more probes needed Python playwright, which was never installed, so TX-20, GS-20, SA-09 and SA-10 always reported SKIPPED.

Clear Glass is already a Chromium, so it now drives the pages itself.

**`clear-glass/src/driver/glass.js` plus `glass-host/main.js`**
- Node starts Clear Glass's Electron on the host script.
- Each page is a BrowserWindow, driven through its own `webContents.debugger`: the DevTools protocol spoken in-process, with no remote-debugging port.
- With no display on Linux it runs `--ozone-platform=headless` with offscreen windows. A shown window under the headless platform segfaults Electron 42.
- A machine without the Electron binary can point it at any Chromium (`GLASS_CHROMIUM`), driven over the DevTools websocket.
- The API is the subset of Playwright's that the probes used, under the same names, so a probe changes one line:
  - `launch`, `newPage`, `goto`, `evaluate`
  - `click` (on an inline element's first line box, so a wrapped link is hit)
  - `fill`, `selectOption`, `keyboard.press`, `locator`, `$`/`$$`/`$eval`/`$$eval`
  - `waitForSelector`/`Function`/`LoadState`
  - `route` (the Fetch domain), `exposeFunction` (Runtime bindings), `addInitScript`, `cdp`, `screenshot`
  - selectors: CSS, `text=`, `:has-text()` and `a >> b`

**Every real-page probe now runs on it**

| Probe | Result |
|---|---|
| `transcript-push-chromium.js` (TX-20) | 10/10 |
| `live-stream-chromium.js` (GS-20) | 8/8 |
| `selector-check-chromium.js` (SA-09) | 10/10 |
| `selector-assign-ui-chromium.js` (SA-10) | 9/9 |
| `agent-blocks-chromium.js` | 13/13 |
| `clearglass-library-window.js` | 29/29 |
| `clearglass-menu-library.js` | 4/4 |
| `nexus-atlas-home.js` (new: a real idearium, in a sandbox) | 8/8 |

- `home-split-equivalence.js` is ported, but its reference commit `30a0c24` predates this checkout's history, so it reports SKIPPED here, as the Python version would have.
- The six `.py` probes are deleted. The shared probe helper is `tests/probe/_glass-probe.js`.
- `tests/manual-chatgpt-console.playwright.js` became `tests/manual-chatgpt-console.glass.js`.
- Root devDependencies are now electron, electron-builder and jsdom. The lockfile went from 468 to 462 packages.

## Tests

`tests/modules/test-nexus-atlas-and-glass.test.js`: 8/8, registered in run-all.

| Group | What it covers |
|---|---|
| AT-001 | every kind of atlas reference resolves to what it names; an unknown one resolves to null |
| AT-002 | the Home is the atlas from the base, every system listed with its own atlas doc |
| AT-003 | a live edit does not show until the next snapshot |
| AT-004 | routes are registered before `:system` |
| UI-001 | markdown and file-tree references |
| UI-002 | one nexus card; back from a system goes to nexus |
| CG-001 | no Playwright, no Python probe, every probe drives Clear Glass |
| CG-002 | a real page: wrapped-element click, fill, `:has-text`, `text=`, events, screenshot size |

Suites that changed, all passing:

| Suite | Result |
|---|---|
| test-chat-transcripts | 31/0 (TX-20 now runs) |
| test-live-stream-and-gates | 13/0 (GS-20 now runs) |
| test-cg-selector-assign | 9/0 (SA-09 and SA-10 now run; SA-06 is still SKIPPED, because its 0.39.250 base commit is not in this history) |
| version-sync-and-registry | 28/2, the same two failures as before this release (lib/version.js lists idearium 4.8.0 while idearium reports 4.7.0) |
