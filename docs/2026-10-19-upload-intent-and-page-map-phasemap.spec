# Upload with an intent, placed against Nexus, asked of him · the Clear Glass page map, felt through Nerve (2026-10-19)

origin: >-
  James, 2026-10-19: "i want to be able to upload files to idearium repos. upload zip with an intent, have it map to nexus using a
  tool, then ask me with the option to edit the location and where they go in relation to the system or the registry. like i want
  to try to make something that can do what you can, when uploading zips, or making requests."
  · "like i need copilot to use clearglass more effectively. parse the dom, index each element as blocks, then download into a index
  to chunk, then synthesize a fucking map in relation to the weboage to use as a map or reference point for inputs from the cli or
  the intent. learns over time."
  · "interaction field, nexus nerve, hooking ollama in to feel with "nexus nerve", see with the interaction field and scrips injected
  into each page."
  · "then it can be a map tool, chunk tool for understanding/analysing/ reverse engineering,, web scraper."

Supersedes-and-keeps PR1_page_reader and PR2_autofill_and_copilot_read_first of docs/2026-10-19-pipeline-root-causes-phasemap.spec
(the shorter reading of the same ask) and narrows FM1_file_manager's "upload" clause of docs/2026-10-19-idearium-control-phasemap.spec
to the zip-with-intent door built here (FM1 keeps drag-in of loose files, detect, rename/move/archive).

## Ground truth (read in the tree before mapping, §8.6)

Upload side — what exists:
- lib/zip-ingest.js extractZipToFiles: bounded zip → `realFiles` (bytes, binaries, sha256) and text `included`.
- lib/intake.js: a file from outside is a STAGED drop, never a change by arriving; `_claimedPath` strips a wrapper folder ONLY when
  the stripped path really exists ("guessing at a target is how a file ends up silently in the wrong place"). Nexus-root only.
- lib/repo-inject.js propose(): the one door an agent's write goes through (path-guard, screens, versioning, apply/revert).
  Text only (content must be a string).
- idearium/repo/index.js writeSources(repoUuid, realFiles): verified byte writes (the import path) — the door for binaries.
- lib/system-boundary.js: a system is a top-level folder; crossings by require edge; homes()/kindOf().
- lib/component-store.js / lib/project-decompose.js: content-addressed components (a dropped file may already be one).
- POST /api/repos/import (repo.import-archive) makes a NEW repo from a zip; nothing uploads INTO an existing repo with an intent.

Page side — what exists:
- clear-glass/src/page/reader.js readPage (text, fields, buttons), semantic-tree.js readTree (role+name addresses, AX or in-page),
  field.js (the interaction field: numbered x/y/z targets, overlay, spotlight), attention.js (per-window attention for Nerve,
  GET /cli/attention), userscripts/manager.js (persistent per-URL injection), guardian/userscript-field-map.js (learned, verified
  selectors per provider with anchors and semantic addresses).
- lib/nerve/index.js reads /cli/attention into per-window focus; lib/nerve-ollama-bridge.js pushes Nerve's diff into Ollama's
  standing stream context (no generation) — today only "N DOM mutations, idle/active": Ollama cannot feel WHAT changed.
- Missing: blocks (every element of substance, not only actionable ones), an index and chunks of a page, a synthesized map kept per
  site, intent → target resolution against that map, and anything that learns across visits.

## Readings (the coder's, marked to confirm where another reading exists)

- "map to nexus using a tool" — read as: a deterministic placement tool, no model first (docs/CLAUDE.md "deterministic first"): the
  zip's own folders against the repo's tree, its systems (top-level folders) and the registry (who would require the file, what it
  requires, whether its bytes are already a component). A model is asked only for files nothing places (UP6, not built here). To
  confirm.
- "ask me with the option to edit the location" — an upload waits as `needs-you`: every file shows where it would go, why, its system
  and registry neighbours, and alternatives; he edits the path, the system, or skips; only his answer writes, through repo-inject
  (text) and writeSources (binaries).
- "learns over time" (both halves) — his corrections are kept and applied first next time (upload); a site's map is kept across
  visits with each block's stability, and intent → block outcomes raise or lower a block for that intent (page).
- "hooking ollama in to feel with nexus nerve" — read as: the page map's deltas (blocks that appeared, changed, went) go into the
  window's attention, so Nerve carries them and the existing nerve-ollama-bridge pushes them as Ollama's standing context — Ollama
  feels the page change in words, not just a mutation count. To confirm.

## Debt named against NC0 (docs/CLAUDE.md addendum, 2026-10-19)

