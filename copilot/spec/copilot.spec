spec:
  meta:
    name:        copilot
    version:     3.8.1   # 0.39.339 PATCH — the working set starts from the checklist. Previous 3.8.0: 0.39.337 MINOR — copilot/lib/workset.js: an Ollama tool loop's working set (JSON per run), rounds send its synthesis. Previous 3.7.2: 0.39.336 PATCH — an Ollama tool-loop reply's written tool call is read (_findToolCalls), as a browser agent's. Previous 3.7.1: 0.39.282 PATCH — a self-reported failure floors confidence; duplicate component id context.get → context.session; module-builder resolves on the full token intersection. Previous 3.7.0: 0.39.258 MINOR — body.tools.composed, raw Ollama prompt, GET /api/prompt/resolve. Previous 3.6.0: 0.39.257 MINOR — /api/prompt body.tools runs the real tool loop (scope enforced, identity, repoDir) for ollama and browser agents; GET /api/tools/list, POST /api/tools/run; a failed round ends a tool loop as a failure with its jobId. Previous 3.5.2: 0.39.253 PATCH — /api/prompt passes body.model to Ollama (was dropped). Previous 3.5.1: 0.39.244 PATCH — _tryGuardian says why it failed (error, jobId) instead of null; no shared-tab pre-check for a repo (agentId) job
    foundation:  nexus-system-foundation@1.0.0
    port:        3750
    uuid:        nexus-copilot-v2-0000-2026-0627-jamesbrooks-001
    status:      active
    purpose: >
      Sovereign co-pilot system. Separated from Guardian.
      Receives intent, assembles context, routes to RAID, returns response.
      Guardian is dispatch. Co-pilot is intelligence. They are separate.
      If Guardian goes down, the co-pilot can still answer from Cortex memory.
      Every exchange is tracked hook-to-hook through CFR.

  core:
    schemas:
      CopilotRequest:
        uuid:        string   # requestId — propagates through all hops
        sessionId:   string   # user session
        prompt:      string
        channel:     string   # which UI channel sent this
        channelName: string
        uiState:     object   # NEXUS_UI_STATE snapshot from browser
        ts:          number

      CopilotResponse:
        requestId:   string
        ok:          boolean
        text:        string
        modelUsed:   string   # 'data-only' | 'ollama' | 'claude' | 'chatgpt' etc
        intent:      string   # classified intent
        fromGrammar: boolean
        componentId: string   # which component handled it
        hookId:      string   # which hook
        tokensUsed:  number
        contextLayers: number # 0-7
        ui:          object   # optional UI instructions (spotlight, navigate)
        ts:          number

      CopilotSession:
        sessionId:   string
        userId:      string
        channel:     string
        startedAt:   number
        exchanges:   number
        lastActive:  number

    axioms:
      - AX-001  validate all inputs
      - AX-002  no silent failures
      - AX-003  write to Cortex before responding
      - AX-005  event bus — results posted, not returned directly
      - AX-007  self-describing

    constants:
      CONTEXT_LAYERS:         7
      TOKEN_FIRST_THRESHOLD:  0.6   # grammar confidence above this = no Ollama
      SESSION_TIMEOUT_MS:     3600000
      MAX_PROMPT_LENGTH:      8000
      DATA_ANSWER_FAST_PATH:  true  # attempt data answer before any model

  events:
    emits:
      - 'copilot.booted'
      - 'copilot.prompt.received'     # before any processing
      - 'copilot.intent.classified'   # after RAID classification
      - 'copilot.answer.data-only'    # answered without a model
      - 'copilot.answer.model'        # answered via model
      - 'copilot.action.dispatched'   # action intent routed to tool
      - 'copilot.navigate'            # UI navigation command
      - 'copilot.spotlight'           # UI spotlight command
      - 'copilot.error'
    handles:
      - 'ollama.job.complete'         # model response arrives back
      - 'cortex.raid.decide.result'   # RAID tells copilot where to route
      - 'orchestrator.shutdown'

  routes:
    # §RECONCILED 2026-08-13 — this block declared 8 routes; copilot really
    # serves 21. Two declared routes were NOT served at all, and 15 served
    # routes were absent here. A contract that is wrong in both directions is
    # worse than no contract: anything reading it (orchestrator's contract
    # poller, copilot's own /contract, capability discovery) was answering
    # from a map of a system that doesn't exist. Every entry below was checked
    # against a real `p === '<path>'` match in copilot/server.js — none are
    # asserted from memory (§0.1, §1.1).

    - method: POST  path: /api/prompt
      body: "CopilotRequest"
      returns: "CopilotResponse"
      description: "Primary entry. All co-pilot interactions."

    - method: POST  path: /api/prompt/stream
      returns: "SSE token stream"
      description: "Streaming variant of /api/prompt."

    - method: POST  path: /api/prompt/tools
      description: "Prompt routed explicitly through the agent-tools loop."

    - method: POST  path: /api/prompt/fulfill
      description: "Adaptive fulfillment path (copilot/adaptive-fulfillment.js)."

    - method: POST  path: /api/channel
      body: "{ sessionId, channel, channelName, uiState }"
      returns: "{ ok }"
      description: "Update current channel context for session"

    - method: GET   path: /api/sessions
      returns: "{ sessions: CopilotSession[] }"

    - method: POST  path: /api/build
      description: "Module build request (copilot/module-builder.js)."

    - method: POST  path: /api/diagnose
      description: "Run a real diagnostic sweep."

    - method: GET   path: /api/diagnose/list
      description: "List available diagnostics."

    - method: GET   path: /api/axioms
      description: "Read the live axiom set (copilot/axiom-manager.js)."

    - method: POST  path: /api/axioms/add
    - method: POST  path: /api/axioms/remove

    - method: POST  path: /api/observe
      description: "Ingest an observation into the stream digest."

    - method: GET   path: /api/stream
      returns: "SSE"
      description: "Live copilot activity stream."

    - method: POST  path: /api/stream/ingest
      description: "Push an event into the activity stream."

    - method: POST  path: /api/event
      description: "Event ingress from other systems."

    - method: GET   path: /api/lifeline/health
      description: "Lifeline cascade health (ollama → guardian escalation)."

    - method: POST  path: /bridge/deliver
      description: "Bridge delivery endpoint."

    # §BUILT 2026-08-13 — both of these were declared here with no handler in
    # copilot/server.js. The work underneath was already real (_sessions is
    # live; copilot/lib/copilot-context.js assembles all 7 layers and is
    # already called on the prompt path) — there was simply no way to LOOK at
    # either. Verified live against a running cortex+copilot pair.

    - method: GET   path: /api/sessions/:sessionId
      returns: "{ session: CopilotSession, exchanges: [], exchangeCount }"
      description: "Session record + its recent chat_log exchanges, read from cortex. 404 on unknown session; exchanges:null + exchangesError if cortex is unreachable (never a bare [], which would read as 'said nothing')."

    - method: GET   path: /api/context/:sessionId
      returns: "{ layerCount, tokensUsed, layers, text, sessionKnown }"
      description: "Assembled 7-layer context snapshot (copilot-context.js). sessionKnown flags whether the snapshot is session-specific or a generic system snapshot."

    - method: GET   path: /health
    - method: GET   path: /contract
    - method: GET   path: /events




  handshake:
    components:
      - id: 'copilot.prompt'
        uuid: 'nexus-copilot-comp-prompt-v2-001'
        grammar: ['ask', 'copilot', 'cp']
        route: { method: POST, path: '/api/prompt' }
        hooks:
          in:
            - id: 'copilot.prompt.receive'
              intent: ['ask', 'build', 'diagnose', 'navigate', 'note', 'tool', 'action']
              contract: 'nexus-interaction-contract-v1::copilot'
              tags: ['copilot', 'user-intent', 'entry-point']
          out:
            - id: 'copilot.prompt.to-raid'
              wires_to: ['cortex.raid.receive']
              tags: ['classification', 'routing']
            - id: 'copilot.prompt.to-ollama'
              wires_to: ['ollama.jobs.dispatch.receive']
              tags: ['synthesis', 'model']
            - id: 'copilot.prompt.to-cortex-memory'
              wires_to: ['cortex.memory.chat_log.write']
              tags: ['persist', 'memory']
            - id: 'copilot.prompt.reply'
              wires_to: ['ui.copilot.receive']
              tags: ['response', 'terminal']

  modules:
    - id: intent-classifier
      path: copilot/intent-classifier.js
      description: >
        Token-first fast path before any model.
        Greeting RE, slash commands, single-word tools, grammar trie.
        Falls through to RAID classify() for everything else.
        Returns: { intent, tool, confidence, fromGrammar, componentId }

    - id: context-assembler
      path: copilot/context-assembler.js
      description: >
        7-layer context. L0 bus events, L1 telemetry, L2 provider health,
        L3 gaps + SEAM, L4 CFR-Ω, L5 memory + artifacts, L6 predictive intent.
        Reads from Cortex (:3748) not Guardian.
        User model hypotheses, recent notes, chat_log session history.
        Returns assembled text block injected into model system prompt.

    - id: data-answerer
      path: copilot/data-answerer.js
      description: >
        Answers from live API reads without any model.
        Greetings, status, gap count, sigma, provider list, pattern summary,
        recent notes, RCA findings, current channel state.
        TOKEN_FIRST_THRESHOLD: if grammar confidence >= 0.6, answer here.
        Never calls Ollama for questions answerable from the field.

    - id: action-router
      path: copilot/action-router.js
      description: >
        Routes action intents to the right component via RAID.
        'build X' → emerge.compiler via ollama
        'diagnose' → cortex.intelligence.rca
        'note: X' → cortex.memory.user_notes + idearium.idea
        'navigate X' → emits copilot.navigate event → UI shell
        'spotlight X' → emits copilot.spotlight event → UI spotlight module
        Every dispatch carries full wire context for CFR.

    - id: session-manager
      path: copilot/session-manager.js
      description: >
        One session per browser tab / terminal connection.
        Reads chat_log from Cortex to rebuild session history.
        SESSION_TIMEOUT_MS: idle sessions expire.
        On new session: reads user_model_hypotheses for personalization.

    - id: memory-writer
      path: copilot/memory-writer.js
      description: >
        All writes go to Cortex via POST :3748/api/memory/insert.
        Tables: chat_log, user_model_hypotheses, user_notes.
        Every write carries: requestId, sessionId, componentId, hookId.
        Fallback: buffer locally if Cortex offline, flush on reconnect.

    - id: server
      path: copilot/server.js
      description: >
        HTTP server on :3750.
        SSE /events stream.
        Registers with orchestrator on boot.

  what_leaves_guardian:
    remove:
      - "guardian/agents/co-pilot/index.js"       # moves to copilot/
      - "guardian/agents/co-pilot/context.js"     # moves to copilot/context-assembler.js
    guardian_keeps:
      - "POST /command → SEAM queue dispatch"
      - "POST /build → T2 gate"
      - "NCP channel management"
      - "Job queue + SSE to browser tabs"
    orchestrator_update:
      - "POST /api/guardian/copilot/prompt → proxies to :3750/api/prompt"
      - "Existing clients still work. No breaking change."

  tests:
    - 'POST /api/prompt "hello" → 200 + text, modelUsed: data-only'
    - 'POST /api/prompt "/gaps" → 200 + gap count, zero model calls'
    - 'POST /api/prompt "build X" → 200 + dispatched to emerge.compiler'
    - 'POST /api/prompt "go to guardian" → 200 + ui.navigate in response'
    - 'POST /api/prompt "note: X" → 200 + written to cortex.memory'
    - 'chat_log written to Cortex on every exchange'
    - 'user_model_hypotheses updated on channel visit'
    - 'session survives Guardian restart'
    - 'context-assembler reads from :3748 not :7820'
    - 'wire context (requestId, componentId, hookId) on every CFR entry'


