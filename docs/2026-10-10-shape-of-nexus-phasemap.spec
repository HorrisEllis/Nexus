spec:
  meta:
    name:     shape-of-nexus
    version:  1.0.0
    date:     2026-10-10
    release:  0.56.0 (base)
    uuid:     nexus-shape-of-nexus-phasemap-v1-0000-2026-1010-jamesbrooks-001
    owner:    every system (options) · idearium (the settings console) · clear-glass (the browser, the field, the tutorial) · cos (the empirical layer)
    status:   "MAPPED 2026-10-10; OP4 built in 0.57.0; OP0–OP2 started in 0.57.0 with guardian"
    voice: >
      The ideas, the direction and the calls are James's. Each phase's `james:` is his, verbatim. `does:` is the coder's
      reading, his to correct. `pushback:` is where the coder thinks the plan as said has a hole — his to decide.
    axioms:   docs/AXIOMS-v3.1.md — §3.3 map before build, §8.6 reuse; docs/architecture-spec HARDLINE_AS_LITTLE_AS_POSSIBLE (anything that can change is a node, not a literal)
    origin: >
      James, 2026-10-10: "can you have these settings broken up into repos? or at least expand the settings drastically,
      i prefer options over hard coded, and i prefer it over code honestly. anything high leverage, or that removes the need
      to understand code so i dont have to change it. eventually, i want a entire nexus tutorial using copilot, spotlight,
      in clearglass, with the interaction field. also need that fixed at somepoint, like google.com injects over 1000
      scripts. i dont know how to use it, or it doesnt work. the fiverr tutorial needs to be in the browser.hmtl, all of
      the browser.js needs to show in the html or consolidate and pick a source of truth. okay. can you compile all of
      those, invent any you can think of to fix the shape of nexus. maybe like epistomology, and using the cos as
      empirical. also have the envirement and desktop tabs in the same manu, have it dynamic. like once you set it up,
      change the button to edit desktop. and have a setting button next to it."
  found:
    options: >
      Idearium already has the engine he wants: idearium/lib/config-core.cjs — one schema, layered (defaults →
      idearium.config.json → the persisted row), each leaf { type, default, min, max, copilot_writable }, 71 settings in
      13 groups (chunking, import, repo, compartment, api, pipeline, snapshots, repos, desktop, ui, specs, routing, cicd),
      shown in the console's Global configuration. No other system has one: their knobs are environment variables or
      constants in code — including the five added to guardian this week (GUARDIAN_PICKUP_MS, GUARDIAN_NO_TAB_MS,
      GUARDIAN_ECONOMY_WAIT_MS, GUARDIAN_COMPLETION_TIMEOUT_MS, GUARDIAN_EMPTY_REPLY_GRACE_MS).
    settings_console: >
      Repos are already one entry each (17, nexus/<system> for each system); each has Agent · Prompt · Hat · Compartment &
      desktop. What a repo's settings cannot show is the settings of the SYSTEM the repo is (nexus/guardian's guardian).
    environment_and_desktop: >
      Idearium's repo Settings tab lists Environment and Desktop as two items; Desktop always shows "open desktop" and
      "set up desktop" side by side, whether or not the machine has the base image (cos/testenv capabilities().vm).
    browser: >
      clear-glass/renderer/browser.html (530 lines) is a shell; browser.js (3,420 lines) builds most of the page in script.
      The Fiverr flow lives in clear-glass/src/autofill/gig.js and the copilot tools, not in the browser's own page.
    field: >
      clear-glass/src/page/field.js — the interaction field (every interactive element numbered, with x, y and z). Every
      web-contents Clear Glass creates (each frame and webview) passes through app.on('web-contents-created'); a page like
      google.com makes many frames, so anything injected per web-contents is injected many times.
  phases:
    OP0_one_options_shape_for_every_system:
      layer: library
      systems: [core]
      status: "DONE (0.57.0) — lib/options.js: config-core's leaf shape for any system; default → <system>/data/options.json → the env var it names; validated, never clamped; atomic writes; a ledger per change with who asked; read on every get (no restart). test-options OP-01..04."
      james: '"i prefer options over hard coded, and i prefer it over code honestly"'
      depends_on: []
      files: [lib/options.js, idearium/lib/config-core.cjs]
      does: >-
        config-core's leaf shape, shared: lib/options.js reads a system's <system>/options.js schema ({ group: { key: {
        type, default, min, max, unit, description, env, copilot_writable } } }), layers defaults → the system's own
        <system>/data/options.json → an environment variable when one is named (so every existing env var keeps working,
        and the setting shows where its value came from). Validated by type and range; a bad value is refused with the
        reason, never silently clamped. One reader, every system — Idearium's config-core stays as it is and is the model.
      proof: "a guardian option set in the file wins over its default, an env var wins over the file, and each value says its source"
    OP1_every_system_declares_its_options:
      layer: library
      systems: [guardian, copilot, cortex, intelligence, versionium, cos, loom, orchestrator, architect, diagnostic, eravos, clear-glass, ollama, emerge, warp]
      status: "PARTIAL (0.57.0) — guardian done (guardian/options.js: 13 options in jobs, retry, ask, routing; its code reads them, env vars still win; OP-05); copilot, versionium, cos and the rest open"
      james: '"anything high leverage, or that removes the need to understand code so i dont have to change it"'
      depends_on: [OP0_one_options_shape_for_every_system]
      files: ["<system>/options.js"]
      does: "Each system's literals that can plausibly change (timeouts, retries, limits, ports, thresholds, gaps) move into its options.js with their current value as the default — guardian first (the job lifecycle: pickup, no-tab, economy wait, completion window, retries, grace), then copilot, versionium, cos. Each one a node (ConfigNode in the architecture spec)."
      proof: "grep finds none of guardian's lifecycle numbers as literals in its code; every one is an option with a description"
    OP2_the_system_settings_in_its_repo:
      layer: ui
      systems: [idearium, core]
      status: "DONE for guardian (0.57.0) — Idearium GET/POST /api/systems/:system/options → the system's /api/options (JSON writes only); the console's nexus/<system> repo has a System tab (grouped, described, range, default, source, reset; refusals said). Clear Glass probe; other systems show 'no options yet' until OP1 reaches them"
      james: '"can you have these settings broken up into repos? or at least expand the settings drastically"'
      depends_on: [OP1_every_system_declares_its_options]
      files: [idearium/ui/settings.html, idearium/api/index.js]
      does: "The settings console's nexus/<system> entry gets a System tab: that system's options, grouped, each with its description, unit, range, current value and where it came from, editable; saved through the system's own route (GET/POST /api/options), never by writing its file from Idearium. A filter across every system's options."
      proof: "nexus/guardian → System shows the pickup window at 90 s from its default; changing it to 60 s takes effect on the next job without a restart"
    OP3_copilot_reads_and_sets_options:
      layer: backend
      systems: [copilot, core]
      status: "DONE (0.57.0) — `idearium options <system> [<group.key> <value> | --reset] [--actor copilot]` in the one command table (copilot through nexus.command); copilot-writable enforced by lib/options"
      james: '"removes the need to understand code"'
      depends_on: [OP2_the_system_settings_in_its_repo]
      files: [idearium/cli/route-commands.js]
      does: "A command for every system's options (list, get, set, reset), so copilot can answer 'why did it wait 90 s?' with the option and change it when asked — only the copilot_writable ones, every change ledgered with who asked."
      proof: "asked 'make guardian give up on a silent tab after a minute', copilot sets the option and says which one and the old value"
    OP4_environment_and_desktop_one_menu:
      layer: ui
      systems: [idearium]
      status: "DONE (0.57.0) — idearium/ui/js/repo-settings.js: one item, Environment & desktop; the desktop's buttons follow /api/cos/testenv vm.ok and its state (⚙ set up · ▣ open · ✎ edit · ■ stop · ⚙ settings). Clear Glass probe: the three states."
      james: '"also have the envirement and desktop tabs in the same manu, have it dynamic. like once you set it up, change the button to edit desktop. and have a setting button next to it."'
      depends_on: []
      files: [idearium/ui/js/repo-settings.js]
      does: "One item, Environment & desktop: the environment check first, the desktop under it. The desktop's buttons follow its state — not set up: ⚙ Set up desktop; set up and stopped: ▣ Open desktop · ✎ Edit desktop · ⚙ settings; running: ▣ Open desktop · ■ Stop · ⚙ settings."
      proof: "on a machine with no base image the pane offers only Set up; with one, Open and Edit with ⚙ beside them"
    TU1_the_nexus_tutorial:
      layer: ui
      systems: [clear-glass, copilot]
      status: "OPEN"
      james: '"eventually, i want a entire nexus tutorial using copilot, spotlight, in clearglass, with the interaction field."'
      depends_on: [CG1_the_field_injects_once, CG2_one_source_of_truth_for_the_browser]
      files: [clear-glass/src/page/field.js, clear-glass/src/copilot/tools.js]
      does: "A tutorial copilot runs in Clear Glass: spotlight highlights the real element (through the field's numbered targets), copilot says what it is and why, and waits for him to do it — Idearium, the repo box, the Plan, Settings, guardian's tabs. Each step is data (a node: target, words, done-when), not code, so it is edited like a setting."
      proof: "a first-run tutorial walks from an idea to a built phase, every highlight on the real element, every step skippable"
    CG1_the_field_injects_once:
      layer: library
      systems: [clear-glass]
      status: "OPEN"
      james: '"also need that fixed at somepoint, like google.com injects over 1000 scripts. i dont know how to use it, or it doesnt work."'
      depends_on: []
      files: [clear-glass/src/main/index.js, clear-glass/src/page/field.js, clear-glass/src/dom/archaeology.js]
      does: "Measure first: count injections per page load (a counter per web-contents, reported) on google.com. Then: inject into the top document only (not every frame and worker), once per navigation, guarded so a second injection is a no-op; field and spotlight on demand, not on every load. And say how to use it — the field answers a copilot request, it is not always on."
      proof: "google.com: injections per load reported before and after; after, one per navigation; the field still numbers the page's targets"
    FN1_the_field_as_commands:
      layer: command
      systems: [clear-glass, idearium, copilot]
      status: "DONE (0.59.0)"
      james: '"Can you make the commands for the interaction field and maybe integrate it with nexus nerve?" · earlier: "i dont know how to use it, or it doesnt work."'
      depends_on: []
      files: [idearium/cli/route-commands.js]
      does: >-
        The field had a door only for agents (the clear-glass browser tool → :7702 /cli/driver). Now it is commands, for
        him at the CLI and for every agent through nexus.command: `field` (number the page, --overlay draws it, --all every
        target, --on <window>) · `field off` · `field at <x> <y>` (what a click there would hit) · `field show <n|selector>
        [label]` (spotlight) · `field point <n> [click|double|right|move|scroll|type] [--text] [--via eros]` · `field
        windows` (what the field is doing in each window). Route commands could reach other systems but dropped a POST's
        body, and Clear Glass was not one of them; both fixed (Clear Glass by CLEARGL_IPC_PORT, the agent tools' own).
      proof: "test-field-nerve FN-01..: each row's request; a stub Clear Glass answers and the row prints the field's text map"
    FN2_nerve_sees_the_field:
      layer: backend
      systems: [clear-glass, cortex]
      status: "DONE (0.59.0)"
      james: '"maybe integrate it with nexus nerve"'
      depends_on: [FN1_the_field_as_commands]
      files: [clear-glass/src/page/attention.js, clear-glass/src/ipc/agent-routes.js, clear-glass/src/driver/index.js, lib/nerve/index.js]
      does: >-
        Nerve is the attention layer (docs/nexus-nerve.spec: it shows, it never decides or acts). The field is where an
        agent is looking and pointing — attention, exactly. Found reading it: Nerve's per-window attention (P7) never saw
        anything — it read /bus/log as an array or .events/.sample, but the bus log answers { level, count, entries } and at
        the EVENTS level carries no event data, so no agentId. Clear Glass now keeps a small per-window attention record
        (page/attention.js: DOM activity, the last field map, spotlight and pointer — field.pointer is now emitted) served
        at GET /cli/attention; Nerve reads it, and each window in its snapshot carries its focus. Still read-only: nothing
        here acts, and Nerve has no command path.
      proof: "FN: attention.js keeps per-window focus from the real event names; nerve's snapshot windows carry it from a stub /cli/attention"
    FN3_the_nerve_shows_it_and_the_field_sees_the_nerve:
      layer: ui
      systems: [ui, clear-glass]
      status: "DONE (0.59.0)"
      james: '"maybe integrate it with nexus nerve"'
      depends_on: [FN2_nerve_sees_the_field]
      files: [ui/tv-shell/nerve/nerve.js, ui/tv-shell/nerve/nerve.html, ui/tv-shell/nerve/nerve.css]
      does: >-
        Both ways. The nerve canvas shows where an agent's attention is: the browser node lights while a window's field is
        in use, and the HUD says it ("default · #3 Apply now · click"). And the canvas was invisible to the field — a canvas
        has no elements to number — so each node now has a transparent, labelled button over it: the field numbers the
        nerve's nodes, `field show` rings one, `field point` presses one (it says that node's state).
      proof: "Clear Glass probe nerve-field-glass: the field numbers the nerve's nodes by name; the HUD shows a window's focus from the snapshot"
    CG2_one_source_of_truth_for_the_browser:
      layer: ui
      systems: [clear-glass]
      status: "OPEN"
      james: '"all of the browser.js needs to show in the html or consolidate and pick a source of truth."'
      depends_on: []
      files: [clear-glass/renderer/browser.html, clear-glass/renderer/browser.js]
      does: "Decide one source of truth for the browser's UI: the HTML holds the structure (every panel, button and section present in browser.html, findable), browser.js only behaviour. What browser.js builds as markup strings moves into the HTML (templates where it repeats). Checked by a probe: every id browser.js touches exists in browser.html."
      pushback: "3,420 lines of script is weeks of careful moving; one panel at a time, each proven in Clear Glass, the old builder archived after."
      proof: "every element id browser.js reads is in browser.html; browser.js builds no top-level markup"
    CG3_the_fiverr_tutorial_in_the_browser:
      layer: ui
      systems: [clear-glass]
      status: "OPEN"
      james: '"the fiverr tutorial needs to be in the browser.hmtl"'
      depends_on: [CG2_one_source_of_truth_for_the_browser, TU1_the_nexus_tutorial]
      files: [clear-glass/src/autofill/gig.js, clear-glass/renderer/browser.html]
      does: "The Fiverr gig flow (autofill/gig.js) as a tutorial in the browser's own page, run by TU1's engine — the same steps as data."
      proof: "opening the Fiverr tutorial from the browser walks the gig form on the live page"
    EP1_every_claim_says_how_it_is_known:
      layer: library
      systems: [core, intelligence]
      status: "OPEN"
      james: '"maybe like epistomology"'
      depends_on: []
      files: [lib/node-schemas]
      does: >-
        Invented to fix the shape. Nexus keeps re-deriving the same distinction in different words: RFR2's edge kinds
        (explicit, rule, adapter, observational), SD12's relation kinds (stated, rule, proposed, observed), loom's declared
        vs served, the roadmap's DONE vs DONE-ELSEWHERE vs claimed, the gate's verdicts, the economy's learned vs default
        limits. One epistemic status on every claim — a node, a relation, a status, a number: stated · derived · proposed ·
        observed · verified — with the evidence it rests on. Everything shown carries it; nothing is "done" or "true"
        without saying how that is known.
      proof: "a phase marked DONE shows its evidence (a test, a probe, a commit); a route marked served shows the check that proved it"
    EP2_cos_is_the_empirical_layer:
      layer: library
      systems: [cos, intelligence]
      status: "OPEN"
      james: '"and using the cos as empirical"'
      depends_on: [EP1_every_claim_says_how_it_is_known]
      files: [cos/playground/compare.js, guardian/lib/agent-model-nodes.js]
      does: >-
        A claim moves from proposed to verified only by an experiment: a COS compartment (a snapshot opened, SN1), a
        workload, a measurement (RFR2 delta and sigma, SN3), a verdict. The scientific loop as a mechanism — hypothesis,
        experiment, evidence, updated belief — for agents ("chatgpt is better at specs"), builds ("this phase works"),
        options ("60 s is enough for a silent tab") and fixes. Guardian already keeps .agent_model hypotheses per agent;
        they become the first claims tested this way.
      proof: "the claim 'a 60 s pickup window loses no real jobs' is run as an experiment over recorded jobs and comes back verified or refuted, with its data"
    SH1_one_home_for_every_concept:
      layer: library
      systems: [core, loom]
      status: "OPEN"
      james: '"invent any you can think of to fix the shape of nexus"'
      depends_on: []
      files: [docs/sources-of-truth.yaml]
      does: >-
        Invented. The shape problem behind most of this week: the same concept in two or three places — three branch
        mechanisms, three palettes, two sigma and two delta, two configs (idearium's and env vars), loom's wires and the
        computed graph, browser.js and browser.html. One file names each concept's single home and its archived
        alternatives; a check fails when a new duplicate appears (a second chunker, a second router).
      proof: "the file lists each concept with one home; adding a second implementation of a listed concept fails the check"
    SH2_explain_this_anywhere:
      layer: ui
      systems: [clear-glass, copilot, idearium]
      status: "OPEN"
      james: '"removes the need to understand code so i dont have to change it"'
      depends_on: [OP2_the_system_settings_in_its_repo]
      files: [clear-glass/src/page/field.js, clear-glass/src/copilot/tools.js]
      does: "Invented. Point at anything in a Nexus page (the field gives it a target) and ask: copilot says what it is, which node and system it belongs to, which options govern it (OP2) and what it last did — and offers to change the option rather than the code."
      proof: "pointing at the Plan's 'retrying' badge explains it and offers guardian's retry option"
    LR0_the_shared_primitives_are_the_glyph:
      layer: library
      systems: [core, idearium, guardian]
      status: "OPEN"
      james: '"what about using the most common primitives between the code langauges, to synthesize the cheapest code tokens. like at lib folder, the listener or language tool in guardian or root/ib?"'
      depends_on: []
      files: [lib/chunk-glyph.js, lib/languages.js, lib/build-context.js]
      does: >-
        The primitives every language shares already have a grammar: lib/chunk-glyph.js (defines, imports, calls,
        events, routes, env, side effects, throws, purpose). Today it reads JS only. LR0 gives it one small reader per
        language family (python, go, rust, shell first), keyed from lib/languages.js, so a glyph means the same thing
        whatever the file is written in. Two uses, both deterministic: (1) READ — agents get glyphs of the code around a
        task instead of the code (lib/build-context.js already packs glyphs for JS); (2) WRITE — from a component's
        glyph (its signatures, imports and contract) the skeleton is generated in the target language, so the model
        writes only the bodies. It lives in root lib/: it serves every system; guardian is the transport to the agents
        and only carries what lib/build-context.js packs.
      pushback: >-
        Not a new code language for the models to write. A synthesized "cheapest common syntax" saves tokens on output
        and loses them back on errors — the models write JS, TS and Python best. The tokens are on the input side (what
        an agent must read to work), and that is where the glyph saves them. Writing stays in a real language; only the
        scaffolding comes from the primitives.
      proof: "the same small module written in JS and Python gives the same glyph fields; a phase build's prompt with glyph context is measured smaller (scripts/bench-file-prompt.js) with the same phase passing; a Python skeleton generated from a JS component's glyph runs its contract test in COS"
    LR1_each_component_in_the_language_that_fits:
      layer: library
      systems: [core, loom, idearium, cos]
      status: "OPEN"
      james: '"huge idea. wait what about dynamic language routing, like with a parser or adapter, use what ever coding language is best fit for the job, or the lest amount of tokens, using the components registry as a bridge?"'
      depends_on: [P8_per_system_component_registry, LR0_the_shared_primitives_are_the_glyph]
      files: [lib/agent-providers.js, cos/testenv/detect.js, idearium/repo/graph.js]
      does: >-
        A component's language is chosen per component and recorded in the registry with why — the job's fit (a parser
        in a language with the right library, numeric work in one with fast arrays, the UI in JS), the tokens it costs
        the model to write and read, how well the agents write it (measured: the eval sweep, SN benchmarks), and what the
        person can read. Components never call each other across languages directly: they meet at the registry's
        contract — a route or a stdio JSON hook declared in the registry — so the registry is the bridge and every
        language is an adapter (run it, call it, parse its errors). COS already knows how to install and test node,
        python, go, rust, ruby, php and make (cos/testenv/detect.js); the code graph already reads several languages.
      pushback: >-
        "Fewest tokens" is a trap on its own: terse languages are cheap to write and expensive to get right, and the
        agents are measurably better in JS, TS and Python than elsewhere. Every language added is a toolchain to install,
        a test runner, an error format and a reader James cannot follow. And every cross-language call is a process
        boundary — serialization and latency — so it belongs between components, never inside one. Proposed rule: one
        default (JS, Nexus's own), a second only when a component's declared need names it, the choice and its evidence
        on the component's node; a language is admitted when its adapter (install, run, test, parse errors) passes in COS.
      proof: "a component declared as Python (for a library only Python has) is built, tested in COS and called from a JS component through its registry contract; its node says why Python"
