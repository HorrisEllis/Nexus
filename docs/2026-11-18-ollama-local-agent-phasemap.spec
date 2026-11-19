# docs/2026-11-18-ollama-local-agent-phasemap.spec — Ollama as the local builder: every setting in one place (COS tab + Ollama system), a continuous event
# stream, scored and gated chunking with a rewind at each gate, a slow-but-sure model lane, and the uses a 3B to 30B local agent can be trusted with.
# The ask and the direction are James's; the inventory, the cut, the readings and the order are the coder's, by his axioms (§3.3 map before build,
# §8.6 reuse before build). Only what nothing covers is written here; the rest EXPANDS the phases that own it (SL_D11), listed under `expands:`.
# Source of the numbers: a conversation on 2026-11-18 and the tree at nexus-0_60_545.zip. Nothing below was run on his PC. Every size, speed and tag
# is an estimate until OL14 measures it (§1.1, §12.3).

origin: >-
  James, 2026-11-18: "so i have 85 GB on my ssd. i have a 3700x, gtx 1650, 16 GB of ram. i want to optimize ollama in every way. gpu, cpu, offloading,
  chunking, everything you can possibly find, invent, or create and make a list. use my ssd to run a bigger model also." · "smarter model the better.
  coding using emerge. claude.md" · "I want a large capable model. i need to finish emerge, pipeline and use ollama to build nexus. js is a backup.
  then at somepoint i can train a base model when emerge is done. use my framework for uncertainty or ambiguity, or gaps? rating or scoring each
  primitive or dependancy or chunk by how load bearing it is" · "pipeline and emerge chunking, utililize the ollama chunking, dynamic chunking or
  context window from the resource manager, rewind engine for each gate." · "biggest model i can get away with that idearium and the pipeline could
  use." · "30b moe? 3b model? 3b with smarter gates?" · "i dont care about slow. as long as it builds. slow is better than not at all. trying to
  replace." · "can you make it a spec file? also include to add all of this in the cos ui settings for ollama tab, and also the ollama system,
  including continious event stream, and any other clever uses for ollama, with this size of agent"

end_state: >-
  Ollama builds Nexus, slowly if it must, and never stalls. Every tunable (server environment, per-model options, lanes, fit rule, chunk budgets, load
  scores, gate and rewind policy, event stream) is one settings node in the Ollama system's own folder, read and changed through its API routes and
  command rows, recorded in Versionium, and shown on an Ollama tab in COS, which is a skin. The Ollama system emits a continuous, resumable event
  stream (heartbeat, not polling) that the tab and the pipeline read. A chunk is scored by how load-bearing and how uncertain it is, sized to the model
  that takes it, built behind a gate that checkpoints first and rewinds when it closes, and escalated up a ladder (the same model with the test output,
  a bigger model, a split, synth, a held gap). The strongest model that fits plans the work and writes the tests; a small fast model fills the one-rule
  units; deterministic tools (eg say, synth, eg check) judge both. Every attempt is kept as a training row for the base model he wants to train when
  Emerge is done.

found_while_mapping:
  # read in the tree 2026-11-18; none of it was run
  - "ollama/config.js is already 'the one real place' for model tags, env-overridable (DEFAULT_MODEL qwen2.5-coder:7b; qwen3.5:9b the thinking fallback). It does not hold the Ollama server's own environment (flash attention, KV cache type, parallel, keep-alive) or any per-model option. This map extends it; it does not add a second place (§10.3)."
  - "ollama/lib/ollama-client.js already streams with an idle timeout, retries a thinking-only reply with think:false, continues a cut reply, retries on the CPU (num_gpu 0, num_ctx 4096) after a GPU out-of-memory error and records every call on the tape (replayable). Its API is Ollama's only; a llama.cpp server (OpenAI-compatible) needs an adapter."
  - "lib/resource-monitor.js fitsModel() admits a model when bytes x 1.2 fits free memory plus what Ollama can release, after a kept-back halt line (MF1, BUILT 0.60.163). It counts weights as resident, which is wrong for a memory-mapped model (evictable page cache: the risk is slowness, not out-of-memory). It returns no context size. DEFAULT_THRESHOLDS was not read."
  - "DC1_dynamic_chunk_at_plan and DK1_dynamic_chunking are OPEN: dynamic chunking exists only reactively, at dispatch (contract-gates.js _splitDeeper). Emerge's own chunk benchmark (emerge/bench/chunks.js) found the 7B passes one-rule units and fails multi-rule ones; synth.eg solved the same task with no model."
  - "The Ollama system (port 3749, ollama/spec/ollama.spec 1.4.0) already emits ollama.job.queued/started/complete/failed/cancelled, ollama.model.loaded/unavailable, ollama.health.ok/degraded and ollama.queue.depth every 5 s, serves GET /events and per-job GET /api/stream/:id, and has 17 command rows. The handlers of /events and /api/stream were not read, so what they stream and whether a client can resume were not checked."
  - "COS has tabs (desktop, log, pipelines, runs, supervision, workflows, console SC11, disk DK3) and cos/app/settings.js and CA3 network settings. No Ollama tab and no Ollama settings page exist: a grep of cos/ui, cos/app and cos/services found Ollama only in pipeline-editor previews. CP7_settings (settings by type, OPEN) and MG6 (settings by template and type) may be the mechanism a tab should use."
  - "The rewind that exists (clear-glass/src/rewind/engine.js) rewinds a browser page (URL, cookies, form values). The rewind meant for pipelines is CP5_states_rewind_versions and CP5d_rewind_and_branch (OPEN in the map): checkpoint, rewind to any recorded moment, branch. gate.eg already has the actions retry, branch, hold and the outcomes open, closed, gap, and a reason that closes it again and again becomes a gap (gapAfter)."
  - "No score called load-bearing is defined anywhere. The words appear as prose. What exists to build one from: his formulas (Leverage = Tension x Weight x f(Slope); Leverage of a Node = sum of vector contributions x f(slope) x weight), the three-gap rule (one is an anomaly, two a coincidence, three an invariant), sigma records (cortex/schemas/schema.sigma_record), phase-dag slice() for reach, lattice_edges with success and failure counts."
  - "OLLAMA_HOST on his PC is 0.0.0.0:11434: Ollama listens on every interface with no authentication. Nexus already dials loopback for it (OA1, 0.60.533). Whether the LAN needs it was not asked."
  - "Emerge needs about 1,200 tokens of reference context per session because no model knows it (emerge/bench/README.md). docs/CLAUDE.md is far larger than a small model's context: a local card of 300 tokens or fewer is needed, not the contract."

agent_size_charter:
  # what each size may be trusted with. A gate, not the model, decides pass. A model never decides a number (sigma, score, tokens/s): those are measured.
  s3b:  "GPU-resident, fast. Routing, one-rule Emerge units, labelling a failing test into the gap taxonomy, short summaries, embeddings. Many samples, always behind a gate."
  s7b:  "Normal chunks of one or two rules, narration of the event stream, drafting a changelog line from verbatim material, hostile-review of a small idea. Behind a gate."
  s14b: "Dense, about 9 GB: multi-rule units, test authoring checked by eg check, JS-to-Emerge translation of one function. Admitted only if fitsModel says it fits with Nexus running."
  s30b_moe: "Slow lane. Plans a phase, splits it into units, declares boundaries, writes the tests, reviews the hard tenth, breaks a tie between two small models. Never in an interactive path. Batched, one swap per queue."
  never: "None of them decides: whether something passed, a score, a sigma, a version number, a quote of his. Those are computed or copied, and a gate checks that they were."