# ── ADDENDUM 2026-07-09 (v3.2.0) — what changed this session ──
# Verified against real source, tested, 97/97 baseline held. Each item
# is a real wire or fix, not a claim:
#   - 4 declared intents wired (navigate/note/tool/action) — were declared, none implemented
#   - tool intent routes action-shaped prompts through ollama's real agent-tools loop (read_file/run_command/diagnose/move_data/run_pipeline)
#   - adversarial faculty wired with a narrow trigger; AX-008 bridge+diagnostic SSE streams into copilot's live buffer
#   - fluid agent routing (extractExplicitAgent) + lifeline /command transport fix (was posting to a removed route, every escalation silently 404ing)

  built_2026_09_19_inject_rule:
    what: >-
      New inject_rule node type (lib/node-schemas/schema.inject_rule + copilot/schemas/ local sovereign
      mirror) — real, editable configuration for copilot's 5 real context-injection sites in
      copilot/server.js (_injectUserModel, _injectSessionHistory, _injectRecallContext, the inline CORTEX
      MASTERMIND append, tool-guide.js's toolGuide()). Deliberately NOT the pre-existing `injection` type
      (a real, different, per-call audit record of priming behavior — checked directly before naming the
      new type, avoiding the exact pat/bep_pattern collision class from earlier the same session).
      enabled:false on a real node skips that site's own network call entirely, not just its output.
      copilot.node-taxonomy.md gained rows for both inject_rule and the pre-existing, previously-
      undocumented injection type.
    proven: >-
      Seed (5 created), idempotent re-seed (never overwrites a real edit), a real direct YAML edit
      (enabled:false, changed a limit) read back correctly including partial-merge of limits, unknown id
      fails loudly. Real require of the fully-edited copilot/server.js: clean.
    honest_gap: >-
      One link in the original injection-pipeline trace was never fully closed: how tool-runtime.js's own
      tool-guide text and analysis.js's contextText actually join for a live NCP session — both build real
      text, no direct call from one into the other was found. Named open, not guessed at.

  built_2026_09_26_tools_for_callers:
    shipped: "0.39.257"
    versionium: "vtm-fc71e0ef"
    asked_by: >-
      James: "the toolscope for the agents tab. need the full capabilities … tool awareness" — "i want everything, at least for now."
    change: >-
      /api/prompt with backend guardian|ollama and body.tools { scope: 'all' | [names], identity, repoDir, maxIterations }
      runs the real tool loop for that backend — tool-runtime runViaAgent (a browser agent; each round a guardian job) or
      run (Ollama) — with allowedTools enforced by runToolLoop, the tool guide in the system prompt, the caller's identity
      in place of "the NEXUS co-pilot", and context.repoDir, which the file tools use as their root
      (lib/agent-tools/tool-root.js). Replies carry toolCallLog and tools {scope, iterations, calls}. Without body.tools
      the route is unchanged. GET /api/tools/list (lib/agent-tools/tool-catalog.js: every registered tool in a named
      group, plain summary, the guide's "when to use", ?q search, ?scope marks). POST /api/tools/run: one tool through
      executeTool, refused outside the caller's scope.
    fixed: >-
      A round whose dispatch failed (e.g. its guardian job stopped at a gate) was returned by makeNcpCallModel as the text
      "[NCP dispatch failed — no response — gap …]" and the loop ended with it as the ANSWER. Now the round is marked
      failed with guardian's reason (ask.js's gate sentence) and jobId; runToolLoop ends the run as a failure; /api/prompt
      answers 502 with the jobId (the caller's late watch needs it); lifeline's explicit-agent path returns the failure
      instead of re-sending the same prompt as a new job. .injection nodes honour lib/test-sandbox.js
      (COPILOT_INJECTION_DIR): lifeline-fluid-routing wrote them into the real tree on every run.
    tests: >-
      test-agent-tools-and-graph AT-03/04/05/13; test-copilot-tool-runtime 12, test-copilot-tools-guardian-ncp-mesh 9,
      copilot-handshake-dispatch 12, test-lifeline-guardian-timeout 5 unchanged and passing.

  # ## ADDENDUM 2026-09-27 (0.39.267–269) — the self-test, intuition, activity recall, memory
  # docs/2026-09-27-agent-hat-memory-download-manager-phasemap.spec (O1, O2, H1, M3).
  # 1. adversarial.js: the 5 hostile prompts test intuition only (the Ollama side could never fail them); the status
  #    cross-check is the one Ollama call. Every NEXUS_ADVERSARIAL_INTERVAL_MS (default 600000; 0 = off); _running reset
  #    in finally. Was 6 generations every 60 s — all of Ollama's work in James's log.
  # 2. intuition.js: ROUTE_RE group 3 ("what is X") and its own _getBP loader — every blueprint answer used to throw.
  # 3. lib/activity-recall.js (nexus.copilot.lib.activity-recall): "what have you been up to" / "what's ollama been
  #    doing" / "/activity" answered from records (ollama activity, self-test, chat_log, repo_agent_log, scheduler,
  #    triggers, stream), checked before the greeting; GET /api/activity?hours=N[&text=1].
  # 4. Memory (lib/agent-memory.js): copilot's own chat is one agent, 'copilot'. lifeline route() recalls before Ollama
  #    answers (memory:true) and names the agent as memoryAgent — NOT agentId, which makes _tryGuardian skip its
  #    "is that tab connected?" pre-check. analysis.js recalls (not for the self-test) and files as 'copilot'.
  #    /api/prompt forwards agentId/compartmentId to Ollama as well as Guardian.

# ── ADDENDUM 2026-09-27 (0.39.271) — docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec ──
# Declared = served. POST /api/introspect, /api/introspect/retry, GET /api/introspect/health and
# /api/agents/capability are served (lib/introspect.js, lib/agent-capability.js were real and never mounted);
# POST /api/agents/calibrate stays declared, marked served:false (it needs a live probe). 16 served routes were
# added to registry-components.js; interaction-contract.json's port corrected 4850 → 3750.

# ── ADDENDUM 2026-09-29 (0.39.282) — copilot 3.7.1 ──
# Spec caught up: 3.7.0 (0.39.258 — body.tools.composed sends the caller's prompt as-is with {tools}/{tool_guide}
# filled, follow-ups are only tool results in the caller's template, Ollama gets a raw prompt, GET
# /api/prompt/resolve) was never written here (orchestrator spec-drift: spec 3.6.0, code 3.7.0). 3.7.1: an answer that
# says it failed ("could not determine", "unable to find") floors confidence the way an empty one does, so it
# escalates; the second context.get (GET /api/context/:id) is context.session; module-builder _resolveExistingTarget
# resolves when exactly one id is in every token's candidate set.

# ── ADDENDUM 2026-10-05 (0.39.336) — copilot 3.7.2 · build-from-the-spec phasemap SB36 ──
# tool-runtime.js makeOllamaCallModel: _dispatchToOllama posts a tool-loop round to the bridge's /api/jobs without the
# tool schemas (a plain generate), so a native tool call never came back and an Ollama agent could call no tool. A call
# the model WRITES is now read with _findToolCalls — the parser runViaAgent already used for browser agents (a ```tool
# block, or a known tool's bare {"name": …} object) — and the call is stripped from the text. A native tool_calls
# answer still wins when one comes. The schemas are not forwarded: 126 tools are ~138K characters of JSON.

# ── ADDENDUM 2026-10-05 (0.39.337) — copilot 3.8.0 · build-from-the-spec phasemap SB37 ──
# James: "Find the context one by one, put it in an index, and then synthesize it into, into just what it needs. Signal
#   to noise." · "Probably just a JSON file."
# copilot/lib/workset.js (new, nexus.copilot.lib.workset): create / add / synthesize / answer / summary. One JSON file per
# composed Ollama tool-loop run — copilot/data/worksets/<id>.json (COPILOT_WORKSET_DIR; the test sandbox redirects it;
# git-ignored): the question and its terms, every read (tool, args, the raw result whole, its signal, chunk ids, files,
# score), the answer. Signal is chosen without a model: what identifies a read, plus the lines carrying the question's
# terms (at most 14); a read of ≤ 1,500 chars (COPILOT_WORKSET_SMALL_READ) is kept whole.
# tool-runtime.js makeOllamaCallModel: with opts.worksetTemplate (composed), each round sends the first user message plus
# the template filled with {reads} and {workset} = synthesize(budget COPILOT_WORKSET_BUDGET, 6,000 chars) — not the
# transcript. run() returns workset (summary). /api/prompt body.tools.worksetTemplate, body.tools.question; the answer
# carries workset { id, file, reads, ids, files }. runViaAgent (browser tabs) is unchanged: a tab keeps its conversation.

# ── ADDENDUM 2026-10-05 (0.39.339) — copilot 3.8.1 · build-from-the-spec phasemap SB39 ──
# copilot/lib/workset.js 1.1.0: create({ checklist }) — the caller's checklist (lib/context-prereqs.js items) is the working
# set's index: found items' content become the first reads (tool 'checklist'); a read with chunk ids ticks a missing
# target / similar / where / what item; synthesize() opens with the checklist's state and "checklist complete" or "still
# missing — ask James: …". /api/prompt body.tools.checklist (≤ 20 items). tool-runtime: the synthesis is sent only once a
# real read is in the set — the first round's prompt already carries the checklist.
