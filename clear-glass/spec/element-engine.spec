spec:

  # clear-glass/spec/element-engine.spec — the Element Engine's full page (EE3a of docs/2026-11-05-clear-glass-element-engine-phasemap.spec).
  # Format: emerge's module spec, compiled by Emerge's kg-builder at specDepth 1.0, no BLACK node (tests/modules/test-substrate-spec.test.js
  # SS-01, compile only: the map's EE0–EE2 were built before it named a spec). Moved here from adblock.spec on 2026-11-06, the coder's own
  # SS-02 miss: a module in adblock.spec must name a phase of the adblock map (the SC8 precedent, 0.60.387: cos-console.spec, cos-disk.spec).

  meta:
    name:        clear-glass-element-engine
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-11-06T00:00:00Z
    status:      built
    uuid:        nexus-clear-glass-element-engine-spec-v1-0000-2026-1106-jamesbrooks-001
    origin: >-
      James, 2026-11-06: "That plugin needs to be front end too." · "It’s meant to replace the adblocker also like a full plugin page." · "It
      needs to have a full page to edit, change and add. Like it needs to be fully featured. Not a small plugin at all dude." The asks are his;
      reading "a full page" as its own Clear Glass window (built like the Library) is the coder's, to confirm.
    purpose: >-
      The Element Engine (the plugin that was the Ad Blocker) has a full page of its own where he edits, changes and adds: filter lists, his
      filters, allowed sites, the elements he hid on every site, ErosmancerOS's options and threats, and his copy of ErosmancerOS's TypeScript.
    target_runtime: [electron]
    language_stack: [javascript]
    paradigm: [one-door, his-changes-are-his, nothing-lost]
    axioms: ["USER_AUTONOMY: his filters and his code change only by him (person:true)", "§5.15 sovereignty: the page reaches only Clear Glass's own doors", "§0.3: his filters stay one text, a rule a line of it"]
    deps:
      - { name: electron, version: ">=28", required: true, purpose: "BrowserWindow, ipcMain, the browser-window-focus event" }

    constraints:
      - id: CGE-001
        description: "Nothing outside his ErosmancerOS copy is read or written by the page's editor; ErosmancerOS's live code changes only through ES5's import."
        type: hard
        enforced_by: [GATE-CGE-COPY]
      - id: CGE-002
        description: "A change to his filters or his copy is taken only with person:true; an agent's tool never sends it."
        type: hard
        enforced_by: [GATE-CGE-HIS]

  schemas:

    - id: HiddenRule
      name: HiddenRule
      description: "One element-hiding line of his filters."
      fields:
        rule: "string — the line as written (site##selector, site#@#selector, ##selector)"
        site: "string — the host, or '' for every site"
        selector: "string — a CSS selector, at most 400 characters, no line break, ## or #@#"
        exception: "boolean — #@#: shown here even if a list hides it"
      behavioral_contracts: ["a site written as a URL becomes its host", "an invalid site or selector is refused with why"]
      error_paths: ["a rule not in his filters → refused, said"]

    - id: CopyFile
      name: CopyFile
      description: "One file of his ErosmancerOS copy (ES5's export folder)."
      fields:
        file: "string — a path inside his folder, .ts, no dot folder, not node_modules"
        bytes: "number — at most 1 MB"
        changed: "boolean | 'new' — against the export's manifest"
      behavioral_contracts: ["the manifest's hash decides changed"]
      error_paths: ["a path outside his folder → refused, said"]

  interfaces:

    - id: IF-ADBLOCK-SERVICE
      name: adblock-service
      path: clear-glass/src/adblock/lists.js
      description: "The blocker's one service: lists, his own filters, allowed sites, matching."
      exports: ["service() → { state(), setCustom(text), setList(id, on), update(id), allow(url, on), importPaths(paths), addUrl(url), removeList(id) }"]
      behavioral_contracts: ["setCustom keeps his filters as one text and reloads them"]
      error_paths: ["no service before boot → null"]

    - id: IF-EROS-EDIT
      name: eros-edit
      path: clear-glass/src/eros/edit.js
      description: "ES5: his copy of ErosmancerOS's TypeScript, exported, compared and imported with checks."
      exports: ["exportTo(dir)", "diff(dir)", "importFrom(dir, { apply, force, by })", "syntaxErrors(file, text)", "defaultDir()", "MANIFEST"]
      behavioral_contracts: ["import archives the old files, runs the module test and restores on failure"]
      error_paths: ["no export → said"]

    - id: IF-SETTINGS-RUNTIME
      name: settings-runtime
      path: clear-glass/renderer/settings/core.js
      description: "The Settings page runtime the Library also runs on: rail, panes, rows, modals, toasts, one file per area."
      exports: ["window.CGS = { section, boot, pane, row, btn, modal, toast, … }"]
      behavioral_contracts: ["boot(opts) sets the groups, the first area and where area CSS lives"]
      error_paths: ["an area that throws shows its error with Retry; the page stays up"]

  modules:

    - id: MOD-CGE-BACKEND
      name: element-engine-backend
      uuid: nexus-cg-element-engine-page-v1-0000-2026-1106-001
      path: clear-glass/src/element-engine/index.js
      phase: EE3a_the_full_page
      description: >-
        What the page edits that nothing served before. hidden: every element-hiding rule across all sites, listed, added, changed in place and
        removed as lines of his own filters (svc.setCustom), so a rule written here, in My filters or by the picker's Hide is the same rule.
        hideRule: the one check every hide goes through, the plugin's too. copy: his ErosmancerOS copy listed with what changed, read, saved
        (inside his folder only, .ts only, 1 MB; the syntax said on save). overview: the switch, counts, lists, allowed sites, hidden count, his copy.
      deps: [{ name: adblock-service }, { name: eros-edit }]
      schema_refs: [HiddenRule, CopyFile]
      exports: ["overview(svc, { editDir, edit })", "hidden.list|add|edit|remove(svc, …)", "hideRule(site, selector, { exception })", "copy.list|read|write(dir, …)", "MAX_FILE"]
      gate_pipeline: ["GATE-CGE-RULE: hideRule before any line is written", "GATE-CGE-COPY: inside his folder, .ts, no dot folder or node_modules, 1 MB"]
      behavioral_contracts: ["his other lines are never touched", "no blocker → said, never a throw"]
      error_paths: ["a rule not in his filters → refused", "a path out of his copy → refused", "no export yet → nothing saved, said"]
      acceptance: ["test-cg-element-engine-page EG-01..EG-04"]

    - id: MOD-CGE-SURFACE
      name: element-engine-surface
      uuid: nexus-cg-element-engine-page-v1-0000-2026-1106-002
      path: clear-glass/src/ipc/bridge.js
      phase: EE3a_the_full_page
      description: >-
        Clear Glass's door for it: :7702 /cli/element-engine/overview | hidden | copy | copy/file | copy/export | copy/diff | copy/import | pick |
        open, and the `element-engine` command row (idearium/cli/route-commands.js; hide, unhide, import person-only). The window:
        openElementEngineWindow and pickInBrowser in clear-glass/src/main/index.js (the browser window he used last, from Electron's own focus
        event), window:openElementEngine | closeElementEngine through the preload.
      deps: [{ name: element-engine-backend }, { name: eros-edit }]
      exports: [":7702 /cli/element-engine/*", "element-engine <overview|hidden|hide|unhide|copy|copy-read|export|diff|import|pick|open>", "window:openElementEngine | window:closeElementEngine"]
      gate_pipeline: ["GATE-CGE-HIS: person:true for his filters and his copy"]
      behavioral_contracts: ["the page does nothing the command cannot"]
      error_paths: ["no browser window to pick from → said", "an import refused → each file and why"]
      acceptance: ["test-cg-element-engine-page EG-05, EG-06, EG-08"]

    - id: MOD-CGE-PAGE
      name: element-engine-page
      uuid: nexus-cg-element-engine-page-v1-0000-2026-1106-003
      path: clear-glass/renderer/element-engine.html
      phase: EE3a_the_full_page
      description: >-
        The page, on the Settings runtime, one JS and one CSS file per area (renderer/element-engine/sections/): Ad blocking — Overview, Filter
        lists, My filters, Allowed sites; Elements — Hidden elements; ErosmancerOS — Options, Threats, Edit TypeScript (an editor over his copy:
        open, save, new file, show changes, import), and Settings' own ErosmancerOS area reused as Workbench. The 🧩 row and the pinned 🛡 open it
        instead of the popover (renderer/shell/extensions.js); the popover stays for every other plugin, and for this one if the page cannot open.
      deps: [{ name: element-engine-surface }, { name: settings-runtime }]
      exports: ["renderer/element-engine.html", "window.CGE = { his, hisRaw, say, pick }"]
      gate_pipeline: ["GATE-CGE-HIS: every write sends person:true from the page"]
      behavioral_contracts: ["unsaved edits are asked about before they are thrown away"]
      error_paths: ["the bridge down → each area says so with Retry"]
      acceptance: ["test-cg-element-engine-page EG-07, EG-09", "test-cg-element-engine-page-drive ED-01..ED-05 (Clear Glass's engine)"]

  events:
    element-engine:
      - "element-engine.opened { area }"

  enforcement:
    gates:
      - { id: GATE-CGE-HIS, name: his-changes-are-his, severity: fatal, check: "the routes refuse a change without person:true", on_failure: "suite red" }
      - { id: GATE-CGE-COPY, name: his-copy-only, severity: fatal, check: "copy.read/write refuse a path out of his folder", on_failure: "suite red" }
      - { id: GATE-CGE-RULE, name: one-hide-check, severity: high, check: "every hide goes through hideRule", on_failure: "suite red" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — compiles at specDepth 1.0, no BLACK node"
    - "tests/modules/test-cg-element-engine-page.test.js — EG-01..EG-09"
    - "tests/modules/test-cg-element-engine-page-drive.test.js — ED-01..ED-05, driven in Clear Glass"
