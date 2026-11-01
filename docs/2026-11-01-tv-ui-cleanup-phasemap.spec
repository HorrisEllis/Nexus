# docs/2026-11-01-tv-ui-cleanup-phasemap.spec — the TV UI (lib/ui/tv-shell, Nexus's home screen on the orchestrator's :9000) cleaned out:
# its noise against the backend removed, then each channel its own page, with one file he edits. The idea and the calls are James's; the
# audit, the phase cut and the order are the coder's.

origin: >-
  James, 2026-11-01: "where is cos. also the tvui. can you clean it up, and make it so i can edit it." · "no the tv ui." · "then i need tv
  ui cleaned out, have playwright to look at the ui in relation to the backend. there is some noise." · earlier the same day: "im saying each
  dsection should be its own html. like settings.html index.html like each page"

status: "MAPPED 2026-11-01, after an audit. Nothing changed in the TV UI yet."

decisions:
  TV_D0_audited_in_clear_glass:
    status: DECIDED 2026-11-01 (his standing rule over his word in the moment; to confirm)
    chosen: >-
      He asked for Playwright; his standing law is AXIOMS §4.1 (2026-10-05, his "No playwright. That's literally what clearglass was born
      from."), so the audit ran in Clear Glass's engine, whose driver keeps Playwright's API. If he wants Playwright itself, that overrides.
    by: "his, 2026-11-01: \"have playwright to look at the ui in relation to the backend\"; his 2026-10-05 rule (CG-001b fails any file that loads Playwright)"
  TV_D1_one_endpoint:
    status: DECIDED 2026-11-01 (by his axioms)
    chosen: "The TV UI talks only to the orchestrator's :9000 (the one endpoint); its direct calls to each system's port go through the orchestrator's /api/<system>/* or COS's door."
    by_the_axioms: "§5.15 (each system reached by its route), the tablet spec's connection law (\"talks to ONE endpoint\"), MG_D10"
  TV_D2_each_channel_its_own_page:
    status: DECIDED 2026-11-01 (his)
    chosen: "Each channel and overlay of index.html becomes its own folder with its own .html, .css and .js; index.html keeps only the shell; channels.json lists the channels (which show, order, name, icon, colour) and is the file he edits."
    by: "his, 2026-11-01: \"each dsection should be its own html. like settings.html index.html like each page\" · \"make it so i can edit it\""

audit_2026_11_01: >-
  The whole stack booted through COS's launcher, sandboxed (12 of 13 up; Clear Glass's circuit opened: Electron has no display here); the
  TV UI loaded in Clear Glass for 12 s. 91 requests, 28 failed, no page error. With every system up, the failures are the noise:
    1. Bridge, a retired system: a tile on :9999 and polls of its /health and /contract (6 failed), and /api/bridge/contract (2, 404).
    2. Emerge IDE on :4242: nothing serves it (lib/emerge/emerge-ide.js is in no compartment.json), so its polls fail (4) and the
       orchestrator's /api/emerge/* answers 500 (3).
    3. /api/guardian/nerve/snapshot (7, polled) and /api/guardian/hooks/summary (1) answer 404 on :9000 although Guardian serves both on
       :7820: the orchestrator does not forward them.
    4. Contracts asked of servers that have none: :9000/contract and /api/orchestrator/contract (4), :4800/contract (1).
  Also seen: the UI calls each system's port directly (health, contract), past the one endpoint. And the booted systems wrote state into
  the repository although sandboxed (architect, cortex, every system's baseline/invariant files, blueprint-index.json, docs/CHANGELOG.md):
  writers that ignore the sandbox, kept in the coder's scratchpad and the tree restored; FX3's map is where that belongs.

  TV_D3_new_systems_appear_in_the_menu:
    status: DECIDED 2026-11-01 (his)
    chosen: "The TV UI's menu is built from the systems COS knows (each compartment.json, through COS's door), so a new system appears in it without anyone editing the UI; channels.json only overrides (order, name, icon, colour, hidden)."
    by: "his, 2026-11-01: \"no i mean, i want new systems to appear in that menu.\""
phases:
  TV0_the_audit_as_a_test:
    status: OPEN
    depends_on: [TV_D0_audited_in_clear_glass]
    files: [tests/modules/test-tv-ui-backend.test.js, tests/modules/run-all.js]
    does: "the audit above as a test: the TV UI in Clear Glass against a running orchestrator; every request it makes answered, or the failure named with its owner"
    proof: "it fails today naming the 28; it passes after TV1"
  TV1_the_noise_out:
    status: OPEN
    depends_on: [TV0_the_audit_as_a_test, TV_D1_one_endpoint]
    files: [lib/ui/tv-shell/index.html, lib/ui/tv-shell/warp-ui/nexus-shell.js, lib/ui/tv-shell/forge-shell/index.html, lib/ui/tv-shell/nerve/nerve.js, orchestrator/orchestrator.js]
    does: >-
      Bridge's tile and polls removed (archived with the release, §0.3); Emerge IDE's tile shown only when something serves it, its proxy
      saying 503 "not running" instead of 500; the orchestrator forwards /api/guardian/nerve/snapshot and /hooks/summary; contracts asked
      only of servers that serve one; every direct port call routed through :9000.
    proof: "TV0 passes: with every system up, no request fails; with one stopped, only its own requests fail, named"
  TV2_each_channel_its_own_page:
    status: OPEN
    depends_on: [TV1_the_noise_out, TV_D2_each_channel_its_own_page, TV_D3_new_systems_appear_in_the_menu]
    files: [lib/ui/tv-shell/index.html, lib/ui/tv-shell/channels, lib/ui/tv-shell/channels.json]
    does: "each of ~20 channels and the overlays (menu, rewind, inspect, the spec wizard) moved into lib/ui/tv-shell/channels/<name>/ as .html, .css, .js; index.html keeps the shell; channels.json drives the rail; the 187 inline styles into each channel's css; the old index.html archived"
    proof: "in Clear Glass, every channel opens and shows what it showed before (screenshots before and after); a channel added by a folder and a line in channels.json, one removed by deleting its line, nothing else breaks"

  TV4_the_overview_idearium_and_cos:
    status: "DONE 0.60.354"
    depends_on: [TV3_the_emergence_channel, MG34_the_cos_channel_always_has_a_way_in]
    files: [lib/ui/tv-shell/index.html, tests/modules/test-cos-channel.test.js]
    interface: [html]
    does: >-
      James, 2026-11-01, on the overview tiles after updating to 0.60.353: "cos is not there still. also need to remove bridge, diagnostic,
      orchastrator. actually clear it all if possible and add ideearium and cos." The overview shows two tiles: Idearium and COS (new; its
      status from the orchestrator's GET /api/cos-ui/status, a click tunes the COS channel). The other eleven are hidden, not removed (§0.3):
      "all systems" beside VIEW shows them again, remembered per screen. Their ids stay, so the code that fills them is untouched.

  TV3_the_emergence_channel:
    status: "DONE 0.60.344"
    depends_on: [TV_D1_one_endpoint, TV_D2_each_channel_its_own_page]
    files: [lib/emergence.js, orchestrator/orchestrator.js, idearium/cli/route-commands.js, lib/ui/tv-shell/channels/emergence/emergence.html, lib/ui/tv-shell/channels/emergence/emergence.css, lib/ui/tv-shell/channels/emergence/emergence.js, lib/ui/tv-shell/index.html]
    interface: [route, cli, html]
    does: >-
      James, 2026-11-01: "the tv ui needs the emergence channel". A channel for what emerges in Nexus, from what already exists:
        - Intelligence's crystallised patterns (GET /api/intelligence/patterns: co-occurrence, failure precursor, bottleneck, cross-system
          causal, each with its count and confidence; noise-tainted ones marked, and what Intelligence sees of itself hidden by a switch);
        - the liminal spaces where a pattern forms before it crystallises (GET /api/liminal-space/status, /list);
        - his emergence runs (lib/emergence.js, "if it can't innovate the problem, innovate the method"): axioms, end state, attempts,
          method pivots, outcome. Kept in the emergence_sessions table, with no reader until now (sessions()).
      Backend first: sessions() in lib/emergence.js. The route: the orchestrator forwards GET /api/emergence/{patterns,liminal,sessions}
      (TV_D1: one endpoint, :9000). The command rows: emergence.patterns, emergence.liminal, emergence.sessions. Then the channel, its own
      page (TV_D2), loaded into the rail like the Emerge IDE's.
    reading: "TO CONFIRM — the coder's reading of 'emergence': what Intelligence crystallises plus his emergence runs; not Emerge (the language), which has its own channel (EMERGE IDE)."
    proof: "the route against a fixture Intelligence answers all three, and says which is down; the channel driven in Clear Glass shows each, with the self-echo switch counting what it hides"