decisions:
  # OL_D1, OL_D2, OL_D3, OL_D4, OL_D5, OL_D6 are his to reconcile (CLAUDE.md: "Ambiguity must be reconciled by me"). Side by side; the coder's recommendation is named as the coder's.
  OL_D1_how_a_setting_reaches_ollama:
    status: PENDING — his
    depends_on: []
    readings:
      a: "The Ollama system writes the server environment to a file and tells him to restart Ollama by hand. Nothing starts or stops a process it does not own."
      b: "COS starts Ollama (ollama serve) with the environment injected, as COS already forwards its environment to every system it starts (AC9), and restarts it when a restart-needed setting changes. The server.js of the system is the process COS manages; Ollama's own daemon would become one COS manages too."
      c: "Per-call options only (num_thread, num_gpu, num_batch, num_ctx, keep_alive ride on each request) and the server environment stays his, by hand."
    coders_recommendation: "(c) first, because it needs no restart and is already how ollama-client.js talks (optionsOverride); (a) for the five environment settings, shown on the tab as a checklist with a copy-paste line. (b) later, if he wants COS to own the daemon."
    axioms: [§5.9, §5.15, §1.2]
  OL_D2_what_load_bearing_means:
    status: PENDING — his
    depends_on: []
    his_words: "rating or scoring each primitive or dependancy or chunk by how load bearing it is"
    readings:
      a: "Structural: how many things transitively depend on it (phase-dag slice() down, the require graph). Deterministic, computable today."
      b: "Risk-weighted, his own formula applied to a chunk: Leverage = Tension x Weight x f(Slope). Reach is (a); Weight is stakes (on the bootstrap path, halts the pipeline, irreversible); Slope is how many gates flip if it fails; Tension is the measured gap between the declared boundary and the evidence, with uncertainty as sigma from repeated trials and from two models disagreeing."
    coders_recommendation: "(b). It contains (a), it uses his formula, and the third consistent failure (his three-gap rule) is the event that updates a budget. The weights are the coder's first guess and are his to set."
    axioms: [§0.1, §1.1, §14.5]
  OL_D3_where_the_tab_lives:
    status: PENDING — his
    depends_on: []
    readings:
      a: "A tab of its own in COS, next to console and disk, with its own page."
      b: "A settings TYPE under the settings-by-type mechanism (CP7, MG6): the Ollama system declares its settings and COS draws them, with extra panels (live stream, models, gates) as sections."
    coders_recommendation: "(b) for the settings, (a) for the live panels, in one tab. Reuse CP7 if it is built by then; read cos/ui and cos/app first (§6.2) because the tab's file placement was not confirmed."
    axioms: [§8.6, §5.12, §5.16]
  OL_D4_how_emerge_code_runs_inside_the_ollama_system:
    status: PENDING — his
    depends_on: []
    his_words: "No non-Emerge code unless the contract or the project names it; a missing capability is built into Emerge. No new JS unless it replaces JS."
    readings:
      a: "Written in .eg, built with eg build --standalone, required by the Ollama system with a three-line adapter (his handoff, 2026-10-31: the Nexus bridge)."
      b: "Written in .eg and run through Emerge's door (POST /lang/run, EAS2), the Ollama system calling the Emerge system."
    coders_recommendation: "(a) first, the bridge his handoff recommends; (b) once EAS4 moves the callers to the door. JavaScript is only the existing door, touched minimally (js_door under each phase)."
    axioms: [§17.13, §5.10, §5.14]
  OL_D5_a_second_model_server:
    status: PENDING — his
    depends_on: []
    readings:
      a: "llama.cpp's llama-server is a backend inside the Ollama system, behind one backend interface (Ollama's API and the OpenAI-compatible one). It gives what Ollama does not expose: expert offload to the CPU for an MoE model, a draft model, a grammar for Emerge."
      b: "It is its own sovereign system with its own server.js, port, registry and compartment, and the Ollama system stays Ollama-only."
    coders_recommendation: "(a), named 'backend', so a third can be added (§5.14). If the model server grows its own settings and tests, split it to (b) then."
    axioms: [§5.9, §5.14, §0.5]
  OL_D6_how_a_model_bigger_than_free_memory_is_admitted:
    status: PENDING — his
    depends_on: []
    readings:
      a: "Keep fitsModel as it is: bytes x 1.2 must fit. The 30B MoE (about 13 GB at 3 bits) is refused whenever Nexus is running."
      b: "A memory-mapped MoE model is admitted by evidence: its measured tokens per second, and whether its first token arrives inside a learned per-model timeout. The bytes rule stays for a dense model."
      c: "Buy 16 GB more memory and keep (a)."
    coders_recommendation: "(b) now, (c) as the cheaper route to a bigger model. On a SATA SSD a dense model larger than memory is not admitted at all (tens of seconds per token); only an MoE model gets (b)."
    axioms: [§1.1, §1.2, §12.3]
  OL_D7_one_settings_place:
    status: DECIDED by the axioms
    depends_on: []
    chosen: >-
      §10.1, §10.3, §8.6: ollama/config.js stays the one place a default lives; a setting node overrides it by its source (default, env, file, learned,
      set by him) and says which. The COS tab holds no setting of its own. It reads and writes through the Ollama system's routes (§5.9, §5.10).
  OL_D8_ui_is_a_skin:
    status: DECIDED by the axioms
    depends_on: []
    chosen: >-
      §5.12, §3.4: every control on the tab is a command row first (idearium/cli/route-commands.js), then a route, then the page. The page is tested
      in Clear Glass (clear-glass/src/driver/glass.js), never Playwright. The page's own language follows OL_D4's rule for what is a skin.
  OL_D9_a_model_never_decides_a_number:
    status: DECIDED by the axioms
    depends_on: []
    chosen: >-
      §0.1, §1.2, §14.2: a pass, a score, a sigma, a version and a quote of his are computed or copied, and a gate checks that they were: a quote must
      exist verbatim in docs/his-words, or the gate closes it. Gates are pure functions; the model's text is evidence, not a verdict.
  OL_D10_failure_is_kept:
    status: DECIDED by the axioms
    depends_on: []
    chosen: >-
      §0.3, §2.1, §7.4, §7.5, §15.2: a closed gate is rewound and its attempt is kept as a node file (persistence is non-negotiable until the contract
      is fulfilled), classified unresolved, rejected or abandoned, and counted by the three-gap rule. It is a row of the training ledger, not an error to hide.

gaps:
  # his framework applied to this map's own unknowns. The rating is the coder's reading (OL_D2 b): load = how much of the map rests on it, uncertainty = how
  # little was checked. They are gaps to close by measuring, not to guess.
  GAP_1_ssd_kind:          { load: high,   uncertainty: high,   close_by: "he says SATA or NVMe (Task Manager shows the model)", decides: "whether OL4's mmap admission (OL_D6 b) is worth building at all" }
  GAP_2_free_ram_with_nexus_up: { load: high, uncertainty: high, close_by: "OL4's first proof: fitsModel's report with Nexus running", decides: "the dense ceiling (14B or not)" }
  GAP_3_30b_tag_size_speed: { load: high,   uncertainty: high,   close_by: "OL14 sweep, wall-clock per passed unit", decides: "whether the slow lane is useful" }
  GAP_4_emerge_grammar:    { load: high,    uncertainty: high,   close_by: "read emerge/lang/parser.js: is the layout expressible as a GBNF grammar", decides: "whether constrained decoding is available to small models" }
  GAP_5_load_bearing_reading: { load: high, uncertainty: medium, close_by: "OL_D2", decides: "OL6 and every escalation threshold" }
  GAP_6_events_handler:    { load: medium,  uncertainty: high,   close_by: "read the /events and /api/stream handlers", decides: "how much of OL9 is new" }
  GAP_7_cp5_built_since:   { load: medium,  uncertainty: medium, close_by: "phase-ledger on CP5, CP5d", decides: "whether OL8 expands it or waits for it" }
  GAP_8_tab_placement:     { load: low,     uncertainty: medium, close_by: "OL_D3 and a read of cos/ui", decides: "OL11's files" }
  GAP_9_lan_exposure:      { load: medium,  uncertainty: low,    close_by: "he says whether the LAN needs 0.0.0.0", decides: "a single setting (host binding)" }

