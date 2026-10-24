spec:
  meta:
    name:     gig-autofill-and-learn
    version:  1.0.0
    date:     2026-10-19
    release:  "0.60.161 (mapped)"
    uuid:     nexus-gig-autofill-and-learn-phasemap-v1-0000-2026-1019-jamesbrooks-001
    owner:    "clear-glass (co-pilot tool, the picker, per-site settings, macros, the gig engine)"
    voice: "The ideas and the calls are James's. `james:` is his, verbatim. `does:` is the coder's reading, his to correct."
    origin: >-
      James, 2026-10-18: "need help with the autofill for fiverr." (screenshot: co-pilot answered "fill this in for me" with chat,
      not a fill.) · 2026-10-19: "yes. and if he doesn't understand, have the element picker popup for me to select the element for
      him. saves to per site settings, and as a macro or automation and updates the autofill."
    axioms: "docs/AXIOMS-v3.1.md — §8.6 reuse before build, §3.3 map before build, §1.2 nothing fails silently, §0.3 nothing lost; docs/CLAUDE.md: backend → route → command → UI; UI tested in Clear Glass; a dependency graph before every phase"
    reading_of_his_words: >-
      The coder's reading, to confirm: (1) co-pilot gets a deterministic gig-fill tool so "fill this in for me" on a Fiverr gig
      page runs the engine (src/autofill/gig.js fillGig) instead of chatting — using a gig already written, else writing one from
      the active profile + a one-line offer, then filling ("Either, its choice", his "yes"). (2) When a gig PART cannot be matched
      to a field, the element picker pops up for James to click the field; his pick is validated against the live page (reuse
      renderer/selector-check.js + src/providers/selector-assign.js's evidence rule), then SAVED three ways: per-site settings
      (src/site-settings/store.js, origin → part → selector), a macro/automation (src/macros), and the autofill's learned map so
      the matcher finds it next time. "Updates the autofill" read as: the learned selector is consulted by matchGigFields on the
      next fill, so the same field is never asked twice.

  exists:
    engine: "src/autofill/gig.js — matchGigFields (name/id/label/placeholder → part, GIG_PATTERNS), fillGig (types via the dom bridge), detectGig (preview). Reachable at /cli/autofill/gig/fill and IPC autofill:gig:fill (ipc/bridge.js _gigFill). Never saves or publishes."
    settings_button: "renderer/settings/sections/autofill.js gigFillFlow — Preview/Fill into a chosen tab (cg.autofill.gigDetect/gigFill). The deterministic path works today; the co-pilot path does not."
    copilot_tools: "src/copilot/tools.js — the co-pilot's tool list. opportunity.prepare fills job APPLICATIONS, not the gig editor. No gig tool, so 'fill this in for me' has nothing to call and the model chats (the screenshot)."
    picker: "renderer/selector-check.js (live check on the page) + src/providers/selector-assign.js (validate the pick carries the check's evidence, then save). renderer/mesh-picker.js, renderer/guardian-picker.js are its two callers today — the pattern to reuse."
    per_site: "src/site-settings/store.js — get(url,key) / set(url,key,value) / getAllForOrigin(url), one store per origin. Where a learned field selector for fiverr.com belongs."
    macros: "src/macros/recording.js recordingToSteps / describeStep — a pick (a fill on a selector) becomes a macro step. src/automation the larger form."
    found:
      - "The engine is built and correct; the only gap is that co-pilot cannot reach it, and that a missed field dies silently instead of asking James to point at it."
      - "selector-assign already does exactly the save-a-pick-with-evidence dance for provider chat selectors. The gig picker is the same shape with a different target (per-site + macro + the gig learned-map, not guardian's selector map)."
      - "Snapshot restore ('Saved page state could not be restored') in his screenshot is a separate page-state bug, not the fill. Out of scope here; noted."

  decisions:
    GA0a_no_gig_yet:
      status: "DECIDED 2026-10-19 — James: \"yes\" to 'Either, its choice': co-pilot fills a written gig if one is held, else writes one from the active Fiverr profile + a one-line offer (asking for the line if it has none), then fills."
    GA0b_where_a_pick_is_kept:
      status: "DECIDED by his words — all three: per-site settings (the learned selector per origin+part), a macro/automation (replayable), and the autofill learned map the matcher reads. §0.3 nothing lost; one pick, three homes, written once through a single save path."
    GA0c_the_learned_map_is_per_site:
      status: "DECIDED by his axioms (§8.6) — the learned part→selector map lives in src/site-settings/store.js under the gig origin (fiverr.com), key `gig.field.<part>`; matchGigFields consults it before GIG_PATTERNS. No new store."

  phases:
    GA1_copilot_fills_the_gig:
      status: OPEN
      depends_on: []
      files: [clear-glass/src/copilot/tools.js, clear-glass/src/copilot/hat.js, clear-glass/src/ipc/bridge.js]
      does: >-
        A co-pilot tool `autofill.gig` (cat browser): fills the Fiverr gig editor in the current tab via the engine that exists
        (_gigFill). It takes { agentId?, offer?, minConfidence? }. It uses a gig already written (the panel's/last-written gig,
        kept by GA1a), else writes one from the active Fiverr profile + `offer` (buildGigPrompt → parseGig), else — no profile and
        no offer — returns a clear ask for one line, never a chat. The hat (hat.js) is told: on a Fiverr gig page, "fill this in"
        means this tool, not prose. Backend → the tool is the command; UI is the co-pilot itself.
      proof: "the tool is in tools.js; given a fake dom + a written gig it fills the matched fields and returns what it filled and what is left; with no gig and no offer it returns the one-line ask, not a chat; with an offer it writes then fills"
    GA1a_a_written_gig_is_remembered:
      status: OPEN
      depends_on: []
      files: [clear-glass/src/autofill/store.js, clear-glass/src/ipc/bridge.js]
      does: "The last gig written (Settings 'Write the gig', or the tool) is kept (autofill/store.js), so the co-pilot tool and the Settings panel fill the same gig. Read-only reuse elsewhere; one writer."
    GA2_a_missed_field_asks_the_picker:
      status: OPEN
      depends_on: [GA1_copilot_fills_the_gig]
      files: [clear-glass/src/autofill/gig.js, clear-glass/src/ipc/bridge.js, clear-glass/renderer/selector-check.js]
      does: >-
        When fillGig leaves a part with no matched field (and the gig has a value for it), it returns those parts as `needsPick:
        [{ part, value }]`. The co-pilot/tool then pops the element picker (reuse renderer/selector-check.js + the mesh/guardian
        picker pattern) for James to click the field for that part; the pick is live-checked (it must match exactly one element —
        selector-assign's evidence rule) before it is accepted. Nothing is guessed; a part he skips stays left-to-copy, said.
      proof: "a fake page missing the title field returns needsPick for title; a pick that matches one element is accepted, one that matches zero or many is refused with why"
    GA3_the_pick_is_saved_three_ways:
      status: OPEN
      depends_on: [GA2_a_missed_field_asks_the_picker]
      files: [clear-glass/src/autofill/gig-learn.js, clear-glass/src/site-settings/store.js, clear-glass/src/macros/recording.js, clear-glass/src/ipc/bridge.js]
      does: >-
        gig-learn.js saveLearned({ origin, part, selector, value }): writes the selector to per-site settings (store.set(origin,
        `gig.field.<part>`, selector)); records a macro step (recording.js — fill <selector> with <part>); and that same per-site
        entry IS the autofill's learned map. One call, the three homes of GA0b. Everything references the per-site entry, so there
        is one truth (§10.3), not three copies.
      proof: "saveLearned writes the per-site key, appends a macro step, and the entry reads back; re-saving the same part replaces, never duplicates"
    GA4_the_matcher_learns:
      status: OPEN
      depends_on: [GA3_the_pick_is_saved_three_ways]
      files: [clear-glass/src/autofill/gig.js]
      does: >-
        matchGigFields consults the per-site learned map (gig.field.<part>) for the open origin BEFORE GIG_PATTERNS: a learned
        selector matches with 'high' confidence and is sourced 'learned'. So the field James pointed at once is filled every time
        after, and never asked again. A learned selector that no longer matches the page falls back to the patterns, said.
      proof: "with a learned selector for title, a page whose title field matches no pattern is still filled, sourced 'learned'; a stale learned selector falls through to the patterns"
    GA5_commands_and_the_panel:
      status: OPEN
      depends_on: [GA3_the_pick_is_saved_three_ways]
      files: [idearium/cli/route-commands.js, clear-glass/renderer/settings/sections/autofill.js]
      does: "`gig fill`, `gig learned <origin>` as command rows; the Autofill panel shows the learned fields per site (with a Forget), so the three saves are visible and undoable (§0.3 reversible)."
    # §JA 2026-10-23/24 — the general job-application form of the learn-loop (addenda below). JA1/JA2 recorded here as phases so
    # the DAG standard (DG3) sees them; their record is the addenda.
    JA1_the_matcher_consults_learned:
      status: DONE (0.60.225)
      depends_on: [GA0c_the_learned_map_is_per_site]
      files: [clear-glass/src/autofill/matcher.js]
    JA2_a_pick_is_saved_per_site:
      status: DONE (0.60.226)
      depends_on: [JA1_the_matcher_consults_learned]
      files: [clear-glass/src/autofill/matcher.js, clear-glass/src/ipc/bridge.js, clear-glass/src/copilot/tools.js, clear-glass/src/copilot/bridge.js]
    JA3_the_picker_on_a_miss:
      status: DONE (0.60.230)
      depends_on: [JA2_a_pick_is_saved_per_site]
      files: [clear-glass/src/autofill/learn-pick.js, clear-glass/src/autofill/matcher.js, clear-glass/src/ipc/bridge.js, clear-glass/src/copilot/tools.js, clear-glass/src/copilot/bridge.js, idearium/cli/route-commands.js]
      does: >-
        A fill reports what it could not place: `needsPick` = { unplaced: the profile's field types with a value that no field took,
        unmatched: the page's fillable fields nothing matched }. For one fieldType, POST /cli/autofill/pick pops the Guardian picker
        in its field mode (renderer/guardian-picker.js pickField — the one src/providers/attention.js already drives) in the
        application's tab; he clicks the field (traverses with the arrows, USE). The pick is resolved to the dom mesh's own field
        record (archaeology.js, the same record matchFields reads), checked (a fillable box; a key — fieldKeysOf — that names exactly
        one field on the page, stable keys preferred by selector-check.js's looksGenerated), saved through the one JA2 save path, and
        the page is filled again with the new learned map. Cancel or a refused pick saves nothing and says why.
      proof: "pure: needsPick lists unplaced types and unmatched fields; chooseKey prefers a stable unique key, refuses one shared by two fields; pickAndLearn with a fake tab: a pick saves + refills, a cancel saves nothing, a button pick is refused"
    JA4_the_learn_loop_ui:
      status: DONE (0.60.231)
      depends_on: [JA3_the_picker_on_a_miss]
      files: [clear-glass/src/autofill/learn-pick.js, clear-glass/src/autofill/matcher.js, clear-glass/src/ipc/bridge.js, clear-glass/src/preload/index.js, clear-glass/src/copilot/tools.js, clear-glass/src/copilot/bridge.js, idearium/cli/route-commands.js, clear-glass/renderer/settings/sections/autofill.js, clear-glass/renderer/settings/sections/autofill.css]
      does: "The Autofill panel: after a fill or a preview, the unplaced fields each get a 'Pick' (IPC autofill:pick); the learned fields per site are listed with a Forget (§0.3 reversible). Backend first: learn-pick.js listLearned / forgetLearned over the store's own listOrigins / deleteKey; GET|DELETE /cli/autofill/learned; rows `autofill learned|forget`; co-pilot tools autofill.learned / autofill.forget."
      proof: "pure: listLearned across origins (only autofill.field.* keys), forgetLearned removes one and leaves the site's other settings; in Clear Glass (glass.js) the Settings › Autofill page: a Fill with an unplaced github shows a Pick that calls autofill:pick and reports the save; the learned pane lists a real store's entries and Forget removes one"

    JA5_the_pick_is_also_a_macro:
      status: DONE (0.60.232)
      depends_on: [JA4_the_learn_loop_ui, GA0b_where_a_pick_is_kept]
      files: [clear-glass/src/autofill/learn-pick.js, clear-glass/src/ipc/bridge.js, clear-glass/renderer/settings/sections/autofill.js]
      does: >-
        His 2026-10-19 "saves to per site settings, and as a macro or automation" — the third home GA0b decided. At the pick, the box is
        also given a CSS selector by renderer/selector-check.js (key 'input': exactly one match, the editable box picked), kept per-site as
        autofill.selector.<fieldKey>. From a site's learned fields the macro "autofill <host>" is (re)built: urlPattern <origin>/*, one
        `type` step per field with a selector ({{param}} text — the profile's values are never stored in the macro, they are given at run),
        saved through macro.js's own create (delete + create: it refuses a duplicate name; the old row is kept as history, §0.3), and exported
        as a .macro node into the automation nodes folder (macro.js export) — so it is an automation too. A field with no stable selector is
        left out of the macro and said; Forget rebuilds the macro without it (and removes it when nothing is left).
      proof: "pure: macroFor builds steps/params/urlPattern from learned + selectors and lists the fields left out; saveMacro replaces an existing macro and exports the node; pickAndLearn with a fake tab saves the selector and the macro; Forget rebuilds it; on screen the Pick says the macro"

  build_order: "GA1 + GA1a first (the 'yes', makes 'fill this in for me' work); then GA2 → GA3 → GA4 (the picker-learn loop); GA5 last (surfaces it)."
  verification_here: "No real Fiverr page or browser in this container: every phase is proven with a fake dom bridge, fake page fields and a fake picker in Clear-Glass-driven tests; the real fill is his machine's (said, not faked)."

## ADDENDUM 2026-10-23 (JA1, 0.60.225) — the learn-loop extended off Fiverr to general job applications
James, 2026-10-23 (the gig-work email): "for clearglass, job applications/autofill. look clearglass" · "make sure it works for these"
(micro1, AfterQuery, RemoExperts, Turing, Mercor; boards OpenTrain / aitraining.jobs / aitrainer.work).
GA0c made the GIG matcher (matchGigFields) consult a per-site learned map. JA1 does the same for the GENERAL application matcher
(clear-glass/src/autofill/matcher.js matchFields), so the same "pick it once, it's remembered per-site" loop works for any job
application, not just the Fiverr gig editor. Decided by his axioms (§8.6 reuse): same site-settings store, same picker/selector-assign
pattern GA2–GA5 name; no new store.
- **Built:** matchFields consults opts.learned ({fieldKey→fieldType}) before its patterns (a human pick is highest authority,
  source 'learned'); fieldKeysOf(field) gives the identities the picker and matcher share; detectFields/fillFields forward learned.
  Test tests/modules/test-autofill-learned.test.js JA 4/4.
- **Open (the rest of the loop, general form of GA2–GA5):** JA2 save a pick to site-settings (autofill.field.<key>) under the
  application's origin; JA3 the element picker on a missed field; JA4 the UI + the IPC loading learned from site-settings on fill;
  and a real Clear Glass fill on one live listing (his login).

## ADDENDUM 2026-10-23 (JA2, 0.60.226) — the pick is saved per site, and the fill path reads it back
James, 2026-10-23: "then the phases with the per site settings."
JA1 made matchFields *consult* a learned map; it never *saved* one, and nothing loaded it on a real fill. JA2 closes that loop
for the general application matcher, the per-site home GA3/GA4 name — reusing the existing SiteSettingsStore (§8.6, no new store).
- **Built (backend → route → command → agent, his order 2026-10-07):**
  - clear-glass/src/autofill/matcher.js — two pure helpers so the save door and the fill path agree on one format:
    `learnKey(fieldKey)` → `autofill.field.<fieldKey>` (lowercased, trimmed); `learnedFromSettings(allForOrigin)` → the
    `{fieldKey→fieldType}` map matchFields already consumes (prefix-scoped, so unrelated site-settings keys are ignored). Exported.
  - clear-glass/src/ipc/bridge.js — `POST /cli/autofill/learn` ({fieldKey, fieldType, url?}) saves
    siteSettings.set(origin, learnKey, fieldType) under the tab's normalized origin; `_pageUrl(agentId)` / `_learnedFields(agentId)`
    load learnedFromSettings(getAllForOrigin(url)) and `/cli/autofill/{detect,fill}` now pass that learned map to the matcher, so a
    taught field fills on that site on the next visit without being asked again.
  - clear-glass/src/copilot/tools.js + copilot/bridge.js — the `autofill.learn` tool and its dispatch, so an agent can teach a
    field through the same door a person uses.
  - Test tests/modules/test-autofill-learn-save.test.js JA2 3/3 (pure round-trip prefix-scoped; per-origin isolation on the real
    SiteSettingsStore; a saved pick drives matchFields to fill a pattern-missed field end-to-end).
- **Open:** JA3 the element picker pops up on a missed field (reuse renderer/selector-check.js + selector-assign); JA4 the UI for
  the learn-loop (the fill path already loads learned); and a real Clear Glass fill on one live listing (his login, his machine).

## ADDENDUM 2026-10-24 (JA3, 0.60.230) — the element picker on a missed field
James, 2026-10-19: "if he doesn't understand, have the element picker popup for me to select the element for him. saves to per site
settings, and as a macro or automation and updates the autofill." · 2026-10-24: "ja3" (asked "continue with JA3?" after the session
that built JA1/JA2 was closed by accident; the coder had listed JA3, JA4 and a live fill as what was open).
- **Built:** clear-glass/src/autofill/learn-pick.js (needsPick · chooseKey · saveLearned · pickAndLearn); fillFields returns needsPick;
  POST /cli/autofill/pick + IPC autofill:pick (bridge _autofillPick); the IPC autofill:detect/fill (the panel's door) now load learned too
  (JA2 had wired only the HTTP routes); JA2's /cli/autofill/learn now saves through saveLearned (one save
  path); rows `autofill pick|learn`; co-pilot tool autofill.pick (5 min wait). Loom: copilot-capability-map + economy-map edges.
  Test tests/modules/test-autofill-learn-pick.test.js JA3 5/5; JA1 4/4, JA2 3/3 still pass.
- **Decided by his axioms (§8.6 reuse, §1.2 nothing silent, §0.3):** the picker is guardian-picker.js pickField (attention.js's mode);
  a pick resolves to the dom mesh record matchFields reads; the learned key must name exactly one field on the page (selector-assign's
  evidence rule), stable first by selector-check.js looksGenerated; a cancel or refusal saves nothing and says why.
- **Readings, to confirm:** (1) "as a macro or automation" — GA0b's third home is NOT built for JA; site-settings + the learned map
  (one entry) are. (2) "reuse selector-check.js" read as its looksGenerated + selector-assign's one-match rule on field keys, since the
  learned identity is a field key, not a CSS selector.
- **Not proven here:** the page scripts in a live Clear Glass tab (no Electron display in this container; no Playwright, his rule).
- **Version:** 0.60.230, skipping 0.60.227–229, which the unmerged claude/sleepy-gates-9lc085 branch already uses.
- **Open:** JA4 (the panel's pick-it + learned list with Forget); the macro home; a real fill on a live listing (his login).

## ADDENDUM 2026-10-24 (JA4, 0.60.231) — the learn-loop on screen
James, 2026-10-24: "continue" — said after the JA3 report, which named JA4 next (the panel's "pick it" per missed field, and the
learned fields per site with a Forget).
- **Built (backend → route → command → UI, his order 2026-10-07):** learn-pick.js listLearned / forgetLearned (the store's own
  listOrigins / deleteKey, §8.6); detectFields reports needsPick; GET|DELETE /cli/autofill/learned + POST /cli/autofill/forget;
  IPC autofill:learned / autofill:forget; preload cg.autofill.pick / learned / forget; rows `autofill learned|forget`; co-pilot tools
  autofill.learned / autofill.forget; Settings › Autofill: "Pick <field>" after a Fill or Preview, and the "Fields it learned" pane
  with Forget. Loom: economy-map edges panel → preload → IPC, co-pilot → routes.
- **Found by the screen test (§0.1):** the panel's call() turns any {ok:false} into a toast, so a cancelled or refused pick left the
  "click the box…" line on screen; the Pick reads its answer directly and says it in place.
- **Proof:** tests/modules/test-autofill-learn-ui.test.js JA4 3/3, the screen driven in Clear Glass (glass.js) over the real learn-pick.js
  and a real per-origin store (the pick's tab is a fake one; no live page here).
- **Still open:** the macro home of his "as a macro or automation" (to confirm with him); a real fill on a live listing (his login).

## ADDENDUM 2026-10-24 (JA5, 0.60.232) — the pick is also a macro and an automation node
James, 2026-10-24: "merge and push. yes make the macro too." — his answer to the coder's question after JA4: his 2026-10-19 words also
say the pick saves "as a macro or automation"; JA3/JA4 saved it only to per-site settings (read "to confirm" in the JA3 addendum).
This closes that reading: GA0b's third home is built for the general autofill. "merge and push" was done first: PR #152 (JA3+JA4) merged
to main at e05a5ed8; the branch was restarted from main for this phase.
- **Built:** learn-pick.js selectorScript / macroFor / saveMacro / macroName; resolveScript returns the box's own xpath (a label click
  resolves to its box); pickAndLearn keeps autofill.selector.<fieldKey> and saves the macro; forgetLearned drops the selector; bridge
  _autofillMacroDoor (macroTool + automation NODES_DIR) and _autofillForget (forget, then rebuild the macro); the Pick message and the
  learned list say the macro. Loom: economy-map edges learn-pick → selector-check, bridge → macro.js and automation-engine.
- **Decided by his axioms:** §8.6 reuse — selector-check.js gives the selector (key 'input'), macro.js stores and validates the macro,
  its export writes the .macro node (the automation form); no new store. §0.3 — a macro is replaced by delete + create, which keeps
  the old row as history. §4.3 (cybersecurity-grade privacy) — the profile's values never enter the macro; each step types a {{param}}
  given at run. §1.2 — a field with no stable selector is still learned and is said to be left out of the macro.
- **Proof:** tests/modules/test-autofill-learn-macro.test.js JA5 5/5 — including a REAL page in Clear Glass (glass.js) with the real dom
  mesh and selector-check.js, and the real macro.js create validation; test-autofill-learn-ui.test.js JA4 3/3 now checks the macro on
  screen.
- **Open:** a real fill on a live listing (his login, his machine).
