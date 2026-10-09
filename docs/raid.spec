spec:
  meta:
    name:        raid
    version:     6.3.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-raid-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Provider routing. Ollama always first. Claude always last. Weight table learns from outcomes. _decide() is a pure function — same inputs always produce same decision.

  dispatch_model:
    note: >
      v6.1: CLUSTER_CHAINS (hardcoded per-cluster preference array) retired.
      Replaced by computed constraint-then-fitness, per
      seam-component-registry.spec §10. Same allow-list problem as that
      spec's role_definitions correction, applied to dispatch — a
      hand-authored preference order can't respond to observed drift; a
      computed candidate set does.
    layer_1_constraints: >
      Deny-only exclusion. Partially already built: _agentAvailable()
      (offline check), consecutiveFails>=3 (ollama LAW_I failure
      tracking), callCount>=5 && successRate<0.2 (poor track record).
      Extended this version to also exclude role status=violated and any
      candidate whose dispatch would emit an event forbidden by every
      currently-confirmed role (registry §2 multi_role). Survivors are
      NOT ranked here — just legal.
    layer_2_fitness: |
      fitness = SNR_tier_gate(task)
              → role_confidence(component, role)     [fidelity, registry §6]
              × health(component)                    [existing RAID _health snapshot]
              × topological_proximity(component)      [CFR _byComponent edge, docs/cfr.spec]
      Highest-fitness survivor gets the dispatch. Agent preference is
      emergent from role_confidence/health, not array position — re-ranks
      automatically as roles drift; new components become eligible the
      moment they register a role, no array to hand-edit.
    blocked_on: "docs/cfr.spec _byComponent edge — topological term is a hard dependency, not yet built."

  invariants:
    LAW_I:   "Ollama always first for non-specialist clusters"
    LAW_III: "Claude always last — reserve, never primary"

  tool_approval_gate:
    function: "_approveTool(source, command, opts)"
    purpose: >
      Choke point for real command execution (not just LLM dispatch).
      Reuses cortex/contract/index.js's CONTRACTS — one source of truth
      for agent permissions, not a second tools.json. Fail-closed:
      unregistered sources fall back to the _default contract, which
      denies 'tool' explicitly.
    consumer: guardian/agents/co-pilot — see docs/copilot.spec
    tests: "9/9 PASSING — tests/modules/raid-approve-tool.test.js"

  # ── ADDENDUM 2026-07-21 (v6.3.0) — RAID as universal entry point ──
  universal_router:
    principle: >
      James, 2026-07-21: "the request comes from co-pilot or one of the UIs,
      but goes to RAID — that way the start point doesn't matter, as long as
      it goes to RAID." RAID is the switchboard for the WHOLE system, not just
      provider selection. Any surface (Co-pilot, any UI, CLI, SSE flow) funnels
      every request to RAID; RAID routes; no surface knows about any fulfilling
      system; every fulfilling system is hot-swappable.
    two_decisions: >
      RAID now decides TWO things, on two independent paths that don't touch
      each other: (1) which AI AGENT — the existing _decide() (ollama first,
      claude last, pure); (2) which SYSTEM fulfills a request — the NEW router
      (cortex/core/raid/router.js).
    mechanism:
      - "cortex/core/raid/envelope.js — the universal request shape. Every surface wraps its request in make(intent, {from, payload, capability?}). The envelope accumulates a `trail` (every system + status + ts it passed through) — the 'input → tagged → output, every hop logged' ledger."
      - "Any surface emits raid.route.request { envelope }."
      - "Router resolves the target via the LIVE capability-registry (Phase B) — hot-swappable: swap the provider, the registry re-announces, RAID routes to the new one, no surface changes. Capability namespace = owning system (idearium.gap.find → idearium), no separate mapping table (§10.1)."
      - "Router stamps ROUTED, emits raid.route.decided { envelope, capability }. Target system subscribes and checks envelope.target === its id — RAID names the target, never calls it (fully decoupled)."
      - "Target calls fulfill() → raid.route.fulfilled/failed. Surface hears the answer over SSE."
      - "No match → raid.route.no_route, honest, never silently dropped (§1.2)."
    verified: >
      Live against the real 217-capability registry: 'gap' from copilot → idearium,
      'guardian' from cli → guardian, both resolved with no surface knowing the
      target; nonsense intent → no_route. 10 unit tests (test-raid-router.js) incl.
      start-point-agnostic (R-001) and hot-swap (R-002). §14.4: router never
      consumes its own emissions.
    not_yet: >
      Surfaces still call systems the old (hard-pointer) way in most paths. This
      landed the SPINE + proved it with the router live in cortex boot. Converting
      each surface to route-through-RAID is the incremental follow-on — one surface
      at a time, each verified, system booting throughout (the bottom-up plan).

