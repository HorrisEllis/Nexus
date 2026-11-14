spec:
  meta:
    name:     ollama-recorder
    roadmap: 'later — later (declutter 2026-10-09, James: "okay")'
    version:  1.1.0
    date:     2026-10-07
    release:  "each phase its own minor"
    uuid:     nexus-ollama-recorder-phasemap-v1-0000-2026-1007-jamesbrooks-001
    owner:    "ollama (ollama/lib/ollama-client.js, ollama/ollama-runtime.js) + lib/ollama-activity.js + the failure macro (FM2)"
    status:   "OR1–OR3 BUILT (0.44.0; the tape moved to ollama/lib/tape.js in 0.46.0, its runs on screen in the drawer's Machine view). OR4, OR5 MAPPED."
    origin: >
      James, 2026-10-07: "yes. can we use the rewind engine on ollama? like record ollamas process as a macro?"

  grounded:
    rewind_engine: "clear-glass/src/rewind/engine.js — a BROWSER time machine (URL, cookies, storage, scroll per agent). Its idea fits; its subject does not: a model call has no URL or DOM."
    activity: "lib/ollama-activity.js record() — 13 callers log caller, op, model, prompt SIZE, num_ctx, ms, ok to data/ollama/activity.jsonl. Not the prompt, the options, the seed or the answer: it can say a call happened, not replay it."
    doors: "server-side calls to :11434 go through ollama/lib/ollama-client.js, ollama/ollama-runtime.js — and still directly from cortex/boot.js, idearium/agent-suite, loom/agent-suite, guardian/server.js."
    timing: "Ollama's own reply carries total_duration, load_duration, prompt_eval_count/duration, eval_count/duration — read today only as eval_count."
    macro: "docs/2026-10-05-failure-reproduction-phasemap.spec FM2 already names 'model outputs, the seed' as what a failure macro must capture from outside — nothing captures them yet."
    tests: "the module suite logs dozens of 'ECONNREFUSED 127.0.0.1:11434' — tests touching a model either need a live Ollama or skip."

  decided:
    what_a_frame_is: >-
      One model call = one frame: { model, digest (the exact weights), options (temperature, seed, num_ctx, num_predict),
      system, prompt → blob, answer → blob, thinking?, timings (load, prompt eval, eval, tokens/s), doneReason, caller,
      causedBy (the running task: lib/repo-activity current()), at }. Prompts and answers are content-addressed blobs
      (sha256) — the same system prompt sent 1,000 times is stored once.
    a_macro_is_a_run: "the frames under one task id, in order, are the macro of that run — what the model was asked and answered, step by step."
    three_replays:
      cassette: "replay AS RECORDED — the recorded answers returned without Ollama: the code around the model rerun exactly, in milliseconds, with no GPU (tests and failure macros run anywhere)."
      live: "replay AGAINST THE MODEL — same model digest, same seed, temperature as recorded: the same answer is expected (a diff is a finding: the model or Ollama changed)."
      what_if: "replay with ONE thing changed — another model, prompt, num_ctx — and diff the answers: a model upgrade or prompt edit tested on real past runs before it is used."
    rewind: "rewinding a run = its versionium commit (VR1, the code), its desktop checkpoint (CK1, the machine) and its macro (this, the model) — the three things a run depends on, each recordable, together."

  phases:
    OR1_one_door:
      does: "every server-side call to Ollama through ollama/lib/ollama-client.js (cortex/boot.js, idearium/agent-suite, loom/agent-suite, guardian/server.js moved onto it). One door is where recording costs nothing extra."
      proof: "no :11434 call outside the client (a test greps); every caller's calls still answer"
      status: "DONE 0.44.0 — as three recorded doors, not one: ollama-runtime streamGenerate keeps its own tested wire (clear-glass copilot, emerge, orchestrator use it) with the same tape; loom/agent-suite goes through the client first; idearium/loom direct HTTP remains only for a package run standalone (test OR-05)"
    OR2_every_call_a_frame:
      does: "the door writes a frame per call (blobs content-addressed under data/ollama/blobs, frames appended — PF3's segment shape); the seed is always set and recorded (a random one when the caller gives none), so every call is replayable; timings read from Ollama's reply."
      proof: "a call → a frame with digest, seed, prompt and answer blobs, timings; the same prompt twice → one blob"
      status: "DONE 0.44.0 — lib/ollama-tape.js (the model digest is not yet read: OR5 reads /api/show once per model); test-ollama-tape OR-01, OR-02"
      open: "retention: frames per day per process and blobs are not yet capped — PF5's archive applies when they grow"
    OR3_the_cassette:
      does: "NEXUS_OLLAMA_REPLAY=<run id> (or per call): the door answers from recorded frames by (model, prompt hash, options) — no Ollama. A recorded run's code reruns exactly. The failure macro (FM2) carries its frames."
      proof: "a recorded agent run replays with Ollama stopped and produces the same files; a call not in the cassette is said, never invented"
      status: "DONE 0.44.0 — NEXUS_OLLAMA_REPLAY=<run>|all on all three doors; test-ollama-tape OR-03 (Ollama stopped: same answers, zero calls out), OR-04 (an unrecorded call refused)"
    OR4_live_and_what_if:
      does: "`idearium ollama replay <run> [--live | --model m | --num-ctx n]` (a CM1 row — copilot has it): reruns the frames against the model, diffs each answer; a what-if run is a report, never applied."
      proof: "live replay at the recorded seed matches; --model swaps and shows the per-step diff"
    OR5_model_vitals:
      does: "frame timings feed EX2 vitals for the ollama system: load time (a reload = a model evicted from VRAM), tokens/s, prompt size vs num_ctx; expectations (EX1) for each; EX5 forecasts VRAM thrash."
      proof: "two models alternating → load_duration rises, said as a violation naming the callers"

  ordering: "OR1 → OR2 → OR3 → OR4 → OR5; OR3 also lets the test suite run model tests without Ollama. Slots after PF4 and alongside EX2 (OR5 is an EX2 input)."

