spec:
  meta:
    name:        grammar-engine
    version:     1.2.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-grammar-engine-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Reads component registry grammar tree. Builds trie for O(k)
      command resolution. Tab completion. Live rebuild on SSE.
      Grammar owned by registry. Engine reads. Never writes.
      §CR-006: CLI does not own grammar. Registry does.

  exports:
    - "fetch(orchestratorUrl) → { ok, componentCount }"
    - "load(tree, aliases) → { ok, componentCount }  (test/offline use)"
    - "buildTrie(tree) → TrieNode"
    - "resolve(input) → { componentId, matched, remainder, params, fromAlias } | null"
    - "complete(partial) → string[]"
    - "parseParams(remainder, schema) → { ok, parsed, errors }"
    - "invalidate() → void"
    - "rebuild(orchestratorUrl) → { ok }"
    - "status() → { ready, componentCount, aliasCount }"

  resolution_order:
    1: "Check aliases (single and multi-word)"
    2: "Walk trie token by token"
    3: "Return last valid componentId found"
    4: "Remainder = tokens after matched command"

  intent_preclassification:
    status: built
    phase: 31
    correction: >
      Previously marked fully "pending" in this spec and the roadmap —
      wrong, found by checking the actual code instead of trusting the
      roadmap label. Confidence scoring (_resolveConfidence in this
      file), the >0.8 fast-path threshold, and grammar.low_confidence_demoted
      event logging were ALL already built and wired into
      lib/request-handler.js's Phase B before this session touched
      anything. Only the feedback loop was missing — now built:
      lib/grammar-misfire-tracker.js, wired into request-handler.js's
      existing demotion branch, initialized at orchestrator boot. 6/6
      tests passing (tests/modules/grammar-misfire-tracker.test.js).
    description: >
      grammar.resolve() output handed to the intent gate as a pre-filter,
      not a replacement — clear commands handled faster, unclear ones
      flagged instead of silently misrouted.
    flow: >
      resolve() → {componentId, params, confidence} → intent gate.
      High-confidence (>0.8) → boosted confidence, faster case-library
      match. Low-confidence → intent.low_confidence gap raised BEFORE any
      compartment spawns (docs/seam-component-registry.spec §4) — no
      wasted compartment lifecycle on a misread command.
    feedback_loop: >
      Case-library hit/miss rates feed back into grammar confidence
      weights via lib/grammar-misfire-tracker.js. 3 misfires on the same
      (componentId, matched) pattern escalates to Idearium for review
      (POST /api/ideas, tagged grammar-misfire) and resets the streak so
      a 4th/5th/6th misfire doesn't re-escalate immediately.
    deps: "Phase 45 ✓ · grammar-engine ✓ (this file) · raid ✓ · snr-filter ✓ · request-handler ✓ — complete"

  tests:
    count: 16
    status: "16/16 PASSING"