settings_catalog:
  # every tunable from the plan, as a setting node (OL1). source is one of: default | env | file | learned | set-by-him. restart: yes where Ollama must restart.
  server_environment:   # OL_D1: shown as a checklist with a copy-paste line unless COS owns the daemon
    OLLAMA_FLASH_ATTENTION:    { recommended: 1,       restart: yes, why: "required for a quantized KV cache; less memory as context grows" }
    OLLAMA_KV_CACHE_TYPE:      { recommended: q8_0,    restart: yes, why: "f16 | q8_0 | q4_0; halves cache memory at q8_0; global to every model" }
    OLLAMA_NUM_PARALLEL:       { recommended: 1,       restart: yes, why: "context memory multiplies by it; queue in Nexus instead" }
    OLLAMA_MAX_LOADED_MODELS:  { recommended: 1,       restart: yes, why: "16 GB; the router decides when a swap is worth it" }
    OLLAMA_KEEP_ALIVE:         { recommended: "30m",   restart: yes, why: "avoid reloading from the SSD" }
    OLLAMA_CONTEXT_LENGTH:     { recommended: 4096,    restart: yes, why: "per-call num_ctx overrides it" }
    OLLAMA_GPU_OVERHEAD:       { recommended: 268435456, restart: yes, why: "VRAM kept back so Windows growing does not cause an out-of-memory" }
    OLLAMA_MODELS:             { recommended: "the fastest drive", restart: yes, why: "models on the SSD, not an HDD" }
    OLLAMA_HOST:               { recommended: "127.0.0.1:11434", restart: yes, why: "0.0.0.0 exposes an unauthenticated server to the LAN (GAP_9)" }
  per_model_options:    # ride on each call (optionsOverride); no restart
    num_thread:  { recommended: 8, why: "physical cores of the 3700X; 16 SMT threads often slows a bandwidth-bound run; the tuner benchmarks 6, 8, 10" }
    num_gpu:     { recommended: "learned", why: "raise layers until about 3.6 GB of 4 GB is used; 0 is the CPU fallback" }
    num_batch:   { recommended: "512 to 1024", why: "faster prompt processing for a little memory" }
    num_ctx:     { recommended: "from OL4", why: "sized from free memory and the model's KV cost, not fixed" }
    num_predict: { recommended: "per task", why: "cap a runaway reply; a cut reply is continued at the unit's declared end (OL7)" }
    use_mmap:    { recommended: true, why: "lets a model exceed memory; the basis of the slow lane" }
    think:       { recommended: false, why: "thinking tokens cost minutes on a CPU-bound box; true only in the slow lane" }
    temperature: { recommended: "0.2 build, 0.4 trials", why: "trials need a spread for sigma" }
  lanes:                # OL5
    rung0: "3 to 4B coder, GPU-resident: routing and one-rule units"
    rung1: "qwen2.5-coder:7b: normal chunks"
    rung2: "14B dense at Q4 (about 9 GB): only if fitsModel admits it"
    rung3: "30B-A3B coder MoE at 3 bits (about 13 GB): the slow lane; llama.cpp backend with expert offload (--n-cpu-moe)"
    rung4: "32B or 70B dense: not admitted on SATA"
  backend_llama_cpp:    # OL5, OL_D5 a
    flags: "-ngl 99 --n-cpu-moe <n> -c <ctx> -fa on -ctk q8_0 -ctv q8_0 -t 8 -b 512; optional -md <draft.gguf> for speculative decoding; optional --grammar-file emerge.gbnf (GAP_4)"
  fit_rule:             # OL4
    dense: "bytes x 1.2 <= free + reclaimable - kept back (unchanged)"
    mmap_moe: "admitted by measured tokens per second and a learned first-token timeout (OL_D6 b)"
    kv_bytes_per_token: "2 x layers x kv_heads x head_dim x bytes per element (f16 2, q8_0 about 1): a 7B about 30 KB at q8_0, a 14B about 100 KB"
  chunking:             # OL6, OL7
    unit: "rules per unit, not tokens (the 7B result)"
    budget: "learned per model by counting outcomes; the third consistent failure lowers it (three-gap rule)"
    high_load: "smaller units, one rule each, boundary declared at every edge"
    low_load: "neighbours merge (R4 of lib/code-intel/chunker.js)"
    stop: "a unit's declared end is the stop sequence, so a cut aligns with a unit"
  scoring:              # OL6, weights set by him
    reach: "phase-dag slice() down, log-scaled"
    weight: "bootstrap path, halts the pipeline, irreversible (writes data/**, Versionium)"
    slope: "gates that flip if it fails"
    uncertainty: "sigma over trials and over two models; unknown counts, never as a pass (SB_D3)"
  escalation:           # OL8
    ladder: "retry with the test output, then a bigger model, then split (_splitDeeper), then synth, then hold as a gap for him"
    invariant_after: 3
    rewind: "file-level checkpoint of the phase's declared files, then Versionium record(); the failed attempt is kept"
  timeouts:             # OL5
    idle_per_model: "learned; a cold 30B load from SATA plus the 1,200-token Emerge card can take minutes before the first token"
    total_per_task: "set per lane; a slow lane is never killed at 45 s"
  prompt_prefix:        # OL5
    card: "Emerge syntax card first and identical on every call so the cached prefix is reused; a distilled local CLAUDE card of 300 tokens or fewer, not docs/CLAUDE.md"
  events:               # OL9
    heartbeat_s: 5
    resume: "a cursor, so a client reconnects and misses nothing"
  advisories:           # read-only checks on the tab; detectable where marked, otherwise a manual checklist
    - "XMP/DOCP on, dual channel, memory about 3600 CL16 (manual)"
    - "Windows power plan High performance, core parking off (manual)"
    - "close browser hardware acceleration and background GPU apps; the 3700X has no integrated graphics (detectable: free VRAM)"
    - "Defender exclusion for the model folder (manual)"
    - "pagefile 16 to 32 GB on the SSD: a safety net, not a speed-up (detectable)"
    - "OLLAMA_HOST binding (detectable)"

