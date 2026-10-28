spec:
  meta:
    name:     autofill-transfer
    version:  1.0.0
    date:     2026-10-26
    release:  "0.60.256"
    uuid:     autofill-transfer-phasemap-v1-0000-2026-1026-jamesbrooks-001
    owner:    "clear-glass (src/autofill/transfer.js, the IPC and /cli doors, Settings → Autofill) + idearium (the rows) + core (the agent tool)"
    voice: "The ideas and the calls are James's. `james:` is his, verbatim. `does:` is the coder's reading, his to correct."
    origin: >-
      James, 2026-10-26: "continue. look at autofill. i want to be able to import and export the data. have a download template button
      just the fiverr gigs, also fix it so its .gig not .gig.json."
    axioms: "docs/AXIOMS-v3.1.md — §3.3 map before build, §8.6 reuse before build, REVERSIBILITY (an import is undone in one step), §1.2 nothing silent (a field or row an import cannot take is said), §0.3 nothing lost (the duplicate .gig.json archived, not deleted); docs/CLAUDE.md: backend → route → command → UI; agents get every capability a person gets"
    reading_of_his_words: >-
      The coder's reading, to confirm: (1) "import and export the data" = everything autofill keeps about him: the profiles (fields and
      documents), what it learned per site (the picked fields and their selectors), and the last gig written. One file out, the same file
      in. (2) "have a download template button just the fiverr gigs" = the template is for Fiverr gigs only; the data export needs no
      template (an export is its own example). The gig template button already exists in Settings → Autofill → Fiverr gigs and in the gig
      panel; it stays, and it sits beside the import and export. (3) ".gig not .gig.json" = every gig file Clear Glass writes or ships is
      .gig; a .gig.json still loads (his old files), but none is written.

  exists:
    gig_files: "clear-glass/src/autofill/gig.js gigFile (YAML, <slug>.gig), gigTemplate (gig-template.gig), parseGig (YAML or JSON); IPC autofill:gig:file, autofill:gig:import; the buttons in renderer/settings/sections/autofill.js and renderer/gig-panel.js."
    stores: "AutofillStore (cg_autofill_profiles, cg_autofill_last_gig, JAA rows); learned fields in site settings (learn-pick.js saveLearned / listLearned / forgetLearned, keys autofill.field.<key> and autofill.selector.<key>)."
    found:
      - "clear-glass/docs/gigs/ ships nodejs-automation-scraping.gig.json beside the same gig as .gig: the only .gig.json Clear Glass gives him, and the one gig-file.test.js reads."
      - "A gig download is a Blob typed text/yaml. No extension is added for a named file, but nothing guarantees it either: the download is typed application/octet-stream and the name is forced to end in .gig."
      - "There is no export or import of profiles or learned fields anywhere (grep: autofill:export, /cli/autofill/export — none)."

  decisions:
    AT_D1_the_file:
      status: DECIDED 2026-10-26 by his axioms
      chosen: >-
        Decided by his axioms and his own earlier call for gigs ("maybe you could use a yaml file with a real .gig extension", 2026-10-12):
        the export is YAML with its own extension, <date>.autofill, format clearglass.autofill/1, so he can read and edit it. JSON loads too.
    AT_D2_how_an_import_lands:
      status: DECIDED 2026-10-26 by his axioms
      chosen: >-
        Decided by his axioms (REVERSIBILITY, §1.2, §0.3): an import merges. A profile with the same id is replaced only when the file's copy
        is newer; one with a new id is added with its id. A learned field is set for its site. The gig in the file becomes the last gig.
        Before anything changes, the state it replaces is kept (JAA row cg_autofill_import_undo), and "Undo the last import" puts it back.
        A profile with an unknown field, or a row with no site, is refused and named, never dropped silently.

  phases:
    AT1_transfer_backend:
      status: DONE (0.60.256)
      depends_on: [AT_D1_the_file, AT_D2_how_an_import_lands]
      files: [clear-glass/src/autofill/transfer.js, clear-glass/src/autofill/store.js]
      does: "exportAll({ store, siteSettings }) → { text, filename, counts }; parseTransfer(text) → { ok, data, warnings }; importAll({ store, siteSettings, text, undoRows }) → { ok, counts, refused, undo }; undoLast({ store, siteSettings, undoRows }). AutofillStore.putProfile(p) (validated, keeps its id) and replaceProfiles(list) for the undo."
    AT2_doors:
      status: DONE (0.60.256)
      depends_on: [AT1_transfer_backend]
      files: [clear-glass/src/ipc/bridge.js, clear-glass/src/preload/index.js, idearium/cli/route-commands.js, lib/agent-tools/tools/autofill/autofill-manage.js, clear-glass/src/copilot/bridge.js, clear-glass/src/copilot/tools.js, clear-glass/registry-components.js]
      does: "IPC autofill:export | autofill:import | autofill:import:undo; HTTP GET /cli/autofill/export, POST /cli/autofill/import, POST /cli/autofill/import/undo; rows `autofill export [--out <file>]`, `autofill import <file>`, `autofill import undo`; autofill_manage actions export | import | import_undo; the co-pilot's autofill.export | autofill.import."
    AT3_settings_ui:
      status: DONE (0.60.256)
      depends_on: [AT2_doors]
      files: [clear-glass/renderer/settings/sections/autofill.js]
      does: "Settings → Autofill opens with one row: Export autofill data, Import a file…, Undo the last import, and what each did. The Fiverr gigs pane keeps Download template (the gig template, the only template)."
    AT4_gig_files_are_gig:
      status: DONE (0.60.256)
      depends_on: []
      files: [clear-glass/src/autofill/gig.js, clear-glass/src/ipc/bridge.js, clear-glass/renderer/settings/sections/autofill.js, clear-glass/renderer/gig-panel.js, clear-glass/renderer/browser.html, clear-glass/docs/gigs/nodejs-automation-scraping.gig.json, clear-glass/test/gig-file.test.js, clear-glass/registry-components.js]
      does: "Every gig file written is <name>.gig (a .json, .yaml or .gig.json ending is replaced); the download is typed application/octet-stream so nothing adds an extension. The shipped .gig.json, a duplicate of the .gig beside it, is archived (_archive/2026-10-26-gig-json/), and the test reads the .gig. A .gig.json he has still loads."
    AT5_proof:
      status: DONE (0.60.256)
      depends_on: [AT3_settings_ui, AT4_gig_files_are_gig]
      files: [clear-glass/test/autofill-transfer-render.test.js, clear-glass/package.json, tests/modules/test-autofill-transfer.test.js, tests/modules/run-all.js, loom/maps/economy-map.js]
      does: "Export → import into empty stores is lossless; a merge keeps the newer profile; an unknown field is refused and named; undo puts back what the import replaced; the doors and rows are wired; gig files end in .gig."
