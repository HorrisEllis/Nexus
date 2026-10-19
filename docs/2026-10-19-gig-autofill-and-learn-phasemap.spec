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

  build_order: "GA1 + GA1a first (the 'yes', makes 'fill this in for me' work); then GA2 → GA3 → GA4 (the picker-learn loop); GA5 last (surfaces it)."
  verification_here: "No real Fiverr page or browser in this container: every phase is proven with a fake dom bridge, fake page fields and a fake picker in Clear-Glass-driven tests; the real fill is his machine's (said, not faked)."
