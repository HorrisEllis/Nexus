spec:
  meta:
    # §FIX 2026-09-01 (LM1): name was 'ollama'. lib/version.js's real code-
    # version key for this system is 'ollama-bridge' (port 3749, sovereign
    # HTTP wrapper) — orchestrator/lib/spec-drift.js's live check reported
    # this spec as MISSING every run, not because its content was wrong
    # (it wasn't — meta/core/events/routes/handshake/modules/tests/
    # resilience were all already real and correct) but purely because its
    # own name-matching (system, system.replace(/-/g,'_'),
    # system.replace(/_/g,'-')) does not bridge 'ollama-bridge' <-> 'ollama'
    # in either direction. Versions already agreed (1.0.0 == 1.0.0) before
    # this fix — this is a naming correction, not a content rewrite.
    name:        ollama-bridge
    version:     1.1.0   # 0.39.356 MINOR — a running job keeps job.partial (LS1); was 1.0.0
    foundation:  nexus-system-foundation@1.0.0
    port:        3749
    uuid:        nexus-ollama-v1-0000-2026-0627-jamesbrooks-001
    status:      active
    purpose: >
      Sovereign Ollama bridge. Local model dispatch, isolated from Guardian.
      If Guardian goes down, Ollama keeps running.
      If Ollama is slow, Guardian does not block.
      RAID routes to this system by name, not by Guardian's internal logic.
      Every request gets a contract. Every response is tracked.

  core:
    schemas:
      OllamaJob:
        uuid:        string   # jobId — matches CFR trace
        contractId:  string   # which contract governs this job
        componentId: string   # which component requested it
        hookId:      string   # which hook this arrived on
        requestId:   string   # end-to-end request trace
        sessionId:   string   # user session
        model:       string   # which model (qwen2.5-coder, mistral, etc)
        prompt:      string
        stream:      boolean
        status:      enum     # queued | running | complete | failed | cancelled
        result:      string   # the response
        ts:          number
        completedAt: number
        durationMs:  number

      OllamaContract:
        id:          string   # contract UUID
        jobId:       string
        intent:      string   # classified intent
        agent:       'ollama'
        model:       string
        maxTokens:   number
        timeoutMs:   number
        fallback:    string[] # if this fails, try these next

    axioms:
      - AX-001  validate all inputs at boundary
      - AX-002  no silent failures — every error is a bus event
      - AX-003  JAA write before job execution
      - AX-005  event bus is the spine — results posted to bus, not returned directly
      - AX-007  self-describing — registers all components on boot

    constants:
      DEFAULT_MODEL:       'qwen2.5-coder:7b'
      FALLBACK_MODEL:      'mistral:7b'
      DEFAULT_TIMEOUT_MS:  45000
      MAX_CONCURRENT:      3
      QUEUE_POLL_MS:       200
      HEALTH_INTERVAL_MS:  10000
      OLLAMA_HOST:         'http://127.0.0.1:11434'

  events:
    emits:
      - 'ollama.booted'
      - 'ollama.job.queued'
      - 'ollama.job.started'
      - 'ollama.job.complete'
      - 'ollama.job.failed'
      - 'ollama.job.cancelled'
      - 'ollama.model.loaded'
      - 'ollama.model.unavailable'
      - 'ollama.health.ok'
      - 'ollama.health.degraded'
      - 'ollama.queue.depth'        # emitted every 5s — RAID reads this
    handles:
      - 'raid.dispatch.ollama'      # RAID tells Ollama to run a job
      - 'guardian.job.cancel'       # cancel a queued job
      - 'orchestrator.shutdown'     # graceful drain and stop

  command_index:
    status: DONE   # verified 2026-09-03 — GET /commands live, 17 real commands, matches docs/command-index-per-system.spec build_order phase 2's own exit criteria (independently re-derived and confirmed equal, tests/modules/ollama-command-index.test.js)
    spec: "docs/command-index-per-system.spec"
    served_at: "GET /commands"
    file: "ollama/lib/command-index.js"
    note: "each routes/*.js module self-declares a commands export -- aggregated at boot into the real index."

  routes:
    - method: GET  path: /health
      returns: "{ ok, model, queue_depth, running, uptime, models_available }"

    - method: GET  path: /contract
      returns: "Full interaction contract"

    - method: GET  path: /events
      returns: "SSE stream — all ollama events"

    - method: POST path: /api/jobs
      body: "{ prompt, model?, contractId, componentId, hookId, requestId, sessionId, intent, stream? }"
      returns: "{ ok, jobId, status: 'queued' }"

    - method: GET  path: /api/jobs
      params: "status?, limit?"
      returns: "{ jobs: OllamaJob[] }"

    - method: GET  path: /api/jobs/:jobId
      returns: "OllamaJob"

    - method: DELETE path: /api/jobs/:jobId
      returns: "{ ok, cancelled }"

    - method: GET  path: /api/models
      returns: "{ models: string[], active: string }"

    - method: POST path: /api/models/load
      body: "{ model: string }"
      returns: "{ ok, model, loaded }"

    - method: GET  path: /api/queue
      returns: "{ depth, running, completed_today, failed_today }"

  handshake:
    components:
      - id: 'ollama.jobs.dispatch'
        uuid: 'nexus-ollama-comp-dispatch-v1-001'
        grammar: ['ollama dispatch', 'od', 'ollama run']
        route: { method: POST, path: '/api/jobs' }
        hooks:
          in:
            - id: 'ollama.jobs.dispatch.receive'
              intent: ['build', 'ask', 'forge', 'classify', 'synthesize']
              contract: 'nexus-interaction-contract-v1::ollama'
              tags: ['dispatch', 'local', 'ollama']
          out:
            - id: 'ollama.jobs.dispatch.complete'
              wires_to: ['cortex.raid.feedback', 'guardian.copilot.receive_result']
              tags: ['result', 'complete']

      - id: 'ollama.jobs.list'
        uuid: 'nexus-ollama-comp-list-v1-001'
        grammar: ['ollama jobs', 'oj']
        route: { method: GET, path: '/api/jobs' }

      - id: 'ollama.models.list'
        uuid: 'nexus-ollama-comp-models-v1-001'
        grammar: ['ollama models', 'om']
        route: { method: GET, path: '/api/models' }

      - id: 'ollama.queue.status'
        uuid: 'nexus-ollama-comp-queue-v1-001'
        grammar: ['ollama queue', 'oq']
        route: { method: GET, path: '/api/queue' }

  modules:
    - id: job-queue
      path: ollama/job-queue.js
      description: >
        In-memory + JAA-persisted job queue.
        MAX_CONCURRENT=3 running at once.
        Queue depth emitted to bus every 5s.
        §LAW II: JAA write before job starts.

    - id: dispatcher
      path: ollama/dispatcher.js
      description: >
        Reads from job-queue, calls Ollama HTTP API.
        Streams or collects response.
        Posts result to bus as ollama.job.complete.
        Records outcome to JAA for RAID weight update.
        Attaches contractId, componentId, hookId, requestId to every JAA entry.

    - id: contract-engine
      path: ollama/contract-engine.js
      description: >
        Validates every incoming job against its OllamaContract.
        Checks model availability, token budget, timeout.
        Enforces fallback chain if model unavailable.
        Logs contract violations as gaps.

    - id: health-monitor
      path: ollama/health-monitor.js
      description: >
        Polls Ollama HTTP API every 10s.
        Emits ollama.health.ok or ollama.health.degraded.
        RAID reads this to decide whether to route here.
        If degraded: emits gap, RAID shifts weight to NCP providers.

    - id: model-manager
      path: ollama/model-manager.js
      description: >
        Tracks which models are loaded.
        Pre-warms DEFAULT_MODEL on boot.
        Handles load requests.
        Emits ollama.model.loaded / ollama.model.unavailable.

    - id: server
      path: ollama/server.js
      description: >
        HTTP server on :3749.
        All routes validated at boundary (AX-001).
        SSE /events stream.
        Registers with orchestrator on boot.

  tests:
    - 'POST /api/jobs with valid body → 200 + jobId'
    - 'POST /api/jobs with missing prompt → 400'
    - 'GET /api/jobs → array'
    - 'DELETE /api/jobs/:id → 200 cancelled'
    - 'GET /health → ok + queue_depth'
    - 'MAX_CONCURRENT enforced — 4th job queued not started'
    - 'contract violation → gap opened, job rejected'
    - 'fallback chain: model unavailable → next model tried'
    - 'ollama.job.complete fires on bus with full wire context'
    - 'JAA entry written before job execution'
    - 'RAID weight updated on job complete (via cortex.raid.feedback)'

  resilience:
    guardian_down:     "Ollama continues. Jobs queue. Results posted to bus."
    ollama_host_down:  "Health monitor detects. Gap opened. RAID shifts to NCP providers."
    cortex_down:       "Jobs still run. JAA writes buffered. Reconnect + flush on cortex return."
    queue_overflow:    "Oldest queued job rejected. Bus event. Gap opened."

  where_it_fits:
    current:  "Ollama is called inline inside guardian/server.js and co-pilot"
    problem:  "Guardian bottleneck. If guardian blocks, ollama blocks. No isolation."
    fix:      "Sovereign system on :3749. RAID routes to it directly. Guardian dispatches via event bus."
    cfr:      "Every job carries contractId, componentId, hookId, requestId — CFR tracks the full wire"

  history:
    - date: 2026-06-27
      summary: >
        Original build — sovereign Ollama bridge, isolated from guardian's
        own request path, so a slow/stalled Ollama call cannot block
        guardian and a guardian outage cannot stop local dispatch.
    - date: 2026-07-04
      summary: >
        Registered in lib/version.js's services map for the first time
        (per that file's own 0.9.10 changelog entry — five real, already-
        running sovereign systems, including this one, had never been
        added despite the file calling itself the single source of
        truth).
    - date: 2026-09-01
      summary: >
        meta.name corrected from 'ollama' to 'ollama-bridge' to match
        lib/version.js's real code-version key — closes one of the 11
        real gaps orchestrator/lib/spec-drift.js's live check reported
        (§LM1, docs/2026-09-01-living-model-and-autonomous-pipeline-
        phasemap.spec). Content unchanged; this was a naming fix, not a
        rewrite — the spec was already accurate and complete.

  gaps:
    as_of: 2026-09-01
    entries: []   # richest, most complete system-local spec found this pass — no open gap identified

  version_history:
    - version: 1.0.0
      date: 2026-06-27
      summary: "Original build, matches live code@1.0.0 — no drift found this pass."
      versioniumCommitId: null

  # ## ADDENDUM 2026-09-27 (0.39.269) — the bridge is where Ollama's memory is written
  # docs/2026-09-27-agent-hat-memory-download-manager-phasemap.spec (M2).
  # POST /api/jobs takes agentId, compartmentId, repoUuid, record. Every completed job is recorded to the Clear Glass
  # download manager under its agent (lib/agent-memory.js record → response-sink + chat index + chat-logger), not
  # awaited. Not recorded: intent adversarial-probe, intent tool-loop (the caller records the final answer), record:false.
  # dispatch.js exports _remember for tests.
  #
  # ADDENDUM 2026-10-05 (0.39.350, CT4 of docs/2026-10-05-code-tab-and-one-router-phasemap.spec) — James: "make sure ollama is all wired into idearium."
  # GET /api/models no longer answers ok:true with [defaultModel] when Ollama's /api/tags reply is not JSON: that claimed a
  # model was installed when Ollama never said so. It answers ok:false, models [], with the reason. idearium's Settings →
  # Models check (lib/ollama-check.js) reads this list and passes the reason on.
  #
  # ADDENDUM 2026-10-05 (0.39.356, LS1 of docs/2026-10-05-cli-data-code-phasemap.spec) — James: "also the dom mutator/node
  # anchor, or ollama or cpilot stream live into the worksurface panel and code tab." 1.1.0 (MINOR): a running job keeps
  # what the model has written so far — job.partial (answer) and job.partialThinking, appended token by token through
  # callOllamaRaw's opts.onDelta (every round: the think:false retry and each continuation), at most 200,000 chars each
  # (the oldest dropped, counted in partialDropped / partialThinkingDropped), job.partialAt. GET /api/jobs/:id answers them.
