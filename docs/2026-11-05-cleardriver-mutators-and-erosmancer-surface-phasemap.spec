# docs/2026-11-05-cleardriver-mutators-and-erosmancer-surface-phasemap.spec — ClearDriver's DOM mutators (watch rules for anchors,
# listeners, macros) and ErosmancerOS's options in plain words, CLI first, then browser.html. Owner: clear-glass. The asks are James's; the
# readings, shape and order are the coder's, decided by his axioms (cited). MAPPED, nothing built.

origin: >-
  James, 2026-11-05, after the element engine was mapped: "as long as nothing is lost, what about cleardriver? expand it exponentially if
  possible. i want to be able to add dom mutators for node anchor for guardian, listeners, macros, etc. what do you think?" · "can you expand
  erosmanceros. add as much human ledgible options as possible, inscluding adding typescripts, threats, etc, all cli first, then into the
  browser.html."

found_before_mapping: >-
  (§0.1, read 2026-11-05) ClearDriver (clear-glass/src/driver/: glass.js, index.js, page-resolver.js, url-listener.js, glass-host; 2,206
  lines) drives a page over the DevTools protocol and listens for URLs. Several pieces each run their own MutationObserver with no shared
  rule: element-gate.js, keyboard-mode.js, dom/archaeology.js, chat-ledger.js, autofill/suggest.js, bookmarks/browser.js, and ErosmancerOS's
  own observer (src/observer). ErosmancerOS's modules: adaptive, api, behavior (profiles; ER2 0.60.253 made them account options), bridge,
  dispatcher, hostile, observer, registry, replay, routing, selector, telemetry. hostile/ detects bot traps and anti-automation defences
  (Cloudflare, CAPTCHA, honeypots, rate limits, fingerprinting and CDP-detection scripts) and recommends a routing or behaviour change. Nothing
  of ErosmancerOS has a CLI row or a screen.

the_coder_s_view: >-
  (asked "what do you think?") Yes, and it is the right next layer: every observer above is the same idea written again. One watch rule —
  WHEN this element (an identity from the element engine, EE1) appears, changes, disappears, or its text or an attribute changes, DO this
  (re-anchor a Guardian node anchor, emit an event listeners can take, run a macro, check a gate) — makes them one mechanism a person or an
  agent can add from the CLI. Reuse: the element engine's identity (EE1), Clear Glass's bus and event taxonomy, macros and gates as they are.
  Nothing is lost: each existing observer keeps working until it is moved onto the rules, and is archived only when nothing calls it (§0.3).

readings_to_confirm:
  - "\"adding typescripts\": (a) his own TypeScript files dropped in a folder become ErosmancerOS actions a rule or a macro can run (it already
     runs TypeScript, with tsx) — the coder's reading; (b) ErosmancerOS's own modules made editable from the CLI; (c) something else."
  - "\"threats\": ErosmancerOS's hostile/ detections (challenges, CAPTCHAs, honeypots, rate limits), shown in plain words."

decisions:
  CM_D0_what_typescripts_means:
    status: "OPEN — his (the readings above)"
  CM_D1_a_threat_hands_over_never_evades:
    status: "DECIDED by his axioms; the coder's line, said plainly"
    chosen: >-
      A detected challenge, CAPTCHA or bot check stops the automation on that page and hands it to him (a toast: what was seen, on which page,
      with the page brought forward). The detections are kept and shown in plain words. What is NOT built: changing behaviour, fingerprints or
      routing to get past a site's bot check. That is evading the site's own security, and on his own accounts (Fiverr, Google) it risks the
      account itself. Honeypot fields are never filled (a person would not see them either).
    by_the_axioms: "USER_AUTONOMY (a site's challenge is a question for the person, so it goes to him), TRUTH_OVER_COHERENCE (said, never hidden), §1.2 (nothing silent)"

