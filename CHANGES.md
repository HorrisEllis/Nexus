# Changes since 0.60.47

Written from git by `lib/release-notes.js` (RN2), not by hand: every commit is listed once, under the first release that contains it. Each release links its own changelog (the coder's write-up with James's words). Regenerate: `npm run changes -- --since 0.60.47`.

25 release(s), 48 commit(s); 21 of them carried no version of their own (maps, addenda, docs) and are listed under the release that shipped them.

## 0.60.72 — 2026-10-16

James: "tell me all the recent changes. i want a changelog for each change or diff. i want it all syncd with git, versionium, the zip. like lets tet idearium working"

- Changelog: [CHANGELOG-0.60.72.md](CHANGELOG-0.60.72.md) — 0.60.72 — 2026-10-16
- Commit: `89c99e78`
- 1 commit(s):

  - `89c99e78` 2026-10-16 01:31 — 0.60.72 RN2 + RN3: every change under the release that shipped it — git, Versionium, CHANGES.md, the Releases screen
    18 file(s), +26942 −927; systems: docs, idearium, lib, loom, root, tests
    `CHANGELOG-0.60.72.md` · `docs/2026-10-15-gate-held-work-phasemap.spec` · `docs/2026-10-15-one-contract-raid-releases-phasemap.spec` · `docs/PROOF-OF-COMPETENCY.md` · `idearium/api/index.js` · `idearium/cli/route-commands.js` · `idearium/ui/index.html` · `idearium/ui/js/app.js` · `idearium/ui/js/repo-releases.js` · `lib/nexus-releases.js` · `lib/release-notes.js` · `lib/version.js` · … 6 more

## 0.60.71 — 2026-10-16

James: "actually wen its asking me to pick the inputs or response, or what ever. its needs to use the guardian picker so i can traverse through the elements one at a time."

- Changelog: [CHANGELOG-0.60.71.md](CHANGELOG-0.60.71.md) — 0.60.71 — 2026-10-16
- Commit: `baa6dcf7`
- 1 commit(s):

  - `baa6dcf7` 2026-10-16 01:07 — 0.60.71: the attention panel's picks use the Guardian picker — walk one element at a time
    10 file(s), +377 −43; systems: clear-glass, docs, lib, root, tests
    `CHANGELOG-0.60.71.md` · `clear-glass/renderer/guardian-picker.js` · `clear-glass/src/providers/attention.js` · `docs/2026-10-12-browser-providers-and-work-phasemap.spec` · `docs/PROOF-OF-COMPETENCY.md` · `lib/version.js` · `package.json` · `tests/modules/run-all.js` · `tests/modules/test-guardian-field-pick.test.js` · `tests/modules/test-plan-code-run-attention.test.js`

## 0.60.70 — 2026-10-16

James (answering "SP2 next, then the 33-writer gap sweep — in that order?"): "alright."

- Changelog: [CHANGELOG-0.60.70.md](CHANGELOG-0.60.70.md) — 0.60.70 — 2026-10-16
- Commit: `297ea8b7`
- 2 commit(s):

  - `297ea8b7` 2026-10-16 00:51 — 0.60.70 SP2: picked provider fields found by semantic address after class churn; required tool params by alias; crystallisation log capped
    5 file(s), +86 −3; systems: docs, lib, root
    `CHANGELOG-0.60.70.md` · `docs/2026-10-15-capability-specs-and-semantic-page-tree-phasemap.spec` · `docs/PROOF-OF-COMPETENCY.md` · `lib/version.js` · `package.json`
  - `64018f21` 2026-10-16 00:50 — WIP 0.60.50: SP2 semantic addresses for the field map; officiator routes local models to Ollama; required tool params by alias; crystallisation log capped
    11 file(s), +303 −25; systems: clear-glass, guardian, intelligence, lib, tests
    `clear-glass/spec/semantic-tree.spec` · `clear-glass/src/page/semantic-tree.js` · `clear-glass/src/providers/attention.js` · `clear-glass/src/providers/host.js` · `guardian/lib/selector-map.js` · `guardian/userscript-field-map.js` · `intelligence/index.js` · `lib/agent-tools/index.js` · `tests/modules/run-all.js` · `tests/modules/test-semantic-field-map.test.js` · `tests/modules/test-tool-required-alias.test.js`

## 0.60.69 — 2026-10-16

James — "should not rely on raid." (the red line in Run macro: "RAID denied dispatch: proof required, none supplied for 'chat'")

