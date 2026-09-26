# NEXUS 0.39.262: Idearium Compartment + recursive tabs; Clear Glass on JAA, copilot hat CLI, macros, WebExtensions, site settings

**Date:** 2026-09-26 · idearium (workbench, UI), clear-glass 3.15.0 → 3.16.0, ui/brainos-float

James, live on 0.39.260:

> *"in idearium can you make the tabs much more recursive, deep and expanded fully? interconnected. i want ideas once promoted to move to the compartment idea section for brainstorming, problem solving, expanding, and improving"*
>
> *"in clearglass. can you fix this? also make the macros way more user friendly? expand the copilot settings. add new button to the plugins section with webextension support. expand per site settings. make a clearglass hat for the copilot cli … also with clearglass, make it jaa. no json. cookies only. expand the autofill section, agent mesh and brainos."*

## Fixed: `unhandledrejection GUEST_VIEW_MANAGER_CALL … ERR_CONNECTION_REFUSED (-102) 'http://127.0.0.1:900/'`

- **Cause:** `<webview>.loadURL()` returns a Promise that rejects when a navigation fails. All nine call sites in `renderer/browser.js` dropped it, so every failed navigation reached the global `unhandledrejection` handler (error toast + `errors:report`).
- `:900` is not in any code. It was typed. The `:9000` ERR_ABORTED (-3) in the same log is the default start page being superseded by that typed navigation, which is normal.
- **Fix:** all navigation goes through `navigate()`, which consumes the rejection. `did-fail-load` (main frame only) shows one in-view page: the URL, the error, Retry, and for a refused local port one keystroke from a NEXUS port, "Did you mean http://127.0.0.1:9000/?". The address bar and history keep the URL that failed, not the error page.

## Idearium: the Compartment

- **Promote now lands somewhere:** a promoted brainstorm becomes an idea *in the Compartment*, with its text seeding the Brainstorm lane, and the UI opens it there.
- **Four lanes per idea:** Brainstorm, Problem solving, Expand, Improve. Entries nest to any depth (reply ↳), move between lanes, resolve, fold, delete with their subtree.
- **Recursive across ideas:** ◆ on any entry spins it out into its own idea, a child of this one, linked causally, with its own four lanes.
- **Interconnected:** ⇄ links an entry to any entry or idea. Links are shown as chips and walked both ways (the Links view lists spun-out ideas, links out, links in, and the idea graph).
- **Copilot per lane:** ✨ asks copilot to work the entry in its lane's terms (break down / expand / improve…). You pick which suggestions to keep; they are added one level deeper. Nothing is stored without that pick.
- **Tabs:** the Compartment tab's dropdown nests idea → spun-out idea → lanes as flyouts, as deep as the idea tree goes. **Expand all (⊞)** replaces the tab bar with a full navigator tree: every view, every idea, every compartment idea and lane, every repo and every repo subtab.
- Model: `idearium/lib/idea-workbench.js` (pure). Store: JAA tables `idearium_workbench_members`, `idearium_workbench_entries`. Routes under `/api/workbench` and `/api/ideas/:uuid/workbench`.
- An unknown lane is refused with a 400, never defaulted.

## Clear Glass: JAA, no JSON files

- Cookies were already on JAA (0.39.243). Everything else wrote its own `<name>.json` on every change: options, API settings, site settings, history, downloads, bookmarks, autofill profiles, fingerprints, saved passwords.
- All of them now go through `src/storage/jaa.js`: one JaaStore at `~/.clear-glass/jaa`, one table per store, one row per record. Only changed rows are written. History and downloads order by their own timestamps, so a new entry doesn't rewrite 5000 rows.
- The password vault, like the cookie vault, keeps its own store in its own directory.
- Old files are imported once, marked in `cg_jaa_meta`, and **left on disk**.
- **Stated limit:** JaaStore itself snapshots each table as `<table>.json` inside `jaa/`. That is its storage format. "No JSON" here means no store owns a JSON file; it does not mean the database stops writing JSON.

## Clear Glass: the co-pilot pane wears the Clear Glass hat

- **Route bar:** the TV UI floating menu's toggle (ollama | copilot | guardian), plus the NCP agent dropdown and a 🎩 hat chip.
- **CLI** in the style of Idearium's agent CLI:
  - `/help` `/status` `/backend` `/agent` `/hat [on|off]` `/forge` `/persona` `/ctx` `/run` `/go` `/back` `/reload` `/site` `/macro` `/cookies` `/build` `/diagnose` `/history` `/clear` `/settings`
  - ↑/↓ recalls earlier inputs, Tab completes a command.