---
## ADDENDUM 2026-07-30 — RAID verification spine P4 (docs/raid-warp-verification-phasemap.spec)
RAID gained verifyInIsolation() — a consequential action is isolated (via lib/execution-pipeline: BranchEngine→SandboxRunner→CompareEngine, P3) and then SCORED (P4): sigma divergence (meta/cfr/sigma.computeSigma) + behavioral regime (meta/bda BDAKernel.observe). These are SOFT signals (§17.10 weight 0.3): they flag drift, they do not by themselves hard-fail a passing run. Scores persist to cortex's raid_decisions table in a queryable `meta` field (§17.5 — not hashed into argsDigest). recordDecision (P1) + constitution gate (P2) + isolate (P3) + drift score (P4) now compose. _approveTool remains synchronous — its 6 live callers are untouched (§8.4).

---
## ADDENDUM 2026-07-30 — cortex schema-registry P3 (docs/cortex-schema-registry-phasemap.spec)
raid_decisions writes are now schema-OBSERVED. jaaDB.insert consults lib/schema-registry after appending; a row deviating from the raid_decisions schema records a schema_drift row — NON-BLOCKING (the decision write always succeeds, §13.4 integrity by observation). This is why the `meta` field mattered (P4 addendum): a decision carrying sigma/regime in `meta` conforms only if the schema knows `meta`. Re-derive the schema (schema-registry.registerSchema) after adding fields so the shape stays current. The observer skips its own tables (schemas, schema_drift) and high-volume tables (event_log, component_ledger) to avoid noise/recursion.

---
## ADDENDUM 2026-07-30 — RAID verification spine P5 (docs/raid-warp-verification-phasemap.spec)
verifyInIsolation now surfaces a contract-vs-output mismatch as a FIRST-CLASS signal. The execution-pipeline already gates on regressions (CompareEngine vs golden → ok:false, stage:'compare') — P5 does not duplicate that gate (§16.5). Instead it maps a compare-stage failure to a distinct `contractBreach:true` + the specific `regressions[]` in the verdict, with a distinct error message and `contractBreach`/`regressionCount` in the cortex decision meta (§17.6). A contract breach is now legible as what it is, separate from build/validate failures. Note (§0.1): the live golden-regression path needs the real system (a baseline must exist to regress against); the sandbox verifies the signal MAPPING, and James's boot verifies the end-to-end compare.

---
## ADDENDUM 2026-07-30 — RAID verification spine P7 COMPLETE (docs/raid-warp-verification-phasemap.spec)
raid.verify(decision) is the ONE fused entry every system calls — the WARP GateFusion composing the whole spine: constitution gate (P2, hard/cheap, runs FIRST and short-circuits before any sandbox cost) → verifyInIsolation (P3-P6: COS isolate → sigma/drift score → compare contract-vs-output → rewind-snapshot on fail) → one unified verdict, recorded to cortex (P1). §16.5 — composes the P1-P6 pieces, reimplements nothing. §10.3 — agent-tools, execution-pipeline, and the autonomous loop should all call raid.verify() so there is ONE spine, not N verification paths. The verdict carries a per-gate breakdown (verdicts.constitution, verdicts.isolation) for legibility (§17.6). Note: the constitution/contract gate denies actions not in a source's allowed_actions (e.g. copilot allows tool/chat/build/diagnose/ask/browser) — a denial there is the gate working, short-circuiting before isolation.