- Changelog: [CHANGELOG-0.60.69.md](CHANGELOG-0.60.69.md) — 0.60.69 - 2026-10-15
- Commit: `2a265ecd`
- 5 commit(s):

  - `e89361c7` 2026-10-15 21:10 — 0.60.62: macro runs drive Clear Glass directly (no Guardian/RAID); ChatGPT chat reader template
    10 file(s), +99 −5; systems: clear-glass, lib, root, tests
    `CHANGELOG-0.60.62.md` · `clear-glass/src/automation/templates.js` · `clear-glass/src/ipc/bridge.js` · `lib/agent-tools/tools/browser/browser-action.js` · `lib/agent-tools/tools/clear-glass/macro.js` · `lib/version.js` · `package.json` · `tests/modules/run-all.js` · `tests/modules/test-chatgpt-scrape-template.test.js` · `tests/modules/test-macro.js`
  - `686da6eb` 2026-10-15 21:05 — Map: pipeline focus path over code-tab, gate-held-work and spec-foundation maps; CE6 blocker is stale
    2 file(s), +33 −0; systems: docs
    `docs/2026-10-15-pipeline-focus-phasemap.spec` · `docs/SPEC-REGISTRY.spec`
  - `68f1b8c3` 2026-10-15 21:02 — Map: COSA9, COS syncs with Idearium to manage repos
    1 file(s), +21 −0; systems: docs
    `docs/2026-10-15-cos-app-phasemap.spec`
  - `ddd75c68` 2026-10-15 20:58 — Map: COS as a Windows application (COSA1-COSA8); finding: 37 modules hardcode the data folder
    2 file(s), +96 −0; systems: docs
    `docs/2026-10-15-cos-app-phasemap.spec` · `docs/SPEC-REGISTRY.spec`
  - `7f126be1` 2026-10-15 20:56 — Map: spec foundation model (SF1-SF7) from his boot log and proposal; log findings (0.60.44 run, officiator/Ollama)
    2 file(s), +71 −0; systems: docs
    `docs/2026-10-15-spec-foundation-model-phasemap.spec` · `docs/SPEC-REGISTRY.spec`

## 0.60.68 — 2026-10-15

James: "Use the templates. The genesis by default." (asked "So it can spec now?" and was told a compiled spec came out as a generic TypeScript package)

- Changelog: [CHANGELOG-0.60.68.md](CHANGELOG-0.60.68.md) — 0.60.68 — 2026-10-15
- Commit: `9b0f6944`
- 1 commit(s):

  - `9b0f6944` 2026-10-15 22:33 — 0.60.68: specs laid out from the templates, genesis by default
    15 file(s), +240 −55; systems: docs, idearium, lib, root, tests
    `CHANGELOG-0.60.68.md` · `docs/2026-10-15-warp-builds-and-spec-framework-phasemap.spec` · `docs/PROOF-OF-COMPETENCY.md` · `docs/spec-compiler.spec` · `idearium/api/index.js` · `idearium/cli/route-commands.js` · `idearium/lib/config-core.cjs` · `idearium/spec/idearium.spec` · `idearium/ui/js/app.js` · `lib/repo-prompt-blocks.js` · `lib/repo-prompt-blocks.previous.json` · `lib/spec-collect.js` · … 3 more

## 0.60.67 — 2026-10-15

James: "Next."

- Changelog: [CHANGELOG-0.60.67.md](CHANGELOG-0.60.67.md) — 0.60.67 — 2026-10-15
- Commit: `45386a14`
- 1 commit(s):

  - `45386a14` 2026-10-15 22:21 — 0.60.67 WB0 + SF4: which builds go through WARP (measured, CK-255); a collected spec compiled into proposals
    25 file(s), +425 −19; systems: cos, docs, idearium, lib, loom, root, tests
    `CHANGELOG-0.60.67.md` · `cos/spec/check-catalogue.spec` · `docs/2026-10-15-warp-builds-and-spec-framework-phasemap.spec` · `docs/SPEC-REGISTRY.spec` · `docs/spec-compiler.spec` · `docs/warp.spec` · `idearium/api/index.js` · `idearium/cli/route-commands.js` · `idearium/lib/config-core.cjs` · `idearium/spec/idearium.repo-roadmap.spec` · `idearium/spec/idearium.spec` · `idearium/spec/nexus-repository-system.spec` · … 13 more

## 0.60.66 — 2026-10-15

James: "Continue"

