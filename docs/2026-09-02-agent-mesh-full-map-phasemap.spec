spec:
  meta:
    name:        2026-09-02-agent-mesh-full-map-phasemap
    version:     1.0.0
    foundation:  nexus-system-foundation@1.1.0
    status:      mapped-not-built
    uuid:        nexus-phasemap-v1-0000-2026-0902-jamesbrooks-002
    purpose: >
      James: "look at all the agent phases. lets do the highest leverage,
      that gets us closer to being able to build nexus using nexus...
      lets do the whole mesh. i want nexus to be able to actually build
      something." This phasemap is the real inventory that ask requires:
      what's already built and wired (a lot more than the ask implied),
      what's real but disconnected, and what's a genuine gap — checked
      directly against live code, not assumed from file names.

  done_this_session:
    ack_over_injection_fix: >
      James, live: "ack is injecting way to much into chatgpt, the tools
      are for that exact reason. need the intent map and hats." This WAS
      the single highest-leverage fix and is done, not just mapped —
      commit cea0e76. Root cause: every browser-agent job (chatgpt,
      claude, gemini, perplexity) got a generic, always-on context blob
      stacked in front of the prompt because lib/intent-hat-router.js
      (real, built 2026-08-17) had never been wired into guardian's
      dispatch path — only into copilot's own internal cascade.
      guardian/server.js's createJob() now computes a real hat suggestion
      per job; all four userscripts use the hat's short persona + scoped
      tools instead of the blob when one applies. 23 real test
      assertions pass. This is also the concrete mechanism behind "want
      to be able to build using chatgpt" — the_builder hat (baseAgent:
      claude, allowedAgents: [claude, chatgpt], real bottom-up/proven-by-
      a-real-run/safe_apply discipline) can now actually reach chatgpt.

  # ────────────────────────────────────────────────────────────────────
  # REAL INVENTORY — checked directly, not assumed. The ask implied a
  # sparse mesh; it isn't. Every item below was confirmed by reading the
  # real file, not by its name existing.
  # ────────────────────────────────────────────────────────────────────

  already_real_and_wired:
    hats_and_intent:
      - lib/hat-forge.js — real per-hat identity (uuid/name/seedKey),
        personaPrompt, toolScope, baseAgent, allowedAgents. 458 lines,
        tested (tests/modules/test-hat-forge.js).
      - lib/hat-seed.js — 4 real forged hats (the_auditor,
        the_diagnostician, the_builder, the_librarian), each with a real
        personaPrompt + toolScope already matched to real classified
        verbs.
      - lib/hat-seed-ollama-personalities.js — 16 additional real,
        already-forged personality hats on baseAgent:'ollama'.
      - lib/intent-classifier.js — real classify() extracting a real
        verb (diagnose/build/validate/recall/analyze/...) with a
        confidence score, VERB_PATTERNS-based, not a stub.
      - lib/intent-hat-router.js — real, tested, read-only suggestHat()
        (verb → hat) and stateful withIntentHat() (temporarily switches
        copilot's own current-agent, always restores). As of this
        session, ALSO wired into guardian's browser-agent dispatch (see
        done_this_session above) — previously copilot-internal only.
    routing_and_accounts:
      - >-
          lib/agent-router.js (CA5) — real intent→agent STRENGTH map
          (perplexity: research, claude: large codebases, chatgpt: general
          + 900-token chunking awareness, gemini: coding + adversarial),
          both auto-classified and user-directed-override, every route
          recorded {intent, agent, why}.
      - lib/account-registry.js (CA7) — real multi-account-per-provider
        registry, editable cortex rows, stores a credential REFERENCE not
        a raw secret (real OS/Electron credential store resolves it).
        ollama/mistral base-agent support fixed this line (2026-08-29) so
        the 16 personality hats above have somewhere real to route.
    tool_authoring:
      - lib/tool-forge.js + lib/agent-tools/tools/execution/forge-tool.js
        — real, wired "give the system a system for its own capabilities"
        (James, 2026-08-09). COMPOSITION not codegen — a forged tool is
        DATA (name/schema/steps binding to already-verified callables),
        every step proven at forge time. This is the real mechanism
        behind "tool forge... lets do the whole mesh" — it already does
        what that ask names, confirmed by reading forge-tool.js's own
        ACTIONS.schema directly, not assumed from the filename.
    two_way_chat_and_coordination:
      - >-
          lib/agent-tools/tools/coordination/agent-chat.js — real,
          hop-capped, ONE-addressee agent messaging, dispatches through
          copilot/tool-runtime.js's runViaAgent — the SAME full tool loop
          copilot itself runs on, not a narrower fallback set. Writes to
          guardian_chat_log (confirmed: that table had zero writers before
          this tool existed).
      - lib/agent-tools/tools/coordination/agent-council.js,
        roundtable.js, parallel-dispatch.js — real multi-agent fan-out
        siblings (same question to multiple members, independently).
      - lib/agent-tools/tools/query/agent-chat-search.js — real
        cross-provider "do you remember when we talked about X" search
        over BOTH chat_log (copilot) and guardian_chat_log (other
        providers), deliberately separate from query_recall's pinned
        single-store scoring engine rather than bolted on unsafely.
    wake_word:
      - >-
          guardian/userscript-nexus-wake.js — ALREADY cross-provider (its
          own header: "Loaded by each provider userscript... so the
          behaviour is defined once rather than four times"). "Hey nexus"
          works in claude/chatgpt/gemini/perplexity today. NOT a gap.
    artifacts:
      - guardian/artifact-upload.js — real, working auto-upload for
        generated code blocks (a real 2026-07-05 bugfix replaced a
        version that always threw). Real file write + token/URL, no
        fake registry.
      - clear-glass/src/providers/host.js's download-capture — real,
        confirmed live in every boot log this session ("download-capture
        armed for claude/chatgpt/gemini/perplexity → guardian
        :7820/api/intake").
    context_query_tools:
      - >-
          lib/agent-tools/tools/query/query-intelligence.js,
          query-recall.js — real tools an agent can call ON DEMAND for
          exactly the information the old context blob used to force-feed
          every message. These are WHY the ack-injection fix is safe: no
          capability was removed, just the forced delivery.

  # ────────────────────────────────────────────────────────────────────
  # REAL GAPS — checked directly, genuinely missing or disconnected.
  # ────────────────────────────────────────────────────────────────────

  phases:
    AM1_raid_intent_contracts_per_agent:
      status: OPEN — genuinely missing, zero hits
      depends_on: []
      does: >
        "All of the intent contracts per agent, like agent aware and
        specific for each intent." Checked directly: grepped tree-wide
        for intent-contract/intent_contract/agent-intent — zero hits
        anywhere, including cortex/core/raid/. lib/agent-router.js's
        strength map (CA5) is a real, similar-sounding thing but is a
        ROUTING HEURISTIC ("perplexity is good at research"), not a
        formal, RAID-verifiable CONTRACT ("chatgpt may/may not perform
        X class of action, must satisfy Y before Z"). This is the one
        genuinely new piece of infrastructure the whole mesh ask
        actually needs — a real schema (candidate shape: per-agent
        {allowedIntents, forbiddenIntents, requiredGates, toolScope})
        that RAID's real contract-intake pipeline (cortex/core/raid/,
        confirmed real and live — RAID_CONTRACT_SUBMITTED/ACKNOWLEDGED/
        PASSED/FAILED lifecycle from an earlier session) can check a
        dispatched job against BEFORE guardian sends it, not just route
        heuristically after the fact.
      real_reuse_candidates: >
        lib/hat-forge.js's own toolScope + allowedAgents fields are the
        closest existing real shape — this phase likely EXTENDS hat-forge
        with a few more real fields (allowedIntents/requiredGates) rather
        than building a fourth parallel per-agent config surface, per
        §8.6 reuse-before-build.

    AM2_first_principles_hat_or_modifier:
      status: OPEN — real design decision
      depends_on: [AM1_raid_intent_contracts_per_agent]
      does: >
        "Maybe inject into chatgpt to use first principles thinking
        logic." Two real, honest options, not decided here: (a) a NEW
        seeded hat (e.g. the_reasoner) with a first-principles
        personaPrompt, reachable the same way the_builder already is; or
        (b) a MODIFIER on existing hats specifically when baseAgent
        resolves to chatgpt (since chatgpt's own real, already-documented
        weakness in lib/agent-router.js's own comments is the 900-token
        chunking constraint, not reasoning depth — worth confirming
        first-principles is actually the right lever before building
        either option).

    AM3_agent_mesh_folder_consolidation:
      status: OPEN — real question from last session, still open
      depends_on: []
      does: >
        Last session's LM_AGENT_1 (docs/2026-09-02-versionium-sovereign-
        and-cleanup-phasemap.spec) already flagged idearium/agent-suite
        vs loom/agent-suite as two real, divergent copies. This mesh
        phasemap makes the same call explicit for the WHOLE mesh: given
        how much of the real mesh (hats, routing, accounts, tool-forge,
        coordination tools) currently lives scattered across lib/,
        guardian/, copilot/, and clear-glass/, whether a real, sovereign
        "agent mesh" home (candidate: lib/agent-mesh/, matching AX-010's
        shared-infra carve-out) should consolidate the cross-cutting
        pieces (hat-forge, hat-seed, intent-classifier, intent-hat-
        router, agent-router, account-registry) is a real architecture
        decision, not a code fix. Not decided here — every piece above
        works correctly where it is today.

    AM4_userscript_shared_core_dedup:
      status: OPEN — real, confirmed duplication
      depends_on: []
      does: >
        Confirmed directly this session while applying the ACK-injection
        fix: guardian/userscript-{chatgpt,claude,gemini,perplexity}.js
        are four independent files with near-identical handleJob,
        _buildToolsHeader, _runToolCall, connection/heartbeat logic —
        confirmed by diffing handleJob() across all four, byte-for-byte
        identical in three of them. Every real fix to shared logic
        (this session's ACK-injection fix included) has to be applied
        four times by hand, which is exactly the "fix drifts across
        siblings" risk this codebase's own axioms warn about. A real
        shared-core extraction (the wake-word file already proves the
        pattern works — "loaded by each provider userscript... defined
        once") would close this permanently. Sizable refactor, not
        attempted here.

    AM5_tool_forge_real_usage_audit:
      status: OPEN — real usage not yet measured
      depends_on: []
      does: >
        tool-forge + forge-tool.js are real and wired, but whether any
        agent has actually forged a real, working tool with it (vs. it
        existing as a correct but unused capability) wasn't checked this
        pass — same "built, correct, disconnected" pattern this
        session's earlier work found twice already (loop-topology.js,
        loom's cortex-sync/ingest history). A real usage audit (grep the
        real forged-tools table for any live rows) is the first step
        before assuming this is actually load-bearing.

    AM6_raid_contract_gate_before_dispatch:
      status: OPEN — depends on AM1
      depends_on: [AM1_raid_intent_contracts_per_agent]
      does: >
        Once AM1's real per-agent contract schema exists, guardian's
        createJob()/dispatchJob() path (the same real function this
        session's ACK-injection fix already touched) is the real
        integration point — RAID checks the job's intent against the
        target agent's real contract BEFORE the NCP push, not after.
        This is the piece that makes "agent aware and specific for each
        intent" a real, enforced gate rather than routing advice.

  build_order_recommendation: >
    AM1 first (it's the one genuinely missing piece and gates AM2/AM6).
    AM4 (userscript dedup) is independently startable and reduces real,
    ongoing maintenance risk — every future fix to shared userscript
    logic currently has to land four times by hand, exactly as this
    session's ACK-injection fix did. AM5 (tool-forge usage audit) is a
    cheap, fast check that should happen before any further tool-forge
    investment. AM3 (folder consolidation) and AM2 (first-principles
    hat) are real design decisions, not blocking — can happen whenever a
    real conversation about them makes sense.
