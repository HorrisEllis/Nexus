# Fiverr, as a dependency graph from the end state back (2026-10-29)

origin: >-
  James, 2026-10-29: "Also, make a dependency graph for the fiverr gigs." Earlier the same day: "Beyond getting fiverr gigs working. We then
  need …" and, on how a graph is built: "Yes the same way I reason. Bidirectional causal changing."

method: >-
  Built his way: from the end state (money for a delivered order) backward, each node asking what must be true just before it, down to
  what exists; then forward from what exists to check every chain reaches the end. Each node is a phase: DONE means built and passing its
  tests in the sandbox; PROVEN means seen working on his PC (none yet — this sandbox cannot reach it); OPEN means not built or not true yet.
  lib/phase-dag.js checks the graph (no dangling name, no cycle). Read it in Idearium's Phases tab, or `repo dag <repo>`.

status: "nothing in this graph is PROVEN on his PC yet; the two roots that block everything are FI0 (Nexus runs on his PC) and FI3 (he passes Fiverr's human check)"

decisions:
  FI_D1_publish_is_his:
    status: "DECIDED — his, standing since 0.39.301 (\"Not automate talking or posting\") and HC3 (2026-10-26)"
    chosen: >-
      Publish, Save, the human check (Press & Hold) and talking to a buyer are his clicks. Nexus fills, checks and drafts; it never presses
      them. The graph has them as his nodes, not the system's.

