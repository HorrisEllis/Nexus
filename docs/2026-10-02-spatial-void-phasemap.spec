spec:
  meta:
    name:     spatial-void
    version:  1.1.0
    date:     2026-10-02
    release:  0.39.295
    uuid:     nexus-spatial-void-phasemap-v1-0000-2026-1002-jamesbrooks-001
    owner:    idearium · docs
    status:   "MAPPED and BUILT 2026-10-02 (0.39.295)"
    axioms:   docs/AXIOMS-v3.1.md — §3.3 map before build, §8.6 reuse before build, §0.3 nothing lost, §1.2 nothing
              silently fails, §17.5 every output has provenance; docs/CLAUDE.md James's voice.
    origin: >
      James, 2026-10-02 (with Current_State_of_Nexus.zip — Nexus v0.54.0, the old Nexus): "I hate that ui you made. The
      spacial void is its own page. all of it needs to be isolated, in its own pages. i was describing the pipeline when
      i told you that, from idearium. current state of nexus.zip is the old one, take the spacial void ad completely
      rebuild it for the new nexus, non of it will connect to the new one. keep the style, thats what i want most. like
      steal everything you can from it. no boilerplate, or copy paste. i thought maybe we replace, ideas, and brain
      storm. Just have the spacial void, with a slider that moves from: normal, creative, outside the box, novel,
      outlier. then moves another switch from the opposit side: stable, shaky, risky, dangerous, unstable. with those
      linked togethe"
      Then: "the ideas come from me though not agents" · "lets do it. anything else from nexus"

  read_from_the_old_nexus:   # v0.54 nexus_work/nexus.html, src/ui/nexus.css, nexus-auth.js, nexus-core.js — read, not copied
    style: >-
      The void: a full-screen near-black field (#030508) and a canvas of ~200 cyan stars twinkling (alpha on a sine),
      drawn over a translucent wash each frame so they leave trails. Titles in Bebas Neue, letter-spacing .4em, a slow
      opacity pulse and a cyan glow ("THE VOID", "SPEAK YOUR VISION INTO EXISTENCE"); DM Mono for working text, Space
      Grotesk for body. The v4 palette: bg #05080f/#080d17/#0b1120, borders #1a2a40/#1e3050/#2a4060, cyan #00d4ff,
      green #00ff88, red #ff2d55, yellow #ffcc00, orange #ff6b35, magenta #cc44ff; text #b8cfe0/#5a7a96/#2e4a60. 2px
      corners, thin glowing borders, wide-tracked uppercase buttons. James's words in cyan, the AI's in magenta.
    modes: "EXPLORE (speak the vision, inspire me) · FLOW (breathwork, inspiration from your builds, SCAMPER, constraint
      inversion) · SPAR (I will attack it, find strengths, synthesize) · GROUND (hardware reality, tech stack)"
    engines: >-
      The console's reasoning engines (nexus-core.js): EROSMANCER — "Reverse-engineer from end-states. Find hidden
      leverage. Apply cross-domain pattern transfer."; HOSTILE TRUTH — "Stress-test everything … Identify single points
      of failure before they occur."; DELTA RISK — "Scan for the 28 systemic Δ failure types. Map cascading effects.";
      UNIFIED — "Full-spectrum analysis combining all engine perspectives." They are the two sliders' voices: Erosmancer
      the creativity side, Hostile Truth and Delta Risk the stability side, Unified where the two meet.

  design:   # agreed in conversation, 2026-10-02
    ideas_are_james: >-
      "the ideas come from me though not agents". An idea in the void is only ever his words. The agent never makes an
      idea: it answers his idea (an echo) — questions, angles, checks — shown around it, never in it. He takes from an
      echo by choosing the part and putting it in his own words; only then is it part of the idea.
    the_two_sliders: >-
      CREATIVITY normal · creative · outside the box · novel · outlier (left → right). STABILITY stable · shaky · risky ·
      dangerous · unstable, from the opposite side (right → left). Linked with slack: they move together by default;
      hold one (the lock) and push the other, and the gap between them is the TENSION — drawn as a line between the two
      handles that pulls harder the further apart they are. Creativity sets how far the agent pushes his idea outward;
      stability sets how hard it checks it against what is real (stable: buildable today, what exists in his repos;
      unstable: no checks, only what would break). The sliders replace the old mode buttons.
    born_at: "every idea keeps the creativity, stability and tension it was born at, and the field can be filtered by them (wild but buildable: outlier + stable)."
    field: "his ideas are points of light: brighter the more he has worked them, fading toward the edges when untouched (drift); brainstorm entries are dimmer sparks until made ideas. Drag to place; drag one onto another to collide them — the agent says how they fit or clash, nothing more."
    exit_gate: "→ spec: a grounding pass at stable, whatever the dials say, reported to him; then the idea goes on to the spec workshop."

  phases:
    V1_fonts_local:
      status: DONE (0.39.295)
      files: [idearium/ui/fonts/, idearium/api/index.js]
      does: "Bebas Neue, DM Mono, Space Grotesk (SIL OFL 1.1, from @fontsource) shipped in idearium/ui/fonts with their licenses, served by idearium as binary — the void works offline."
    V2_void_engine:
      status: DONE (0.39.295)
      files: [idearium/lib/void.js]
      does: "the levels, the link with slack and the tension; the voices (Erosmancer, Hostile Truth, Delta Risk, Unified) composed from the two dials; the echo prompt that answers James's idea and never writes one; collisions; the exit grounding; drift and brightness."
    V3_ideas_carry_the_void:
      status: DONE (0.39.295)
      files: [idearium/index.js]
      does: "an idea may carry void {creativity, stability, tension, x, y, held} — accepted on create and update (the gates whitelist fields; void was added, nothing else)."
    V4_routes_and_cli:
      status: DONE (0.39.295)
      files: [idearium/api/index.js, idearium/cli/index.js]
      does: "GET /api/void; POST /api/void/idea; POST /api/void/idea/:uuid; …/echo; …/ground; POST /api/void/collide; POST /api/void/echo/:id; POST /api/void/spark/:uuid/idea (a brainstorm spark becomes an idea). Echoes in the JAA table idearium_void_echoes. `idearium void …`."
    V5_the_page:
      status: DONE (0.39.295)
      files: [idearium/ui/void.html]
      does: "its own page, in the old void's style, rebuilt: the star field, the ideas in it, THE VOID, the two sliders and the tension line, speak your vision, the focused idea with its echoes, take (his words), collide by dragging, → spec."
    V6_replaces_ideas_and_brainstorm:
      status: DONE (0.39.295)
      files: [idearium/ui/index.html, idearium/ui/js/app.js]
      does: "Create → The Void opens it; Ideas and Brainstorm leave the nav and Welcome (their views and data stay — §0.3 — and every idea and brainstorm entry shows in the void)."
    V7_proof:
      status: DONE (0.39.295)
      files: [tests/modules/test-spatial-void.test.js]
      does: "the engine, the router with a stand-in agent, and the page driven in Chromium."