build_order: "TV0 → TV1 → TV2. TV3 stands alone (its own page, its own route). The orchestrator change in TV1 is the orchestrator's (its own file), made through its route table."

# ── ADDENDUM 2026-11-01 (0.60.344) — TV3 built ────────────────────────────────────────────────────────────────────────────────────────
# James, 2026-11-01: "the tv ui needs the emergence channel". Built in his order: backend (lib/emergence.js sessions(); Intelligence's own
# pattern route now carries each pattern's sentence and self), route (the orchestrator's GET /api/emergence/{patterns,liminal,sessions}),
# command rows (emergence patterns | liminal | sessions), then the channel (lib/ui/tv-shell/channels/emergence/, its own page, TV_D2).
# Found on the way, fixed in the same release:
# - a rail he had saved (the channel editor) never showed a channel built after it. loadChannelList now adds a built-in channel missing from
#   the saved list at its end. One he hid stays hidden: the editor never deletes a built-in.
# - CH_INSPECT (the inspect overlay) is read by position and has 14 entries for 22 channels: channels past the 14th have no inspect entry.
#   Pre-existing, not fixed here, said (TV2 moves each channel to its own page and ends the positional list).
# The orchestrator's forward is checked in its source (EC-04), not run: the orchestrator cannot be started on a test port.

# ── ADDENDUM 2026-11-01 (0.60.345) — TV3 in COS's UI too ───────────────────────────────────────────────────────────────────────────────
# James, 2026-11-01: "i also meant cos ui". COS's UI gains an Emergence page (cos/ui/emergence/, listed in COS's contract). It is ONE page with
# the TV channel ("no redundancy"):
# - the same script and pieces, served read-only by cos/ui/serve.js from lib/ui/tv-shell/channels/emergence/ (that folder, .js and .css only);
# - worn in COS's theme by its page.css;
# - told its door by <meta name="emergence-api">: COS's GET /api/cos/emergence/:what.
# COS asks Intelligence through its routes, its origin taken from its declaration, and the kernel for his runs.