phases:
  CM1_watch_rules:
    status: OPEN
    depends_on: [EE1_one_identity_for_a_chosen_element]
    files: [clear-glass/src/driver/watch.js, clear-glass/src/schemas/watch.schema.json, clear-glass/src/event-taxonomy.js, idearium/cli/route-commands.js, tests/modules/test-cg-watch-rules.test.js]
    does: >-
      ClearDriver's watch rules: { id, site, target (an element identity, or a selector, or a URL pattern), when (appear | change | remove |
      text | attr:<name>), do (anchor | emit | macro:<name> | gate:<name>), once? }, stored as node files per site, with a schema. One observer
      per page runs every rule for it. CLI first: `cg watch add | list | remove | test` through Clear Glass's door.
    proof: "a rule added from the CLI fires once when its element appears on a fixture page, and is listed and removed; a bad rule is refused by the schema with why"
  CM2_guardian_anchors_follow_the_page:
    status: OPEN
    depends_on: [CM1_watch_rules]
    files: [clear-glass/src/driver/watch.js, clear-glass/src/page/page-memory.js, clear-glass/renderer/guardian-picker.js, tests/modules/test-cg-watch-rules.test.js]
    does: "A Guardian node anchor (AF5's ⚓, the picker's anchors) is a watch rule with do: anchor — when the page replaces the node, the anchor is found again through its identity and moved, said in the log."
    proof: "an anchor on a fixture element survives the page replacing that element"
  CM3_listeners_and_macros:
    status: OPEN
    depends_on: [CM1_watch_rules]
    files: [clear-glass/src/driver/watch.js, clear-glass/src/macros, lib/automation/pipeline.js, clear-glass/src/event-taxonomy.js, tests/modules/test-cg-watch-rules.test.js]
    does: >-
      do: emit puts cg.watch.fired { rule, site, element, when } on Clear Glass's bus (declared in its taxonomy), so macros, pipelines and
      co-pilot can listen. A macro can start on a rule (do: macro:<name>) and gains a step "wait until <rule> fires".
    proof: "a macro waits on a rule and continues when the element appears; the event is on the bus with its rule"
  CM4_the_old_observers_on_the_rules:
    status: OPEN
    depends_on: [CM2_guardian_anchors_follow_the_page, CM3_listeners_and_macros]
    files: [clear-glass/src/page/element-gate.js, clear-glass/src/autofill/suggest.js, clear-glass/src/dom/archaeology.js, _archive]
    does: "Each existing MutationObserver moved onto watch rules one at a time, its tests unchanged; the replaced code archived with a note (§0.3)."
    proof: "each moved piece's own suite unchanged; no observer left without a caller"
  ES1_erosmancer_options_in_plain_words:
    status: OPEN
    depends_on: []
    files: [clear-glass/erosmancer/erosmancer-os/src/api/server.ts, clear-glass/erosmancer/erosmancer-os/src/options.ts, clear-glass/src/eros/supervisor.js, idearium/cli/route-commands.js, tests/modules/test-eros-options.test.js]
    does: >-
      Every ErosmancerOS option (behaviour profiles, selector strategies and their order, routing, telemetry, replay, observer, hostile
      detectors) listed with a plain-words description, its value, its default and what changing it does. Read and set from the CLI (`eros
      options`, `eros set <key> <value>`) through ErosmancerOS's own API; each change recorded (§17.12).
    proof: "every option in the code is listed with a description (none missing); a set is read back; a bad value is refused with the allowed ones"
  ES2_your_typescript_actions:
    status: "OPEN — waits on CM_D0"
    depends_on: [CM_D0_what_typescripts_means, ES1_erosmancer_options_in_plain_words]
    files: [clear-glass/erosmancer/erosmancer-os/src/actions, clear-glass/erosmancer/erosmancer-os/src/api/server.ts, tests/modules/test-eros-options.test.js]
    does: "(reading a) a .ts file in erosmancer-os/actions/ is an action with a name and a description; `eros actions` lists them, `eros run <name>` runs one; a watch rule or a macro can call it."
    proof: "a fixture action is listed with its description and run; a file that does not compile is listed as broken with the error"
  ES3_threats_said_and_handed_over:
    status: OPEN
    depends_on: [ES1_erosmancer_options_in_plain_words, CM_D1_a_threat_hands_over_never_evades]
    files: [clear-glass/src/eros/supervisor.js, clear-glass/src/main/index.js, tests/modules/test-eros-options.test.js]
    does: "Each hostile/ detection in plain words (what it saw, where, how sure); `eros threats` lists them; a detection pauses the automation on that page and hands it to him (CM_D1). No evasion is built."
    proof: "a fixture challenge page pauses a running macro and raises the hand-over toast; the threat is listed with what was seen"
  ES4_the_browser_panel:
    status: OPEN
    depends_on: [CM3_listeners_and_macros, ES3_threats_said_and_handed_over]
    files: [clear-glass/renderer/browser.html, clear-glass/renderer/eros-panel.js, clear-glass/renderer/eros-panel.css]
    does: "In browser.html: the site's watch rules (add from a picked element), ErosmancerOS's options in plain words, its actions and its threats — the same as the CLI, nothing the CLI cannot do. Tested in Clear Glass (AXIOMS §4.1)."
    proof: "Clear Glass driver: add a rule from a picked element in the panel, see it in `cg watch list`"

  ES5_edit_the_typescript_yourself:
    status: "BUILT 0.60.396 — test-eros-edit"
    origin: "James, 2026-11-05: \"can you make a way to import type scripts so i can edit it myself, and import the changes. if i remove cloudflare, fringerprint scripts, and datadome etc\""
    depends_on: []
    files: [clear-glass/src/eros/edit.js, tests/modules/test-eros-edit.test.js, tests/modules/run-all.js, package.json]
    does: >-
      Three commands, CLI first (`npm run eros:edit -- <export|diff|import> [folder]`):
        export — every ErosmancerOS source file (.ts under erosmancer-os/src) copied to a folder of his (default <home>/erosmancer-edit),
                 with a manifest of each file's hash, so he edits a copy, never the live code.
        diff   — what he changed: each changed, added or missing file, with lines added and removed. Changes nothing.
        import — dry run unless --yes. Refused, said: a path outside src or not .ts; a file whose syntax does not parse (TypeScript's own
                 parser); a file that changed in Nexus since his export (unless --force). With --yes: the current files are copied to
                 _archive/erosmancer-edits/<stamp>/ first (nothing lost), the new ones written, each module's own test run
                 (tests/<module>.test.ts with tsx) when it can run; a test that fails puts the old files back and says so. A file he deleted
                 is reported, never deleted. The change is recorded in Versionium in full (§17.12).
    proof: "export → edit (remove a pattern) → diff names it → import --yes writes it and archives the old; a syntax error is refused; a conflict is refused; a failing test restores"

order: "CLI first, as he asked: ES1 can start now; CM1 after the element engine's EE1; ES2 after his CM_D0; ES4 last."

# ── ADDENDUM 2026-11-05 — his: leave the existing module alone ───────────────────────────────────────────────────────────────────────────
# James, 2026-11-05: "can you at least leave them alone. how does that module work? i want to see if i can make it safge"
# ErosmancerOS's hostile/ (clear-glass/erosmancer/erosmancer-os/src/hostile/index.ts) is his and stays exactly as it is: no phase here
# edits, removes or archives it. ES3 now only READS it, through ErosmancerOS's own routes (GET /api/hostile/state, POST /api/hostile/probe)
# and its threat:* events; its files list no longer names hostile/index.ts. CM_D1 is the coder's line for what the coder builds on top,
# not a change to his module. Making it safe is his to design; the coder explained how it works the same day (in the conversation).
