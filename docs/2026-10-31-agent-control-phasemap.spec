# docs/2026-10-31-agent-control-phasemap.spec — the agents' control panel; each phase its folder; his agents for the Void and the Workshop;
# the Void on his toolkit; skip buttons. His asks; the census and cut are the coder's. Spec: idearium/spec/agent-control.spec.

origin: >-
  James, 2026-10-31: "can we have a full control panel for the agents intents, and everything they touch in idearium? in the repos specific
  setting." · "do it. also find the phases with the code tab. consolidating the ideas and notes tab, what if we put each phase is a
  pretermined folder/location of the target directory and also the idearium settings, so i can change the agemnts for the spacial void and
  spec workshop. like spacial void needs to be better, maybe use my framework. also its too back and fourth lke we are. I also want skip
  buttons which will autofill generic/default values in each step of the pipeline."

status: "MAPPED 2026-10-31. Nothing built."

found: >-
  The Code tab and Ideas+Notes are already mapped in his words of 2026-10-19 (docs/2026-10-19-idearium-control-phasemap.spec): CT0–CT1 (the
  Code tab, fewer wider tabs), IM1 (Ideas and Notes as one), IM2 (promote to phase), IM3, PC1 (phase controls), TB1 (one toolbox) — all OPEN.
  The older Code tab map (docs/2026-10-05-code-tab-and-one-router-phasemap.spec, CT1–CT9) is DONE. This map adds only what is new and
  orders those beside it.

decisions:
  AC_D0_control_and_fewer_round_trips:
    chosen: "a per-repo control panel over agents' intents and what they touch; each phase its own target folder; his agent per page; skip buttons with marked defaults"
    by: "his, 2026-10-31 (origin)"
  AC_D1_my_framework_is_the_toolkit:
    chosen: "TO CONFIRM (the coder's reading): 'maybe use my framework' for the Spatial Void is his Innovation Toolkit (docs/innovation-toolkit.framework)"
    by: "the coder; the Void is his ideation page and the toolkit is his ideation method"

phases:
  AC1_intents_and_what_they_touched:
    status: OPEN
    depends_on: [AC_D0_control_and_fewer_round_trips]
    files: [idearium/repo/agent-control.js, idearium/api/index.js, tests/modules/test-agent-control.test.js, tests/modules/run-all.js]
    spec: idearium/spec/agent-control.spec
    blocks: [MOD-AC-INTENTS]
    does: "intents grouped from the existing records, with everything each touched"
    proof: "two prompts → two intents with their files and gate verdicts"
  AC2_the_controls:
    status: OPEN
    depends_on: [AC1_intents_and_what_they_touched]
    files: [idearium/repo/agent-controls.js, lib/repo-agent.js, idearium/api/index.js, tests/modules/test-agent-control.test.js]
    spec: idearium/spec/agent-control.spec
    blocks: [MOD-AC-CONTROLS]
    does: "pause, stop, allow and deny, approve writes, roll an intent back"
    proof: "a denied path refused; a paused intent idle; a rollback restores"
  AC3_the_panel:
    status: OPEN
    depends_on: [AC2_the_controls]
    files: [idearium/ui/js/agent-control.js, idearium/ui/js/repo-settings.js, idearium/cli/route-commands.js]
    spec: idearium/spec/agent-control.spec
    blocks: [MOD-AC-PANEL]
    does: "command rows and Settings › Agents › Control panel"
    proof: "driven in Clear Glass on a fixture repo"
  AC4_each_phase_its_folder:
    status: OPEN
    depends_on: [AC_D0_control_and_fewer_round_trips]
    files: [lib/phase-target.js, tests/modules/test-phase-target.test.js]
    spec: idearium/spec/agent-control.spec
    blocks: [MOD-AC-TARGET]
    does: "a phase's target folder; writes outside it refused unless named"
    proof: "inside passes, outside refused with why"
  AC5_his_agents_for_the_void_and_the_workshop:
    status: BUILT 0.60.335
    depends_on: [AC_D0_control_and_fewer_round_trips]
    files: [idearium/lib/page-agents.js, idearium/api/index.js, idearium/ui/settings.html, idearium/cli/route-commands.js, tests/modules/test-skip-and-page-agents.test.js]
    spec: idearium/spec/agent-control.spec
    blocks: [MOD-AC-PAGE-AGENTS]
    does: "an agent per page in Idearium's settings, tried first, fallback said"
    proof: "the Void asks his chosen agent; down → fallback said"
  AC6_the_void_on_his_toolkit:
    status: OPEN
    depends_on: [AC5_his_agents_for_the_void_and_the_workshop, AC_D1_my_framework_is_the_toolkit]
    files: [idearium/lib/void-toolkit.js, idearium/ui/void.html, tests/modules/test-void-toolkit.test.js]
    spec: idearium/spec/agent-control.spec
    blocks: [MOD-AC-VOID-TOOLKIT]
    does: "echoes follow his toolkit's methods, chosen by the sliders, each naming its method"
    proof: "outlier/unstable → an associative and a constraint method, both named"
  AC7_skip_buttons:
    status: BUILT 0.60.335
    depends_on: [AC_D0_control_and_fewer_round_trips]
    files: [idearium/lib/step-defaults.js, idearium/ui/js/workshop.js, idearium/ui/workshop.html, idearium/ui/void.html, idearium/api/index.js, idearium/cli/route-commands.js, loom/maps/idearium-codebase-map.js, tests/modules/test-skip-and-page-agents.test.js]
    spec: idearium/spec/agent-control.spec
    blocks: [MOD-AC-SKIP]
    does: "a skip on every pipeline step fills marked defaults"
    proof: "skip on an empty plan fills the template's, marked; his text untouched"

order: >-
  AC7 (skip buttons) and AC5 (his agents) first: small, and they cut the back and forth at once. Then AC1 → AC2 → AC3 (the panel), AC4, AC6
  after his confirm. Beside it, from 2026-10-19: IM1 (Ideas and Notes as one), CT0 → CT1 (the Code tab).

# ── ADDENDUM 2026-10-31 — AC7 and AC5 built (0.60.335) ──────────────────────────────────────────────────────────────────────────────
# AC7: idearium/lib/step-defaults.js; POST /api/workshop/:id/skip; the Workshop's SKIP button (every empty section, marked "(default)", his
# text untouched); the pipeline's plan step skips to the no-agent plan. The Void's slider skip (void.sliders) is in the module, its button
# with AC6 (the Void's rebuild). AC5: idearium/lib/page-agents.js; GET/POST /api/settings/page-agents; _agentAsk puts his choice first,
# the router's next after it; the "Page agents" card on Settings › Routing & fallback; rows page-agents, workshop skip.
# Proof: tests/modules/test-skip-and-page-agents.test.js 4/4. Not yet driven in Clear Glass (said): the screens are checked by PA-02's wiring.