- Changelog: [CHANGELOG-0.60.66.md](CHANGELOG-0.60.66.md) — 0.60.66 — 2026-10-15
- Commit: `f3471031`
- 1 commit(s):

  - `f3471031` 2026-10-15 22:04 — 0.60.66 SF1-SF3 + MP3: spec framework by intent, a gate + listener that collects specs, builds start with their mapped context
    23 file(s), +452 −35; systems: docs, idearium, lib, loom, root, tests
    `CHANGELOG-0.60.66.md` · `docs/2026-10-15-warp-builds-and-spec-framework-phasemap.spec` · `docs/PROOF-OF-COMPETENCY.md` · `docs/SPEC-REGISTRY.spec` · `docs/spec-compiler.spec` · `idearium/api/index.js` · `idearium/spec/idearium.spec` · `idearium/ui/js/agent-blocks.js` · `idearium/ui/settings.html` · `lib/context-prereqs.js` · `lib/phase-map-auto.js` · `lib/repo-agent.js` · … 11 more

## 0.60.65 — 2026-10-15

James: "begin on the pipeline. The speccing, mapping, listener. It doesn't know how to map. Nexus needs to generate dependancies for each phase, with files. The agent keeps having to find context, with tools.  Need them all mapped. Need that be automatic for every new phase from any project."

- Changelog: [CHANGELOG-0.60.65.md](CHANGELOG-0.60.65.md) — 0.60.65 — 2026-10-15
- Commit: `63ddec64`
- 1 commit(s):

  - `63ddec64` 2026-10-15 21:28 — 0.60.65 MP1 + MP2: Nexus maps every phase to files and dependencies, automatic in every repo
    15 file(s), +515 −7; systems: docs, idearium, lib, loom, root, tests
    `CHANGELOG-0.60.65.md` · `docs/2026-10-15-warp-builds-and-spec-framework-phasemap.spec` · `docs/PROOF-OF-COMPETENCY.md` · `docs/SPEC-REGISTRY.spec` · `idearium/api/index.js` · `idearium/repo/phases.js` · `idearium/spec/idearium.repo-roadmap.spec` · `idearium/ui/js/phases.js` · `lib/phase-map-auto.js` · `lib/version.js` · `loom/maps/build-surface-map.js` · `loom/maps/one-idearium-map.js` · … 3 more

## 0.60.64 — 2026-10-15

James: "phases tags by system/nested repo"

- Changelog: [CHANGELOG-0.60.64.md](CHANGELOG-0.60.64.md) — 0.60.64 — 2026-10-15
- Commit: `5176d15d`
- 0 commit(s):


## 0.60.63 — 2026-10-15

James: "can you make sure those are added to the phases in idearium. make sure all of the files and dependancies are mapped. and i want the specs to tagged per phase"

- Changelog: [CHANGELOG-0.60.63.md](CHANGELOG-0.60.63.md) — 0.60.63 — 2026-10-15
- Commit: `5176d15d`
- 0 commit(s):


## 0.60.62 — 2026-10-15

James: "bricks keep failing." (with his 2026-10-15 run log)

- Changelog: [CHANGELOG-0.60.62.md](CHANGELOG-0.60.62.md) — 0.60.62 — 2026-10-15
- Commit: `5176d15d`
- 4 commit(s):

  - `a0635dee` 2026-10-15 21:20 — 0.60.52 PT2: phases tagged by system / nested repo
    10 file(s), +110 −14; systems: docs, idearium, lib, loom, root, tests
    `CHANGELOG-0.60.52.md` · `docs/2026-10-15-warp-builds-and-spec-framework-phasemap.spec` · `idearium/spec/nexus-repository-system.spec` · `idearium/ui/js/phases.js` · `lib/version.js` · `loom/scanners/phasemap-map.js` · `loom/spec/loom.spec` · `package.json` · `tests/modules/test-loom-phasemap.js` · `tests/modules/test-phase-specs-tag.test.js`
  - `a21b8b24` 2026-10-15 16:17 — 0.60.51 PT1: specs tagged per phase; the WARP / spec-framework phases' files and deps mapped
    13 file(s), +204 −19; systems: docs, idearium, lib, loom, root, tests
    `CHANGELOG-0.60.51.md` · `docs/2026-10-15-warp-builds-and-spec-framework-phasemap.spec` · `docs/PROOF-OF-COMPETENCY.md` · `docs/SPEC-REGISTRY.spec` · `idearium/repo/roadmap.js` · `idearium/spec/idearium.repo-roadmap.spec` · `idearium/ui/js/phases.js` · `lib/version.js` · `loom/scanners/phasemap-map.js` · `loom/spec/loom.spec` · `package.json` · `tests/modules/run-all.js` · … 1 more
  - `cc0f1171` 2026-10-15 16:08 — Map: every build through WARP; agents write .spec from an injected framework, collected; intent-based blocks
    2 file(s), +77 −0; systems: docs
    `docs/2026-10-15-warp-builds-and-spec-framework-phasemap.spec` · `docs/SPEC-REGISTRY.spec`
  - `0fbf99cf` 2026-10-15 15:59 — 0.60.50: an Ollama job goes to the bridge, not Guardian's tab check
    8 file(s), +142 −5; systems: copilot, docs, lib, root, tests
    `CHANGELOG-0.60.50.md` · `copilot/lifeline.js` · `copilot/spec/copilot.spec` · `docs/PROOF-OF-COMPETENCY.md` · `lib/version.js` · `package.json` · `tests/modules/run-all.js` · `tests/modules/test-lifeline-ollama-dispatch.test.js`

