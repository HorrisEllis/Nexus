# docs/2026-11-26-cos-service-and-resources-phasemap.spec — the supervisor inside COS's service; the model server's engines beneath it, under the
# resource manager and the load balancer; RAM, SSD, HDD, GPU and CPU given out as needed, measured by sigma and delta; COS never freezes, its
# window floats on top and never throws him off; the model server pulls the smallest capable model.
# author: james-brooks (the ideas and the direction are his; the coder wrote this origin from his words, 2026-11-26)
meta:
  status: "MAPPED 2026-11-26. Nothing built but the two fixes named in found."
  james: >-
    "cos uses a service. why not hook the superviser into it? so then the engines in the model server are beneath it, hooked into the resource
    manager and load balancer. then dynamic allocation for the ram, ssd, hdd, gpu and cpu. sigmas and deltas to measure performance??" · "also cos
    ui needs to float on top, it keeps kicking me off of it. like it needs to stop kicking me off, also refreshing the main page over and over."
    · "make sure nexus is doing this, not you if possible" · on Qwen3-4B and Qwen3-8B: "yes, but i want it to be capable with as little as
    possible"
  found: >-
    The coder's census, 2026-11-26. Kicked off: COS's manager blocked its event loop 119 times in 3 hours (5 to 96.7 s, its own ledger, rule
    supervisor), and the app asked its health with 2 s (cos/app/runtime.js whoRuns), so a busy manager read as "ports in use"; fixed in the app
    (asked again up to 2 minutes while COS's port is held). The stall's cause is not named yet: netstat (0.08 s) and the usage reader (async)
    were ruled out; ledger() reads the whole 4 MB ledger. Stale pid: after his reboot COS adopted csrss (pid 1292) as Idearium (_alive takes
    EPERM for life); fixed: a saved pid is adopted only while it holds the system's port. Both filed with Cortex as failure modes (stale-pid,
    event-loop-stall), with orphan-job (a dead run's model job holding the bridge). Existing: CP6 load balancing, PR4 deltas, PR6 heartbeat
    (docs/2026-11-08-pipeline-canvas-phasemap.spec), cos/manager/resources.js (per-compartment caps, RAID-approved acts), inference/ (the model
    server: llama-server per model, reading Ollama's store).

phases:
  SR1_the_supervisor_is_the_service:
    status: OPEN
    depends_on: []
    files: [cos/manager/service.js, cos/manager/supervisor.js]
    does: >-
      COS's Windows service is the supervisor's own process: it starts with Windows, owns every system's process and port, and outlives the
      window. The window (the app) is only a view on it: it never starts a second copy and never stops the service by closing.
    proof: "after a reboot the systems are up before the window opens; closing and reopening the window changes nothing"
  SR2_engines_beneath_the_supervisor:
    status: OPEN
    depends_on: [SR1_the_supervisor_is_the_service]
    files: [inference/server.eg, cos/manager/resources.js]
    does: >-
      Each model engine (a llama-server per model) is a child of the supervisor, declared like any system, under the resource manager (caps,
      RAID-approved acts) and the load balancer (CP6): a job goes to an engine that has the room; a big model loads only when the room is there
      and leaves when its job ends.
    proof: "two builds and Copilot share the engines without a second model loading past the memory floor; each load and unload is a ledger row"
  SR3_dynamic_allocation:
    status: OPEN
    depends_on: [SR2_engines_beneath_the_supervisor]
    files: [cos/manager/allocate.eg, cos/manager/test/allocate.test.eg]
    does: >-
      RAM, SSD, HDD, GPU (VRAM, layers offloaded) and CPU (threads) given to each engine and system as the work needs them, from the measured
      free amounts: a decision, pure, from { need, free, floor } to { grant, wait, refuse } with the reason.
    examples:
      - 'grant({ ram: 3000 }, { ram: 8000 }, { ram: 2000 }) == { act: "grant", ram: 3000 }'
      - 'grant({ ram: 7000 }, { ram: 8000 }, { ram: 2000 }) == { act: "wait", why: "ram" }'
    proof: "a model that does not fit waits with its reason instead of pushing his PC into paging"
  SR4_sigma_and_delta_per_engine:
    status: OPEN
    depends_on: [SR2_engines_beneath_the_supervisor, ML1_metric_point]
    files: [intelligence/engine-performance.eg, intelligence/test/engine-performance.test.eg]
    does: >-
      Each engine's performance as his measures: sigma, how far this run's tokens per second, time to first token and memory sit from the
      engine's own baseline; delta, the gap between what was asked (the cap, the deadline) and what it gave. They feed the load balancer (SR2)
      and the ladder (which model next).
    proof: "a slowed engine is named by its sigma before a build waits on it"
  SR5_cos_never_freezes:
    status: OPEN
    depends_on: []
    files: [cos/manager/supervisor.js, cos/manager/server.js]
    does: >-
      Name and remove what blocks COS's event loop (119 stalls of 5-97 s in 3 hours): each stall row carries what ran in it (the last route,
      timer and file read), so the cause is the record's, not a guess; then nothing synchronous runs on the loop (the whole-ledger read becomes a
      tail read).
    proof: "a day with no stall over 1 s in COS's ledger"
  SR6_the_window_floats_and_stays:
    status: OPEN
    depends_on: [SR1_the_supervisor_is_the_service]
    files: [cos/app/main.js, cos/app/runtime.js]
    does: >-
      COS's window can float on top (his setting, on by default), never falls back to the start screen while the service holds its port (built
      2026-11-26: asked again up to 2 minutes), and never reloads the page on its own: a change of code reloads only the screen that changed,
      when he is not on it.
    proof: "a day of builds and restarts with him never thrown off his screen"
  SR7_the_model_server_pulls_a_model:
    status: OPEN
    depends_on: []
    files: [inference/pull.eg, inference/models.eg]
    does: >-
      The model server fetches a model itself (a GGUF from its source, its hash checked, stored where models.eg reads), so no other app is
      needed; smallest capable first (his: "capable with as little as possible"): Qwen3-4B (about 2.5 GB) for building and for Copilot, the
      8B only if the 4B fails at understanding people. Each new model is tried on real phases through the pipeline against the current ladder.
    proof: "Qwen3-4B pulled by the model server, served, and its first build's rows set beside the 3b's on the same phase"
order: "SR5 and SR6 first (he is thrown off now); SR7 (the models he said yes to); SR1 → SR2 → SR3, SR4."
