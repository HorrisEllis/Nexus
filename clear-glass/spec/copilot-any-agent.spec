spec:

  # ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # copilot-any-agent.spec — the Clear Glass CLI's Guardian route honoured, and any agent as the copilot.
  # Format: emerge's module spec (emerge/SPEC_COMPILER.spec), compiled by emerge/compiler/kg-builder.js at specDepth 1.0, no BLACK node
  # (tests/modules/test-substrate-spec.test.js). Phases: docs/2026-10-24-copilot-any-agent-phasemap.spec (`blocks:` name these modules).
  # ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        copilot-any-agent
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-24T00:00:00Z
    status:      specced
    uuid:        nexus-cg-copilot-any-agent-spec-v1-0000-2026-1024-jamesbrooks-001
    origin: >-
      James, 2026-10-24, pasting the floating CLI after picking guardian (claude), then chatgpt, and saying "hello": the reply was labelled
      "guardian · chatgpt · 🎩 · ollama:qwen2.5-coder:7b". His words: "clearglass. can you get the cli working for guardian, use any agent as
      the copilot". The ask is his; the trace and the contracts are the coder's. The coder's reading (to confirm): "any agent as the copilot" =
      one copilot (its tools, memory, hat), and he picks which model wears it — any Guardian agent, a local Ollama model, or Claude Code.
    purpose: >-
      A route he picks is the route that answers, or the answer says why it could not. A Guardian agent whose tab is not open yet is opened
      (Guardian's dispatcher already does this for a repo agent's job) instead of being refused; an explicit pick never falls back to another
      model in silence; and the CLI can set which agent is the copilot, each reply placed under its own question and labelled by who answered.
    target_runtime: [electron, node]
    language_stack: [javascript]
    paradigm: [honour-the-pick, fail-loud, reuse-before-build]
    axioms: ["USER_AUTONOMY: his pick is his", "§1.2 nothing fails silently", "TRUTH_OVER_COHERENCE: the label says who answered",
      "§8.6 reuse before build", "§5.2 one door"]
    deps:
      - { name: electron, version: ">=30", required: true, purpose: "the floating CLI window" }

    census: >-
      Traced 2026-10-24. clear-glass/renderer/float-cli.js sends { backend, agent, hat } with each message (cg.copilot.send); src/copilot/
      bridge.js _callNexusCopilot forwards backend, provider (the agent) and agent to copilot's bridge handler (copilot.prompt, copilot/
      server.js ~2194), which reads payload.provider only and calls lifeline.route({ provider }). lifeline _routeInner treats it as an explicit
      agent: runViaAgent → _tryGuardian, whose shared-tab pre-check (GET /providers) refuses an agent with no tab open; the plain retry is
      refused the same way; then "Explicit request failed — fall through to the normal cascade" and Ollama answers. Guardian's askSync
      (guardian/ask.js) fails fast on an unconnected provider too, except for a job with an agentId, whose tab the dispatcher opens and waits
      for (guardian/lib/dispatcher.js: guardian.tab.needed → Clear Glass ProviderHost spawns it, the job flushes on connect — seen in his
      2026-10-23 boot log for gemini). The floating CLI appends each reply at the end, so two quick questions are answered out of order.

    constraints:
      - id: CA-001
        description: "An agent he picks explicitly is asked with openTab: copilot's pre-check and Guardian's fail-fast let the dispatcher open its tab and wait, as for a repo agent."
        type: hard
        enforced_by: [GATE-CA-OPEN]
      - id: CA-002
        description: "An explicit pick never falls back to another model in silence: when it cannot answer, the reply is a failure naming the agent and Guardian's reason."
        type: hard
        enforced_by: [GATE-CA-LOUD]
      - id: CA-003
        description: "The reply's label is who answered (provider_used), never the route that was asked when they differ."
        type: hard
        enforced_by: [GATE-CA-TRUE-LABEL]

  schemas:

    - id: CopilotPick
      name: CopilotPick
      description: "Which agent wears the copilot, per Clear Glass window, and how it is reached."
      fields:
        backend:  "string — guardian | ollama | claude-code | copilot (copilot = copilot decides, the cascade)"
        agent:    "string|null — claude | chatgpt | gemini | perplexity | deepseek (guardian); null otherwise"
        model:    "string|null — an Ollama model name (ollama), else null"
        hat:      "boolean — the Clear Glass hat on"
        strict:   "boolean — true for every pick but copilot: no fallback in silence"
      behavioral_contracts: ["copilot is the only non-strict pick", "the pick travels with each call (per window); copilot's global agent is never switched"]
      error_paths: ["an unknown agent or backend → refused, the allowed ones listed"]

  interfaces:

    - id: IF-CG-COPILOT-BRIDGE
      name: cg-copilot-bridge
      path: clear-glass/src/copilot/bridge.js
      description: "Clear Glass's copilot client: send({ message, backend, agent, hat }) → copilot's bridge, else Ollama/Guardian direct."
      exports: ["send(payload) → { text, route: { backend, agent, hat, modelUsed } }", "_route({ backend, agent, hat })"]
      behavioral_contracts: ["the route is per call"]
      error_paths: ["copilot unreachable → direct, said"]

    - id: IF-COPILOT-PROMPT
      name: copilot-prompt
      path: copilot/server.js
      description: "copilot.prompt (the bridge handler) and POST /api/prompt: a message with a provider → lifeline.route."
      exports: ["copilot.prompt { prompt, provider, backend, agent } → { ok, text, modelUsed }"]
      behavioral_contracts: ["provider 'copilot' or none → config.DEFAULT_PROVIDER"]
      error_paths: ["no text → _noAnswer with lifeline's reason"]

    - id: IF-LIFELINE
      name: lifeline
      path: copilot/lifeline.js
      description: "lifeline.route(prompt, { provider }) — an explicit agent through copilot's tool loop (runViaAgent → _tryGuardian), else the cascade."
      exports: ["route(prompt, opts) → { ok, text, provider_used, error }", "dispatchToNcpAgent (= _tryGuardian)"]
      behavioral_contracts: ["an explicit agent is honoured exactly as named"]
      error_paths: ["guardian reports the agent's tab not connected → refused before dispatch (today)"]

    - id: IF-GUARDIAN-ASK
      name: guardian-ask
      path: guardian/ask.js
      description: "askSync(prompt, { provider, agentId }) — a job to one NCP agent; fails fast when its tab is not connected, unless the job carries agentId."
      exports: ["askSync(prompt, opts, deps) → { ok, text, jobId, error }"]
      behavioral_contracts: ["an agentId job waits for the tab the dispatcher opens"]
      error_paths: ["no provider connected → ok:false, said"]

  modules:

    - id: MOD-CA-OPEN
      name: open-the-picked-tab
      uuid: nexus-cg-ca-open-tab-v1-0000-2026-1024-001
      path: copilot/lifeline.js
      phase: CL1_the_picked_agent_is_opened
      description: >-
        A strict pick (CopilotPick.strict) travels as openTab from copilot.prompt through lifeline to Guardian. _tryGuardian skips the shared-tab
        pre-check for it, and Guardian's askSync skips its fail-fast for it, as both already do for an agentId job: the dispatcher queues the
        job, emits guardian.tab.needed, Clear Glass opens the tab, and the job flushes when the userscript connects.
      deps: [{ name: lifeline }, { name: guardian-ask }, { name: copilot-prompt }]
      schema_refs: [CopilotPick]
      exports: ["route(prompt, { provider, openTab: true }) → the agent's answer after its tab opens", "askSync(prompt, { openTab: true }) → queued, not refused"]
      gate_pipeline:
        - "GATE-CA-OPEN-001: openTab → no shared-tab pre-check, no fail-fast"
        - "GATE-CA-OPEN-002: the job is queued to the agent; its tab is asked for (guardian.tab.needed)"
      behavioral_contracts: ["openTab only for a strict pick; the cascade keeps its checks"]
      error_paths: ["the tab never connects within the call's wait → the agent's own timeout sentence, said (CL2)"]
      acceptance: ["a fake Guardian that reports chatgpt not connected: a strict chatgpt pick is still posted to /api/copilot/prompt with openTab, and its answer is returned"]

    - id: MOD-CA-LOUD
      name: no-silent-fallback
      uuid: nexus-cg-ca-no-silent-fallback-v1-0000-2026-1024-001
      path: copilot/lifeline.js
      phase: CL2_a_pick_never_falls_back_in_silence
      description: >-
        When a strict pick cannot answer (its tab never connects, Guardian refuses, the reply is empty), lifeline returns ok:false with the agent
        and Guardian's reason instead of falling to the Ollama cascade; copilot.prompt passes it on, and the CLI prints it as a failure. A pick
        of 'copilot' keeps the cascade (that is what it means).
      deps: [{ name: lifeline }, { name: copilot-prompt }]
      schema_refs: [CopilotPick]
      exports: ["route(prompt, { provider, strict: true }) → { ok: false, error, provider_used } when the agent cannot answer"]
      gate_pipeline: ["GATE-CA-LOUD-001: strict and the agent failed → no cascade, the reason"]
      behavioral_contracts: ["Ollama never answers a strict Guardian pick"]
      error_paths: ["none beyond the reason it carries"]
      acceptance: ["a fake Guardian that fails the job: a strict chatgpt pick returns ok:false naming chatgpt and the reason; a fake Ollama is never called"]

    - id: MOD-CA-PICK
      name: any-agent-as-copilot
      uuid: nexus-cg-ca-any-agent-v1-0000-2026-1024-001
      path: clear-glass/renderer/copilot-cli.js
      phase: CL3_any_agent_as_the_copilot
      description: >-
        /copilot <agent> sets which agent wears the copilot for this window — claude, chatgpt, gemini, perplexity, deepseek (Guardian),
        ollama or ollama:<model>, claude-code, or copilot (copilot decides). /copilot alone says the current one and lists the choices. The
        Ollama model travels as model (copilot already honours body.model for Ollama). The pick is strict unless it is copilot.
      deps: [{ name: cg-copilot-bridge }, { name: copilot-prompt }]
      schema_refs: [CopilotPick]
      exports: ["/copilot [agent]", "route() → { backend, agent, model, hat, strict }"]
      gate_pipeline: ["GATE-CA-PICK-001: an unknown name → refused, the choices listed"]
      behavioral_contracts: ["the same pick from the toggle, the select or /copilot is one state"]
      error_paths: ["an unknown agent → refused"]
      acceptance: ["/copilot chatgpt → backend guardian, agent chatgpt, strict; /copilot ollama:llama3 → backend ollama, model llama3; /copilot copilot → not strict"]

    - id: MOD-CA-REPLY
      name: reply-in-place
      uuid: nexus-cg-ca-reply-in-place-v1-0000-2026-1024-001
      path: clear-glass/renderer/float-cli.js
      phase: CL4_each_reply_under_its_question_labelled_true
      description: >-
        The floating CLI writes each reply where its "thinking" line was (under its own question), not at the end; the route line names who
        answered (route.modelUsed / provider_used), and says so when it differs from the pick.
      deps: [{ name: cg-copilot-bridge }]
      exports: ["send() — reply at its own place; route line from who answered"]
      gate_pipeline: ["GATE-CA-REPLY-001: the reply replaces its own thinking line"]
      behavioral_contracts: ["two questions answered out of order still read in order"]
      error_paths: ["a failure is printed in place too"]
      acceptance: ["two sends, the second answered first: each reply sits under its own question"]

  events:
    copilot:
      - "guardian.tab.needed { provider, url, jobId } (existing) — now also for a strict copilot pick"

  enforcement:
    gates:
      - { id: GATE-CA-OPEN, name: open-the-pick, severity: fatal, check: "a strict pick is never refused for a tab that is not open yet", on_failure: "suite red" }
      - { id: GATE-CA-LOUD, name: no-silent-fallback, severity: fatal, check: "a strict pick that fails never reaches Ollama", on_failure: "suite red" }
      - { id: GATE-CA-TRUE-LABEL, name: true-label, severity: fatal, check: "the label is who answered", on_failure: "suite red" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node"
    - "tests/modules/test-copilot-any-agent.test.js — lifeline against a fake Guardian and a fake Ollama; the CLI in jsdom"