lib/core/* and the adapter contract (NC1, AD1–AD2) do not exist yet. UP1 reads a file's requires with its own small JS/ESM scan;
every edge it reports says `discovered: js-require-scan`, and a file in any other language says `requires: unknown` — never empty
as if proven. When AD2 lands, UP1's scan moves behind the JS adapter (one function, `requiresOf`).

## Decisions

decisions:
  D1_placement_is_deterministic_first:
    depends_on: []
    chosen: >-
      Decided by his axioms (§8.6 reuse, docs/CLAUDE.md "deterministic first", §1.1 evidence): placement reads the tree; a guess is
      never presented as a fact — each placement carries `why` and `confidence`, and an unplaced file says so (§1.2).
  D2_one_door_for_writes:
    depends_on: []
    chosen: >-
      Decided by his axioms (§5.2/§9.1 no side door; REVERSIBILITY): text lands as repo-inject proposals (then applied by the repo's
      inject mode), binaries through writeSources; nothing is written before his answer.
  D3_page_map_lives_in_clear_glass:
    depends_on: []
    chosen: >-
      Decided by docs/CLAUDE.md "code belongs to the system it serves" and DG2 (no new crossing): blocks/index/map are
      clear-glass/src/page/*; the CLI reaches them through the driver route like `field`; Nerve reads them through /cli/attention.
  D4_learning_is_counted_not_trained:
    depends_on: []
    chosen: >-
      Decided by "deterministic first" and §1.1: learning is counts on disk (his corrections; block seen/changed; intent hit/miss),
      read back first next time. No model is trained; a model only ranks when counts tie (later).

## Phases. Delivery per phase: backend → route → command → UI (tested in Clear Glass). Archive, never delete.

phases:

  UP1_placement_tool:
    layer: library
    status: DONE 0.60.173
    depends_on: []
    files: [lib/upload-placement.js, tests/modules/test-upload-placement.test.js]
    does: >-
      plan({ files, intent, tree, learned }) → one row per file: from (zip path), to (proposed repo path), action
      (create | replace | identical | skip), system (top-level folder of `to`), why (learned | exists-after-strip | same-name |
      requires-resolve | intent-system | zip-root | new), confidence, alternatives, requires (what it would require, resolved),
      requiredBy (files already requiring that path), binary. Strips the zip's wrapper folder only when that lands on real paths
      (intake's rule, applied to the whole zip, not file by file). Intent words pick a system when the zip says nothing.
    proof: test-upload-placement — wrapper stripped only onto real paths; identical bytes say identical; intent picks the system; his
      learned correction wins next time; requires/requiredBy from the tree

  UP2_learned_placements:
    layer: library
    status: DONE 0.60.173
    depends_on: [UP1_placement_tool]
    files: [lib/upload-placement.js]
    does: >-
      learn(rows, answer) → rules from his edits ("from dir X → to dir Y", "basename B → path P"), kept per repo; plan() applies
      them first and says `why: learned`.
    proof: covered in test-upload-placement

  UP3_upload_routes_and_commands:
    layer: integration
    status: DONE 0.60.173
    depends_on: [UP1_placement_tool, UP2_learned_placements]
    files: [idearium/api/index.js, idearium/cli/route-commands.js, tests/modules/test-upload-placement.test.js]
    does: >-
      POST /api/repos/:uuid/uploads {name, contentBase64, intent} → stages (bytes kept under the repo's data dir), plans, and
      waits as `needs-you`; GET /api/repos/:uuid/uploads (open first) and /uploads/:id; POST /uploads/:id/answer {rows:[{from, to,
      skip}]} → his edits checked (safe paths, no two files to one path), learned (UP2), text proposed through repo-inject and
      applied by the repo's mode, binaries through writeSources; the answer is recorded. Commands: `repo upload <repo> <zip>
      --intent "…"`, `repo uploads <repo> [id]`, `repo upload-answer <repo> <id> [--to from=path …] [--skip from …]`.
    proof: through the router — an upload waits, the answer writes only what he kept, at the path he gave

  UP4_upload_ui:
    layer: interface
    status: DONE 0.60.173
    depends_on: [UP3_upload_routes_and_commands]
    files: [idearium/ui/js/upload-intent.js, idearium/ui/index.html]
    does: >-
      In the Code tab: drop a zip, write the intent, see every file's proposed place with its system, why, and registry
      neighbours; edit the path, pick an alternative, skip; Apply. Open uploads are listed and can be answered later.
    proof: tested in Clear Glass (not Playwright)

  UP5_registry_wires_on_apply:
    layer: integration
    status: OPEN
    depends_on: [UP3_upload_routes_and_commands]
    files: [lib/upload-placement.js, loom/maps/run-state-map.js]
    does: >-
      For the Nexus repo, an applied upload declares each new component into loom with its real require/consumer edges (rule 3),
      through the registry spine (IN3) when it lands.
    proof: an uploaded lib file appears in loom_impact with its wires

  UP6_model_for_the_unplaced:
    layer: integration
    status: OPEN
    depends_on: [UP3_upload_routes_and_commands, UP5_registry_wires_on_apply]   # same file as UP5
    files: [lib/upload-placement.js]
    does: >-
      Only files no rule places (why: new, confidence low) go to the local model with the intent, the tree's systems and the atlas
      line for each; its answer is a suggestion beside the deterministic one, never instead of it.
    proof: a file with no evidence gets a model suggestion marked as such

  PM1_blocks:
    layer: library
    status: DONE 0.60.174
    depends_on: []
    files: [clear-glass/src/page/blocks.js, tests/modules/clear-glass-page-map.test.js]
    does: >-
      The page as blocks: every element of substance (landmarks, headings, paragraphs, lists, tables, forms, fields, buttons,
      links, images, media), each { id, kind, role, name, text, address (semantic-tree address rule), selector, box x/y/w/h, z
      (covered layers, the field's rule), parent, depth, attrs }. id is stable across visits (address + kind + text signature).
      In-page function serialised with toString() (the reader.js rule), normalize() in Node; budgeted, cuts said.
    proof: jsdom — a form page yields its landmarks, fields and buttons as blocks with stable ids across two reads

  PM2_index_and_chunks:
    layer: library
    status: DONE 0.60.174
    depends_on: [PM1_blocks]
    files: [clear-glass/src/page/page-map.js, tests/modules/clear-glass-page-map.test.js]
    does: >-
      Blocks → chunks (one per region/section, budgeted, each listing its block ids) and an inverted keyword index over names,
      text, roles and labels — deterministic, no model, no network. Export as JSON or Markdown (the scraper/reverse-engineering
      output).
    proof: chunks cover every block once; search finds a block by its label

  PM3_synthesized_map_that_learns:
    layer: library
    status: DONE 0.60.174
    depends_on: [PM2_index_and_chunks]
    files: [clear-glass/src/page/page-map.js, clear-glass/src/page/page-memory.js, tests/modules/clear-glass-page-map.test.js]
    does: >-
      synthesize(blocks) → the map: regions with their purpose, forms with their fields, primary actions, navigation — as short
      lines a 3B model reads. Kept per site key (origin + path with ids/numbers generalized) in page-memory (.clear-glass data):
      each visit diffs against the last (new, changed, gone, stable — each block's seen count), so stable blocks are trusted.
    proof: two visits — the second says what changed; a block seen twice is stable

  PM4_intent_to_targets:
    layer: library
    status: DONE 0.60.174
    depends_on: [PM3_synthesized_map_that_learns]
    files: [clear-glass/src/page/page-map.js, clear-glass/src/page/page-memory.js]
    does: >-
      find(map, intent) → ranked blocks (words against name/text/role/region, stability, and learned outcomes for that intent on
      that site), each with its selector, address and centre so pointer/click/type can act. outcome(site, intent, blockId, ok)
      records the result; the next find on that site uses it.
    proof: "search box" finds the search field; a recorded success moves the chosen block to the top next time

  PM5_tools_routes_commands:
    layer: integration
    status: OPEN
    depends_on: [PM4_intent_to_targets, UP3_upload_routes_and_commands]   # UP3 first: both add rows to idearium/cli/route-commands.js
    files: [clear-glass/src/driver/index.js, clear-glass/src/copilot/tools.js, clear-glass/src/copilot/bridge.js,
      idearium/cli/route-commands.js]
    does: >-
      Driver actions pageMap, pageFind, pageChunks, pageScrape, pageOutcome; co-pilot tools of the same names; commands `page map`,
      `page find <intent…>`, `page chunks`, `page scrape [--md]`, `page outcome` through the same route as `field`.
    proof: the command rows resolve to the driver actions; the co-pilot tool list carries them

  PM6_nerve_feel:
    layer: integration
    status: OPEN
    depends_on: [PM5_tools_routes_commands]
    files: [clear-glass/src/page/attention.js, lib/nerve/index.js, lib/nerve-ollama-bridge.js]
    does: >-
      A page map read emits page.map; attention keeps the window's site, map summary and last diff; Nerve's per-window focus
      carries it; the bridge pushes the words ("window w1 · jobs.example.com/apply: +2 blocks (form "Apply"), 1 changed") to
      Ollama's standing context when the diff moved — Ollama feels what changed.
    proof: attention keeps the diff; the bridge pushes the diff's words once, not again while nothing changed

  PM7_live_injected_map:
    layer: interface
    status: OPEN
    depends_on: [PM6_nerve_feel]
    files: [clear-glass/src/page/page-live.js, clear-glass/src/userscripts/manager.js]
    does: >-
      A persistent injected script (userscripts manager) keeps the map live: a MutationObserver marks dirty regions, re-blocks only
      those, and posts the delta to the bus (page.map.delta) — the map stays current without the agent asking.
    proof: tested in Clear Glass — a page that adds a row shows it in the map without a new pageMap call

  PM8_page_map_panel:
    layer: interface
    status: OPEN
    depends_on: [PM5_tools_routes_commands]
    files: [clear-glass/src/renderer/page-map-panel.js]
    does: >-
      Clear Glass panel: the map of the current page, its chunks, what changed since last visit, intent search with the result
      spotlit (field.spotlight), scrape export.
    proof: tested in Clear Glass