## 0.60.61 — 2026-10-15

James — "now can we get the pipeline working?" (the red line: "the chatgpt tab was handed the job and did nothing with it for 90 s — the prompt was not typed")

- Changelog: [CHANGELOG-0.60.61.md](CHANGELOG-0.60.61.md) — 0.60.61 - 2026-10-15
- Commit: `be593c89`
- 1 commit(s):

  - `be593c89` 2026-10-15 20:51 — 0.60.61: pickup timeout names which failure (no tab / script stopped / script alive, did not act)
    5 file(s), +58 −7; systems: guardian, lib, root, tests
    `CHANGELOG-0.60.61.md` · `guardian/lib/dispatcher.js` · `lib/version.js` · `package.json` · `tests/modules/test-guardian-stack-sim.test.js`

## 0.60.60 — 2026-10-15

James — "im saying add support for snowflake, using cli, then you can add the commands to the agents, or make agent tools. what about an encrypted container, only accessable through clearglass?"

- Changelog: [CHANGELOG-0.60.60.md](CHANGELOG-0.60.60.md) — 0.60.60 - 2026-10-15
- Commit: `57e224c5`
- 2 commit(s):

  - `57e224c5` 2026-10-15 20:44 — 0.60.60: Snowflake/Tor routes by CLI (policy, fail-closed PAC, isolated transport, net command, read-only agent tool); map NP19 encrypted container
    17 file(s), +736 −7; systems: clear-glass, docs, idearium, lib, loom, root, tests
    `CHANGELOG-0.60.60.md` · `clear-glass/src/contexts/manager.js` · `clear-glass/src/ipc/bridge.js` · `clear-glass/src/net/policy.js` · `clear-glass/src/net/service.js` · `clear-glass/src/net/transport-host.js` · `clear-glass/src/options/store.js` · `docs/2026-10-15-clear-glass-network-posture-phasemap.spec` · `idearium/cli/route-commands.js` · `lib/agent-tools/index.js` · `lib/agent-tools/tool-guide.js` · `lib/agent-tools/tools/clear-glass/net.js` · … 5 more
  - `3c07daf5` 2026-10-15 20:36 — Map addendum: freeze/resume on connection loss (hold primitive in core, freeze plugin), NP17-NP18
    1 file(s), +51 −0; systems: docs
    `docs/2026-10-15-clear-glass-network-posture-phasemap.spec`

## 0.60.59 — 2026-10-15

James — "okay, can you consolidate the settings? if you havent? and the dark mode on the popups"

