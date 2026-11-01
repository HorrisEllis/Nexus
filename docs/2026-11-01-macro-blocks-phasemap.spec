# docs/2026-11-01-macro-blocks-phasemap.spec — a macro in Settings is a line of blocks, each with its settings, and a gate between every two
# blocks that holds the delay and everything a gate can do. The idea is James's; the layout, the delay kinds and the cut are the coder's
# reading, said where they are.

origin: >-
  James, 2026-11-01, in Clear Glass on Fiverr's gig wizard: "i want the macros in the settings to be blocks with settings, gates between them
  with the delays type and everything else the gates can do"

already_there_2026_11_01: >-
  - A macro is steps {action, data} (src/macros/recording.js; a recording's pauses ≥1.5 s become wait {ms}). Settings › Macros
    (renderer/settings/sections/macros.js) lists the steps as sentences.
  - A gate is "a block a pipeline, workflow or macro waits on" (his correction of 2026-10-30, src/driver/index.js _gateCheck). Its parts are
    in clear-glass/src/page/element-gate.js:
      what must hold: value, equals, matches, shows, checked, text, visible, gone, url, page text, or one of his site gates by id;
      timing: timeoutMs, settleMs, every, retries, backoff {baseMs, factor, capMs} (GT1).
  - Pipelines already draw tasks with element gates and retries (renderer/settings/sections/pipelines.js, PL7/PL11). The pointer's human pace is
    pointerPath (src/page/field.js).
  - Missing: a macro's steps are not blocks, nothing sits between two steps but a bare wait, and a delay has one kind (a fixed ms).

readings_to_confirm:
  - "\"blocks with settings\": each step a card holding its own action's fields (what it does, where, the value, how: pointer, keys, eros), editable in place. To confirm."
  - "\"gates between them with the delays type\": between every two blocks, a gate block with a delay kind: fixed (ms), range (random between two), human (pace drawn like the pointer's), until (wait for the gate's condition, up to its timeout), and backoff (the GT1 retry curve). To confirm."
  - "\"everything else the gates can do\": the whole of element-gate: what must hold, timing, retries, backoff, one of his site gates by id, and what happens when it stays closed (stop, retry the block before, skip, ask him). The last is new; the rest exists. To confirm."

decisions:
  MB_D0_blocks_and_gates:
    status: "PROPOSED 2026-11-01 (his idea; the reading above to confirm)"
    chosen: >-
      A macro's node keeps its steps and gains a gate between any two: steps[i].after = { delay: { kind, ms | min,max | pace }, gate: <element-gate>,
      timing: <GT1 timing>, onClosed: stop|retry|skip|ask }. A macro without gates runs exactly as today (a bare wait reads as delay fixed).
      One runner: the driver's gate action and EG.settle, no second gate engine (§8.6).
    by_the_axioms: "§8.6 (element-gate and the gate action reused), §0.3 (old macros run unchanged), §5.9 (all of it Clear Glass's: its settings, its driver, its macro nodes)"

phases:
  MB1_the_gate_between:
    status: "DONE 0.60.343"
    depends_on: [MB_D0_blocks_and_gates]
    files: [clear-glass/src/macros/recording.js, clear-glass/src/driver/index.js, clear-glass/src/page/element-gate.js]
    interface: [cli]
    does: "the macro runner honours steps[i].after: the delay by kind, then the gate (EG.settle with the step's timing), then onClosed; a recording's pauses become fixed delays in the new shape"
    proof: "a macro with a fixed, a range, a human and an until gate runs on a fixture page; a closed gate stops, retries or skips as set; an old macro runs the same"
  MB2_the_blocks_ui:
    status: "DONE 0.60.343"
    depends_on: [MB1_the_gate_between]
    files: [clear-glass/renderer/settings/sections/macros.js, clear-glass/renderer/settings/sections/macros.css]
    interface: [html]
    does: "Settings › Macros draws a macro as blocks (one card per step, its fields in place) with a gate chip between every two; a chip opens the gate's settings: delay kind and numbers, what must hold, timing, retries, backoff, when closed"
    proof: "driven in Clear Glass: a gate added between two blocks, saved, read back from the node, run"
  MB3_one_shape_with_pipelines:
    status: OPEN
    depends_on: [MB2_the_blocks_ui]
    files: [clear-glass/renderer/settings/sections/pipelines.js]
    interface: [html]
    does: "pipelines' task gate and the macro's gate are one editor (the same fields, one file), so a gate made in one reads the same in the other"
    proof: "the same gate shown in a pipeline task and between two macro blocks"

# ── ADDENDUM 2026-11-01 (0.60.343) — MB1 and MB2 built; James: "do it" ────────────────────────────────────────────────────────────────
# Read first: the runner (lib/agent-tools/tools/clear-glass/macro.js) already checked a gate after each step (KB4: the condition, choice,
# timeoutMs, retries). So the gate after a step IS the gate between two blocks, and MB1 added only the missing parts:
# - delay {kind fixed|range|human}: waited after the step, before the check. A gate with only a delay is a pause.
# - backoff {baseMs, factor, capMs}: the wait before each retry.
# - onClosed stop|skip.
# Validated in gate-eval.js validateGate when the macro is made; the node schema (lib/node-schemas/schema.macro) says the shape.
# "until" is not a delay kind: it is the gate's condition with its timeout, as before.
# Found while building MB2: the Settings editor rebuilt each step from its fields and DROPPED step.gate on every save, so editing a gated macro
# in Settings removed its gates. It is kept now (MBU-02); keys the editor does not show (choice, settleMs) are kept as they were.
# Open: MB3 (one gate editor shared with pipelines); "ask him" as an onClosed (needs a prompt surface; not built, said).

# ── ADDENDUM 2026-11-01 (MB4) — the macro toast: which step, out of how many, with pause, skip and back ─────────────────────────────────
# James, 2026-11-01: "also the macro toast for playback and recording, shows what step your on, out of how many. with a pause and skip, goes
# back one step." Mapped, not built (his budget that day, his "do the most you can for the least amount of tokens"): the player's step loop
# reports step i of n to one toast for playback and for recording; pause holds before the next step; skip moves past one; back reruns the
# step before. Proof in Clear Glass (never Playwright).
#   MB4_the_macro_toast: { status: BUILT 0.60.359 (test-macro-toast 5/5; the toast itself not yet driven in Clear Glass), depends_on: [MB2_the_blocks_ui], files: [lib/agent-tools/tools/clear-glass/macro-control.js, lib/agent-tools/tools/clear-glass/macro.js, clear-glass/src/macros/live-recording.js, clear-glass/src/ipc/bridge.js, clear-glass/src/preload/index.js, clear-glass/src/bookmarks/browser.js, tests/modules/test-macro-toast.test.js] }