# ── ADDENDUM 2026-11-14 (0.60.533) — Nexus reaches Ollama on his PC: its listen address is no longer dialled ──────────────────────────────
# Found on his PC proving 0.60.532's `ask @ollama` (his, of that release: "the console in cos, is supposed to hook into each system, and agent"):
# copilot answered "ollama unavailable" with Ollama running. His OLLAMA_HOST is 0.0.0.0:11434: Ollama's own variable for where its server
# LISTENS. Nexus dialled it. On his PC nothing in Nexus could use Ollama (the co-pilot's Ollama way, the pipeline's Ollama rung).
phases_addendum_2026_11_14_oa:
  OA1_nexus_dials_loopback_for_a_listen_everywhere_address:
    status: "BUILT 0.60.533 — ollama-runtime.test 9/9 (H1). Through COS's Console on his PC: see the changelog's proof line"
    origin: 'Found on his PC, 2026-11-14 (a fault found while proving what he asked for; §4.2). His words of the day before: "now we can use ollama for the pipeline. i need to be able to use it fully."'
    depends_on: []
    spec: ollama/spec/ollama.spec
    files: [ollama/config.js, ollama/ollama-runtime.js, lib/agent-tools/tools/ollama/generate.js, tests/modules/ollama-runtime.test.js]
    does: >-
      ollama/config.js clientAddress(): an OLLAMA_HOST that says listen everywhere (0.0.0.0, [::]) is dialled on this machine's loopback; any
      other value is used as given. The runtime and the agent tool follow the same rule.
    by_the_axioms: "§4.2, §1.2 (the bridge said 'offline' of an Ollama that was up), §17.7"
    his_not_changed: "the bridge's default model is qwen2.5-coder:7b; installed on his PC is only huihui_ai/qwen2.5-coder-abliterate:3b. Which answers is the bridge's setting (PUT /api/model), his."
# OA1 proved on his PC, 2026-11-14 (0.60.533 running): the bridge reports ollama_host http://127.0.0.1:11434 and lists his installed model; in COS's
# Console `ask @ollama reply with exactly: console reaches ollama` answered "console reaches ollama" (asked ollama, answered by ollama), and a bare
# `ask` (the co-pilot) was answered by Ollama. For that, the bridge's model was set to the one installed (huihui_ai/qwen2.5-coder-abliterate:3b;
# his 2026-08-23: "now using huihui_ai/qwen2.5-coder-abliterate:3b for ollama/co-pilot"): by PUT /api/model for the running bridge, and kept across
# restarts as COS's setting env.OLLAMA_DEFAULT_MODEL on ollama-bridge (undo: `config ollama-bridge clear env.OLLAMA_DEFAULT_MODEL`). The coder set
# it, said here; the choice of model stays his. 0.60.532's CH1 proved the same hour: `raid <words>` kept as input in-1794626974354-3e15a5, booked as
# contract c-in-1794626974354-3e15a5 with four gaps.
