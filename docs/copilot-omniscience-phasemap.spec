spec:
  meta:
    name:        copilot-omniscience
    version:     0.1.0-phasemap
    status: >-
      ALL 7 PHASES DONE 2026-07-30. PHASEMAP — dependency-ordered, bottom-up. Each phase is a
      shippable chunk gated on real data. Written 2026-07-30 per §8.5
      (map before build) and §3.1 (build order: substrate before
      logic before surface). Axioms are law throughout.
    uuid:        nexus-copilot-omniscience-v0-0000-2026-0730-001

  goal: >
    Co-pilot becomes omniscient (every event/stream/ledger flows in as
    continuous context) and omnipotent (every tool and every system reachable
    through one agentic loop), while REMEMBERING across sessions (user-model +
    cortex data). Sovereign, non-linear (B): the tool-loop is a shared
    capability each system injects its own model into — copilot AND guardian AND
    idearium — not a service copilot owns.

  substrate_verified_2026_07_30:
    tool_loop:    "lib/agent-tools/index.js — runToolLoop(callModel, sys, user, opts) → {text, iterations, toolCallLog}. Sovereign, DI'd callModel. 10 tools auto-registered."
    tools_present: "read-file, run-command, diagnose, move-data, nexus-status, browser-action, query-recall, query-intelligence, run-pipeline, run-closed-loop"
    persistence:  "copilot/lib/user-model.js — persists user_model_hypotheses to cortex JAA store (data/cortex/memory). init(jaaDB), lazy-loads cortex/memory/jaa-db."
    stream:       "copilot/stream-digest.js — ALREADY consumes Cortex + Guardian SSE, normalizes to plain text, ledgers (nothing lost). normalizeStream/StreamDigest."
    copilot_model: "copilot/server.js ~461-546 — the ollama dispatch is the callModel to inject."
    faculties:    "copilot/{adversarial,analysis,axiom-manager,module-builder,intuition}.js — NOT tools (different shapes). Wrap as tools, do not move (§16.5 — keep sovereign)."

  # ── PHASES — bottom-up, each shippable, each gated ──
  phases:

    P1_copilot_tool_loop:   # ← DONE 2026-07-30 (marker was missing — file's own header already said "ALL 7 PHASES DONE"; confirmed live 2026-08-12: copilot/server.js:1222 requires tool-runtime.js, which calls agentTools.runToolLoop — the gate condition was always actually met)
      why_first: "The spine. Until copilot runs runToolLoop, nothing else has a working thing to plug into (§1.1 — nothing real until it runs)."
      does: >
        Wire lib/agent-tools into copilot/server.js: inject copilot's existing
        ollama dispatch as callModel, expose a tool-using command path. The 10
        existing tools become live for copilot.
      axioms: "§16.5 (use the sovereign module, don't duplicate), §10.1 (copilot owns its callModel, not the loop)"
      gate: "a copilot request that needs a file reads it via the read_file tool mid-turn, no pre-upload — proven with a real prompt."

    P2_persistence_threaded:   # ← DONE 2026-07-30 (commit follows)
      why: "'Remember me — vital.' The loop must carry user-model + cortex memory as context, and write back what it learns."
      does: >
        user-model.init(jaaDB) at copilot boot; inject its hypotheses into the
        tool-loop's systemPrompt; persist new signal after each turn. Memory is
        cortex-backed (survives restart), not in-process.
      axioms: "§0.3 (nothing lost — memory persists), §10.1 (cortex owns the store, copilot reads/writes through it)"
      gate: "restart copilot; a fact it learned last session is present in the next session's context, read from cortex."

    P3_continuous_stream_to_copilot:   # ← DONE 2026-07-30
      why: "Omniscience, half 1. stream-digest already consumes Cortex+Guardian SSE; wire its digest into EVERY tool-loop turn as living context."
      does: >
        StreamDigest feeds the tool-loop's context on each turn (via opts, not a
        signature break). Co-pilot always sees the live event stream.
      axioms: "§1.2 (the stream is observable, never silent), §2.3 (state always visible)"
      gate: "co-pilot answers a 'what just happened?' question from the live stream with no explicit fetch."

    P4_guardian_tool_loop:   # ← DONE 2026-07-30
      why: "B / non-linear proof. agent-tools' own header names Guardian. Wire the SAME loop into guardian with guardian's provider dispatch as callModel."
      does: >
        guardian/server.js injects its /command provider dispatch as callModel
        into runToolLoop. Guardian gets the 10 tools, talking to claude/chatgpt/
        gemini instead of ollama. No copilot dependency — proves the mesh.
      axioms: "§5.14 (same contract, different backend), §10.3 (one loop, no competing tool systems)"
      gate: "a guardian /command that needs a tool uses it — via guardian's providers, with zero call into copilot."

    P5_faculties_as_tools:   # ← DONE 2026-07-30
      why: "Omnipotence. The copilot faculties become callable tools so the loop can invoke them."
      does: >
        Thin adapters in lib/agent-tools/tools/: module_builder (→ module-builder.build),
        run_adversarial (→ adversarial.run), axiom_check (→ axiom-manager),
        analyze (→ analysis.answer). Faculties stay where they are (§16.5).
      axioms: "§16.5 (wrap, don't move), §10.1 (each faculty still owns its logic)"
      gate: "the tool-loop builds a module by calling the module_builder tool, end to end."

    P6_every_system_reachable:   # ← DONE 2026-07-30
      why: "Omnipotence, completed. A call_system tool over the registry (self-register work) makes every registered system callable by name."
      does: >
        A call_system tool resolves a target via the capability registry
        (already populated by self-register) and dispatches. Every system that
        registered is now a co-pilot tool target.
      axioms: "§10.3 (route through the registry, one source of truth), §8.4 (uses the real registry, not a hardcoded list)"
      gate: "co-pilot invokes a named system's capability it has never been explicitly coded to reach, resolved live from the registry."

    P7_stream_to_all_systems:   # ← DONE 2026-07-30
      why: "Omniscience, expanded. The continuous stream is not copilot-only — every consumer (guardian's loop, the tablet, idearium) can subscribe to the same normalized digest."
      does: >
        Promote StreamDigest to a shared subscribable (lib/), so any system's
        tool-loop or UI gets the same continuous normalized stream copilot has.
      axioms: "§10.3 (one stream, many readers — not N copies), §0.3 (ledgered, nothing lost)"
      gate: "guardian's tool-loop AND the tablet both read the same live digest copilot does, from one source."

  ordering_rationale: >
    P1→P2→P3 build the copilot spine (loop, memory, stream) — 'B first, then
    continuous stream' as directed. P4 proves non-linearity (guardian) on the
    working spine. P5→P6 complete omnipotence (faculties + every system). P7
    expands the stream to all, so omniscience is system-wide, not copilot-only.
    No phase depends on a later one. Each is a real, testable increment.

  honest_risks:
    - "P1: runToolLoop with a real model can loop — maxIterations caps it, but a bad callModel could burn iterations. Gate proves a real termination."
    - "P4: guardian's provider dispatch is async/job-based (poll), not a direct return like ollama — the callModel adapter must resolve the job before returning to the loop."
    - "P6: call_system must not become a second dispatch path competing with RAID (§10.3). It routes THROUGH the registry, same as RAID resolves."
    - "sandbox cannot run the live loop (no model, no SSE) — every gate is James-verified on the real boot, per this whole engagement."

  corrections_2026_08_14:
    P4_gate_never_actually_verified:
      what: >
        P4 was marked DONE 2026-07-30 on its stated gate ("a guardian
        /command that needs a tool uses it — via guardian's providers,
        with zero call into copilot"). That gate was never actually met.
        guardian/tool-runtime.js's resolveJob has always read
        job.tool_calls; nothing anywhere in guardian/ ever wrote it
        (confirmed by grep, zero assignments). Every browser-tab tool
        call silently returned toolCalls: null — the loop always saw a
        "final answer," never a tool request. A second, separate bug in
        the same path: resolveJob read job.response, but the
        GUARDIAN_COMPLETE handler only ever set job.responseText — so
        even the plain-text answer came back empty on every resolved job.
        Root cause: the DOM-reply path has no native tool-calling schema
        to produce structured tool_calls from at all — the missing piece
        wasn't a bug in existing logic, it was a producer that was never
        built.
      fixed: >
        guardian/server.js: added _extractToolCallsFromDOM(text), a
        parser for a fenced ```tool_call convention, called at
        GUARDIAN_COMPLETE/NCP_COMPLETE to set job.tool_calls; fixed
        resolveJob to read job.responseText (the field actually
        written) instead of job.response (never written).
        guardian/tool-runtime.js: run()'s systemPrompt now names the
        available tools and states the exact fenced-block convention —
        the in-band substitute for a schema a browser tab can't see.
      new_capability: >
        lib/agent-tools/tools/query/file-tree.js (file_tree) — read_file
        only ever handled one named file; there was no way for the model
        to discover what exists before requesting it. Same safe-path
        containment as read_file, registered in lib/agent-tools/index.js.
      verified: >
        Syntax-checked all four touched files; unit-tested
        _extractToolCallsFromDOM against single- and multi-tool-call DOM
        text and a plain-text final answer; ran file_tree.execute()
        against a real directory and a path-traversal string
        ('../../../etc') — correctly listed one, correctly refused the
        other. NOT verified: the live round trip through an actual
        claude.ai tab, guardian's NCP channel, and a live job poll —
        sandbox has no reachable NCP/browser process. That's the one
        remaining gate, same honest_risks caveat as every other phase:
        James-verified on the real boot.
#
# ADDENDUM 2026-10-05 (0.39.352, CT6/CT8 of docs/2026-10-05-code-tab-and-one-router-phasemap.spec) — James: "i want to see the agents activity in the code tab, in real time. like maybe have a little dot blinking next to it"
# runToolLoop opts: maxToolErrors (failed calls in a row end the run: failed + toolErrors) and onToolCall (each call as it
# starts and ends). copilot /api/prompt body.tools.maxToolErrors and body.tools.progressUrl (tool-runtime toolEventSink:
# loopback only, fire and forget) carry them; a stopped loop answers 502 with toolErrors:true.
