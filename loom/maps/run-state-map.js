'use strict';
/**
 * loom/maps/run-state-map.js — §0.60.50 CE1–CE5 + CE10: the edges the source scanner cannot read in the run state
 * (docs/2026-10-15-code-tab-run-state-phasemap.spec). lib/run-state.js is reached by lazy require() inside functions
 * (the scanner reads top-level requires), and the copilot loop reaches the agent over HTTP, so these are hand-mapped.
 * comp_id: nexus.loom.maps.run-state
 */
const { idFor } = require('../scanners/source-map');
const { declareMap } = require('./declare-map');
const I = (rel) => idFor(rel);

const FILES = [
  ['lib/run-state.js',   I('lib/run-state.js'),   [I('lib/node-export.js'), I('nexus/nexus-bus.js')]],
  ['lib/reply-kind.js',  I('lib/reply-kind.js'),  [I('lib/step-gate.js')]],
  ['lib/gig-ledger.js',  I('lib/gig-ledger.js'),  []],   // §0.60.53 PF0
  ['lib/checks/ck-248-toolchain.js', I('lib/checks/ck-248-toolchain.js'), []],   // §0.60.77 MB5: 18 languages, each by its own parser; selfTest/coverage/checkText
  ['lib/test-map.js', I('lib/test-map.js'), []],   // §0.60.75 PE1: which tests exercise a file (direct links, by how)
  ['lib/proposal-evidence.js', I('lib/proposal-evidence.js'), [I('lib/test-map.js'), I('lib/step-gate.js'), I('lib/repo-inject.js')]],   // §0.60.75 PE2
  ['lib/chat-crawl-settings.js', I('lib/chat-crawl-settings.js'), []],   // §0.60.55 PI5
  ['lib/chat-crawl-plan.js', I('lib/chat-crawl-plan.js'), [I('lib/chat-crawl-settings.js')]],
  ['clear-glass/src/chats/crawler.js', I('clear-glass/src/chats/crawler.js'), [I('lib/chat-crawl-plan.js'), I('lib/chat-crawl-settings.js')]],   // §0.60.84 PI5
  ['clear-glass/src/chats/ports.js', I('clear-glass/src/chats/ports.js'), [I('clear-glass/src/downloads/chat-ledger.js')]],   // §0.60.85 PI5b
  ['clear-glass/src/chats/service.js', I('clear-glass/src/chats/service.js'), [I('clear-glass/src/chats/crawler.js'), I('clear-glass/src/chats/ports.js'), I('lib/chat-crawl-settings.js')]],
  ['cos/app/store.js', I('cos/app/store.js'), [I('lib/zip.js'), I('lib/release-version.js')]],   // §0.60.87 COSA1; 0.60.111 names a zip from its contents
  ['cos/app/runtime.js', I('cos/app/runtime.js'), []],   // §0.60.88 COSA2/3
  ['cos/app/switch.js', I('cos/app/switch.js'), [I('cos/app/store.js'), I('cos/app/runtime.js')]],   // §0.60.88 COSA4
  ['clear-glass/src/releases/deliver.js', I('clear-glass/src/releases/deliver.js'), []],   // §0.60.93 COSA7
  ['clear-glass/src/releases/service.js', I('clear-glass/src/releases/service.js'), [I('clear-glass/src/releases/deliver.js'), I('cos/app/store.js')]],
  ['cos/app/shell.js', I('cos/app/shell.js'), [I('cos/app/store.js'), I('cos/app/runtime.js'), I('cos/app/cli.js')]],   // §0.60.91 CON-lite
  ['cos/app/settings.js', I('cos/app/settings.js'), []],   // §0.60.90 COSA12/13
  ['cos/app/controller.js', I('cos/app/controller.js'), [I('cos/app/store.js'), I('cos/app/runtime.js'), I('cos/app/switch.js'), I('cos/app/settings.js')]],   // §0.60.89 COSA6
  ['cos/app/desktop/main.js', I('cos/app/desktop/main.js'), [I('cos/app/controller.js'), I('cos/app/store.js'), I('cos/app/settings.js'), I('cos/app/shell.js')]],
  ['cos/app/desktop/preload.js', I('cos/app/desktop/preload.js'), []],
  ['cos/app/desktop/ui/app.js', I('cos/app/desktop/ui/app.js'), []],
  ['scripts/build-cos-app.js', I('scripts/build-cos-app.js'), [I('cos/app/controller.js'), I('lib/zip.js')]],
  ['cos/app/cli.js', I('cos/app/cli.js'), [I('cos/app/store.js'), I('cos/app/runtime.js'), I('cos/app/switch.js')]],
  ['clear-glass/src/macros/recorder-script.js', I('clear-glass/src/macros/recorder-script.js'), []],   // §0.60.57 MR1
  ['clear-glass/src/macros/live-recording.js', I('clear-glass/src/macros/live-recording.js'), [I('clear-glass/src/macros/recorder-script.js'), I('clear-glass/src/macros/recording.js'), I('clear-glass/src/automation/nodes.js')]],
  ['clear-glass/src/net/policy.js', I('clear-glass/src/net/policy.js'), []],   // §0.60.60 NP2
  ['clear-glass/src/net/transport-host.js', I('clear-glass/src/net/transport-host.js'), []],   // §0.60.60 NP1
  ['clear-glass/src/net/service.js', I('clear-glass/src/net/service.js'), [I('clear-glass/src/net/policy.js'), I('clear-glass/src/net/transport-host.js')]],
  ['lib/agent-tools/tools/clear-glass/net.js', I('lib/agent-tools/tools/clear-glass/net.js'), []],   // §0.60.60 NP9: read-only agent view
  ['clear-glass/src/net/installer.js', I('clear-glass/src/net/installer.js'), [I('clear-glass/src/releases/deliver.js')]],   // §0.60.168 Tor Expert Bundle setup (his upload, mapped 0.60.178)
  ['clear-glass/src/net/bridge-sources.js', I('clear-glass/src/net/bridge-sources.js'), [I('clear-glass/src/net/installer.js')]],   // §0.60.178 SF2 real bridge lines (Tor Browser, bundle, package example; Tor Project only when asked)
  ['clear-glass/src/net/https-only.js', I('clear-glass/src/net/https-only.js'), []],   // §0.60.178 SF4 his "optional encryption" (reading): http upgraded or refused in routed windows
  ['clear-glass/src/net/compartment.js', I('clear-glass/src/net/compartment.js'), []],   // §0.60.178 SF3 a routed window is one in-memory compartment, page and shell
  ['clear-glass/src/plugins/context-items.js', I('clear-glass/src/plugins/context-items.js'), []],   // §0.60.169 the display half of 'context-menu-item' (his upload, mapped 0.60.178)
  ['clear-glass/plugins/snowflake/index.js', I('clear-glass/plugins/snowflake/index.js'), []],   // §0.60.169 NP11/NP12 "Open link with Snowflake": emits net.open on the bus, decides nothing
  ['clear-glass/src/net/magnet.js', I('clear-glass/src/net/magnet.js'), []],   // §0.60.179 CD1 a magnet link parsed, pure
  ['clear-glass/src/net/quarantine.js', I('clear-glass/src/net/quarantine.js'), [I('clear-glass/src/net/magnet.js')]],   // §0.60.179 CD2 the compartment's download manager
  ['clear-glass/src/net/qbittorrent.js', I('clear-glass/src/net/qbittorrent.js'), []],   // §0.60.179 CD3 the verified torrent hand-off (MR12)
  ['clear-glass/src/net/kill-switch.js', I('clear-glass/src/net/kill-switch.js'), []],   // §0.60.179 CD4 kill on disconnect
  ['clear-glass/src/import/firefox.js', I('clear-glass/src/import/firefox.js'), []],   // §0.60.179 BS1 Firefox profiles, cookies, bookmarks, persona (node:sqlite)
  ['clear-glass/src/main/float-cli.js', I('clear-glass/src/main/float-cli.js'), []],
  ['clear-glass/src/adblock/engine.js', I('clear-glass/src/adblock/engine.js'), []],   // §0.60.183 AB1 filter lists parsed, requests matched, element hiding (pure)
  ['clear-glass/src/adblock/lists.js', I('clear-glass/src/adblock/lists.js'), [I('clear-glass/src/adblock/engine.js')]],   // §0.60.183 AB2 the lists, state, store; the one service
  ['clear-glass/plugins/adblocker/index.js', I('clear-glass/plugins/adblocker/index.js'), [I('clear-glass/src/adblock/engine.js'), I('clear-glass/src/adblock/lists.js')]],   // §0.60.183 AB3 the Ad Blocker plugin asks the service
  ['clear-glass/src/adblock/import.js', I('clear-glass/src/adblock/import.js'), [I('clear-glass/src/adblock/engine.js')]],   // §0.60.184 AB5 his own lists: files, folders, host lists
  ['clear-glass/src/net/host-import.js', I('clear-glass/src/net/host-import.js'), [I('clear-glass/src/adblock/import.js')]],   // §0.60.184 SF8 host lists as routes through Snowflake
  ['clear-glass/plugins/snowflake/index.js', I('clear-glass/plugins/snowflake/index.js'), [I('clear-glass/src/net/service.js'), I('clear-glass/src/net/host-import.js')]],   // §0.60.184 SF8 the Snowflake plugin's page
  ['clear-glass/src/accounts/for-site.js', I('clear-glass/src/accounts/for-site.js'), [I('clear-glass/src/copilot/context-need.js')]],   // §0.60.185 BS20 the accounts signed in to a site
  ['clear-glass/src/passwords/service.js', I('clear-glass/src/passwords/service.js'), []],   // §0.60.186 PW1 pending logins, offers, exact-origin fill, linkPending (vault passed in)
  ['clear-glass/src/preload/passwords.js', I('clear-glass/src/preload/passwords.js'), []],   // §0.60.186 PW2 the page script on every session
  ['clear-glass/src/main/passwords-wiring.js', I('clear-glass/src/main/passwords-wiring.js'), []],   // §0.60.186 PW3 pages ↔ service ↔ window
  ['clear-glass/renderer/shell/passwords.js', I('clear-glass/renderer/shell/passwords.js'), []],   // §0.60.186 PW4 the key and its panel
  ['clear-glass/src/core/zoom.js', I('clear-glass/src/core/zoom.js'), []],
  ['clear-glass/src/site-settings/store.js', I('clear-glass/src/site-settings/store.js'), []],   // the per-origin store (JAA KV cg_site_settings); declared with SP1, 0.60.215
  ['clear-glass/src/site-settings/keys.js', I('clear-glass/src/site-settings/keys.js'), []],   // §0.60.215 SP1 the per-site keys every feature reads (one table)
  ['clear-glass/src/site-settings/profile.js', I('clear-glass/src/site-settings/profile.js'), [I('clear-glass/src/site-settings/keys.js'), I('clear-glass/src/net/policy.js')]],   // §0.60.215 SP1 siteProfile(url): site, else global, else default; the route a netPolicy rule   // §0.60.183 BS14 page zoom in the core: Firefox's ladder, saved per site
  ['clear-glass/renderer/processes.js', I('clear-glass/renderer/processes.js'), []],   // §0.60.220 SP6 the Processes window (Shift+Esc, ☰, Tools)
  ['clear-glass/src/processes/index.js', I('clear-glass/src/processes/index.js'), []],   // §0.60.219 SP5 what is running (metrics joined to pages) and the activity ring
  ['clear-glass/renderer/settings/sections/driver.js', I('clear-glass/renderer/settings/sections/driver.js'), []],   // §0.60.218 SP4 Settings › ClearDriver (options driver.*)
  ['clear-glass/renderer/settings/sections/guardian.js', I('clear-glass/renderer/settings/sections/guardian.js'), []],   // §0.60.218 SP4 Settings › Guardian (options guardian.*, listenerDecay)
  ['clear-glass/renderer/site-profile-groups.js', I('clear-glass/renderer/site-profile-groups.js'), []],   // §0.60.217 SP3 one site's settings by feature, drawn from the key table (popup + Settings › Sites)
  ['clear-glass/src/site-settings/readers.js', I('clear-glass/src/site-settings/readers.js'), []],   // §0.60.216 SP2 each feature's hook onto the one resolver (installed by main)
  ['clear-glass/src/rewind/resume.js', I('clear-glass/src/rewind/resume.js'), [I('clear-glass/src/rewind/engine.js')]],   // §0.60.216 SP2 a site's resume state: kept by the page, put back on the revisit
  ['clear-glass/renderer/shell/ctxmenu.js', I('clear-glass/renderer/shell/ctxmenu.js'), []],   // §0.60.183 BS15 the right-click menu: rows by what was clicked, placed at the pointer
  ['clear-glass/src/copilot/context-need.js', I('clear-glass/src/copilot/context-need.js'), []],   // §0.60.182 BS12 what a message needs from the page (wired late, 0.60.183)
  ['lib/agent-tools/tools/clear-glass/adblock.js', I('lib/agent-tools/tools/clear-glass/adblock.js'), [I('lib/agent-tools/tools/clear-glass/net.js')]],   // §0.60.183 AB4 the blocker for agents   // §0.60.179 BS6 the floating CLI's own content-protected window
  ['clear-glass/renderer/shell/menus.js', I('clear-glass/renderer/shell/menus.js'), []],   // §0.60.179 BS3 menu bar + ☰ from one model
  ['clear-glass/renderer/shell/extensions.js', I('clear-glass/renderer/shell/extensions.js'), []],   // §0.60.179 BS4 🧩 plugins with icons
  ['clear-glass/renderer/shell/downloads.js', I('clear-glass/renderer/shell/downloads.js'), []],   // §0.60.179 BS5 ⬇ panel (the Library's store + the quarantine)
  ['clear-glass/renderer/shell/shell.js', I('clear-glass/renderer/shell/shell.js'), []],   // §0.60.179 BS2/BS6 popovers, identity, shortcuts, float CLI button
  ['clear-glass/renderer/float-cli.js', I('clear-glass/renderer/float-cli.js'), []],   // §0.60.179 BS6 the floating CLI page
  ['clear-glass/src/driver/cg-stub.js', I('clear-glass/src/driver/cg-stub.js'), []],   // §0.60.179 test-only window.ClearGlass from the preload's namespaces
  ['clear-glass/renderer/shell/icons.js', I('clear-glass/renderer/shell/icons.js'), []],   // §0.60.180 BS8 the drawn icon set (no emoji, no font)
  ['clear-glass/renderer/shell/agents.js', I('clear-glass/renderer/shell/agents.js'), []],   // §0.60.180 BS9 Guardian's agents in one place
  ['clear-glass/renderer/shell/newtab.js', I('clear-glass/renderer/shell/newtab.js'), []],   // §0.60.180 BS10 the start page over a blank tab
  ['lib/agent-tools/tools/clear-glass/firefox.js', I('lib/agent-tools/tools/clear-glass/firefox.js'), [I('lib/agent-tools/tools/clear-glass/net.js')]],   // §0.60.179 BS7 profiles listed for agents
  ['idearium/lib/surface-state.cjs', I('idearium/lib/surface-state.cjs'), [I('idearium/lib/data-dir.cjs')]],   // §0.60.80 CE8: the Code tab's surface, one for the tab, the CLI and agents
  ['cos/archetype/eravos.js', I('cos/archetype/eravos.js'), []],   // §0.60.104 CN1/CN2: his ERAVOS canvas, tools and domains as COS archetypes (read from cos/archetype/eravos-*/)
  ['lib/canvas-compartments.js', I('lib/canvas-compartments.js'), [I('lib/cos-bridge.js'), I('lib/file-tree-plan.js'), I('cos/archetype/eravos.js')]],   // §0.60.104 CN3: a canvas compartment, each tool nested
  ['clear-glass/src/contexts/google-signin.js', I('clear-glass/src/contexts/google-signin.js'), [I('clear-glass/src/contexts/session-headers.js'), I('clear-glass/src/fingerprint/firefox-version.js'), I('clear-glass/src/preload/google-signin.js')]],
  ['clear-glass/src/fingerprint/firefox-version.js', I('clear-glass/src/fingerprint/firefox-version.js'), []],   // §0.60.108 GS3: the Firefox version from Mozilla's calendar
  ['clear-glass/src/preload/google-signin.js', I('clear-glass/src/preload/google-signin.js'), []],   // §0.60.108 GS4: the sign-in page reads as Firefox, no debugger   // §0.60.106 GS1: Google's sign-in as Firefox, consistently
  ['clear-glass/src/tls/helper.js', I('clear-glass/src/tls/helper.js'), []],   // §0.60.109 TLS2: runs cg-tls-helper (clear-glass/tls-helper, Go + uTLS); its CA trust for personas
  ['lib/gig-ledger-listener.js', I('lib/gig-ledger-listener.js'), [I('lib/gig-ledger.js'), I('lib/run-state.js'), I('nexus/nexus-bus.js')]],
  ['lib/repo-procedures.js', I('lib/repo-procedures.js'), [I('lib/node-export.js'), I('lib/run-state.js'), I('idearium/lib/data-dir.cjs')]],   // §0.60.118 DK1: .procedure files, replayed through an injected tool runner
  ['idearium/ui/js/ui-editor-doc.js', I('idearium/ui/js/ui-editor-doc.js'), []],   // §0.60.122 UE1: the page ↔ editor round trip (pure)
  ['idearium/ui/js/ui-editor.js', I('idearium/ui/js/ui-editor.js'), [I('idearium/ui/js/ui-editor-doc.js')]],   // §0.60.122 UE1: the editor page on vendored GrapesJS (idearium/ui/vendor/grapesjs, BSD-3-Clause)
  ['lib/system-boundary.js', I('lib/system-boundary.js'), []],
  ['lib/data-home.js', I('lib/data-home.js'), [I('lib/system-registry.js'), I('lib/data-clearup.js'), I('lib/test-sandbox.js'), I('lib/version.js')]],   // §0.60.207 DL2 one resolver; each system brings its own data home at boot
  ['lib/data-clearup.js', I('lib/data-clearup.js'), []],   // §0.60.177 DL0/DL1 census + clear-up tool; its rules are docs/data-layout.spec ownership: (read at run time, not a require)
  ['idearium/spec-compiler/compiler/phase-specs.js', I('idearium/spec-compiler/compiler/phase-specs.js'), [I('idearium/spec-compiler/compiler/kg-builder.js'), I('lib/phase-dag.js'), I('lib/phase-graph.js'), I('lib/phase-map-auto.js'), I('lib/pipeline-nodes.js'), I('lib/phase-plan.js')]],   // §0.60.176 PS1 each phase specced again: .phase + .graph (dag slice) beside its owner
  ['lib/spec-compiler-port.js', I('lib/spec-compiler-port.js'), [I('lib/nexus-self/systems.js')]],   // 0.60.239 EW2 the kernel's one door to Idearium's spec compiler (in-process when provided, else its route)
  ['lib/raid-port.js', I('lib/raid-port.js'), [I('lib/nexus-self/systems.js')]],   // 0.60.240 GD1 the one door to RAID for every system that is not Cortex (in-process when provided, else Cortex's routes)
  ['lib/upload-placement.js', I('lib/upload-placement.js'), []],   // §0.60.173 UP1/UP2 a zip's files placed against a repo (strip, exists, same bytes, folders, intent, his learned rules); requires/requiredBy
  ['idearium/ui/js/upload-intent.js', I('idearium/ui/js/upload-intent.js'), [I('idearium/ui/js/code-tab-panels.js')]],   // §0.60.173 UP4 the Code tab's upload panel (page globals: CX, _cxPaintPanel, api)
  ['lib/phase-dag.js', I('lib/phase-dag.js'), [I('loom/scanners/phasemap-map.js')]],   // §0.60.172 DG3 the whole DAG of every phasemap
  ['lib/verify-first.js', I('lib/verify-first.js'), [I('lib/phase-plan.js'), I('cos/testenv/run-target.js')]],   // §0.60.171 VF1 a file checked as it is, no model, before any agent
  ['lib/coder-brief.js', I('lib/coder-brief.js'), [I('lib/verify-first.js')]],   // §0.60.171 CB1 Gemini's five-part brief with AXIOMS v3.1
  ['lib/agent-self-model.js', I('lib/agent-self-model.js'), []],   // §0.60.171 SM1 each agent's model of itself; interrogation → proposals
  ['lib/safe-watch.js', I('lib/safe-watch.js'), []],   // §0.60.170 RC1: an fs.watch whose async EPERM cannot take the process down; re-arms
  ['lib/phase-census.js', I('lib/phase-census.js'), [I('lib/phase-dag.js')]],
  ['lib/build-queue.js', I('lib/build-queue.js'), [I('lib/phase-dag.js')]],
  ['lib/phase-close.js', I('lib/phase-close.js'), [I('lib/test-map.js')]],
  ['lib/trust-rule.js', I('lib/trust-rule.js'), []],
  ['lib/registry-draft.js', I('lib/registry-draft.js'), [I('lib/system-boundary.js')]],
  ['cos/services/anonymous/nexus.js', I('cos/services/anonymous/nexus.js'), []],   // 0.60.235 SV0 his engines' kernel in COS (spawns engines/<name>.js by name, newline-JSON IPC)   // 0.60.229 DB16 a registry drafted for every system with none   // 0.60.225 SL5 his rule for what lands without him (B, his words: "yes do it.")
  ['idearium/lib/autobuild.js', I('idearium/lib/autobuild.js'), []],   // 0.60.225 SL4 the loop: a state machine, every effect a dep   // 0.60.223 SL1 closes a proven, landed phase; 0.60.224 SL2 byEvidence (its own tests, through lib/test-map.js)   // 0.60.223 SL1 a proven, landed phase closes itself; a revert reopens it (the writer is passed in)   // 0.60.222 SL0 what can be built now, and why every other open phase cannot
  ['lib/change-entry.js', I('lib/change-entry.js'), [I('lib/nexus-self/inject-gate.js')]],
  ['lib/chat-ledger-client.js', I('lib/chat-ledger-client.js'), []],   // 0.60.192 Clear Glass's live chat ledgers read through its routes (:7702), never its code   // 0.60.190 APV1 an approved change's change-log entry (it rides on its Versionium commit)   // 0.60.188 CNS1 every phase judged against its evidence (commits, releases, files, proof)
  ['lib/path-guard.js', I('lib/path-guard.js'), []],   // §0.60.170 RC4: a file name from an agent's reply is checked (chat label, cut short, prose) before it is written
  ['lib/system-shape.js', I('lib/system-shape.js'), []],   // §0.60.138 does a system match genesis, role by role
  ['diagnostic/cli.js', I('diagnostic/cli.js'), [I('diagnostic/registry-components.js'), I('diagnostic/config.js')]],   // §0.60.138 diagnostic's genesis cli
  ['diagnostic/server.js', I('diagnostic/server.js'), [I('diagnostic/nexus-diagnostic.js')]],   // §0.60.138 diagnostic's genesis entry
  ['loom/templates/cos-compartment.js', I('loom/templates/cos-compartment.js'), [I('lib/system-registry.js'), I('lib/system-boundary.js'), I('lib/cos-bridge.js')]],   // §0.60.134 the template for each system's COS compartment
  ['lib/system-store.js', I('lib/system-store.js'), [I('lib/jaa-store.js')]],   // §0.60.133 IM6: a system's own database, its tables brought home from cortex's once
  ['lib/node-registry.js', I('lib/node-registry.js'), [I('lib/jaa-store.js'), I('lib/node-index.js'), I('lib/node-export.js'), I('lib/node-schemas.js')]],   // §0.60.130 P33a: any system's node registry into its own store, with the history and the listener
  ['lib/jaa-store.js', I('lib/jaa-store.js'), []],   // §0.60.130: moved from guardian/jaa-store.js (re-exported there) — the kernel's store
  ['lib/system-registry.js', I('lib/system-registry.js'), [I('lib/component-registry.js'), I('lib/cos-bridge.js')]],   // §0.60.128 DB13/DB14: his 2026-09-06 runtime registry, extended as the tunnel (tunnel/heartbeat/tunnels); reads each system's registry-components.js by path (the registry is the door)
  ['lib/drawbridge-registry.js', I('lib/drawbridge-registry.js'), [I('lib/system-boundary.js'), I('loom/scanners/capability-map.js'), I('lib/shadow.js')]],   // §0.60.127 DB9/DB10: a system's registry generated as its dependency graph; the negative space through lib/shadow.js   // §0.60.126 DB1: every require() across a system boundary; the ratchet holds contracts/drawbridge-baseline.json
  ['idearium/ui/js/code-dock.js', I('idearium/ui/js/code-dock.js'), [I('idearium/ui/js/work-surface.js'), I('idearium/ui/js/repo-tasks.js'), I('idearium/ui/js/plan-panel.js')]],   // §0.60.118 DK2: the dock — _wsCard, _rtTree/_rtRow, _ppContext reused (page globals)
];
const CONSUMERS = [
  [I('idearium/spec-compiler/compiler/phase-specs.js'), I('idearium/spec-compiler/compiler/kg-builder.js'), '§0.60.176 PS1 specIds(): what a spec declares, through emerge\'s own knowledge-graph build'],
  [I('idearium/spec-compiler/compiler/phase-specs.js'), I('lib/phase-dag.js'), '§0.60.176 PS1 the whole DAG and each phase\'s slice'],
  [I('idearium/spec-compiler/compiler/phase-specs.js'), I('lib/phase-graph.js'), '§0.60.176 PS1 graphFor(): files with roles and crossings'],
  [I('idearium/spec-compiler/compiler/phase-specs.js'), I('lib/phase-map-auto.js'), '§0.60.176 PS1 mapPhase() over envFromTree()'],
  [I('idearium/spec-compiler/compiler/phase-specs.js'), I('lib/pipeline-nodes.js'), '§0.60.176 PS1 phaseNode / graphNode (graphNode now keeps the dag slice)'],
  [I('idearium/spec-compiler/compiler/phase-specs.js'), I('lib/phase-plan.js'), '§0.60.176 PS1 targetSystem(): the owner of each phase'],
  [I('lib/build-pipeline.js'), I('lib/spec-compiler-port.js'), '0.60.239 EW2 t2(): T0→T1→T2 (was a require of emerge/compiler/t2-gate)'],
  [I('lib/spec-collect.js'), I('lib/spec-compiler-port.js'), '0.60.239 EW2 compile(): the "compiler" template\'s T0/T1 (was emerge/compiler/index.js)'],
  [I('guardian/server.js'), I('lib/spec-compiler-port.js'), '0.60.239 EW2 POST /build → t2() (was a require of emerge/compiler/t2-gate); progress replayed to its bus'],
  [I('copilot/module-builder.js'), I('lib/spec-compiler-port.js'), '0.60.239 EW2 pipeline() (was emerge/compiler/pipeline)'],
  [I('idearium/api/index.js'), I('lib/spec-compiler-port.js'), '0.60.239 EW2 provide() at boot; compiler.{compile,pipeline,t2} routes call it'],
  [I('lib/spec-compiler-port.js'), I('idearium/api/index.js'), '0.60.239 EW2 over HTTP from another process: POST /api/compiler/{compile,pipeline,t2} (not a require)'],
  [I('idearium/api/index.js'), I('idearium/spec-compiler/compiler/t2-gate.js'), '0.60.239 EW3 the provided t2 (lazy require)'],
  [I('idearium/api/index.js'), I('idearium/spec-compiler/compiler/pipeline.js'), '0.60.239 EW3 the provided pipeline (lazy require)'],
  [I('idearium/api/index.js'), I('idearium/spec-compiler/compiler/index.js'), '0.60.239 EW3 the provided compile (lazy require)'],
  [I('cortex/boot.js'), I('lib/raid-port.js'), '0.60.240 GD1 provide() at boot: RAID\'s approveTool, decide, outcome, listQueue in-process'],
  [I('lib/raid-port.js'), I('cortex/boot.js'), '0.60.240 GD1 over HTTP from another process: POST /api/raid/approve-tool, GET /api/raid/decide, POST /api/raid/feedback, GET /api/raid/queue (not a require)'],
  [I('guardian/server.js'), I('lib/raid-port.js'), '0.60.240 GD1 approveTool (/build, forge, chunking, chat), decide (raw dispatch), listQueue (/api/intake)'],
  [I('guardian/api-dispatch.js'), I('lib/raid-port.js'), '0.60.240 GD1 outcome (was recordOutcome with a job id as the agent)'],
  [I('guardian/lib/dispatcher.js'), I('lib/raid-port.js'), '0.60.240 GD1 approveTool for browser jobs (fails closed)'],
  [I('idearium/api/index.js'), I('lib/upload-placement.js'), '§0.60.173 UP3 repo.uploads.{create,list,get,answer}: plan → needs-you; his answer → repo-inject propose/apply (text) and writeSourceBytes (binaries); learn()'],
  [I('idearium/api/index.js'), I('lib/zip-ingest.js'), '§0.60.173 UP3 the uploaded zip read with the importer\'s own bounds (project-import.config ZIP)'],
  [I('idearium/api/index.js'), I('lib/repo-inject.js'), '§0.60.173 UP3 an upload\'s text files land through propose() and apply() — the one door'],
  [I('idearium/ui/js/code-tab-panels.js'), I('idearium/ui/js/upload-intent.js'), '§0.60.173 UP4 the upload panel: cxUploadLoad / _cxUpload (page globals, loaded by index.html — not a require)'],
  [I('idearium/api/index.js'), I('lib/phase-dag.js'), '§0.60.172 DG3 build gate (DAG_INVALID), slice on the phase graph, repo.phases.graph lines, repo.phases.dag route'],
  [I('idearium/cli/route-commands.js'), I('lib/phase-dag.js'), '§0.60.172 DG3 `repo dag <repo> [phase]` through the route'],
  [I('idearium/api/index.js'), I('lib/verify-first.js'), '§0.60.171 VF1 runPlanned file loop + runContract brick dispatch: check() before the ladder; an existing test reused only when it proves the files'],
  [I('idearium/api/index.js'), I('lib/coder-brief.js'), '§0.60.171 CB1 compose() is the brief of every file/brick sent to a coder'],
  [I('idearium/api/index.js'), I('lib/pipeline-routing.js'), '§0.60.171 CB2 preferFirst() after the learned order (both build paths)'],
  [I('idearium/api/index.js'), I('lib/phase-census.js'), '0.60.188 CNS1 GET /api/phases/census'],
  [I('idearium/api/index.js'), I('lib/build-queue.js'), '0.60.222 SL0 GET /api/phases/next and /api/repos/:uuid/phases/next (with the census and the flights)'],
  [I('idearium/api/index.js'), I('lib/flight-data.js'), '0.60.222 SL0 the flights a held phase is judged by'],
  [I('idearium/cli/route-commands.js'), I('lib/build-queue.js'), '0.60.222 SL0 `phases next` and `repo next` through the route'],
  [I('idearium/api/index.js'), I('lib/phase-close.js'), '0.60.223 SL1 _closeRun (on the proof row and on each applied change) and _reopenFor (on a revert), through _phaseSetStatus; repo.phases.close / closes'],
  [I('lib/repo-inject.js'), I('idearium/api/index.js'), '0.60.223 SL1 setOnSettled: each applied or reverted change is told to the closer (registered by idearium, called on the next tick)'],
  [I('idearium/api/index.js'), I('idearium/repo/roadmap.js'), '0.60.223 SL1 setPhaseStatus note: "DONE <date>. <version> — proven by run <id>, on snapshot <s>"'],
  [I('idearium/api/index.js'), I('lib/phase-dag.js'), '0.60.224 SL2 repo.phases.evidence: the open phases of the repo\'s maps'],
  [I('idearium/ui/js/phases.js'), I('idearium/api/index.js'), '0.60.224 SL2 the rail\'s "done by evidence?" → POST …/phases/evidence (dry run; close asks first)'],
  [I('idearium/api/index.js'), I('idearium/lib/autobuild.js'), '0.60.225 SL4 _loopDeps (queue, _phaseBuild, _loopRunState, _landByRule, _closeRun), _loopTick on the watchdog minute, repo.loop routes'],
  [I('idearium/api/index.js'), I('lib/trust-rule.js'), '0.60.225 SL5 _landByRule: a proven run\'s proposals applied when his rule allows; trust.get / trust.set'],
  [I('idearium/api/index.js'), I('lib/build-queue.js'), '0.60.225 _queueFor: shared by …/phases/next and the loop'],
  [I('idearium/cli/route-commands.js'), I('idearium/lib/autobuild.js'), '0.60.225 SL4 `repo loop <repo> [start|stop|step]`'],
  [I('idearium/cli/route-commands.js'), I('lib/trust-rule.js'), '0.60.225 SL5 `trust`'],
  [I('idearium/ui/js/phases.js'), I('idearium/lib/autobuild.js'), '0.60.225 SL4 the rail\'s loop: start (asks) / stop, built, closed, skipped; his rule in his words'],
  [I('idearium/api/index.js'), I('lib/registry-draft.js'), '0.60.229 DB16 GET /api/system/registry-drafts and /api/system/registry/:system/draft'],
  [I('idearium/cli/route-commands.js'), I('lib/registry-draft.js'), '0.60.229 DB16 `system drafts [<system>]`'],
  [I('idearium/cli/route-commands.js'), I('lib/phase-close.js'), '0.60.223 SL1 `repo close <repo> <runId>` and `repo closes <repo>` through the route'],
  [I('idearium/ui/js/phases.js'), I('lib/phase-close.js'), '0.60.223 SL1 the phase panel\'s "closed by" / "reopened" through GET …/phases/closes'],
  [I('idearium/ui/js/phases.js'), I('lib/build-queue.js'), '0.60.222 SL0 the rail\'s "can be built now" through GET …/phases/next'],
  [I('lib/work-journal.js'), I('lib/chat-ledger-client.js'), '0.60.192 _chat(): the contract ledger\'s reply text from the chat ledger (it pointed at :7701, the SSE port)'],
  [I('guardian/lib/chat-transcripts.js'), I('lib/chat-ledger-client.js'), '0.60.192 ledgerReplyFor(): the reply recovery\'s last source — his download manager\'s live chat ledger'],
  [I('lib/repo-inject.js'), I('lib/change-entry.js'), '0.60.190 APV2 an approved/reverted inject\'s entry, noted on its commit or queued for the gate\'s sync commit'],
  [I('idearium/api/index.js'), I('lib/repo-inject.js'), '0.60.190 APV2 setRunResolver (run → phase, map, startedBy); takeGateEntries/returnGateEntries on the sync commit; changeEntry for the ledger'],
  [I('idearium/api/index.js'), I('lib/repo-versions.js'), '0.60.190 APV4 setOnCommit → idearium.version.commit on the orchestrator\'s ledger'],
  [I('idearium/api/index.js'), I('lib/nexus-client.js'), '0.60.190 APV4 _emitLedger → postDurable(orchestrator, /api/ledger); drainBuffer every minute'],
  [I('idearium/cli/route-commands.js'), I('lib/phase-census.js'), '0.60.188 CNS1 `phases census` through the route'],
  [I('idearium/api/index.js'), I('lib/path-guard.js'), '§0.60.171 RC4b repairTree() at the start of a phase build'],
  [I('orchestrator/orchestrator.js'), I('lib/safe-watch.js'), '§0.60.170 RC1 UI hotswap watcher and auth hotswap watcher'],
  [I('guardian/lib/node-registry.js'), I('lib/safe-watch.js'), '§0.60.170 RC1 a watcher per node type folder'],
  [I('lib/node-registry.js'), I('lib/safe-watch.js'), '§0.60.170 RC1 every system\'s node listener'],
  [I('lib/node-index-watcher.js'), I('lib/safe-watch.js'), '§0.60.170 RC1'],
  [I('lib/queue.js'), I('lib/safe-watch.js'), '§0.60.170 RC1 the input folder watcher'],
  [I('lib/ico.js'), I('lib/safe-watch.js'), '§0.60.170 RC1'],
  [I('auth/index.js'), I('lib/safe-watch.js'), '§0.60.170 RC1 policy and client-key watchers'],
  [I('architecture-spec/registry/watcher.js'), I('lib/safe-watch.js'), '§0.60.170 RC1'],
  [I('cos/foundation/file-browser.js'), I('lib/safe-watch.js'), '§0.60.170 RC1'],
  [I('diagnostic/nexus-diagnostic.js'), I('lib/safe-watch.js'), '§0.60.170 RC1 the ledger folder watcher'],
  [I('emerge/emerge-kernel.js'), I('lib/safe-watch.js'), '§0.60.170 RC1'],
  [I('idearium/repo/watcher.js'), I('lib/safe-watch.js'), '§0.60.170 RC1 (ESM import) the drop folder watcher'],
  [I('lib/repo-inject.js'), I('lib/path-guard.js'), '§0.60.170 RC4 propose(): check(path, { exists }) before anything else; a change is kept as pathNote'],
  [I('lib/pipeline-nodes.js'), I('lib/node-export.js'), '§0.60.170 RC3 writeNode names the file with fileIdOf (Windows-safe)'],
  [I('lib/node-registry.js'), I('lib/node-export.js'), '§0.60.170 RC3 removal matches a file by fileIdOf(id); RC2 one index map per type per scan'],
  [I('idearium/api/index.js'),                    I('lib/system-boundary.js'), '§DB1 0.60.126 GET /api/system/drawbridge → census() + check() (lazy require in the case)'],
  [I('orchestrator/orchestrator.js'), I('lib/node-registry.js'), '§P33b 0.60.131 startForSystem at boot: this system\'s own node listener, its own store'],
  [I('cortex/boot.js'), I('lib/node-registry.js'), '§P33b 0.60.131 startForSystem at boot: this system\'s own node listener, its own store'],
  [I('guardian/server.js'), I('lib/node-registry.js'), '§P33b 0.60.131 startForSystem at boot: this system\'s own node listener, its own store'],
  [I('idearium/api/index.js'), I('lib/node-registry.js'), '§P33b 0.60.131 startForSystem at boot: this system\'s own node listener, its own store'],
  [I('architect/service.js'), I('lib/node-registry.js'), '§P33b 0.60.131 startForSystem at boot: this system\'s own node listener, its own store'],
  [I('diagnostic/nexus-diagnostic.js'), I('lib/node-registry.js'), '§P33b 0.60.131 startForSystem at boot: this system\'s own node listener, its own store'],
  [I('intelligence/server.js'), I('lib/node-registry.js'), '§P33b 0.60.131 startForSystem at boot: this system\'s own node listener, its own store'],
  [I('ollama/server.js'), I('lib/node-registry.js'), '§P33b 0.60.131 startForSystem at boot: this system\'s own node listener, its own store'],
  [I('versionium/server.js'), I('lib/node-registry.js'), '§P33b 0.60.131 startForSystem at boot: this system\'s own node listener, its own store'],
  [I('copilot/server.js'), I('lib/node-registry.js'), '§P33b 0.60.131 startForSystem at boot: this system\'s own node listener, its own store'],
  [I('loom/server.js'), I('lib/node-registry.js'), '§P33b 0.60.131 startForSystem at boot: this system\'s own node listener, its own store'],
  [I('clear-glass/src/main/index.js'), I('lib/node-registry.js'), '§P33b 0.60.131 startForSystem at boot: this system\'s own node listener, its own store'],
  [I('idearium/api/index.js'),                    I('lib/system-shape.js'), '§0.60.138 GET /api/system/shape'],
  [I('diagnostic/nexus-diagnostic.js'),           I('diagnostic/config.js'), '§0.60.138 its port from its config'],
  [I('loom/server.js'),                           I('loom/templates/cos-compartment.js'), '§0.60.134 GET /api/compartments[/:system], POST /api/compartments/apply'],
  [I('diagnostic/healer/api/index.js'),           I('lib/system-store.js'), '§0.60.133/0.60.136 healer_proposals in diagnostic\'s own store (was cortex/memory/jaa-db.js, then nexus-healer\'s)'],
  [I('diagnostic/healer/api/index.js'),           I('lib/system-registry.js'), '§0.60.133 the tunnel: where intelligence is, to ask its forge route'],
  [I('diagnostic/nexus-diagnostic.js'),           I('diagnostic/healer/api/index.js'), '§0.60.136 diagnostic serves the healer under /healer (handle(), lazy require)'],
  [I('idearium/api/index.js'),                    I('lib/system-boundary.js'), '§IM1 0.60.133 GET /api/system/sovereign → sovereignty()'],
  [I('lib/system-nodes.js'),                      I('lib/node-registry.js'), '§P33a 0.60.130 sync(): each system scanned into its own store (guardian runs its own)'],
  [I('idearium/api/index.js'),                    I('lib/node-registry.js'), '§P33a 0.60.130 GET /api/system/nodes/:system'],
  [I('guardian/jaa-store.js'),                    I('lib/jaa-store.js'), '§0.60.130 the old path re-exports the moved store'],
  [I('lib/system-nodes.js'),                      I('lib/system-boundary.js'), '§DB18 0.60.129 plan(): the .wire nodes and depends_on/consumed_by from scan() (lazy require)'],
  [I('idearium/api/index.js'),                    I('lib/system-boundary.js'), '§DB17 0.60.129 GET /api/system/homes → homes()'],
  [I('idearium/api/index.js'),                    I('lib/system-registry.js'), '§DB13/DB14 0.60.128 GET /api/system/tunnel[/:name], /api/system/heartbeat (commands handed in from idearium/cli/route-commands.js SPEC)'],
  [I('idearium/api/index.js'),                    I('lib/drawbridge-registry.js'), '§DB9/DB10 0.60.127 GET /api/system/registry[/:system], POST …/:system/settle (lazy require in the case)'],
  [I('tests/modules/test-system-boundary.test.js'), I('lib/system-boundary.js'), '§DB1 0.60.126 SB-06: the ratchet over Nexus itself'],
  [I('lib/step-gate.js'),                           I('lib/checks/ck-248-toolchain.js'), 'checkText(): the code.write gate parses every language the table knows with that language\'s own tool; a missing tool is not a pass (0.60.77)'],
  [I('lib/proposal-evidence.js'),                   I('lib/checks/ck-248-toolchain.js'), 'compare(): syntax status per file — checked, or NOT checked and why (0.60.77)'],
  [I('lib/code-edit.js'),                           I('lib/proposal-evidence.js'), '§FR2 0.60.115 promoteTested(): gatherBatch — a staged batch tested together in the repo\'s own tree before promote'],
  [I('idearium/repo/code-api.js'),                  I('lib/code-edit.js'), '§FR2 0.60.115 POST code/promote → promoteTested (409 with the batch on a regression)'],
  [I('idearium/api/index.js'),                      I('lib/repo-inject.js'), '§FR2 0.60.115 setEvidenceRoot(): a change is tested in its own repo\'s folder, not Nexus\'s tree'],
  [I('lib/repo-inject.js'),                         I('lib/proposal-evidence.js'), 'attachEvidence()/evidenceNow(): an agent\'s proposal is compared and its linked tests run on the file as it is and as proposed; apply() refuses a regression (0.60.75 PE3)'],
  [I('lib/repo-inject.js'),                         I('lib/step-gate.js'), '_screen(): the code.write gate and the collapse/shrink guards at propose() and edit(), whoever calls (0.60.74)'],
  [I('idearium/api/index.js'),                      I('lib/proposal-evidence.js'), '_rejectionContext(): a rejected proposal\'s evidence goes to the agent and into the retry note (0.60.75 PE4)'],
  [I('clear-glass/src/ipc/bridge.js'),              I('clear-glass/src/net/service.js'), '/cli/net/*: routes, resolve, bridge, transport start/stop/detect (0.60.60 NP9)'],
  [I('clear-glass/renderer/settings/sections/network.js'), I('clear-glass/src/ipc/bridge.js'), '0.60.160 Settings → Network: the Tor·Snowflake transport UI, over /cli/net/* (James: "add snowflake to the ui")'],
  [I('idearium/api/index.js'),                      I('lib/economy/tokens.js'), '_phaseBuild: breakdown() of what the agent is given (request, mapped files, charter, lessons, note) on the building row — the Plan\'s Context card (0.60.107 PS1)'],
  [I('idearium/api/index.js'),                      I('lib/ollama-activity.js'), '_contextOf: MAX, the num_ctx window Nexus gives Ollama — the Context card\'s window (0.60.107 PS1)'],
  [I('clear-glass/src/main/index.js'),              I('clear-glass/src/tls/helper.js'), 'boots TlsHelper on :7703 (in place of the Node proxy), its state → net service setTlsLayer, stopped at shutdown (0.60.109 TLS2)'],
  [I('clear-glass/src/contexts/manager.js'),        I('clear-glass/src/tls/helper.js'), 'setCertificateVerifyProc(verifyProc()): a Firefox persona trusts only the layer CA\'s leaves; registers firefox:true (0.60.109 TLS3)'],
  [I('clear-glass/src/net/service.js'),             I('clear-glass/src/net/policy.js'), 'pacFor(…, { tlsPort }): a persona\'s direct https/wss through the TLS layer, DIRECT after (0.60.109 TLS3)'],
  [I('clear-glass/src/main/index.js'),              I('clear-glass/src/contexts/google-signin.js'), "app 'session-created' → applySession; 'web-contents-created' → attach: every session and page, popups and webviews included (0.60.106 GS1)"],
  [I('clear-glass/src/fingerprint/engine.js'),      I('clear-glass/src/fingerprint/firefox-version.js'), 'ffPool(): current Firefox personas; getOrGenerate refreshes a stale stored UA (0.60.108 GS5)'],
  [I('clear-glass/src/page/semantic-tree.js'),      I('clear-glass/src/contexts/google-signin.js'), 'readAX: isSignin → page tree, no debugger on Google\'s sign-in (0.60.108 GS7)'],
  [I('clear-glass/src/net/policy.js'),              I('clear-glass/src/net/policy.js'), 'pacFor → signinRoute: Google\'s sign-in never via the transport or a collision blackhole (0.60.108 GS6)'],
  [I('clear-glass/src/contexts/manager.js'),        I('clear-glass/src/contexts/session-headers.js'), 'requestHook(fingerprint-profile): composes with the localhost and sign-in hooks instead of replacing them (0.60.106 GS2)'],
  [I('clear-glass/src/contexts/manager.js'),        I('clear-glass/src/net/service.js'), 'register(partition, session) so a rule can route an agent window; a no-op with no rules (0.60.60 NP3)'],
  [I('lib/agent-tools/index.js'),                   I('lib/agent-tools/tools/clear-glass/net.js'), 'clear_glass_net registered (0.60.60 NP9)'],
  [I('clear-glass/src/ipc/bridge.js'),              I('clear-glass/src/macros/live-recording.js'), 'macros:recordStart / recordStatus / recordStop: a recording is a .macro node file from the first second (0.60.57 MR1)'],
  [I('clear-glass/src/ipc/bridge.js'),              I('lib/chat-crawl-settings.js'), 'chats:schema / chats:settings / chats:save: the one table of every capture setting, its limits and its Settings rows (0.60.55 PI5)'],
  [I('lib/repo-agent.js'),                          I('lib/gig-ledger-listener.js'), 'attach() before a run begins: a finished run files a deliverable claim with its changed files as evidence (0.60.53 PF0)'],
  [I('lib/repo-agent.js'),                          I('lib/run-state.js'),  'begin() a run (resume on the same goal; a brick\'s run by its brick key, 0.60.77 GW2) before dispatch, finish() it after; lost-job and door fallbacks carry the brick; header() on a resumed Ollama run (0.60.50 CE1, CE10; 0.60.77 GW2)'],
  [I('idearium/api/index.js'),                      I('lib/run-state.js'),  'runIdFor({ brick }) + load(): each brick\'s run in the contract trace (0.60.77 GW2)'],
  [I('idearium/api/index.js'),                      I('lib/repo-procedures.js'), 'GET/POST /api/repos/:uuid/procedures, /from-run, /:id/replay, DELETE /:id: list/save/fromRun/replay/remove (0.60.118 DK1)'],
  [I('idearium/api/index.js'),                      I('lib/repo-agent.js'), 'POST /api/repos/:uuid/agent/tools/run and every procedure step: runTool() — copilot /api/tools/run with the repo\'s scope (0.60.118 DK1)'],
  [I('idearium/ui/js/code-surface.js'),             I('idearium/ui/js/ui-editor.js'), 'an open .html file → "edit UI" opens /ui-editor.html?repo=&path= (0.60.122 UE1)'],
  [I('idearium/ui/js/plan-panel.js'),               I('idearium/ui/js/code-dock.js'), 'planTabSync() → dockSync(): the Plan\'s tab is the dock rail\'s first (0.60.118 DK2)'],
  [I('idearium/ui/js/plan-panel.js'),               I('idearium/ui/js/code-dock.js'), 'ppFocusPiece/ppFocusRun → dockFocus + dockToggle: a piece narrows Changes/Outputs, a run opens Context (0.60.123 PP3)'],
  [I('idearium/ui/js/code-dock.js'),                I('idearium/ui/js/plan-panel.js'), '_ppContext(steps, { runId }) and openPlanPanel({ focus }): the run picked, and the way back (0.60.123 PP3)'],
  [I('idearium/ui/js/app.js'),                      I('idearium/ui/js/code-dock.js'), 'SSE idearium.repo.task → dockTaskIn (no fetch); refreshOnEvent → dockOnEvent (only open panels reload) (0.60.118 DK2)'],
  [I('idearium/api/index.js'),                      I('idearium/lib/surface-state.cjs'), 'GET / PUT /api/repos/:uuid/surface: get() / set(); a set emits idearium.surface.changed (0.60.79 CE8)'],
  [I('idearium/api/index.js'),                      I('lib/run-state.js'),  'list({ repoUuid })[0]: the repo\'s latest run on the surface (0.60.79 CE8)'],
  [I('idearium/ui/js/code-surface.js'),             I('idearium/lib/surface-state.cjs'), 'csPublish() PUTs the surface as it changes; csFollow() opens what the CLI set (idearium.surface.changed) and where it was left (0.60.79 CE8)'],
  [I('idearium/cli/route-commands.js'),             I('idearium/lib/surface-state.cjs'), 'code surface / code open / code select rows, through the route (0.60.79 CE8; agents reach them through nexus.command)'],
  [I('idearium/api/index.js'),                      I('lib/line-edit.js'),  'POST …/code/edit and …/code/assist: applyText checks every edit against the file now; one proposal (0.60.80 CE7)'],
  [I('idearium/api/index.js'),                      I('lib/repo-agent.js'), 'POST …/code/assist: dispatch the picked range with its action, noContext, no layer (0.60.80 CE7)'],
  [I('idearium/api/index.js'),                      I('lib/repo-history.js'), 'POST …/runs/:id/rewind: restoreFile each file the run changed to the last version before it (0.60.80 CV3)'],
  [I('idearium/api/index.js'),                      I('lib/repo-versions.js'), 'commitNow({ kind: restore }) after a file restore and a run rewind (0.60.80 CV2)'],
  [I('lib/repo-inject.js'),                         I('lib/repo-versions.js'), 'an applied or reverted proposal commits at once, labelled kind / inject / by / run (0.60.80 CV2)'],
  [I('idearium/api/index.js'),                      I('lib/run-state.js'),  'GET …/runs (list), POST …/runs/:id/rewind (load, note rewound) (0.60.80 CV3)'],
  [I('cos/archetype/registry.js'),                  I('cos/archetype/eravos.js'), 'ARCHETYPES_RAW.push(...archetypes()): eravos-canvas, eravos-domain-music, eravos-domain-dataflow, eravos-tool, eravos-sound-tool (0.60.104 CN1/CN2)'],
  [I('lib/file-tree-plan.js'),                      I('cos/archetype/eravos.js'), 'fromCosTemplate vars + the archetype\'s varDefaults (toolVars: his new-tool.mjs rules) (0.60.104 CN2)'],
  [I('idearium/api/index.js'),                      I('lib/phase-faults.js'), '_learnFromRejection(): rejectionModes → tell → diagnosis → learnRejection (fault per mode, with the phase) → the reject retry; GET /api/repos/:uuid/lessons (0.60.105 RL2/RL4)'],
  [I('lib/repo-inject.js'),                         I('lib/proposal-evidence.js'), '_screen(): compare() for an agent\'s proposal — exports lost, or a gutted file (declarations or keys lost) is refused before it reaches James (0.60.105 RL3)'],
  [I('idearium/api/index.js'),                      I('lib/run-watch.js'), 'runForInject(): the run and phase a rejected proposal came from, so its lesson and retry land on that phase (0.60.105 RL2)'],
  [I('idearium/api/index.js'),                      I('lib/canvas-compartments.js'), 'GET/POST /api/canvas, GET /api/canvas/:id, POST /api/canvas/:id/tools; emits idearium.canvas.created / tool.added (0.60.104 CN3)'],
  [I('idearium/cli/route-commands.js'),             I('lib/canvas-compartments.js'), 'canvas list · new · show · add-tool rows, through the routes (0.60.104 CN3; agents through nexus.command)'],
  [I('idearium/api/index.js'),                      I('lib/build-paths.js'), 'repo.code.edit / code.assist classified not-build, beside the Agent tab chat (0.60.83, census CK-255)'],
  [I('copilot/server.js'),                          I('lib/run-state.js'),  'every ok/failed tool call is written to the run by step() (0.60.50 CE1)'],
  [I('copilot/tool-runtime.js'),                    I('lib/run-state.js'),  'header() at the head of follow-up rounds and resumed runs; note(off-task) on a blocked reply (0.60.50 CE2, CE3)'],
  [I('guardian/lib/response-sink.js'),              I('lib/run-state.js'),  'a response node is tagged with its run, step and attempt via forSession() (0.60.50 CE4)'],
  [I('guardian/lib/response-sink.js'),              I('lib/reply-kind.js'), 'kind: tag on every response node (0.60.50 CE4)'],
  [I('clear-glass/src/downloads/artifact-chat-index.js'), I('lib/run-state.js'),  'Library index rows carry run_id / step / attempt (0.60.50 CE4)'],
  [I('clear-glass/src/downloads/artifact-chat-index.js'), I('lib/reply-kind.js'), 'Library index rows carry reply_kind (0.60.50 CE4)'],
  [I('clear-glass/src/net/compartment.js'),         I('clear-glass/src/net/https-only.js'), '§0.60.178 SF3/SF4 harden() attaches HTTPS-only to the compartment session (lazy require)'],
  [I('clear-glass/src/contexts/manager.js'),        I('clear-glass/src/net/compartment.js'), '§0.60.178 SF3 create({ via }): partitionFor + harden, register under that partition; destroy() disposes (lazy require)'],
  [I('clear-glass/src/main/index.js'),              I('clear-glass/src/net/compartment.js'), '§0.60.178 SF3 openAgentWindow({ via }): page and shell on the compartment partition, forced at will-attach-webview; onContents() WebRTC policy (lazy require)'],
  [I('clear-glass/src/ipc/bridge.js'),              I('clear-glass/src/net/bridge-sources.js'), '§0.60.178 SF1/SF2 locate() for detect, /cli/net/bridge/find and /bridge/builtin (lazy require)'],
  [I('clear-glass/src/ipc/bridge.js'),              I('clear-glass/src/net/installer.js'), '§0.60.168 /cli/net/setup: TorInstaller (lazy require)'],
  [I('clear-glass/src/plugins/webrequest-adapter.js'), I('clear-glass/src/net/https-only.js'), '§0.60.178 SF4 runs ses.__cgPreRequest (set by https-only.attach) before any content filter — a session property, not a require'],
  [I('clear-glass/plugins/snowflake/index.js'),     I('clear-glass/src/ipc/bridge.js'), '§0.60.169 net.open on the bus, answered by bridge._netOpenVia (the bus, not a require)'],
  [I('clear-glass/src/net/service.js'),             I('clear-glass/src/net/quarantine.js'), '§0.60.179 CD2 ensureQuarantine (lazy require)'],
  [I('clear-glass/src/net/service.js'),             I('clear-glass/src/net/qbittorrent.js'), '§0.60.179 CD3 qbit() (lazy require)'],
  [I('clear-glass/src/net/service.js'),             I('clear-glass/src/net/kill-switch.js'), '§0.60.179 CD4 setOnDisconnect RUNGS (lazy require)'],
  [I('clear-glass/src/ipc/bridge.js'),              I('clear-glass/src/net/kill-switch.js'), '§0.60.179 CD4 armed with the transport host (lazy require)'],
  [I('clear-glass/src/ipc/bridge.js'),              I('clear-glass/src/import/firefox.js'), '§0.60.179 BS7 /cli/firefox/profiles and /import (lazy require)'],
  [I('clear-glass/src/main/index.js'),              I('clear-glass/src/main/float-cli.js'), '§0.60.179 BS6 register() of the floating CLI IPC'],
  [I('clear-glass/src/main/index.js'),              I('clear-glass/src/net/service.js'), '§0.60.179 CD2 a compartment window gets the quarantine; magnets watched (lazy require)'],
  [I('lib/agent-tools/index.js'),                   I('lib/agent-tools/tools/clear-glass/firefox.js'), '§0.60.179 BS7 registerTool(clear_glass_firefox)'],
  [I('clear-glass/renderer/browser.js'),            I('clear-glass/renderer/shell/menus.js'), '§0.60.179 BS3 the ☰ menu draws window.CGMenus rows (page globals, loaded by browser.html — not a require)'],
  [I('clear-glass/renderer/shell/downloads.js'),    I('clear-glass/src/ipc/bridge.js'), '§0.60.179 BS5 /cli/net/quarantine* over :7702 (HTTP, not a require)'],
  [I('clear-glass/renderer/shell/agents.js'),      I('clear-glass/src/ipc/bridge.js'), '§0.60.180 BS9 providers:list/start/stop/show and mesh:list over IPC (cg.providers, cg.mesh — not a require)'],
  [I('clear-glass/renderer/shell/newtab.js'),      I('clear-glass/renderer/shell/agents.js'), '§0.60.180 BS10 the agent cards read window.CGAgents.list (page global)'],
  [I('clear-glass/renderer/shell/extensions.js'),  I('clear-glass/renderer/shell/icons.js'), '§0.60.180 BS8 plugin icons drawn by window.CGIcons.plugin (page global)'],
  [I('clear-glass/src/ipc/bridge.js'),              I('clear-glass/src/net/service.js'), '§0.60.180 SF7 _ensureBridge before every start (service.ensureBridge)'],
  [I('clear-glass/renderer/float-cli.js'),          I('clear-glass/renderer/copilot-cli.js'), '§0.60.179 BS6 CGCopilotCLI.create: the route bar, slash commands, history (page global)'],
  [I('clear-glass/src/main/index.js'),              I('clear-glass/src/adblock/lists.js'), '§0.60.183 AB2 service() started at boot; due lists updated; cosmetics inserted on dom-ready (AB3)'],
  [I('clear-glass/src/ipc/bridge.js'),              I('clear-glass/src/adblock/lists.js'), '§0.60.183 AB4 /cli/adblock/* (lazy require)'],
  [I('clear-glass/src/main/index.js'),              I('clear-glass/plugins/adblocker/index.js'), '§0.60.183 AB3 BUILTIN_PLUGINS installs the Ad Blocker (content-filter + settings)'],
  [I('clear-glass/src/plugins/webrequest-adapter.js'), I('clear-glass/plugins/adblocker/index.js'), '§0.60.183 AB3 emits the content-filter signature with resourceType, pageUrl, tabId (bus, not require)'],
  [I('clear-glass/src/ipc/bridge.js'),              I('clear-glass/src/plugins/host.js'), '§0.60.183 BS13 plugins:settings: list() finds the settings signature; _askPlugin waits for plugin:settings'],
  [I('clear-glass/renderer/shell/extensions.js'),  I('clear-glass/src/preload/index.js'), '§0.60.183 BS13 ClearGlass.plugins.settings (the plugin page) — IPC, not require'],
  [I('clear-glass/src/driver/index.js'),            I('clear-glass/src/core/zoom.js'), '§0.60.183 BS14 the zoom action goes through zoom()'],
  [I('clear-glass/src/ipc/bridge.js'),              I('clear-glass/src/core/zoom.js'), '§0.60.183 BS14 zoom:step|set|restore'],
  [I('clear-glass/src/main/index.js'),              I('clear-glass/src/core/zoom.js'), '§0.60.183 BS14 zoom({ siteSettings }) at boot'],
  [I('clear-glass/renderer/browser.js'),            I('clear-glass/renderer/shell/ctxmenu.js'), '§0.60.183 BS15 window.CGCtxMenu.open/keys (page global)'],
  [I('clear-glass/renderer/shell/ctxmenu.js'),      I('clear-glass/src/preload/index.js'), '§0.60.183 BS15 ClearGlass.window.cursor → window:cursor (IPC)'],
  [I('clear-glass/src/copilot/bridge.js'),          I('clear-glass/src/copilot/context-need.js'), '§0.60.182 BS12 need() and cookieSummary() per message'],
  [I('lib/agent-tools/index.js'),                   I('lib/agent-tools/tools/clear-glass/adblock.js'), '§0.60.183 AB4 registerTool(clear_glass_adblock)'],
  [I('clear-glass/src/main/index.js'),              I('clear-glass/src/passwords/service.js'), '§0.60.186 PW1 service({ vault: passwordVault }) at boot; onCaptured → linkPending'],
  [I('clear-glass/src/main/index.js'),              I('clear-glass/src/main/passwords-wiring.js'), '§0.60.186 PW3 attach() — the page script on every session, the IPC'],
  [I('clear-glass/src/main/passwords-wiring.js'),   I('clear-glass/src/preload/passwords.js'), '§0.60.186 PW3 registerPreloadScript(preloadPath); pw:form / pw:capture / pw:fill (IPC, not a require)'],
  [I('clear-glass/src/ipc/bridge.js'), I('clear-glass/src/site-settings/profile.js'), '§0.60.215 SP1 site-profile:* IPC and /cli/site-profile over siteSettings, options and the net service (lazy)'],
  [I('clear-glass/src/site-settings/profile.js'), I('clear-glass/src/site-settings/store.js'), '§0.60.215 SP1 the store is passed in: get/set/deleteKey by url'],
  [I('clear-glass/src/site-settings/profile.js'), I('clear-glass/src/net/service.js'), '§0.60.215 SP1 the net service is passed in: policy(), addRoute, removeRoute'],
  [I('clear-glass/src/ipc/bridge.js'), I('clear-glass/src/site-settings/readers.js'), '§0.60.216 SP2 installSiteReaders(): the resolver the features read; runMacroAsPerson refuses a site whose macros are off'],
  [I('clear-glass/src/main/index.js'), I('clear-glass/src/site-settings/readers.js'), '§0.60.216 SP2 on a page load: workflowsAllowed (page.visited), macrosOnLoad (autoRun), resumeMode'],
  [I('clear-glass/src/main/index.js'), I('clear-glass/src/rewind/resume.js'), '§0.60.216 SP2 resumeScript(mode) run on did-finish-load where the site keeps its place'],
  [I('clear-glass/src/driver/index.js'), I('clear-glass/src/site-settings/readers.js'), '§0.60.216 SP2 driverPolicy: an agent refused a site that says no; the site\'s navigate / wait timeouts'],
  [I('clear-glass/src/passwords/service.js'), I('clear-glass/src/site-settings/readers.js'), '§0.60.216 SP2 passwordPolicy: offer never, autofill, the account that signs in'],
  [I('clear-glass/src/autofill/matcher.js'), I('clear-glass/src/site-settings/readers.js'), '§0.60.216 SP2 autofillFor: off for the site, or the site\'s profile'],
  [I('clear-glass/src/copilot/bridge.js'), I('clear-glass/src/site-settings/readers.js'), '§0.60.216 SP2 meshAgent: the site\'s Co-pilot agent; mesh off → no page read'],
  [I('clear-glass/src/options/store.js'), I('clear-glass/src/site-settings/readers.js'), '§0.60.216 SP2 guardianPolicy: findListenersForUrl empty where Guardian does not listen'],
  [I('clear-glass/src/downloads/chat-ledger.js'), I('clear-glass/src/site-settings/readers.js'), '§0.60.216 SP2 guardianPolicy: no ledger where chat capture is off'],
  [I('clear-glass/src/main/passwords-wiring.js'), I('clear-glass/src/passwords/service.js'), '§0.60.216 SP2 autofillLogin(origin): the one login to fill without asking'],
  [I('clear-glass/src/ipc/agent-routes.js'), I('clear-glass/src/driver/index.js'), '§0.60.216 SP2 POST /cli/driver marks its calls by: \'agent\''],
  [I('clear-glass/renderer/browser.js'), I('clear-glass/renderer/site-profile-groups.js'), '§0.60.217 SP3 the toolbar\'s Site Settings popup: this tab\'s site, each change written at once'],
  [I('clear-glass/renderer/settings/sections/sites.js'), I('clear-glass/renderer/site-profile-groups.js'), '§0.60.217 SP3 Settings › Sites: the Edit dialog\'s Features, written on Save'],
  [I('clear-glass/renderer/site-profile-groups.js'), I('clear-glass/src/preload/index.js'), '§0.60.217 SP3 ClearGlass.siteProfile get/set/clear/keys → site-profile:* (IPC, not a require)'],
  [I('clear-glass/renderer/settings/sections/driver.js'), I('clear-glass/src/options/store.js'), '§0.60.218 SP4 options.set({ driver }) via IPC options:set; bounds from siteProfile.keys()'],
  [I('clear-glass/renderer/settings/sections/guardian.js'), I('clear-glass/src/options/store.js'), '§0.60.218 SP4 options.set({ guardian | listenerDecay }) via IPC options:set'],
  [I('clear-glass/renderer/settings/sections/mesh.js'), I('clear-glass/src/options/store.js'), '§0.60.218 SP4 "When a task fails": options.set({ mesh: { retriesPerStrategy | backoffMs } })'],
  [I('clear-glass/src/mesh/agent-mesh.js'), I('clear-glass/src/options/store.js'), '§0.60.218 SP4 drainSettings(this.accounts) at each failure: mesh.retriesPerStrategy, mesh.backoffMs'],
  [I('clear-glass/src/main/index.js'), I('clear-glass/src/processes/index.js'), '§0.60.219 SP5 processes() over windows / bgTabs / closeBackgroundTab; bus.on(\'*\') feeds activity(); a site page\'s load is a nav line'],
  [I('clear-glass/src/ipc/bridge.js'), I('clear-glass/src/processes/index.js'), '§0.60.219 SP5 processes:list/end, activity:recent; GET /cli/processes, /cli/activity; POST /cli/processes/end 403; macro runs into the activity'],
  [I('clear-glass/src/ipc/handler-registry.js'), I('clear-glass/src/ipc/bridge.js'), '§0.60.219 DENIED processes:end, site-profile:set/clear (his, not an agent\'s through /cli/invoke)'],
  [I('idearium/cli/route-commands.js'), I('clear-glass/src/ipc/bridge.js'), '§0.60.219 site, glass processes, glass activity → /cli/site-profile, /cli/processes, /cli/activity (HTTP)'],
  [I('clear-glass/renderer/processes.js'), I('clear-glass/src/preload/index.js'), '§0.60.220 SP6 ClearGlass.processes list/end/activity, window.closeProcesses (IPC)'],
  [I('clear-glass/src/main/index.js'), I('clear-glass/renderer/processes.js'), '§0.60.220 SP6 openProcessesWindow() loads processes.html; cg.processes (Shift+Esc) opens it'],
  [I('clear-glass/renderer/shell/menus.js'), I('clear-glass/renderer/browser.js'), '§0.60.220 SP6 ☰ and Tools → Processes run CGShell.processes → window:openProcesses'],
  [I('clear-glass/src/main/index.js'), I('clear-glass/src/shortcuts/registry.js'), '§0.60.220 SP6 cg.processes bound to Shift+Esc (Esc with a modifier passes isSafe)'],
  [I('architect/service.js'), I('lib/data-home.js'), '§0.60.207 DL2 atBoot: its files in the root data/ come home before anything opens them'],
  [I('clear-glass/src/main/index.js'), I('lib/data-home.js'), '§0.60.207 DL2 atBoot: its files in the root data/ come home before anything opens them'],
  [I('copilot/server.js'), I('lib/data-home.js'), '§0.60.207 DL2 atBoot: its files in the root data/ come home before anything opens them'],
  [I('cortex/boot.js'), I('lib/data-home.js'), '§0.60.207 DL2 atBoot: its files in the root data/ come home before anything opens them'],
  [I('diagnostic/nexus-diagnostic.js'), I('lib/data-home.js'), '§0.60.207 DL2 atBoot: its files in the root data/ come home before anything opens them'],
  [I('guardian/server.js'), I('lib/data-home.js'), '§0.60.207 DL2 atBoot: its files in the root data/ come home before anything opens them'],
  [I('intelligence/server.js'), I('lib/data-home.js'), '§0.60.207 DL2 atBoot: its files in the root data/ come home before anything opens them'],
  [I('loom/server.js'), I('lib/data-home.js'), '§0.60.207 DL2 atBoot: its files in the root data/ come home before anything opens them'],
  [I('ollama/server.js'), I('lib/data-home.js'), '§0.60.207 DL2 atBoot: its files in the root data/ come home before anything opens them'],
  [I('orchestrator/orchestrator.js'), I('lib/data-home.js'), '§0.60.207 DL2 atBoot: its files in the root data/ come home before anything opens them'],
  [I('versionium/server.js'), I('lib/data-home.js'), '§0.60.207 DL2 atBoot: its files in the root data/ come home before anything opens them'],
  [I('idearium/api/index.js'), I('lib/data-home.js'), '§0.60.207 DL2 atBoot: its files in the root data/ come home before anything opens them'],
  [I('idearium/api/index.js'), I('lib/data-clearup.js'), '§0.60.207 DL2 data.home.*: census, plan per owner, rollback'],
  [I('idearium/cli/route-commands.js'), I('idearium/api/index.js'), '§0.60.207 DL2 data home [<system>] [--apply], data rollback <manifest>'],
  [I('idearium/ui/settings.html'), I('idearium/api/index.js'), '§0.60.207 DL2 Settings console → Data: GET/POST /api/data/home[/:system]'],
  [I('guardian/agents/index.js'), I('lib/system-store.js'), '§0.60.208 SS1 callto: agent_calls, guardian_health, artifacts, toasts in guardian\'s own store (agent_calls brought from cortex once)'],
  [I('guardian/agents/index.js'), I('lib/nexus-client.js'), '§0.60.208 SS1 event_log → cortex POST /api/event, cortex_memory → POST /api/memory/insert (postDurable)'],
  [I('guardian/ask.js'), I('lib/nexus-client.js'), '§0.60.208 SS1 bridge turns → cortex POST /api/event'],
  [I('guardian/lib/ncp.js'), I('lib/nexus-client.js'), '§0.60.208 SS1 ncp.flap → cortex POST /api/event (queue_uuid top-level); a flapping gap → POST /api/gaps'],
  [I('guardian/config.js'), I('lib/data-home.js'), '§0.60.208 DL3 GUARDIAN_DATA_DIR = guardian/data/memory'],
  [I('guardian/lib/jobs.js'), I('lib/data-home.js'), '§0.60.208 DL3 guardian/data/jobs'],
  [I('guardian/lib/account-routing.js'), I('lib/data-home.js'), '§0.60.208 DL3 guardian/data/accounts'],
  [I('guardian/lib/agent-registry.js'), I('lib/data-home.js'), '§0.60.208 DL3 guardian/data/agents'],
  [I('guardian/artifact-upload.js'), I('lib/data-home.js'), '§0.60.208 DL3 guardian/data/input'],
  [I('lib/seam/queue.js'), I('lib/data-home.js'), '§0.60.208 DL3 guardian/data/seam-artifacts'],
  [I('service/guardian-service.js'), I('lib/data-home.js'), '§0.60.208 DL3 atBoot before it creates any folder; pid, ledger, queue under guardian/data'],
  [I('cli/clear-idearium.js'), I('lib/data-home.js'), '§0.60.208 DL3 guardian/data/jobs'],
  [I('lib/ledger-writer.js'), I('lib/data-home.js'), '§0.60.208 DL3 a rewired system (REWIRED) writes in its own folder'],
  [I('lib/cortex-write.js'), I('lib/data-home.js'), '§0.60.208 DL3 a rewired system buffers in its own folder; the drain reads both'],
  [I('versionium/config.js'), I('lib/data-home.js'), '§0.60.209 DL3 DATA_DIR = versionium/data'],
  [I('ollama/config.js'), I('lib/data-home.js'), '§0.60.209 DL3 DATA_DIR = ollama/data'],
  [I('ollama/lib/tape.js'), I('lib/data-home.js'), '§0.60.209 DL3 the tape under ollama/data'],
  [I('architect/service.js'), I('lib/data-home.js'), '§0.60.209 DL3 LEDGER_DIR = architect/data'],
  [I('clear-glass/src/providers/registry.js'), I('lib/data-home.js'), '§0.60.209 DL3 providers-cache.json under clear-glass/data'],
  [I('clear-glass/src/ipc/bridge.js'), I('lib/data-home.js'), '§0.60.209 DL3 clear-glass/data'],
  [I('lib/agent-tools/tools/clear-glass/command-index.js'), I('lib/data-home.js'), '§0.60.209 DL3 command-index.json under clear-glass/data'],
  [I('orchestrator/lib/changelog.js'), I('lib/data-home.js'), '§0.60.209 DL3 changelog-snapshot.json under orchestrator/data'],
  [I('clear-glass/renderer/browser.js'), I('clear-glass/renderer/shell/icons.js'), '§0.60.210 the ☰ menu Tools rows and Customize toolbar draw each command\'s glyph (CGIcons.apply, CGIcons.PLUGIN for a plugin\'s command)'],
  [I('clear-glass/src/plugins/host.js'), I('clear-glass/src/toolbar/commands.js'), '§0.60.210 a plugin\'s command carries pluginName and desc (its icon drawn by name)'],
  [I('clear-glass/src/passwords/service.js'),       I('clear-glass/src/passwords/vault.js'), '§0.60.186 PW1 the PasswordVault passed in: save(…, { accountId }), get'],
  [I('clear-glass/src/providers/account-switch.js'), I('clear-glass/src/passwords/service.js'), '§0.60.186 PW3 capture() → onCaptured (injected by main) → linkPending'],
  [I('clear-glass/renderer/shell/passwords.js'),    I('clear-glass/src/preload/index.js'), '§0.60.186 PW4 ClearGlass.passwords.save|dismiss|forPage|fillPage|onOffer|onAvailable (IPC)'],
  [I('clear-glass/src/ipc/bridge.js'),              I('clear-glass/src/accounts/for-site.js'), '§0.60.185 BS20 accounts:forSite (lazy require; each account session read for the site)'],
  [I('clear-glass/renderer/browser.js'),            I('clear-glass/src/preload/webview-bridge.js'), '§0.60.185 BS19 the page sends cg:ctx-point (sendToHost → the webview ipc-message event), not a require'],
  [I('clear-glass/renderer/browser.js'),            I('clear-glass/renderer/shell/menus.js'), '§0.60.185 BS17 window.CGMenus.appMenuHTML/wire builds the ☰ menu (page global)'],
  [I('clear-glass/src/adblock/lists.js'),           I('clear-glass/src/adblock/import.js'), '§0.60.184 AB5 importPaths / addUrl: detectFormat, sources'],
  [I('clear-glass/src/ipc/bridge.js'),              I('clear-glass/src/net/host-import.js'), '§0.60.184 SF8 /cli/net/routes/import, /lists, /lists/rm (lazy require)'],
  [I('clear-glass/src/net/host-import.js'),         I('clear-glass/src/net/service.js'), '§0.60.184 SF8 addRoutes / removeRoutes / routes() on the service passed in (not a require)'],
  [I('clear-glass/renderer/settings/sections/network.js'), I('clear-glass/src/preload/index.js'), '§0.60.184 SF8 ClearGlass.plugins.pick for Import a host list (IPC)'],
];

function mapRunState(driver) { return declareMap(driver, { key: 'run-state', uuidTag: '2026-1015-050', files: FILES, consumers: CONSUMERS }); }

module.exports = { mapRunState, FILES, CONSUMERS };