- **The hat:** `clear_glass` in `lib/hat-forge`, found by its role (seedKey), forged on first `/forge`. Until then a built-in persona is used.
  - Like Idearium's repo agents, the persona is composed into each call. backend/agent are per-call fields (the same ones the TV menu sends).
  - Wearing it in the browser never changes what copilot wears anywhere else.
- **Fixed:** every ```driver command in a reply ran twice. The main process ran it, then `browser.js` ran it again through `cg.driver.exec`.
  - Now the main process is the only executor.
  - With auto-run off, commands are proposed and run on `/run`.
- **Fixed:** `/build` and `/diagnose` always failed. Their IPC handlers existed, but the preload never exposed them.

## Clear Glass: Settings

- **Co-pilot:**
  - the default route
  - the hat: status, Forge, persona editor, model
  - DOM on/off and budget, timeout
  - auto-run of proposed actions, the route line under replies, history size
  - channel, fallback endpoint and model
  - the CLI reference
- **Macros:**
  - **Record** from a tab. The driver's recorder now builds unique selectors. `src/macros/recording.js` turns the recording into steps, and a password becomes a `{{password}}` parameter, never a stored value.
  - Templates: log in, fill a form, search, open and screenshot.
  - Steps read as sentences and have labelled fields.
  - Parameters are found in the `{{…}}` placeholders.
  - Edit: if the new version is refused, the old one is restored. Duplicate is also available.
  - Missing url/selector is flagged before save.
  - Run offers an explicit "rewind snapshot first" choice.
- **Plugins → Add WebExtension:** Chrome extensions (MV2/MV3) from a folder, a `.zip` or a `.crx` (CRX2/3 header stripped).
  - Loaded into the default session and every persistent tab session as it is created. The registry is in JAA.
  - Controls: enable/disable, reinstall, remove. Remove deletes only a copy Clear Glass unpacked.
  - Electron's refusal or its warnings show on the extension's row.
  - Electron supports part of the `chrome.*` API. The page says so.
- **Site settings** (new area; it was one pane in Privacy):
  - 15 permissions, each Default/Allow/Block
  - zoom
  - content blocking on/off per site
  - any other stored key, editable
  - add a site, copy settings to another site, filter
  - Every control is enforced: `permission:*` by the permissions plugin, `zoomFactor` by the browser, and `contentFilter='off'` by a new exemption in `webrequest-adapter.js`.
- **Autofill:**
  - all 25 fields the store accepts, grouped (the editor had 12)
  - completeness
  - duplicate
  - **Fill a tab** with a match preview first. It never submits.
  - try an on-screen answer
- **Agent mesh:**
  - health bars and readable constraints
  - per-agent page check (`/agent-mesh/diagnose`)
  - dispatch shows the reply text and supports a fallback order
  - routes with `{{output}}` transforms and a pipeline summary
  - Jobs (`/agent-mesh/intake`), Network nodes (`/agent-mesh/view`)
  - live refresh

## BrainOS Float

- New tabs **NODES, MESH JOBS, MACROS, AUTOFILL, SITES**, added through the panel's own `registerTab` hotswap point (`ui/brainos-float/brainos-float-cg.js`). The contract is updated.
- **Fixed:** a tab registered before `mount()` silently removed all five built-in tabs.

## Tests

- **New, all passing:**
  - `clear-glass/test/storage-jaa.test.js` 5
  - `clear-glass/test/copilot-cli.test.js` 10, including the real hat forge on an isolated JAA dir
  - `clear-glass/test/webextensions.test.js` 7
  - `clear-glass/test/content-filter-exempt.test.js` 1
  - `tests/modules/brainos-float-cg.test.js` 6, registered in `run-all.js`
  - `idearium/test/idea-workbench.test.js` 10
  - `idearium/test/compartment-ui.smoke.cjs`
- **`tests/modules/test-cg-accounts-portal-settings.test.js`: 38/38.**
  - It failed on 0.39.260 (UI-05) because its section list and fake backend predated Downloads and Plugins. Both are updated.
  - Before that fix, UI-05 stopped at the list and never rendered any section.
- **Still passing:** `clear-glass-autofill` 16, `nexus-options-autoboot` 15, `test-response-downloads` 9, `test-cookie-vault-jaa` 7, `clear-glass-screen-qa` 26, clear-glass `bus` and `watchdog`.
- **Failing on 0.39.260 too, unchanged:**
  - `clear-glass-accounts`: 1 (send() accountId)
  - clear-glass `network-install`: 5
  - `test-brainos-real-access-path`: BRA-001, BRA-002B

## Not verified here

- **Not run in a real Electron window:** the WebExtension loading and the recorder. Both were exercised against fake sessions and a fake driver in tests.
- **Not run against a live copilot and guardian:** the co-pilot CLI's routing.