---
## ADDENDUM 2026-07-30 — CA5 intent routing (planned) extends routing-ir (docs/copilot-awareness-routing-phasemap.spec)
routing-ir.js (buildRoutingIR) TODAY has LAW_I (ollama-first), LAW_III (claude-last-resort), and the chain ['ollama','claude','chatgpt']. CA5 will EXTEND it (§10.3 one routing brain, not a competitor) with an INTENT→AGENT map, both auto (by classified intent) and user-directable: perplexity = reliable data/research; claude = large codebases (+ WARP + relevant context injected); chatgpt = optimal general agent BUT limited to 900 tokens (→ chunking, already conceptually present); gemini = coding + adversarial testing (secondary to claude for code); claude = last resort. Every route decision records which agent + why (intent matched) (§17.5 provenance). CA6 makes the map, fallback order, token limits, and constraints EDITABLE config (cortex rows, like the schema registry) rather than hardcoded (§0.4 optionality, §2.2 storage is truth). §0.1 — this is a real behavior change from the current 3-agent chain; James-verified on boot.

---
## ADDENDUM 2026-07-30 — CHUNK C built: intent routing (CA5) + editable config (CA6)
CA5 (lib/agent-router.js): intent→agent by strength, both AUTO (classified/inferred intent) and USER-DIRECTED (explicit agent wins). The map: perplexity=reliable data/research; claude=large codebases (WARP+context injected) AND last resort in fallback; chatgpt=optimal general BUT 900-token limit → chunkForAgent() splits long inputs; gemini=coding+adversarial (secondary to claude for code). Every route carries {agent, why, directed, constraints, inject, fallbackChain}. §10.3 — composes with routing-ir's fitness/availability, does not replace it. CA6 (lib/routing-config.js): the map, fallback order, and token limits are EDITABLE cortex rows (routing_config table, schema-registry pattern) — setAgentForIntent/setTokenLimit write versioned rows (§0.3), getRoutingConfig reads current or built-in defaults, and the router respects the edited config with no code change (§0.4 fluid, §2.2 cortex is truth). §17.11 — the "chatgpt is optimal but 900-token-limited" claim ships WITH the chunking it depends on.

---
## ADDENDUM 2026-07-30 — sigma serves five roles (OB10, docs/nexus-observability-tablet-phasemap.spec)
James's insight, mapped: computeSigma produces ONE score from three input axes (structural/temporal/contextual), but that score serves FIVE roles depending on the consuming component's declared intent: (1) deviation — how far from expected shape, (2) performance — how far from expected timing/throughput, (3) expectations — contract/spec conformance, (4) drift-detection — shift over time (§13.4), (5) leverage — impact weighting for pattern importance (OB8). OB10 will map a sigma_intent per loom component so a spike is reported AS its role (a pipeline's spike = "performance deviation"; a gap-engine's = "drift"; a contract's = "expectation violation") rather than a bare number. The same score, interpreted per component (§16.2 legible, §17.5 provenance). OB11 extends the CA2 tool-guide edge-case pattern to loom components + systems, feeding OB2 gap-detection so a known edge case is diagnosed by name, not as an unknown fault.

---
## ADDENDUM 2026-10-09 — RAID in the one model engine (planned, docs/2026-10-09-one-model-engine-phasemap.spec ME5)
James: "What about hooking in raid?" Planned, not built: RAID's health poll becomes an availability source for the engine's
ladder; every engine attempt is recorded as a RAID decision (raid_decisions); raid.verify becomes a check a caller's policy
can name for consequential outputs (builds), never for chat or pages; RAID's in-memory weight table and the economy ledger
become one learner; decideForContract and copilot's door give one answer per job. Open, his call: which is the brain, and
LAW_I as written here (Ollama first) versus _decide since 2026-09-02 (ChatGPT first). The router (which SYSTEM fulfils a
request) and the contract queue are untouched.