## ADDENDUM 2026-10-02 — 1.0.0, built (0.39.295)
# Two calls made while building, both from using it: (1) a hold is the slack itself — while it is on, EITHER dial moves
# alone (first built as "the held one stays", which surprised in the browser: moving the held dial let go and dragged the
# other); one link between the dials, either hold button toggles it. (2) Found in the browser, not by a test: the focused
# idea shared the class name `.focus` with the side panel and took the panel's styles (fixed, 430px, off-screen) — the
# idea vanished when opened; renamed. Proof: tests/modules/test-spatial-void.test.js 6/6; Chromium against the real server
# with a stand-in agent — seven ideas and a spark in the field, the dials linked then unlinked to tension +3, an idea
# spoken, ECHO and D20 answered, a line kept in his words; no console errors; wide and narrow.

## ADDENDUM 2026-10-02 — 1.1.0, "no lowercase" and the enterprise pass (0.39.296)
# James: "alright but no lowercase. and make sure its enterprise grade". Capitals everywhere (CSS for the page, inputs and
# placeholders; tooltips and the window title uppercased at the source, which CSS cannot reach) — his text is stored as
# typed. Limits (idea 4000, kept part 1000), deadlines on every call and a timer on agent calls, the field's states
# (entering, empty, unreachable + try again; a lost server said while the field stays), contrast on everything read,
# names that never overprint, unplaced ideas spread over the whole field. Measured: 150 ideas load + paint 77–85 ms,
# repaint 10–12 ms; no console errors. tests/modules/test-spatial-void.test.js 7/7 (VD-07).

## ADDENDUM 2026-11-06 — the void sets the end state (his); V8 written
# James, 2026-11-06: "the spacial void, is for setting the endstate, which then creates the dag/conditions for the stopping condintions. agnostic problem solving, like synthesis filling a compartment. ierative build loops learning from each fault or failure mode report, until it meets the conditoins."
# Read first (§0.1): the void is built (V1–V7: ideas, the two dials, echoes, the exit gate "→ spec"). The end state, its conditions and the
# loop to them already exist as pieces: lib/end-state.js (conditions frozen, check kinds), FA11 (lib/intent-flow.js: backward from the end
# state, forward from the change, the meeting set is the DAG), PR1's proof run, the failure-mode report (FMR), LB1 (the end-state lab: attempt,
# proof, failures fed back, strategy changed, until met) and DA1 (end states for any domain). Nothing joined the void to them: the void's exit
# went to the spec workshop only. V8 is that join; the loop itself is LB1's (expanded, not written again).
decisions:
  VOID_D1_the_void_sets_the_end_state:
    status: DECIDED 2026-11-06 (his)
    chosen: >-
      The void is where the end state is set. From it come the conditions (lib/end-state.js), the DAG to it (FA11, backward and forward) and
      the stopping conditions (met, or the budget spent and said). The build loop (LB1) runs against them, learning from each failure-mode
      report, until the conditions are met. Domain agnostic (DA1): code, research, a problem; "synthesis filling a compartment" — the
      compartment is the sandbox the loop fills (reading, to confirm).
    by: "his, 2026-11-06 (quoted above)"
phases_v8:
  V8_the_void_sets_the_end_state:
    status: OPEN
    depends_on: [VOID_D1_the_void_sets_the_end_state, V7_proof, FA11_bidirectional_causal_chain]
    files: [idearium/lib/void.js, idearium/ui/void.html, lib/end-state.js, lib/intent-flow.js, idearium/api/index.js, tests/modules/test-void-end-state.test.js]
    requires: [node, "an agent for the conditions' wording (a stand-in in the test)"]
    prerequisites: ["lib/end-state.js's condition kinds read and listed before any is added"]
    does: >-
      From an idea in the void: SET THE END STATE. He states it; the void proposes its conditions (each a machine check of lib/end-state.js's
      kinds, his yes on each), the DAG to it (FA11), and the stopping conditions (all met; or the budget of attempts, tokens and time he sets,
      spent, and then what was tried said). Saved with the idea; handed to LB1's lab as its end state. Deterministic first: the conditions
      are checks, never the model's say-so.
    proof: "a fixture idea given an end state: its conditions frozen and checkable, its DAG built, its stopping conditions saved; LB1 receives exactly that end state"