- Changelog: [CHANGELOG-0.60.59.md](CHANGELOG-0.60.59.md) — 0.60.59 - 2026-10-15
- Commit: `d31b4481`
- 4 commit(s):

  - `d31b4481` 2026-10-15 20:33 — 0.60.59: Privacy & sites (3 settings sections into 1), dark color-scheme, dark in-page prompt, map NP16 quarantine
    15 file(s), +167 −32; systems: clear-glass, docs, lib, root
    `CHANGELOG-0.60.59.md` · `clear-glass/package.json` · `clear-glass/renderer/browser.js` · `clear-glass/renderer/cos-theme.css` · `clear-glass/renderer/settings/core.js` · `clear-glass/renderer/settings/sections/fingerprint.css` · `clear-glass/renderer/settings/sections/fingerprint.js` · `clear-glass/renderer/settings/sections/privacy.js` · `clear-glass/renderer/settings/sections/sites.css` · `clear-glass/renderer/settings/sections/sites.js` · `clear-glass/test/dark-popups.test.js` · `clear-glass/test/privacy-merge.test.js` · … 3 more
  - `eef78b11` 2026-10-15 20:29 — Map addendum: kill switch ladder (block / kill_tabs / kill_compartment), NP15
    1 file(s), +26 −0; systems: docs
    `docs/2026-10-15-clear-glass-network-posture-phasemap.spec`
  - `e152b7e3` 2026-10-15 20:27 — Map addendum: network scope model, incognito, plugin split (core enforces, plugin transports), macro/automation support (NP9-NP14)
    1 file(s), +73 −0; systems: docs
    `docs/2026-10-15-clear-glass-network-posture-phasemap.spec`
  - `9735814e` 2026-10-15 20:24 — Map: Clear Glass network posture (NP1-NP8); record his decisions on hotkeys, P2P, hypothesis tracker
    2 file(s), +97 −0; systems: docs
    `docs/2026-10-15-clear-glass-network-posture-phasemap.spec` · `docs/SPEC-REGISTRY.spec`

## 0.60.58 — 2026-10-15

James — "have a simple step by step guide for making a macro on a webpage, and have a optional toast for macro recording when you press the hotkey"

- Changelog: [CHANGELOG-0.60.58.md](CHANGELOG-0.60.58.md) — 0.60.58 - 2026-10-15
- Commit: `05f0153e`
- 1 commit(s):

  - `05f0153e` 2026-10-15 20:20 — 0.60.58: macro guide in Settings, optional hotkey toast, hotkey stop saves a macro
    9 file(s), +76 −10; systems: clear-glass, docs, lib, root
    `CHANGELOG-0.60.58.md` · `clear-glass/package.json` · `clear-glass/renderer/browser.js` · `clear-glass/renderer/settings/sections/macros.js` · `clear-glass/src/options/store.js` · `clear-glass/test/macros-guide.test.js` · `docs/2026-10-15-macro-node-recording-phasemap.spec` · `lib/version.js` · `package.json`

## 0.60.57 — 2026-10-15

James — "this is wrong... needs to start recording a macro node file. i was saying the whole process of the chat listener.. like expand the automation and macros."

- Changelog: [CHANGELOG-0.60.57.md](CHANGELOG-0.60.57.md) — 0.60.57 - 2026-10-15
- Commit: `18e65281`
- 1 commit(s):

  - `18e65281` 2026-10-15 20:04 — 0.60.57: Record a macro writes a live .macro node file; scroll/paging keys, waits, navigation; map for macros as control plane (MR7-MR14)
    14 file(s), +435 −26; systems: clear-glass, docs, lib, loom, root, tests
    `CHANGELOG-0.60.57.md` · `clear-glass/renderer/settings/sections/macros.js` · `clear-glass/src/ipc/bridge.js` · `clear-glass/src/macros/live-recording.js` · `clear-glass/src/macros/recorder-script.js` · `clear-glass/src/macros/recording.js` · `clear-glass/src/preload/index.js` · `docs/2026-10-15-macro-node-recording-phasemap.spec` · `docs/SPEC-REGISTRY.spec` · `lib/version.js` · `loom/maps/run-state-map.js` · `package.json` · … 2 more

## 0.60.56 — 2026-10-15

James — "use erosmanceros, scroll slowly, using the arrow keys or something, could also make it a macro and or automation in clearglass, a good way to test them"

- Changelog: [CHANGELOG-0.60.56.md](CHANGELOG-0.60.56.md) — 0.60.56 - 2026-10-15
- Commit: `77c45c31`
- 1 commit(s):

  - `77c45c31` 2026-10-15 19:46 — 0.60.56: scroll_until step (ErosmancerOS wheel, arrow keys), real-key press, Read-one-chat template
    10 file(s), +198 −6; systems: clear-glass, docs, lib, root, tests
    `CHANGELOG-0.60.56.md` · `clear-glass/src/automation/steps.js` · `clear-glass/src/automation/templates.js` · `clear-glass/src/mesh/automation-engine.js` · `docs/2026-10-15-personal-chat-import-phasemap.spec` · `lib/chat-crawl-settings.js` · `lib/version.js` · `package.json` · `tests/modules/run-all.js` · `tests/modules/test-scroll-until.test.js`

## 0.60.55 — 2026-10-15

James — "i dont [want] anything missed. then it only logs the chaturl once unless it has new data, maybe check the previous chat url once, but use it as an edge for a stopping point for catching up. … make sure you add extensive settings for all of this"

