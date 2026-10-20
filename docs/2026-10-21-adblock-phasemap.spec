# A full content blocker for Clear Glass: real filter lists, exceptions and options, element hiding, per-site allow, a count per tab (2026-10-21)

origin: >-
  James, 2026-10-21: "can you make a full adblocker and make it so i can click on them t ochange their settings. migrate page zoom to
  the core of clearglass. moright click menu needs to be redone in the same themeand in relation to the mouse is way of f onthe right
  clicskk"
  This map is the first sentence's adblocker. The plugin settings pages, zoom and the right-click menu are phases BS13–BS15 of
  docs/2026-10-21-browser-shell-phasemap.spec.

Build contract: clear-glass/spec/adblock.spec (emerge module format, specDepth 1.0).

## Ground truth (2026-10-21)

- plugins/adblocker is 16 hard-coded domains (one of them a path), matched by host suffix. No lists, no exceptions, no options, no
  element hiding, no counts, no settings. Its toggleFromToolbar() is exported but no manifest entry reaches it.
- The wiring is real and kept: main/index.js attaches webrequest-adapter.js to each window's session with every content-filter
  signature, and exempts a page whose site setting contentFilter is 'off' (Settings → Site settings).
- The adapter sends a filter only { url, requestId }: no resource type, no page, no tab. Third-party and type options need all three.
- web-contents-created in main/index.js is where every page's contents are first seen (compartment, quarantine, nexus-chat attach there).

## Decisions

decisions:
  AB0_engine_in_core:
    status: DECIDED
    question: Where does the blocker's engine live, the plugin or Clear Glass's core?
    chosen: >-
      Decided by his axioms (§8.6 reuse, ABK-003 pure core). The engine and the list service live in clear-glass/src/adblock (pure parse
      and match; files and network at the edge), one per process like net/service.js. The plugin stays the surface: its content-filter
      and settings contributions ask the service, so turning the plugin off in the 🧩 panel still turns blocking off (host.disable), as
      it did. Allowed sites stay in site settings (contentFilter = 'off'), the one place Settings already edits.

phases:

  AB1_engine:
    layer: library
    status: DONE 0.60.183
    depends_on: [AB0_engine_in_core]
    files: [clear-glass/src/adblock/engine.js]
    spec: clear-glass/spec/adblock.spec
    blocks: [MOD-ABK-ENGINE]
    does: "ABP/uBlock syntax parsed (network + cosmetic, skips counted by why); host-suffix and token index; exceptions, important, types, party, domains; cosmetics per page."
    proof: test-adblock ABK-01..ABK-06

  AB2_lists:
    layer: library
    status: DONE 0.60.183
    depends_on: [AB1_engine]
    files: [clear-glass/src/adblock/lists.js]
    spec: clear-glass/spec/adblock.spec
    blocks: [MOD-ABK-LISTS]
    does: "The catalogue, the state and the store under userData/adblock; update with an injected fetch, last copy kept on failure; allow through site settings; counts per tab."
    proof: test-adblock ABK-07, ABK-08

  AB3_wiring:
    layer: integration
    status: DONE 0.60.183
    depends_on: [AB2_lists, BS13_plugin_settings]
    files: [clear-glass/plugins/adblocker/index.js, clear-glass/plugins/adblocker/manifest.json, clear-glass/src/plugins/webrequest-adapter.js, clear-glass/src/main/index.js]
    spec: clear-glass/spec/adblock.spec
    blocks: [MOD-ABK-WIRING]
    does: "The plugin asks the service; the adapter sends type, page and tab; element hiding inserted on dom-ready; the plugin's settings page."
    proof: test-adblock ABK-09, ABK-10

  AB4_surface:
    layer: surface
    status: DONE 0.60.183
    depends_on: [AB3_wiring]
    files: [clear-glass/src/ipc/bridge.js, idearium/cli/route-commands.js, lib/agent-tools/tools/clear-glass/adblock.js]
    spec: clear-glass/spec/adblock.spec
    blocks: [MOD-ABK-SURFACE]
    does: "/cli/adblock/* routes, the adblock command row, the clear_glass_adblock agent tool; the UI is the 🧩 panel page (BS13) and the count on the shield."
    proof: test-adblock ABK-11; test-browser-shell BST-13 (the page in Clear Glass)

## Addendum 2026-10-21 (0.60.184): his own lists

James, 2026-10-21, after 0.60.183: "Needs filters. you'll be able to import folders and host lists. Same with the Snowflake plugin."
Reading, to confirm: "needs filters" = bring his own filter lists in (a file, a folder of them, a host list, a list's URL), not only the
catalogue. The Snowflake half is SF8 of docs/2026-10-21-snowflake-compartment-phasemap.spec; the picker and the field kinds are BS16.

  AB5_import:
    layer: library
    status: DONE 0.60.184
    depends_on: [AB4_surface, BS16_import_fields]
    files: [clear-glass/src/adblock/import.js, clear-glass/src/adblock/engine.js, clear-glass/src/adblock/lists.js, clear-glass/plugins/adblocker/index.js, clear-glass/src/ipc/bridge.js, idearium/cli/route-commands.js, lib/agent-tools/tools/clear-glass/adblock.js]
    spec: clear-glass/spec/adblock.spec
    blocks: [MOD-ABK-IMPORT]
    does: "Files, folders, host lists and list URLs become lists of their own (copy kept; on/off, update, remove); the page's Import and Add fields; /cli/adblock/import; adblock import."
    proof: test-adblock ABK-12, ABK-13
