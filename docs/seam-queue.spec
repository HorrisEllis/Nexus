spec:
  meta:
    name:        seam-queue
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-seam-queue-v1-0000-0000-0000-000000000001
    status:      missing_until_now
    purpose: >
      SEAM queue — chunked spec dispatch to a browser-tab provider.
      Previously unspecced. First .spec for it, not a v2 of something
      that existed.

  raid_gate:
    status: built
    location: guardian/server.js — POST /command's SEAM-queue-via-.spec branch
    description: >
      Zero constraint gate before this session — straight from HTTP body
      to queue creation. Now routes through RAID's _approveTool() with
      action 'forge' (already in every provider's contract, no new
      vocabulary needed). Provider is still explicitly chosen by the
      caller (RAID doesn't re-pick it) — the gate is the constraint
      layer (contract check, rate limit, fail-closed for unknown
      sources), not the fitness/routing layer.
    new_contracts:
      chatgpt-console: "ui/agents/chatgpt/index.html — trust_level: console"
      cli:              "cli/nexus-repl.js, guardian/cli.js — trust_level: console"
    verified_live: >
      Real boot test: unrecognized source denied with an honest reason
      ("fell back to minimal-trust default, which denies 'forge'");
      chatgpt-console source approved, real queue created with real UUID.

  persistence_gaps:
    status: identified_not_built
    cortex_side: >
      Queue state (queue_compartments, seam_sessions) lives ONLY in
      guardian's own local JAA store — checked directly. Cortex, the
      central memory/cognition layer, has zero visibility into active
      SEAM queues unless something explicitly syncs it over. Nothing
      currently does.
    userscript_side: >
      currentJobId and the seam_queue_id/seam_chunk_idx/seam_total
      fields the userscript tracks live in plain in-memory `let`
      variables — checked directly in guardian/userscript-chatgpt.js.
      sessionStorage is used only for tab identity, explicitly marked
      "intentionally ephemeral" in its own comment. A tab refresh loses
      all in-progress queue/chunk state, no durable record survives.
    fix_not_yet_built: >
      Queue state needs to be a real, persistent contract file in
      cortex (not guardian-local JAA only) — readable across a guardian
      restart, and the userscript needs to persist its current
      queue/chunk position (localStorage, not sessionStorage) so a tab
      refresh mid-SEAM-run can resume instead of losing all progress.

  escalation_ladder:
    status: designed_not_built
    requested_flow: >
      Tool/chunk execution fails → retry via RAID → if queue/status
      still doesn't move → run the diagnostic tool, which uses the
      ollama userscript + working memory to diagnose and try different
      strategies, checking back in with RAID and escalating each
      attempt → if all of that fails, open a new browser tab and paste
      the full context to Claude as a last-resort human/different-model
      fallback.
    real_pieces_this_touches: >
      RAID's _approveTool (built) for the retry-gate step. Phase 49
      (Agent Reachability: Self-Healing Connections) is related but
      narrower — it's specifically about "no tab connected" reachability,
      not this full failure-execution-diagnosis-escalation chain. The
      diagnostic tool (service/nexus-diagnostic.js) exists and has a
      real /gaps/:uuid/fix route (already proxied this session). Ollama
      working-memory-driven multi-strategy diagnosis and the
      Claude-tab-paste fallback are both genuinely new — not extensions
      of anything currently built.
    not_built_because: >
      Four distinct subsystems wired together (RAID retry plumbing,
      diagnostic integration, ollama adaptive strategy selection, a new
      browser-tab-open-and-paste mechanism) — too large to build
      correctly in the same pass as the persistence gaps above. Needs
      its own design session, same discipline as Phase 40 got before
      any code was written for it.