- Changelog: [CHANGELOG-0.60.55.md](CHANGELOG-0.60.55.md) — 0.60.55 - 2026-10-15
- Commit: `5e1b9e93`
- 1 commit(s):

  - `5e1b9e93` 2026-10-15 19:34 — 0.60.55: personal-chat crawl plan and 39 settings (Settings -> Chat capture)
    17 file(s), +530 −4; systems: clear-glass, docs, lib, loom, root, tests
    `CHANGELOG-0.60.55.md` · `clear-glass/package.json` · `clear-glass/renderer/settings.html` · `clear-glass/renderer/settings/sections/chats.css` · `clear-glass/renderer/settings/sections/chats.js` · `clear-glass/src/ipc/bridge.js` · `clear-glass/src/preload/index.js` · `clear-glass/test/chats-settings.test.js` · `docs/2026-10-15-personal-chat-import-phasemap.spec` · `docs/PROOF-OF-COMPETENCY.md` · `lib/chat-crawl-plan.js` · `lib/chat-crawl-settings.js` · … 5 more

## 0.60.54 — 2026-10-15

James — "can you make all pop ups from clear glass look like this" · "consolidate the provider and accounts settings sections" · "see? why the repitition?"

- Changelog: [CHANGELOG-0.60.54.md](CHANGELOG-0.60.54.md) — 0.60.54 - 2026-10-15
- Commit: `e9615aaa`
- 5 commit(s):

  - `e9615aaa` 2026-10-15 19:30 — 0.60.54: dark frame for every popup; Providers & accounts is one section
    18 file(s), +213 −121; systems: clear-glass, lib, root
    `CHANGELOG-0.60.54.md` · `clear-glass/package.json` · `clear-glass/renderer/settings/core.js` · `clear-glass/renderer/settings/sections/accounts.css` · `clear-glass/renderer/settings/sections/accounts.js` · `clear-glass/renderer/settings/sections/automation.js` · `clear-glass/renderer/settings/sections/mesh.js` · `clear-glass/renderer/settings/sections/providers.js` · `clear-glass/src/accounts/login-portal.js` · `clear-glass/src/main/compartment-window.js` · `clear-glass/src/main/index.js` · `clear-glass/src/main/window-frame.js` · … 6 more
  - `06589849` 2026-10-15 19:25 — Addend the chat import map: background crawler and links
    1 file(s), +29 −1; systems: docs
    `docs/2026-10-15-personal-chat-import-phasemap.spec`
  - `5199fccd` 2026-10-15 19:22 — Correct the chat import map: the DOM-mutation chat ledger already exists
    1 file(s), +12 −0; systems: docs
    `docs/2026-10-15-personal-chat-import-phasemap.spec`
  - `08bc644c` 2026-10-15 19:21 — Addend the chat import map: sync, Firefox script, measured patterns
    1 file(s), +33 −1; systems: docs
    `docs/2026-10-15-personal-chat-import-phasemap.spec`
  - `0c5f6b74` 2026-10-15 19:17 — Map the personal chat importer, listener and person-model pass (no code)
    2 file(s), +92 −0; systems: docs
    `docs/2026-10-15-personal-chat-import-phasemap.spec` · `docs/SPEC-REGISTRY.spec`

## 0.60.53 — 2026-10-15

James — "can you create a ledger for anything you can log thats useful for fiverr, that you can verify for a fact? like i want to keep a record overtime. like anything that slots to a gig template. to automate. you can have the agents also have a listener for that?"

- Changelog: [CHANGELOG-0.60.53.md](CHANGELOG-0.60.53.md) — 0.60.53 - 2026-10-15
- Commit: `9e94dd22`
- 2 commit(s):

  - `9e94dd22` 2026-10-15 19:09 — 0.60.53: Fiverr claim ledger with verifiable evidence, agent-run listener
    12 file(s), +271 −2; systems: docs, lib, loom, root, tests
    `CHANGELOG-0.60.53.md` · `docs/2026-10-15-fiverr-ledger-phasemap.spec` · `docs/SPEC-REGISTRY.spec` · `lib/gig-ledger-listener.js` · `lib/gig-ledger.js` · `lib/repo-agent.js` · `lib/test-sandbox.js` · `lib/version.js` · `loom/maps/run-state-map.js` · `package.json` · `tests/modules/run-all.js` · `tests/modules/test-gig-ledger.test.js`
  - `bff89804` 2026-10-15 19:03 — Map the portfolio section, popup frame and settings merge (no code)
    2 file(s), +100 −0; systems: docs
    `docs/2026-10-15-clear-glass-surfaces-phasemap.spec` · `docs/SPEC-REGISTRY.spec`

