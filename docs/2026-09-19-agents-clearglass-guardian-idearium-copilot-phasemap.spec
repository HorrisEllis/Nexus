spec:
  meta:
    name:        2026-09-19-agents-clearglass-guardian-idearium-copilot-phasemap
    version:     0.1.0-phasemap
    status:      "Phases 1-6 DONE and committed this session (real commits cited per
      phase, not asserted). Phases 7+ are real, named next steps — not started."
    uuid:        nexus-phasemap-agents-cg-guardian-idearium-copilot-v1-0000-2026-0919-001
    axioms_in_play: "0.1 reality over the plan; 1.1 nothing exists until proven;
      1.2 nothing silently fails; 10.3 competing truth layers are a system failure;
      16.1 close nearest gap; 16.5 one truth, don't duplicate"

  # ═══════════════════════════════════════════════════════════════════════
  # AGENTS / MESH — DONE this session
  # ═══════════════════════════════════════════════════════════════════════
  phase_1_code_extraction:
    status: DONE
    commit: ccd75f2
    what: >
      lib/extract-code.js — real code extraction from an agent's raw chat
      reply. Confirmed real gap: guardian/lib/ncp-handler.js's raw
      responseText flowed into chunk content verbatim everywhere, always.
      Fails loudly on zero blocks, unclosed fence (reusing userscript-
      claude.js's own real heuristic), empty block, or ambiguous multiple
      blocks unless allowMultiple is explicit. Proven against 10 real cases.
    wired_at: >
      warp-build-dispatch.js's generate() (opt-in via record.expectCode,
      commit aa8971c) — NOT forced onto all 10 idearium section types,
      most of which are legitimately prose.

  phase_2_agent_mesh_tool:
    status: DONE
    commits: [6afbff1, 1915473, eee6aef]
    what: >
      lib/agent-tools/tools/mesh/agent-mesh-route.js — built from a
      confirmed dangling-hook gap (declared, never built) to full coverage
      of AgentMesh's real surface: spawn/send/route/enqueue (6afbff1),
      then the structural correction — AgentMesh owns a real 10-method
      automation engine (this._automation) that already backs BrainOS's
      UI but had zero gate coverage (1915473), then the final three
      (listNodes/listMeshView/listAgents, eee6aef). 17/17 real actions,
      zero named gaps remaining, zero refusals left in the tool.
    real_gates_added: >
      clear-glass/src/gates/index.js gained 13 new gates this session
      (10 workflow + 3 list), on top of the 4 that already existed
      (spawn/send/route/enqueue) — 17 total, all confirmed registered
      in the real conditional gate list, not just declared.

  # ═══════════════════════════════════════════════════════════════════════
  # CLEARGLASS — DONE this session
  # ═══════════════════════════════════════════════════════════════════════
  phase_3_browser_action_expansion:
    status: DONE
    commit: ac84082
    what: >
      browser_action's REAL_ACTIONS: 5 named -> 30, matching ClearDriver's
      complete real _dispatch() switch exactly (checked directly against
      driver/index.js, not guessed from method names). Verified
      programmatically: all 30 real dispatch strings resolve correctly,
      zero mismatches.
    honest_gap_named_not_closed: >
      Not run against a live Electron instance — same limit named on
      every ClearGlass-facing tool this session built.

  phase_4_brainos_audit:
    status: DONE (audit only, folded into phase 2's structural fix)
    what: >
      BrainOS (ui/brainos/*.js, ~1,900 real lines) confirmed as a real,
      mature browser-side UI consuming guardian/clear-glass/cortex/
      diagnostic APIs directly — not itself an agent-callable capability.
      Its automation tab's real backend turned out to be AgentMesh's own
      owned engine, not a second system (see phase 2's audit correction).

  # ═══════════════════════════════════════════════════════════════════════
  # GUARDIAN — audited, one real decision still open
  # ═══════════════════════════════════════════════════════════════════════
  phase_5_guardian_command_audit:
    status: DONE (audit only)
    what: >
      cockpit/cli.js's real INTERACTION_CONTRACT extracted live: exactly
      29 commands, 100% forge pipeline/seam/idea/gap/trust/guardian/
      idearium/bus/jaa/help. Zero mesh/driver/brainos coverage confirmed
      — matches James's own instinct exactly.
    still_open_decision: >
      The real gaps found (mesh, driver) were closed via copilot's
      agent-tool loop (agent_mesh_route, browser_action), NOT via new
      cockpit commands. Whether guardian's own cockpit contract should
      ALSO gain "forge mesh ..."/"forge driver ..." commands, duplicating
      the same real dispatch at a second layer, or whether the agent-tool
      loop is the correct single real entry point and cockpit shouldn't
      chase it — not decided. Real question for next session, not guessed
      at here per §16.5 (one truth — adding a second real path to the
      same capability needs a real reason, not just parity for its own sake).

  # ═══════════════════════════════════════════════════════════════════════
  # IDEARIUM — DONE this session
  # ═══════════════════════════════════════════════════════════════════════
  phase_6_spec_compiler_t0_and_bottom_up_build:
    status: DONE
    commits: [fa7a569, aa8971c, db23623]
    what: >
      idearium/spec-engine/compiler-t0.js — spec-compiler.spec's T0 tier
      (structure + placeholder emission), reusing addChunk()'s real,
      existing chunk-creation path rather than a new one. Real bottom-up
      build order added after: addChunk() gained real dependsOn support
      (fa7a569 built T0 first; db23623 added dependsOn, _topoOrder real
      Kahn's-algorithm sort, primitive detection derived from the graph,
      not a separate flag). Proven against a chain, a diamond dependency,
      and a real cycle (fails loudly, names the exact stuck files).
    two_real_bugs_fixed_along_the_way: >
      ingestFilesAsSpec's fabricated markdown-comment placeholder for
      empty files (now fails loudly via failChunk); RepoLayer.materialize()
      returning ok:true with zero files actually written.
    honest_gap_named_not_closed: >
      No real caller in idearium's own dispatch orchestration (index.js/
      api/index.js) yet builds a build_order chunk or triggers
      emitStructure() automatically as part of a real spec's lifecycle —
      the T0 capability is real and proven standalone; nothing invokes it
      end-to-end yet without a human calling it directly.

  # ═══════════════════════════════════════════════════════════════════════
  # COPILOT — DONE this session
  # ═══════════════════════════════════════════════════════════════════════
  phase_7_inject_rule_node_type:
    status: DONE
    commit: 91117c7
    what: >
      New inject_rule node type (central schema + copilot's local
      sovereign mirror), distinct from the pre-existing, differently-
      scoped injection audit-record type (found and correctly NOT reused
      — same collision class as pat/bep_pattern earlier). Five real
      copilot/server.js injection sites (_injectUserModel,
      _injectSessionHistory, _injectRecallContext, the inline CORTEX
      MASTERMIND append, tool-guide.js's toolGuide()) now read real,
      editable .inject_rule nodes — enabled:false skips the site's own
      network call entirely, not just its output. copilot.node-
      taxonomy.md updated with rows for both the new type and the
      previously-undocumented injection type.
    honest_gap_named_not_closed: >
      One link in the original injection-pipeline trace was never fully
      closed: how tool-runtime.js's own tool-guide text and
      copilot/analysis.js's contextText actually join for a live NCP
      session (both build real text, but no direct call from one into
      the other was found) — named as open, not guessed at.

  # ═══════════════════════════════════════════════════════════════════════
  # NEXT — real, named, not started
  # ═══════════════════════════════════════════════════════════════════════
  phase_8_decisions_needed_before_more_building:
    - "Guardian cockpit contract vs. agent-tool loop (phase 5's open decision) — pick one real entry point per capability, not both by default."
    - "idearium: wire a real caller to build_order/emitStructure so T0 fires as part of an actual spec lifecycle, not only when called directly."
    - "copilot: close the tool-runtime.js <-> analysis.js join this session didn't find, if BrainOS/mesh-style priming issues ever surface there the way v0.39.122's 'mountain' bug did for the .injection audit-record type."
    - "intelligence: still unverified whether domain-nodes.js (built two sessions before this one) actually produces real files on a live boot — named open in this session's own earlier turn, not re-checked here."
