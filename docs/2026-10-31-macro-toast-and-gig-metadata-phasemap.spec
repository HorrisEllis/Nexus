# A macro recording/playing toast (breathing red dot + playback controls), and the gig metadata fill
# James, 2026-10-31: "i want a step recorder and player when macros are playing. a toast with playback controls. and i want the
# same for when recording macros and wi want the classic red dot breathing when recording. almost all of it was filled in but
# the gig metadata."
#
# MAPPED 2026-10-31 before code (rule 1, phased-only 0.60.322). REUSE (rule 2):
#   - macro recording already has start/stop hooks (clear-glass/renderer/browser.js: cg.macroRecord, _recordingMacro, the
#     macroRecordToast setting) and the text line "● Recording a macro"; the breathing-red-dot TOAST replaces that line.
#   - macro play runs in lib/agent-tools/tools/clear-glass/macro.js (a loop over macro.steps, returns stepsCompleted/stepsTotal);
#     it has NO per-step events and NO pause — a real player needs those added (MT2).
#   - gig metadata is PARSED (clear-glass/src/autofill/gig.js _metadata, GT6) and shown as a gig part (gigParts), BUT the Overview
#     page's fill parts are ['title','category','tags'] (gig-pages.js PARTS.overview) — metadata is NOT in them, so the fill never
#     places it. Metadata is tabs of CHECKBOXES, so filling it reuses the dropdown/checkbox fill (DD1, select-match boolOf).
# Owner: Clear Glass (renderer + autofill). The toast is Clear Glass UI; the macro runner is lib/agent-tools (its tool).

decisions:
  MT_D1_one_toast_two_states:
    status: DECIDED 2026-10-31 by James — "a toast with playback controls … the same for when recording … the classic red dot breathing"
    chosen: >-
      One persistent macro toast overlay (clear-glass/renderer/macro-toast.js + .css) with two states: RECORDING — a breathing
      red dot, "Recording macro", a step count as steps are captured, and Stop; PLAYING — the macro name, step progress (N / M),
      playback controls (Pause/Resume, Step, Stop) and a progress bar. It is drawn in Clear Glass's own window (like the autofill
      chip), shown on record-start / play-start and hidden on stop. Reading to confirm: "step recorder … when macros are playing"
      reads as the PLAYING toast listing each step as it runs (a mini timeline); if he means a full editable recorder panel, that
      is a bigger UI, marked to confirm.
  GM_D1_metadata_is_a_checkbox_fill:
    status: DECIDED 2026-10-31 by his axioms (reuse §8.6) — to confirm against his page
    chosen: >-
      Gig metadata fills by ticking the tab checkboxes that match the gig's metadata values — the same checkbox fill DD1 built
      (select-match boolOf + the DOM mesh). It is added as a fill part of the Overview page. The exact DOM (how Fiverr lays out
      the metadata tabs and their checkboxes) is confirmed from his screenshot before the ticking logic is written — the coder
      will not guess a live page's structure (§0.1).

phases:
  MT1_the_macro_toast:
    status: DONE 0.60.335 — macro-toast.js + .css (window.CGMacroToast, recording + playing states, breathing red dot), wired to the record hotkey. Verified in a real browser: test-macro-toast-glass 3/3. The player's live progress + pause/step is MT2.
    layer: ui
    depends_on: []
    files: [clear-glass/renderer/macro-toast.js, clear-glass/renderer/macro-toast.css]
    does: >-
      The toast overlay with both states and a small API (window.CGMacroToast.recording(on,{steps}), .playing({name,index,total}),
      .control(cb), .hide()). The breathing red dot (a CSS pulse, respecting prefers-reduced-motion). Wired to the existing
      recording start/stop in browser.js (replacing the "● Recording a macro" line). Playback controls call back to the player
      (MT2). Tested in Clear Glass (glass.js), never Playwright (CG-001b).
    proof: "driven in Clear Glass: starting a recording shows the toast with a breathing red dot and Stop; stopping hides it; .playing() shows name + N/M + controls; prefers-reduced-motion stills the dot; no Playwright"

  MT2_player_lifecycle:
    status: OPEN
    layer: integration
    depends_on: [MT1_the_macro_toast]
    files: [lib/agent-tools/tools/clear-glass/macro.js, clear-glass/src/ipc/bridge.js]
    does: >-
      The runner (macro.js) gains a per-step progress callback and a pause/step gate: before each step it emits
      macro.step { index, total, label } and, when paused, waits for a resume/step signal. Surfaced to the renderer over IPC/SSE
      (bridge) so the toast shows real progress and its Pause/Step/Stop control the run. Backend first (his order of delivery).
    proof: "a macro run emits a step event per step with index/total; Pause holds before the next step, Step advances one, Stop ends it; the toast reflects it — runner tested headless with an injected step sink, the toast live"

  GM1_gig_metadata_fill:
    status: OPEN
    layer: integration
    depends_on: []
    files: [clear-glass/src/autofill/gig-pages.js, clear-glass/src/autofill/gig.js]
    does: >-
      Add 'metadata' to the Overview page's fill parts (gig-pages.js PARTS.overview) and valueOf, and fill it by ticking the tab
      checkboxes that match the gig's metadata values (reuse DD1's checkbox fill / select-match boolOf through the dom mesh). Each
      metadata tab is opened, its checkboxes matched to the metadata list, ticked; an unmatched value is said (§1.2). The exact
      tab/checkbox DOM is confirmed from his screenshot (GM_D1) before the ticking is written.
    proof: "on his Gig metadata page: the metadata values tick their checkboxes tab by tab; an unmatched value is named; gig-pages/gig tests for the part + valueOf stay green; live on his machine"

order: >-
  MT1 first — the toast overlay (both states, the breathing red dot), wired to the recording hooks that already exist, so the
  recording indicator lands now. MT2 adds the real play lifecycle (per-step events + pause/step in the runner) that the PLAYING
  toast needs. GM1 (gig metadata) waits on his screenshot of the Gig metadata tabs — the parse + the part are ready; the
  checkbox ticking reuses DD1 but needs the real DOM. Each phase specced again as .phase + .graph (his 2026-10-20); phased-only.