phases:

  OL1_settings_schema_and_store:
    layer: foundation
    status: OPEN
    depends_on: []
    axioms: [§10.1, §10.3, §2.1, §5.9, §8.6]
    expands: [OA1_loopback_dial]
    files: [ollama/schemas/schema.setting, ollama/settings/setting.eg, ollama/settings/catalog.eg, ollama/data/nodes/setting/, ollama/test/setting.test.eg, ollama/config.js]
    js_door: [ollama/config.js reads a setting node first, then its env, then its default; nothing else in that file changes]
    does: >-
      The settings_catalog above as setting nodes in the Ollama system's own data (a .setting node file each, persisted, resumed from disk): key, value,
      default, source (default | env | file | learned | set-by-him), group, restart-needed, type and range, and the rule that validates it. A value that
      fails its rule is refused with the reason, never silently clamped (§1.2). config.js stays the one place a default lives (OL_D7).
    proof: >-
      A value outside its range is refused with its reason; a changed setting survives a restart of the Ollama system and says its source; with the env
      variable set the node reads it and says 'env'; every key in settings_catalog has a node and a rule.

    expanded_2026_11_18_gpu: >-
      James, 2026-11-18: "are we offloading to the gpu or cpu with ollama. i wanted this to be options in cos settings, in the ollama settings".
      Measured that day (Ollama's own load log, deepseek-coder-v2:16b on his GTX 1650, 4 GB VRAM): "offloaded 28/28 layers to GPU", yet only
      0.75 GB of weights sit on the GPU (CUDA0) and 7.7 GB stay in system RAM (CUDA_Host: the MoE experts), with a 1.3 GB KV cache on the GPU.
      With Nexus running, free RAM fell from 7.1 GB to 0.6 GB within a minute of the load; COS froze and the service killed it.
      The settings to add, each a .setting node in Ollama's own store, shown in COS Settings → Ollama, per model where Ollama allows it:
      GPU layers (num_gpu; 0 = CPU only), main GPU, CPU threads (num_thread), context length (num_ctx), KV cache type (OLLAMA_KV_CACHE_TYPE
      f16 | q8_0 | q4_0: q8_0 halves the 1.3 GB), flash attention, keep-alive, memory mapping (use_mmap), and what is resident now (from /api/ps:
      size and size_vram), so the choice is made against what is measured. Order (his): command, route, then the COS Settings card. Open for him:
      the defaults on this machine.
  OL2_settings_routes_and_commands:
    layer: foundation
    status: OPEN
    depends_on: [OL1_settings_schema_and_store]
    axioms: [§5.10, §3.4, §17.12, §9.2, §1.2]
    files: [ollama/routes/settings.eg, ollama/commands/get-api-settings.command, ollama/commands/put-api-settings-key.command, ollama/commands/post-api-settings-diff.command, ollama/commands/post-api-settings-revert.command, ollama/test/settings-routes.test.eg]
    js_door: [ollama/lib/command-index.js aggregates the new commands exports; nothing else]
    does: >-
      GET /api/settings (grouped, with source and restart-needed), GET/PUT /api/settings/:key, POST /api/settings/diff (what a change would alter, and
      whether Ollama must restart), POST /api/settings/revert. Each change goes to Versionium through lib/versionium-record.js record() and emits
      ollama.setting.changed. A command row for each (idearium/cli/route-commands.js), so the CLI works before any UI (LAW_V).
    proof: >-
      A PUT changes a value, a diff names what it alters, a revert returns the previous value, and Versionium holds both; the command row does the same
      from the CLI with no page open.

  OL3_apply_path:
    layer: foundation
    status: OPEN
    depends_on: [OL1_settings_schema_and_store, OL2_settings_routes_and_commands]
    axioms: [§5.9, §5.15, §1.2, §2.3]
    decisions: [OL_D1_how_a_setting_reaches_ollama]
    files: [ollama/apply/apply.eg, ollama/apply/env-profile.eg, ollama/test/apply.test.eg]
    does: >-
      How a value reaches Ollama (OL_D1): per-call options ride on the request through optionsOverride; the server environment is written as a profile
      (a file, and one copy-paste line per variable) and flagged restart-needed until the running server reports the value (read back from its own log
      line: the starting llama-server line carries the flash-attention and cache-type flags). A setting is 'applied' only when read back, never when written
      (§1.1). If OL_D1 b is chosen, COS restarts Ollama with the environment injected.
    proof: >-
      A changed num_thread appears in the next call's options on the tape; a changed OLLAMA_KV_CACHE_TYPE shows 'written, restart needed' until the server's
      log shows it, then 'applied'.

  OL4_fit_and_context:
    layer: library
    status: OPEN
    depends_on: [MF1_model_fit_routing, OL1_settings_schema_and_store]
    expands: [MF1_model_fit_routing, DC1_dynamic_chunk_at_plan]
    axioms: [§1.1, §1.2, §12.3, §8.6, §3.1]
    decisions: [OL_D6_how_a_model_bigger_than_free_memory_is_admitted]
    files: [ollama/fit/fit.eg, ollama/fit/kv.eg, ollama/test/fit.test.eg, lib/resource-monitor.js]
    js_door: [lib/resource-monitor.js fitsModel() calls the fit door and returns its verdict plus maxCtx and numGpu]
    does: >-
      fitsModel also returns the largest num_ctx and the num_gpu the model can take now (from free memory and the KV cost per token), so the Ollama call is
      sized by the resource manager and not fixed. A memory-mapped MoE model is admitted by measured tokens per second and a learned first-token timeout
      (OL_D6 b); a dense model keeps the bytes x 1.2 rule. The measured tokens per second, the first-token time and the free memory at the time are
      recorded per model (learned settings), so the next admission starts from evidence.
    proof: >-
      With Nexus running, fitsModel's report for 3B, 7B, 14B and the 30B MoE is printed with the numbers behind each verdict (this closes GAP_2); a model whose
      size is unknown is still tried and says so; the CPU fallback still fires on a GPU out-of-memory.

  OL5_lanes_and_queue:
    layer: library
    status: OPEN
    depends_on: [OL3_apply_path, OL4_fit_and_context]
    axioms: [§5.14, §9.3, §2.1, §14.4, §1.2]
    decisions: [OL_D5_a_second_model_server]
    files: [ollama/lanes/lanes.eg, ollama/lanes/queue.eg, ollama/backend/backend.eg, ollama/backend/llama-cpp.eg, ollama/backend/ollama.eg, ollama/test/lanes.test.eg]
    js_door: [ollama/lib/ollama-client.js calls the backend door instead of Ollama's URL directly]
    does: >-
      The ladder as lanes (a fast lane on the GPU, a normal lane, a slow lane), a slow lane that never stalls: its idle and total timeouts are learned per
      model, its queue is persisted (a power cut resumes from disk), and its work is batched by model so a swap happens once per queue and not once per
      job. A backend interface (Ollama, llama.cpp) so the slow lane can use expert offload, a draft model and an Emerge grammar where the backend has them.
      The prompt prefix (the Emerge syntax card, then the 300-token local card) is identical and first on every call so the cached prefix is reused. COS may
      pause heavy systems while the slow lane runs, so the model has memory.
    proof: >-
      Ten queued jobs for two models run as two loads, not ten; a killed process resumes the queue from disk; a cold slow-lane model that takes minutes to its
      first token is not failed at 45 s; the same job through each backend returns a reply the same gate accepts.

  OL6_load_score:
    layer: library
    status: OPEN
    depends_on: [OL1_settings_schema_and_store]
    axioms: [§0.1, §1.1, §14.2, §14.5, §11.1]
    decisions: [OL_D2_what_load_bearing_means]
    files: [cos/pipeline/score.eg, cos/pipeline/test/score.test.eg, cortex/schemas/schema.sigma_record]
    does: >-
      A score for each primitive, dependency and chunk of how load-bearing it is (OL_D2 b: reach, weight, slope, uncertainty), a pure function (§14.2)
      whose inputs are read from the tree and the tape, written as a node file next to the chunk with its inputs, so it can be recomputed and argued with.
      Sigma comes from repeated trials and two-model disagreement; delta is the gap between the declared boundary and the evidence; unknown never counts as a
      pass. Its output is a decision, not a number to look at: a high-load, high-uncertainty chunk gets the biggest model, more trials, smaller units and his
      review; a high-load, low-uncertainty one gets eg say or synth or a small model behind a strict gate; a low-load, high-uncertainty one is a cheap try
      that may fail as an anomaly and is parked as a gap.
    proof: >-
      On the Emerge tree the score ranks the parser, checker, prelude and runtime above a one-off helper, and says why for each; recomputing from the same
      inputs gives the same number; changing a weight changes the ranking and the change is in Versionium.

  OL7_rule_budgets_and_chunk_stops:
    layer: library
    status: OPEN
    depends_on: [OL4_fit_and_context, OL6_load_score]
    expands: [DK1_dynamic_chunking, DC1_dynamic_chunk_at_plan, DK2_chunk_boundaries_learned]
    axioms: [§1.3, §8.6, §14.5, §3.1]
    files: [cos/pipeline/budget.eg, cos/pipeline/chunk-plan.eg, cos/pipeline/test/budget.test.eg, cortex/core/raid/contract-adapters.js, cortex/core/raid/contract-gates.js]
    js_door: [contract-adapters.js reads the rule budget at plan time (DC1); contract-gates.js keeps _splitDeeper as the safety net]
    does: >-
      A rule-count budget per model learned by counting outcomes (a unit of one rule passes at 7B; two rules fail), lowered on the third consistent failure
      and raised on consistent passes, clamped above by what OL4 says the memory allows. The plan cuts a phase into units of that size at plan time, not at
      dispatch; a high-load chunk is cut smaller. A unit's declared end is its stop sequence, so a reply that is cut ends at a unit, and the bridge's
      continuation resumes at the next one.
    proof: >-
      The utf8_decode chunk job is planned at one rule per unit for the 7B and at larger units for a 14B or 30B, with the budget shown and its evidence;
      a cut reply ends at a unit boundary and the continuation starts at the next unit.

  OL8_gate_rewind_file_tier:
    layer: library
    status: OPEN
    depends_on: [OL7_rule_budgets_and_chunk_stops, OL9_event_stream]
    expands: [CP5d_rewind_and_branch, CP5_states_rewind_versions]
    axioms: [§0.3, §2.1, §15.1, §15.2, §14.4, §16.1]
    files: [cos/pipeline/rewind.eg, cos/pipeline/escalate.eg, cos/pipeline/test/rewind.test.eg, cos/pipeline/gate.eg]
    does: >-
      The rewind for each gate, at the file tier first (the machine tier by qcow2 overlays stays CP5d's). Before a gated step the files the phase declares
      are checkpointed and recorded through Versionium. A gate that opens commits; a gate that closes rewinds to the checkpoint, keeps the failed attempt as
      a node file, and escalates on the ladder (retry with the test output, a bigger model, a split, synth, a held gap), the third consistent failure
      recorded as an invariant (his three-gap rule). A gap is held, not forced: it waits for him as a pipeline gap already does (PC_D3).
    proof: >-
      A chunk whose gate is made to close is rewound byte for byte to its checkpoint, its failed attempt is on disk and in the event stream, the next rung
      is tried, and after three failures the chunk is held as a gap with its three attempts attached.

  OL9_event_stream:
    layer: library
    status: OPEN
    depends_on: [OL1_settings_schema_and_store]
    expands: [PR6_heartbeat_not_polling]
    axioms: [§2.3, §1.2, §16.2, §7.0, §13.1, §5.1]
    files: [ollama/events/stream.eg, ollama/events/ring.eg, ollama/events/telemetry.eg, ollama/test/events.test.eg]
    js_door: [ollama/server.js mounts the stream route; the existing GET /events and GET /api/stream/:id keep working]
    does: >-
      One continuous, resumable stream from the Ollama system, a heartbeat and not a poll. Besides the events it already emits it adds: ollama.telemetry
      every few seconds (free memory, free VRAM, resident models, queue depth per lane, tokens per second over a window, first-token time);
      ollama.token (the job stream, optional, throttled); ollama.model.swap (what left, what came, how long it took); ollama.fit.decision (the numbers
      behind an admit or a refuse); ollama.setting.changed and ollama.setting.applied; ollama.score; ollama.gate.verdict (pass, fail, unknown, with its
      evidence); ollama.rewind; ollama.escalation; ollama.gap.held. Each event carries its causedBy and job id (§11.1). A bounded ring is kept on disk, so
      a client that reconnects with a cursor resumes where it stopped and misses nothing. A slow reader is dropped with a said reason, never a silent loss.
    proof: >-
      A client that reads, is disconnected and reconnects with its cursor receives exactly the events it missed, in order; a telemetry event arrives every
      heartbeat with no request; killing the Ollama system and restarting it resumes the cursor from disk.

  OL10_training_ledger:
    layer: library
    status: OPEN
    depends_on: [OL8_gate_rewind_file_tier, OL9_event_stream]
    axioms: [§0.3, §14.5, §15.3, §7.4, §6.1]
    files: [ollama/training/ledger.eg, ollama/training/export.eg, ollama/test/training.test.eg]
    does: >-
      Every attempt becomes one row, persisted as a node file: the chunk's prompt, its declared boundary, the model and quant, the options, the attempt
      number, the reply, the gate's verdict with its evidence, the tokens and the wall time, and what came after (the next rung). A passed and a failed
      attempt at the same chunk are a preference pair. Rows his words appear in carry his consent flag; rows are never used to train anything by this
      phase: it only keeps and exports them (JSONL) for the day he trains. A run of Emerge's bench counts as rows too.
    proof: >-
      After a gated chunk is built in two attempts the ledger holds both rows with a link between them; the export contains no row without a verdict; the
      row count equals the tape's call count for the same jobs.

  OL11_cos_ollama_tab:
    layer: interface
    status: OPEN
    depends_on: [OL2_settings_routes_and_commands, OL5_lanes_and_queue, OL9_event_stream]
    axioms: [§5.12, §3.4, §5.10, §2.3, §16.2]
    decisions: [OL_D3_where_the_tab_lives, OL_D8_ui_is_a_skin]
    files: [cos/ui/ollama/index.html, cos/ui/ollama/ollama.css, cos/ui/ollama/ollama.js, cos/ui/ollama/test/ollama.glass.test.eg]
    does: >-
      The Ollama tab in COS, a skin over the Ollama system's routes (OL_D7, OL_D8). Sections: Live (the event stream: heartbeat, queue per lane, tokens per
      second, the model resident, free memory and VRAM, as it happens); Models (inventory, each with its fit verdict and the numbers, its lane, load and
      unload); Settings (the whole settings_catalog by group, each with default, current, source, restart-needed, a diff before apply, apply, and revert
      from Versionium; the environment settings as a copy-paste checklist unless COS owns the daemon); Lanes (the ladder, the slow-lane queue batched by model,
      timeouts learned); Chunking (rule budgets per model, load scores of the chunks in flight, why each was cut where it was); Gates (each gate's verdict,
      checkpoint, rewind and escalation as a timeline, a held gap with its attempts); Training (the ledger's row count and export); Benchmarks (the sweep,
      wall-clock per passed unit); Tape (replay a recorded call); Advisories (the read-only checklist). Every control calls a command row that already exists.
    proof: >-
      In Clear Glass: the tab opens, the Live section updates with no refresh while a job runs, a setting is changed, diffed, applied and reverted with
      Versionium holding each step, and a gate that closes appears on the Gates timeline with its attempts. The same actions work from the CLI with the tab closed.

  OL12_uses_tier_a:
    layer: library
    status: OPEN
    depends_on: [OL5_lanes_and_queue, OL9_event_stream]
    axioms: [§8.2, §8.4, §8.6, §16.2, §7.5, §14.2]
    files: [ollama/uses/triage.eg, ollama/uses/narrate.eg, ollama/uses/hostile-review.eg, ollama/uses/covers.eg, ollama/uses/quote-check.eg, ollama/test/uses-a.test.eg]
    does: >-
      The uses a 3B to 7B agent can be trusted with, each behind a pure gate that decides, the model's text being evidence only (OL_D9). (1) Gap triage:
      a failing test's output is labelled into the gap taxonomy (version 3.0.0), the label checked against the output by a rule. (2) The narrator: the event
      stream told as a story (§16.2 'debugging should read like a story'), no number in it that is not in the stream. (3) Hostile review: an idea is attacked
      by a second small model before the idea gate (§8.2); the attack is a note, the gate stays his. (4) 'Covers': before anything is built, embeddings on the
      CPU find existing phases, files and Emerge examples that already do it (§8.4, §8.6), as a fallback behind phase-ledger covers; the same index supplies
      the two or three nearest .eg examples to a build prompt. (5) Drafts of changelog and ledger lines from material he said: every quote must exist verbatim
      in docs/his-words or the gate closes it, and a draft is never committed unseen by him.
    proof: >-
      A failing test is labelled and the label is checked; a narration of a recorded stream contains no number absent from it; a draft with an invented quote
      is closed by the quote gate; the covers query finds a phase that already exists for a request worded differently.

  OL13_uses_tier_b:
    layer: library
    status: OPEN
    depends_on: [OL8_gate_rewind_file_tier, OL10_training_ledger, OL12_uses_tier_a]
    axioms: [§12.1, §12.2, §12.4, §1.1, §0.4, §14.5, §16.1]
    files: [ollama/uses/js-to-emerge.eg, ollama/uses/test-author.eg, ollama/uses/replay-regress.eg, ollama/uses/idle-drain.eg, ollama/uses/vote.eg, ollama/test/uses-b.test.eg]
    does: >-
      The uses that need the slow lane or many samples. (1) Replacing JavaScript: the 30B plans the translation of one function into units; the small model
      fills them; the gate is differential, running the old JS and the new Emerge on the same inputs and treating any difference as a gap, so the JS stays
      the backup until the two agree. (2) Test authoring: the big model writes the tests, eg check must pass them, and a mutation check (break the solution,
      the tests must fail) shows they test something; a test the building model wrote itself is 'unknown', not a pass. (3) Replay regression: before a new
      model or a new quant is trusted, the tape's recorded prompts are replayed and the gate outcomes compared; a model that lowers them is not promoted.
      (4) Idle drain: when COS reports idle (the heartbeat), the slow lane works the held gaps and the high-load queue, and stops when he is back. (5) Voting:
      a high-load chunk is sampled several times at a temperature above zero and accepted only when the tests pass and a set number agree, which also
      measures its sigma.
    proof: >-
      One real JS function of Nexus is translated, the differential gate passes on a set of inputs and closes when one output is changed; a test authored by
      the model fails the mutation check when it tests nothing; a replay of the tape against a worse model lowers the pass count and the model is not promoted.

  OL14_benchmark_sweep:
    layer: foundation
    status: OPEN
    depends_on: [OL5_lanes_and_queue, OL7_rule_budgets_and_chunk_stops]
    axioms: [§1.1, §12.3, §0.1]
    files: [emerge/bench/chunks.js, emerge/bench/results/, docs/BENCHMARKS.md]
    does: >-
      The measurement the rest rests on (GAP_1, GAP_2, GAP_3): node bench/chunks.js sweep --models <3b>,<7b>,<14b>,<30b-moe> --trials 5 --temperature 0.4, comparing
      wall-clock per passed unit, not tokens per second, for one-rule and multi-rule units, on a SATA SSD with Nexus running. His own rule: the prediction is
      registered before the result, and a failure is kept. Prediction (the coder's, so post-hoc if judged by the same hands): the 3B wins on one-rule units,
      the 30B wins on every unit of two or more rules, and the 3B passes about none of the multi-rule units. A row goes in docs/BENCHMARKS.md.
    proof: >-
      The results file for each model with the trial counts, the wall time per passed unit and the failed runs and what each taught; the prediction recorded
      in docs/FRAMEWORK-THREADS.md before the run.

  OL5a_one_load_per_model_per_request:
    layer: library
    status: OPEN
    depends_on: []
    axioms: [§2.1, §8.6, §1.2, §14.4]
    expands: [OL5_lanes_and_queue, IF20_gaps_filled_like_a_torrent]
    files: [lib/pipeline-routing.js, idearium/api/index.js, tests/modules/test-plan-code-run-attention.test.js]
    js_door: [JavaScript changed in place (his, 2026-11-18: "then we can use js for now unless we are coding emerge")]
    does: >-
      His "no 30b for all of its steps per pipeline or request. then unload. like chunks for a torrent file." A planned build's files are pieces: the
      planner (an Ollama model) plans and writes the test first, then is unloaded (keep_alive 0). The coders go in passes, not per file: every pending
      file is tried on the first coder rung; what is still pending goes to the next rung in one pass, that model loaded once for all of them; an Ollama
      rung is unloaded when its pass ends. A file a later one needs and that is still pending is said in the later one's brief. routing.batch_by_model
      (on | off; on by default) keeps the old per-file climb one setting away.
    proof: >-
      Unit: passes(rungs) groups the ladder; a file that fails on rung 1 is retried only in rung 2's pass; the planner and each Ollama rung are unloaded
      once. On his machine: a build whose first coder fails one file loads the 30B once, not once per file (Ollama's server log).
  OL15_nexus_aware_prefix_card:
    layer: library
    status: OPEN
    depends_on: [OL5a_one_load_per_model_per_request]
    axioms: [§8.6, §1.3, §5.12]
    files: [lib/coder-brief.js, ollama/cards/nexus.card.md, tests/modules/test-plan-code-run-attention.test.js]
    does: >-
      His "ollama aware of nexus". A fixed card, first and identical on every Ollama call (so Ollama's prompt cache reuses it): what Nexus is, the
      step's contract (intent, test, conditions), the tools Nexus answers with, and, when the language is Emerge, the syntax card (300 tokens or fewer;
      docs/CLAUDE.md is never sent). The card is a file he edits, not code.
    proof: "two calls in one build start with the same bytes; the card file changed changes the next call; Ollama's log shows the prompt cached"
  OL16_models_suggest_tools:
    layer: library
    status: OPEN
    depends_on: [OL15_nexus_aware_prefix_card]
    axioms: [§5.9, §14.2, §0.3]
    expands: [PC15_every_intervention_a_cos_proposal]
    files: [lib/coder-brief.js, idearium/api/index.js, tests/modules/test-plan-code-run-attention.test.js]
    does: >-
      His "ollama or agents can suggest tools needed to expand capability, like askign the llm for feedback." After a chunk is landed or held, the model
      that did it is asked one question: what tool would have made this easier? The answer is kept as a proposal (an agent's act is a proposal, PC15)
      with the chunk, the model and the verdict, for him to accept or reject; repeated suggestions are counted (three is an invariant, his rule).
    proof: "after a build, its proposals are listed with their chunks; the same suggestion from three chunks is counted 3; nothing is built from one unasked"

  OL5b_one_line_for_every_ollama_call:
    layer: library
    status: OPEN
    depends_on: [OL5a_one_load_per_model_per_request]
    axioms: [§2.1, §1.2, §8.6, §16.2]
    expands: [OL5_lanes_and_queue, OL9_event_stream]
    files: [ollama/lib/model-turns.js, ollama/lib/dispatch.js, ollama/routes/generate.js, ollama/routes/queue.js, ollama/test/model-turns.test.js]
    js_door: [JavaScript in the Ollama system, changed in place and one new module (his, 2026-11-18: "then we can use js for now unless we are coding emerge")]
    does: >-
      His "okay. do it." (after: two callers on one Ollama evict each other's model, OLLAMA_MAX_LOADED_MODELS 1; the 30B dropped out of NM1's build
      when he used the 3b). Every model call the Ollama system makes (its jobs and POST /api/generate) waits its turn in one line: the next turn goes
      to a caller of the model already loaded, so a model's work stays together; a caller of another model that has waited longer than the cap
      (OLLAMA_TURN_MAX_WAIT_MS, 10 minutes) goes next, so nothing starves. His "saving performance metrics to a node file": each turn is written as a
      .metric node (one line per turn, the Ollama system's own data, by day): model, caller, door, wait, run, whether the model had to be loaded
      (a swap), free memory before and after, outcome. GET /api/queue says the line and the last turns.
    proof: >-
      Unit: three waiters for models a, b, a with a loaded run a, a, b; a b that waited past the cap goes first; each turn writes one metric line.
      On his machine: two callers on two models alternate in batches, not call by call (the metric lines show the swaps).
  OL5c_his_clients_through_the_line:
    layer: library
    status: OPEN
    depends_on: [OL5b_one_line_for_every_ollama_call]
    axioms: [§5.10, §5.9, §1.2]
    files: [ollama/routes/ollama-compat.js, ollama/server.js, ollama/test/ollama-compat.test.js]
    does: >-
      Ollama's own API (POST /api/chat, /api/generate in Ollama's shape, GET /api/tags) served by the Ollama system under /ollama/, each call waiting
      its turn in OL5b's line, so a client he points at http://127.0.0.1:3749/ollama joins the same line as Nexus and no longer evicts a build's model.
    proof: "a stock Ollama client pointed at the bridge chats; its call shows in the metric lines; a build running at the same time keeps its model"
  OL20_metrics_against_the_ledger:
    layer: library
    status: OPEN
    depends_on: [OL5b_one_line_for_every_ollama_call]
    axioms: [§1.1, §14.2, §12.3]
    expands: [CP6a_caps_priority_accounting, CP6f_raid_balances_load]
    files: [ollama/metrics/deltas.eg, ollama/test/deltas.test.eg]
    does: >-
      His "to understand how to optimize performance in relation to events in the ledger and the deltas between". Read in Emerge: the metric nodes beside
      the events of the same time (the phase runs, the RAID contract steps, COS's halts and restarts), the delta between each pair (wait, swaps,
      memory, wall time per landed chunk), and a baseline per model that grows run by run; what moves the deltas most is named, not guessed.
    proof: "over a day of runs: per model, its baseline and its outliers, each outlier beside the event it followed"

  OL4a_raid_decides_fit_and_says_it:
    layer: library
    status: OPEN
    depends_on: [OL5a_one_load_per_model_per_request]
    axioms: [§1.2, §5.9, §5.10, §16.2, §12.3]
    expands: [OL4_fit_and_context, PC16_raid_routes_every_interaction, MF1_model_fit_routing]
    files: [lib/resource-monitor.js, lib/pipeline-routing.js, cortex/boot.js, idearium/api/index.js, tests/modules/test-plan-code-run-attention.test.js]
    js_door: [JavaScript changed in place (his, 2026-11-18: "then we can use js for now unless we are coding emerge")]
    does: >-
      His "i feel like everything needs to go through raid." and "supposed to be more events for this exact purpose", after NM1's run records were
      read: "won't fit memory: ollama:deepseek-coder-v2:16b" — Idearium dropped both local models by its own copy of the fit rule (1.2x the model
      must be free: 10.7 GB for DeepSeek, ~7-8 GB free with Nexus up), said only in a data row, so the build went to Gemini and Claude alone.
      RAID decides: POST /api/raid/route/fit { models: [{ provider, model, bytes }], loaded } → each admitted or skipped with its numbers, by RAID's
      routing.fit_rule: strict (the old 1.2x free) or resident (the model fits in RAM at all, <= 75% of it: it loads, slower while others page out;
      DeepSeek 8.9 GB admitted on 16 GB, the 30B's 18.6 GB not). Each decision is printed in RAID's console and emitted as raid.route.fit. Idearium
      asks RAID; when RAID does not answer it uses the strict rule and says so.
    proof: "fitsModel resident admits 8.9 GB on 16 GB and refuses 18.6 GB; RAID's route answers with the numbers and prints the decision; NM1 run again reaches DeepSeek"

order_of_work:
  # his, 2026-11-08: automation with COS as the engine, then Emerge done, then WARP 2. This map serves the first two; it does not reorder them.
  # §3.4: backend, then route, then command row, then UI.
  1: "OL14 first, with the 3B and the 7B only (they need nothing built) to close GAP_2; the 30B once it is downloaded"
  2: "OL1, OL2, OL3 (the settings spine and its commands: the CLI works before any page)"
  3: "OL4, OL5 (fit and lanes), then OL6, OL7 (score and budgets)"
  4: "OL9, then OL8, then OL10 (the stream, the rewind, the ledger)"
  5: "OL11 (the tab) last, then OL12, then OL13"

ledger_commands:
  # not run: this map was written outside the repo. In the repo, in the same commit (CLAUDE.md):
  - "node idearium/spec-engine/phase-specs.cjs docs/2026-11-18-ollama-local-agent-phasemap.spec"
  - "node idearium/spec-engine/phase-ledger.cjs covers <files of each phase> --does \"<does>\"   # before building; a phase may EXPAND an existing one"
  - "node idearium/spec-engine/phase-ledger.cjs log <phase> written \"mapped 2026-11-18, nothing built\" --version <x.y.z>"
  - "a version line in lib/version.js that opens with his words, a changelog in versionium/changelogs/, and a row in docs/BENCHMARKS.md for the Emerge work (OL14)"

addendum_pending: >-
  ## ADDENDUM (to write when the map is committed): which of OL_D1 to OL_D6 he reconciled, in his words and dated; the numbers OL14 measured against the
  estimates here; and GAP_1 to GAP_9 each closed, kept open or moved.

## ADDENDUM 2026-11-18 (0.60.567) — his roles for the models; Guardian last; a local planner built
# James, 2026-11-18: "do everything you can to optimize. invent, integrate, innovate, find and impliment. every method possible. we can use more ssd
# storage for a smaller model, maybe deepseek for main tasks and co pilot or general coding, and then a small model for raid routing? 30b for mapping
# and complex reasoning, using agent tools and intelligence system before anything. then we can use js for now unless we are coding emerge, if we
# finish that we can train a base model to learn emerge completely. like chunking, dynamic routing per step or gate, both model, agent and context
# window, idearium has learning for this, like start small, decompose into smaller chunks/bricks dynamically expanding the gates, could also branch,
# then route to a bigger model if it can't handle the task, then different strategies for different models, and use the intelligence system per gate,
# persistent memory accumulates per gate." · "guardian only when ollama cant" · "no. use my ssd for a pagefile or swap." · (the 30B) "abolished if possible"
# Decided (his): roles. qwen3-coder 30B-A3B abliterated (huihui_ai/qwen3-coder-abliterated:30b, Q4, 18.6 GB, on the SSD, the page file his to raise to
# 32 GB): mapping, planning, tests, complex reasoning, after the agent tools and the intelligence system are asked. deepseek-coder-v2:16b: main tasks,
# Copilot, general coding. A small model (the 3b): RAID's routing. Guardian's agents only when Ollama cannot. JavaScript allowed for now except when
# coding Emerge. OLLAMA_MODELS back on the SSD (it pointed at the NAS, D:, and Ollama saw no models).
# Built (0.60.567): a named Ollama planner (lib/pipeline-routing.js planMode; idearium/api/index.js pdp). Set in RAID (data): planner and escalation.
# Expands, next (his "every method possible"), in order: OL5 lanes (the 30B a slow lane, batched, learned timeouts), OL7 dynamic chunk budgets per
# model (start small, decompose, branch, escalate), IF3 slice d (the gate asks the intelligence system and its failure record first) and gate memory
# that accumulates per gate (gate.eg context, persisted), OL4 fit for a memory-mapped model. RAID's routing model (the 3b) to locate before mapping.

## ADDENDUM 2026-11-18 (later) — the pipeline as the model's brain; tension routes; the LLM toolbox (recorded; readings to confirm)
# James, 2026-11-18: "like nexus should reduce as much complexity and context that the models and agents need, graphs, learning, models for learning
# and remembering, synthesis and reusing from cortex and ledgers and chatlogs. ledgers, agent tools, pipeline for stepwise planning, literally the
# pileline can be the llms programmable procedure, process, framework, brain. the more tension between the request, and the end state, the more
# tension?" · "llm toolbox." (with the text of his innovation toolkit pasted; it lives in docs/innovation-toolkit*.md)
# The coder's readings, to confirm:
#   - Tension routes the work: the gap between a request and its end state (OL6's score: tension x weight x f(slope)) decides the model, the size of
#     the chunks, how many gates and how much context; a small gap goes to the 3b or a deterministic tool, a wide one to the 30B, split smaller.
#   - The LLM toolbox: his toolkit's sections (is this a framework problem; frame; find the gaps; map the leverage; hostile verification; failure
#     modes; iterate) run as a .framework the pipeline executes step by step (framework.eg, PC's "yes .framework"), so a model is handed one
#     section's question at a time with only that step's context, instead of the whole method.
#   - Nexus carries the memory (Cortex, the ledgers, chat logs, graphs, learned routes); the model is asked the smallest question the step needs.

## ADDENDUM 2026-11-18 (later) — the 30B measured; his roles revised; boot options; the 30B mapping autonomously by tension (recorded)
# Measured on his PC with Nexus up: huihui_ai/qwen3-coder-abliterated:30b loaded in 120 s, 1.1 tokens/s, 2.1 of 17.7 GB on the GPU, RAM free 0.7 GB
# (under COS's 10% floor); unloaded, 10.1 GB free. The page file was still 11.8 GB (his 32 GB setting had not applied).
# James, 2026-11-18: "yes and do what you can to optimize, like guardian, does it need to be running on boot? clearglass ui on boot? like an option
# to disable that but a button to open it in cos ui, and option to enable it in the settings of clearglass and right clicking the icon in the tray.
# maybe the 30b can map when it's needed, 16b when it can. i want to be able to tell the 30b to map autonomously. like if we have it running
# autonomously, like it does everything its tasked for in nexus, nonlinearly. gaps and open loops, tension is the llms priority maybe? the though
# with the pipeline, needs to map everything, nonlinear."
# Set (data): RAID's planner DeepSeek 16b; escalation DeepSeek 16b, the 30B, Gemini, Claude.
# Open, in order: (1) the 30B loaded only for its step and unloaded after (keep_alive per call, OL3/OL5), the ready gate's memory floor before it;
# (2) start at boot per system, off for Guardian and Clear Glass's UI unless he enables it, with Open in COS, in Clear Glass's settings and the tray
# menu (SC12_start_at_boot_each_system expands); (3) an autonomous mapping loop: the open gaps and loops ranked by tension (OL6), the 30B maps the
# highest first, nonlinearly, each map a pipeline run he can stop (IF12 expands).

## ADDENDUM 2026-11-18 (later) — each model loads once per request, its chunks like a torrent's; Ollama aware of Nexus; models suggest tools (his)
# James, 2026-11-18: "no 30b for all of its steps per pipeline or request. then unload. like chunks for a torrent file. it knows which chunks to
# build, gaps to fill. each model knows its tasks. optrmize ollama i meant. litterally any little helps, nexus and ollama should work together.
# ollama aware of nexus, ollama or agents can suggest tools needed to expand capability, like askign the llm for feedback."
# Decided (his), superseding "16b maps, 30B when needed" for scheduling: a request's chunks are a manifest (a torrent's pieces): each chunk names the
# model that takes it (the 30B: mapping, planning, tests, the hard chunks; DeepSeek 16b: coding; the 3b: routing). The 30B is loaded once, does all
# of its chunks in that request, then is unloaded (keep_alive 0); then the next model does its chunks. Gaps are the pieces still missing.
# Expands: OL5 (batched by model, one load per model per request; the persisted queue), OL3 (keep_alive per call), IF20 (gaps filled like a torrent).
# Open, his "any little helps": (1) the manifest and the per-model batch; (2) the Ollama-side tuning in OL's settings_catalog applied per call
# (num_thread 8, num_batch, num_ctx from free memory, think off); (3) Ollama aware of Nexus: a fixed prefix card (what Nexus is, its tools, the step's
# contract), identical on every call so the prefix is cached; (4) after a chunk, the model is asked one question, "what tool would have made this
# easier?", kept as a proposal (PC15: an agent's act is a proposal) for him, so capability grows from the models' own feedback.

## ADDENDUM 2026-11-18 (later) — verification from both sides (his question; the coder's reading, to confirm)
# James, 2026-11-18: "You're adding that routing to raid right?Is the 16b good enough for checking and verifying each file. Cross domain
# verification, conterfactial or bidirectional causal chaining. Starting from two sides and find the tension or gap in between."
# Done: routing.batch_by_model set in RAID (on); planner the 30B again (his "30b for all of its steps").
# The coder's reading: the deterministic checks decide first (eg check, the test, verify-first, the plan's exports); a model never decides a pass
# (OL_D9). From the spec side, the 30B writes the test and the conditions (already its step). From the code side, DeepSeek 16b reads the landed file
# and states what it does, without seeing the plan; the gate compares the two statements, and the difference is the gap with its tension, held for
# the next pass or for him. Describing code is easier than writing it, so the 16b is good enough for that side; it would not be good enough to be the
# only judge. Proposed as a phase (OL17_verify_from_both_sides) once he confirms.

## ADDENDUM 2026-11-18 (later) — the 3b between words in Emerge (his question; the coder's reading, to confirm)
# James, 2026-11-18: "what about using it for the traversal between words in emerge to map the boundaries of each word in relation to the next?"
# The coder's reading: the boundaries themselves are exact already (Emerge's lexer and parser know every token and what may follow it), so a model
# there would only add error. The 3b fits the fuzzy edge beside them: (a) eg say, his English word to the Emerge construct it means, checked by the
# parser; (b) the next word chosen only from what the grammar allows at that point (the parser gives the set, the 3b ranks it: constrained, so it
# cannot write invalid Emerge; GAP_4); (c) each word-to-next step kept as a row for the base model he wants to train on Emerge (OL10).

## ADDENDUM 2026-11-18 (later) — Emerge and the tokenizer: both (his)
# James, 2026-11-18: "what if emerge uses the tokenizer" · (both readings) "both would make that close to an llm." · "am i making my own llm to an extent"
# Decided (his): (A) Emerge's words fitted to the models' tokenizers: count each construct's tokens per model (prompt_eval_count), rename the
# costly ones; (B) the grammar enforced at the token level: the parser gives the legal next tokens, every other token blocked (llama.cpp grammar,
# GAP_4, OL_D5 a). Phases to write: OL18_emerge_fits_the_tokenizer (A, measurable now), OL19_grammar_constrained_emerge (B, after GAP_4 is read).

## ADDENDUM 2026-11-18 (later) — one line for every Ollama call; metrics as nodes (his)
# James, 2026-11-18: "i was using ollama in the background." · "okay. do it." · "also what about saving performance metrics to a node file to
# understand how to optimize performance in relation to events in the ledger and the deltas between"
# Mapped: OL5b (one line, same model next, an age cap; a .metric node per turn), OL5c (Ollama's API on the bridge, for his clients), OL20 (deltas).

## ADDENDUM 2026-11-18 (later) — OL5c built; sigmas and heartbeat in the line; the resource manager and every system next (his)
# James, 2026-11-18: "yes but also the resource manager. and sigmas. imagine this in a tiny linxus distto" · "also each systems server.js?" ·
# "heartbeat not polling" · "also make sure it doesn't become a performance issue" · "or should we get this test working"
# Built (0.60.570): OL5c (/ollama/* on the Ollama system, model calls through the line); in OL5b, a sigma per turn against its model's baseline
# (Welford, swaps excluded, resumed from the newest metrics file's tail), each turn an ollama.turn event (heartbeat, not polling), the metric append
# asynchronous. Open, mapped onto the phases that own them: every system's server.js beats its own metrics and sigmas to COS (PR6 expands: COS
# listens; CP6a expands: COS's usage per system already sampled becomes a baseline with sigmas); the resource manager reads the line's events to
# decide a model's room before a swap (CP6f expands); the same on a tiny Linux (OS3 in docs/2026-10-05-cos-machines-phasemap.spec expands).
# His order, after: the build test working first (NM1).

## ADDENDUM 2026-11-18 (later) — the ladder's fit goes through RAID, said aloud (his)
# James, 2026-11-18: "supposed to be more events for this exact purpose" · "96% sure. i feel like everything needs to go through raid."
# Mapped: OL4a_raid_decides_fit_and_says_it.

## ADDENDUM 2026-11-18 (later) — retry in a new conversation with the gate's context; RAM and swap managed; the tiny model as RAID's orchestrator (his)
# James, 2026-11-18: "retry logic and be starting a new conversation, and injecting the previous gate context into the chat." · "how could we utilize
# the ssd storage. can we manage what we put on ram and what we put on a swapfile." · "what about using the tiny llm for the load balancing and
# routing. maybe for raid also, like a tiny 'orchastrator."
# Found the same hour (NM1): Idearium's watchdog closed the run cut by COS's restart and retried it ("start over, smaller steps"), but RAID was still
# degraded, so OL4a's fallback (the strict rule) refused DeepSeek again. Fix: the fallback is RAID's last known rule, kept, not the strict one.
# The coder's readings, to confirm:
#   1 retry: each retry is a fresh conversation (a new chat for an agent, no history for Ollama) given only the gate's context as one .inject: what
#     closed it and why, the last output's relevant lines, the step's intent, test and conditions (IF3 slice b), RAID choosing retry/escalate (slice e).
#   2 RAM and the SSD: weights stay memory-mapped (use_mmap: Windows pages them from the SSD); before a model loads, COS trims the working sets of
#     systems that are idle (their pages go to the page file on the SSD) so the RAM goes to the model; each system marked keep-in-RAM or may-be-paged
#     in its caps (CP6a, a new key). Windows cannot pin a process to swap, but it can trim one: measured, not assumed.
#   3 the tiny model (the 3b, GPU-resident, ~2 GB VRAM, no RAM cost) as RAID's orchestrator for the fuzzy choices: what a request is, which of the
#     routes the rules allow fits it, a one-line reason; never a number, a limit or a pass (OL_D9): fit, load and sigma stay computed.

## ADDENDUM 2026-11-18 (0.60.576) — decoupled: a build keeps RAID's last rule when RAID is away (his)
# James, 2026-11-18: "coupled. thats going to kill nexus. we are so close to nexus being able to be nexus after 7 months"
# Built: OL4a's fallback is RAID's last known rule, kept on disk by Idearium. The couplings seen today, to remove next: COS's restart restarting
# Idearium mid-build (COS should adopt running systems, not restart them); Intelligence's growth (IP13 found it); his clients evicting a build's model.