phases:
  # ── the roots: what everything stands on ──────────────────────────────────────────────────────────────
  FI0_nexus_runs_on_his_pc:
    status: OPEN — needs his startup log (HL0 in docs/2026-10-29-his-loop-phasemap.spec)
    depends_on: []
    files: [lib/nexus/autopilot.js, idearium/api/index.js, clear-glass/src/main/index.js]
    does: "the systems start and stay up: Idearium answers (it timed out in his screenshot), memory holds with the 5.2 GB local model"
  FI1_copilot_and_a_provider:
    status: OPEN — runs only when FI0 does
    depends_on: [FI0_nexus_runs_on_his_pc]
    files: [copilot/server.js, guardian/server.js, ollama/server.js]
    does: "Copilot answers Clear Glass's copilot.send; behind it an AI (Guardian's provider tab, or Ollama) — what drafts a gig and answers a buyer"
  FI2_his_fiverr_profile:
    status: OPEN — his data, in Clear Glass › Settings › Autofill
    depends_on: []
    files: [clear-glass/src/autofill/store.js]
    does: "an autofill profile labelled fiverr: who he is, his skills, his proof — what a gig is written from (bridge _fiverrProfileId)"

  # ── the gig's content ─────────────────────────────────────────────────────────────────────────────────
  FI4_gig_files:
    status: DONE — 12 .gig files (10 + vibe-code-rescue, custom-mcp-server); every one parses (test-gig-features GF-01)
    depends_on: []
    files: [clear-glass/docs/gigs/vibe-code-rescue.gig, clear-glass/docs/gigs/custom-mcp-server.gig, clear-glass/src/autofill/gig.js]
    does: "a gig as a file he can read and edit: title, tags, packages with their rows, FAQ, buyer questions; limits enforced on load"
  FI5_gig_drafted_from_his_profile:
    status: DONE in code (clear-glass-gig 7/7) · needs FI1 live
    depends_on: [FI1_copilot_and_a_provider, FI2_his_fiverr_profile]
    files: [clear-glass/src/ipc/bridge.js, clear-glass/src/autofill/gig.js]
    does: "one line of what he offers → a whole gig, from his profile, nothing invented (bridge _gigDraft → copilot.send)"

  # ── the gig onto Fiverr's editor ──────────────────────────────────────────────────────────────────────
  FI3_he_passes_the_human_check:
    status: OPEN — his click (FI_D1); the fill stops at it and says so (HC3, clear-glass/test/human-check.test.js)
    depends_on: [FI_D1_publish_is_his]
    files: [clear-glass/src/contexts/human-check.js]
    does: "PerimeterX Press & Hold on fiverr.com: he holds it; the gate then lets the fill run"
  FI6_editor_page_known:
    status: DONE — Overview and Scope & Pricing recognised (test-fiverr-overview-and-a11y 5/5)
    depends_on: [FI0_nexus_runs_on_his_pc]
    files: [clear-glass/src/autofill/gig-pages.js]
    does: "which editor page is open, so only that page's parts are filled"
  FI7_driver_fills_and_reads_back:
    status: DONE — choose, checkAt, typeAt, readChoice, rowLabels (test-gated-dropdowns 6/6, test-gig-features 3/3, test-gig-fill-menu GM-02)
    depends_on: [FI6_editor_page_known]
    files: [clear-glass/src/driver/index.js]
    does: "each value typed or chosen as him, then read back off the page; a wrong read-back fails that part, with why"
  FI8_his_recorded_choices:
    status: DONE — node macros Fiverr gig - choose category / choose delivery, and his recorded page macros (test-gated-dropdowns)
    depends_on: [FI7_driver_fills_and_reads_back]
    files: [clear-glass/automation/nodes/fiverr-gig-choose-category.macro, clear-glass/automation/nodes/fiverr-gig-choose-delivery.macro, lib/automation-nodes.js]
    does: "what the gig file cannot say (Service type, metadata boxes) done once by him, replayed on every fill; editable in Settings › Macros"
  FI9_fill_menu:
    status: DONE — test-gig-fill-menu 3/3 (GM-03 in Clear Glass)
    depends_on: [FI4_gig_files, FI7_driver_fills_and_reads_back, FI8_his_recorded_choices, FI3_he_passes_the_human_check]
    files: [clear-glass/renderer/gig-menu.js, clear-glass/src/autofill/gig-menu.js, clear-glass/renderer/gig-panel.js]
    does: "every part a row: tick, change, Fill selected; each row's result; Point at it when the page hides a part"
  FI10_filled_on_the_live_editor:
    status: OPEN — the first PROVEN node; needs FI0 and FI3 on his PC
    depends_on: [FI9_fill_menu, FI0_nexus_runs_on_his_pc]
    files: [clear-glass/src/ipc/bridge.js]
    does: "a real gig's Overview and Scope & Pricing filled on fiverr.com, each part read back; what differs on the live page fixed"
  FI11_gig_published:
    status: OPEN — his click (FI_D1)
    depends_on: [FI10_filled_on_the_live_editor]
    files: [clear-glass/renderer/gig-panel.js]
    does: "he reads it on the page and presses Publish"

  # ── after the gig: the order, the build, the delivery ─────────────────────────────────────────────────
  FI12_order_to_idearium:
    status: DONE in code (gig panel step 2, bridge _gigToIdearium) · needs FI0 live
    depends_on: [FI11_gig_published, FI0_nexus_runs_on_his_pc]
    files: [clear-glass/src/ipc/bridge.js, idearium/api/index.js]
    does: "the buyer's answers to the five end-state questions → a spec and a repo in Idearium (POST /api/workshop)"
  FI13_order_built:
    status: OPEN — Idearium's build loop and the Finish/Do tools exist (test-project-spine 8/8, test-intent-flow 5/5); never run on an order
    depends_on: [FI12_order_to_idearium, FI1_copilot_and_a_provider]
    files: [idearium/api/index.js, lib/intent-flow.js]
    does: "the order's end state → contract (his chaining) → phases → agents build, tests prove each piece"
  FI14_delivered_and_paid:
    status: OPEN — his (delivering and talking to the buyer, FI_D1)
    depends_on: [FI13_order_built]
    files: [clear-glass/renderer/gig-panel.js]
    does: "he delivers on Fiverr; the order closes; money in. The end state."