## 0.60.52 — 2026-10-15

James — "i cant click the login on the popup for chatgpt. just chat gpt." · "most of the tool bar things dont work. and the ones that do look terrible. can you fix that?"

- Changelog: [CHANGELOG-0.60.52.md](CHANGELOG-0.60.52.md) — 0.60.52 - 2026-10-15
- Commit: `b25b5fb8`
- 1 commit(s):

  - `b25b5fb8` 2026-10-15 19:02 — 0.60.52: ChatGPT login click not bounced; toolbar pins apply live, buttons restyled
    11 file(s), +84 −4; systems: clear-glass, lib, root, tests
    `CHANGELOG-0.60.52.md` · `clear-glass/renderer/browser.css` · `clear-glass/renderer/browser.js` · `clear-glass/src/ipc/bridge.js` · `clear-glass/src/preload/index.js` · `clear-glass/src/providers/attention.js` · `lib/version.js` · `package.json` · `tests/modules/run-all.js` · `tests/modules/test-cg-attention-focus.test.js` · `tests/modules/test-cg-toolbar-live.test.js`

## 0.60.51 — 2026-10-15

James — (a screenshot of Google's sign-in window: "We've detected a problem with your cookie settings.") "can you fix this."

- Changelog: [CHANGELOG-0.60.51.md](CHANGELOG-0.60.51.md) — 0.60.51 - 2026-10-15
- Commit: `e393b204`
- 6 commit(s):

  - `e393b204` 2026-10-15 18:49 — 0.60.51: Google sign-in window "problem with your cookie settings" — nothing else touches the jar while it is open
    9 file(s), +177 −15; systems: clear-glass, lib, root
    `CHANGELOG-0.60.51.md` · `clear-glass/package.json` · `clear-glass/src/accounts/login-portal.js` · `clear-glass/src/cookies/session-hub.js` · `clear-glass/src/main/index.js` · `clear-glass/src/providers/account-switch.js` · `clear-glass/test/signin-window-quiet.test.js` · `lib/version.js` · `package.json`
  - `a6366bb8` 2026-10-15 18:42 — 0.60.50: run-pipeline test through the real dispatch, sandbox the run store, phase census
    6 file(s), +227 −0; systems: docs, lib, root, tests
    `CHANGELOG-0.60.50.md` · `docs/2026-10-15-gate-held-work-phasemap.spec` · `docs/PHASE-CENSUS-2026-10-15.md` · `lib/test-sandbox.js` · `tests/modules/run-all.js` · `tests/modules/test-run-pipeline.test.js`
  - `7b6f42f3` 2026-10-15 18:34 — docs: GW12 amended (minimal layered test environment), GW22 find before generate, GW23 wire what exists
    2 file(s), +64 −3; systems: docs
    `docs/2026-10-15-gate-held-work-phasemap.spec` · `docs/SPEC-REGISTRY.spec`
  - `2744c364` 2026-10-15 18:28 — docs: fix line breaks in the GW build-order reason
    1 file(s), +2 −1; systems: docs
    `docs/2026-10-15-gate-held-work-phasemap.spec`
  - `bea49d04` 2026-10-15 18:28 — docs: map the agents' test environment (GW11-GW18) — snapshot per gate, optional desktop, SSH door, copy-in/diff-out, every file tested, parallel branches, friction, bisect
    2 file(s), +142 −5; systems: docs
    `docs/2026-10-15-gate-held-work-phasemap.spec` · `docs/SPEC-REGISTRY.spec`
  - `8941db98` 2026-10-15 18:24 — docs: map gate-held work (GW1-GW10) — the baton, contract tracing, copilot on gates, failure macro + rewind, causal graph
    2 file(s), +248 −0; systems: docs
    `docs/2026-10-15-gate-held-work-phasemap.spec` · `docs/SPEC-REGISTRY.spec`

## 0.60.50 — 2026-10-15

James — "i feel lime also needs to use the gates to maintain persistence using the memory. so we can use nexus for the workload, instead of relying on the agents to remember." · "i want it to start exactly where it left off if it restarts." · "need the full pipeline working."

- Changelog: [CHANGELOG-0.60.50.md](CHANGELOG-0.60.50.md) — 0.60.50 - 2026-10-15
- Commit: `80e19061`
- 3 commit(s):

  - `80e19061` 2026-10-15 18:20 — 0.60.50 — CE1–CE5 + CE10: Nexus holds the run, not the agent
    33 file(s), +806 −29; systems: clear-glass, copilot, docs, guardian, idearium, lib, loom, root, tests
    `CHANGELOG-0.60.50.md` · `clear-glass/renderer/library/sections/responses.css` · `clear-glass/renderer/library/sections/responses.js` · `clear-glass/src/downloads/artifact-chat-index.js` · `copilot/server.js` · `copilot/tool-runtime.js` · `docs/2026-10-05-code-tab-and-one-router-phasemap.spec` · `docs/2026-10-15-automatic-tracking-phasemap.spec` · `docs/2026-10-15-code-tab-run-state-phasemap.spec` · `docs/PROOF-OF-COMPETENCY.md` · `guardian/ask.js` · `guardian/event-taxonomy.js` · … 21 more
  - `3fbfd372` 2026-10-15 17:59 — docs: add CV1-CV6 (one Manage+History menu, version per diff, file/run rewind, tagged + universal versioning, phases in Idearium); declare systems on every phase
    2 file(s), +92 −2; systems: docs
    `docs/2026-10-15-code-tab-run-state-phasemap.spec` · `docs/SPEC-REGISTRY.spec`
  - `bdf11e25` 2026-10-15 17:57 — docs: map the Code tab run state (CE1-CE12), registered in SPEC-REGISTRY
    2 file(s), +197 −0; systems: docs
    `docs/2026-10-15-code-tab-run-state-phasemap.spec` · `docs/SPEC-REGISTRY.spec`

## 0.60.49 — 2026-10-15

James — "should we have each module or capability specced. … like specs can reduce surface area, then the phases also. like i want the specs to be like new features or capabilities to the project." · "what about a semantic tree for our own browser agent?" · "start CS1 and SP1"

- Changelog: [CHANGELOG-0.60.49.md](CHANGELOG-0.60.49.md) — 0.60.49 — 2026-10-15
- Commit: `60497c2e`
- 2 commit(s):

  - `60497c2e` 2026-10-15 13:50 — CS1 + SP1: capability specs whose surface is the gate; the page as a semantic tree; spec gaps to intelligence (0.60.49)
    17 file(s), +24774 −1175; systems: clear-glass, docs, intelligence, lib, loom, orchestrator, root, tests
    `CHANGELOG-0.60.49.md` · `clear-glass/spec/semantic-tree.spec` · `clear-glass/src/copilot/bridge.js` · `clear-glass/src/copilot/tools.js` · `clear-glass/src/driver/index.js` · `clear-glass/src/page/semantic-tree.js` · `docs/2026-10-15-capability-specs-and-semantic-page-tree-phasemap.spec` · `intelligence/gap/predicate.js` · `lib/agent-tools/tools/clear-glass/browser.js` · `lib/version.js` · `loom/data/events.json` · `loom/data/registry.json` · … 5 more
  - `ce1f8a58` 2026-10-15 13:35 — CS1: capability specs whose surface is the gate; CK-254 spec surface; spec-drift reports surfaces (WIP 0.60.49)
    9 file(s), +321 −3; systems: cos, lib, orchestrator, tests
    `cos/spec/check-catalogue.spec` · `lib/capability-spec.js` · `lib/check-catalogue.js` · `lib/checks/ck-254-surface.js` · `lib/spec/capability-spec.spec` · `orchestrator/lib/spec-drift.js` · `tests/modules/run-all.js` · `tests/modules/test-capability-spec.test.js` · `tests/modules/test-check-catalogue.test.js`

## 0.60.48 — 2026-10-15

James — "im so sick of zips" · "how will it link to github?"

- Changelog: [CHANGELOG-0.60.48.md](CHANGELOG-0.60.48.md) — 0.60.48 — 2026-10-15
- Commit: `8aa4dddb`
- 1 commit(s):

  - `8aa4dddb` 2026-10-15 13:26 — npm run update: the latest Nexus without a zip (0.60.48)
    7 file(s), +185 −2; systems: docs, lib, root, scripts, tests
    `CHANGELOG-0.60.48.md` · `docs/2026-10-13-gates-that-learn-and-priorities-phasemap.spec` · `lib/version.js` · `package.json` · `scripts/update.js` · `tests/modules/run-all.js` · `tests/modules/test-update-script.test.js`
