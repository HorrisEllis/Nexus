spec:
  meta:
    name:        nexus-copilot-recall
    version:     1.3.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-copilot-recall-v1-0000-2026-0710-jamesbrooks-001
    status:      all 4 chunks complete — see chunk_plan for evidence and the two real bugs found and fixed along the way
    spine:       WARP
    governing:   AXIOMS-v3.1

# ══════════════════════════════════════════════════════════════════════════════
# COPILOT RECALL — give copilot associative memory across all past
# conversations. Map first (verified against real source), then build in chunks.
# ══════════════════════════════════════════════════════════════════════════════

ground_truth_verified:
  - "cortex GET/POST /api/recall EXISTS — CortexPushRecall.recall(intent,{query},tier), 2 real lanes (lexical token-overlap + recency), honestly 2-of-5 (causal/failure/bep need the kernel causal graph which is absent)"
  - "chat_log persists every exchange (copilot/lifeline.js cw.insert('chat_log',...))"
  - "copilot WRITES to recall (note intent -> /api/push) and logs chat_log"
  - "copilot P103 injects only last-N chat_log by POSITION (recency) at session start — it does NOT query /api/recall semantically"
  the_gap: "copilot has no ASSOCIATIVE recall — it cannot pull 'the conversation about X from last week' when X comes up now, only the literal last few messages. The read infra exists; copilot doesn't call it."

# §ADDENDUM 2026-07-12 — the "honestly 2-of-5" ground truth above was
# correct on 2026-07-10 and is superseded now, not silently — re-confirmed
# by running the actual tests, not asserted:
#   - failure lane: cortex/memory/fix-map.js, real token-overlap store, tested
#   - bep lane: cortex/memory/bep-lookup.js + mastermind.js's real writer, tested
#   - causal lane: cortex/memory/causal-lookup.js + the Causal Nexus kernel
#     (brought in this session, 722/722 of its own tests passing), tested
# All 5 lanes are real. lib/agent-tools/tools/query-recall.js's REAL_INTENTS
# list and description were updated to match — drift_gate re-run
# (tests/full.test.js 97/97, tool-registers check, honest-degrade test for a
# genuinely unrecognized intent) — all passing, verified this session.

failure_modes_to_avoid:
  - "do NOT claim recall lanes are real without a passing test behind the claim — this spec's own 2026-07-10 version was correct when written and the 2026-07-12 addendum only changed the claim because the underlying tests changed first, not the reverse"
  - "do NOT let a recall query block or slow the answer — recall is best-effort context, not a hard dependency (§1.2)"
  - "do NOT inject stale/irrelevant recall — rank and threshold, or it poisons the prompt"

chunk_plan:
  spine: "each chunk is a WARP-dispatchable unit; drift check (full.test.js 97/97 + module suite) between chunks so a regression is caught at the chunk that caused it"

  chunk_1_recall_tool:
    intent: "a recall agent-tool so copilot can EXPLICITLY query past conversations (query_recall) — the deliberate 'what did we discuss about X' path"
    builds: "lib/agent-tools/tools/query-recall.js -> cortex /api/recall; registered as the 9th tool"
    status: "✅ COMPLETE 2026-07-12 — all 5 lanes real, re-verified"
    drift_gate: "full.test.js 97/97 + tool registers + honest-degrade test — all passing"

  chunk_2_auto_recall_context:
    intent: "copilot AUTOMATICALLY pulls relevant recall into context before answering — associative memory without the user asking"
    builds: "in the prompt-context assembly (P103 region), after last-N chat_log, add a recall query keyed on the current prompt; inject top-K ranked results above a score threshold; best-effort (never blocks)"
    status: "✅ COMPLETE 2026-07-13 — _injectRecallContext() built and wired at all three real P103 call sites in copilot/server.js. Two real bugs found and fixed along the way, not assumed clean: (1) cortex/boot.js's POST /api/recall was silently never reading `query`/`tier` from the request body — every POST caller since 2026-07-10, including chunk_1's own query_recall tool, had been recalling with query:null the entire time; lexical scoring always contributed 0. Fixed to read both from the body. (2) After that fix, the relevant/irrelevant test this chunk's own drift_gate requires caught a second real bug: recency alone was enough to cross the injection score threshold with zero topical relevance, so a genuinely irrelevant prompt was still surfacing unrelated recent content. Fixed by requiring a real topical signal (lexical/causal/bep > 0) in addition to the threshold, not recency alone."
    drift_gate: "full.test.js 97/97 (re-run after both fixes, passing) + real end-to-end test: a relevant past exchange surfaces (confirmed), an irrelevant one does not (confirmed, only after the second fix — first attempt failed this exact test)"

  chunk_3_pattern_logging:
    intent: "log patterns across conversations (the user's 'log patterns' ask) — recurring topics/intents become queryable"
    builds: "reuse mastermind.detectRecurringPatterns (already wired, rfr2 delta) over chat_log-derived events; surface via nexus_intelligence tool. NOTE: this may already be reachable — verify before building, do not duplicate."
    status: "✅ COMPLETE 2026-07-12, with an honest scope boundary — nexus_intelligence's new `causalPatterns` action (lib/agent-tools/tools/query-intelligence.js) reaches the real mastermind.detectRecurringPatterns route (POST /api/intelligence/mastermind/patterns), verified end-to-end against a live route (3-occurrence causal chain correctly detected, 1 pattern found). Named distinctly from the tool's existing `patterns` action (crystallized execution-outcome triples, a genuinely different capability) to avoid a silent name collision. NOT what this chunk originally imagined, though: this operates on event_log (system events), not chat_log (conversation topics) — 'recurring causal system patterns' is real and reachable now; 'recurring conversation topics' is a separate, still-open piece that would need chat_log entries fed into a graph with their own edges."
    drift_gate: "full.test.js 97/97 (re-run, passing) + real end-to-end test against a live mastermind route (passing) + collision check against the existing 'patterns' action (no collision, confirmed by running both)"

  chunk_4_associative_lattice_link:
    intent: "the non-linear layer — associative system-lattice as the co-activation memory (what topics/systems fire together), pairing with recall's lexical/recency"
    builds: "verify system-lattice (wired this session) can be queried by association from copilot; wire only if a real non-redundant query exists. HONEST: if lexical+recency+patterns already cover it, this chunk is DEFERRED, not faked."
    status: "✅ COMPLETE 2026-07-13 — non-redundancy checked, not assumed: the causal recall lane answers event-level connectivity for one tagged row; system-lattice answers standing, aggregate co-activation across systems. Different question, genuinely non-redundant. The real gap wasn't building system-lattice (already real, tested, continuously fed since 2026-07-06) — it was that GET /api/cortex/lattice, the route lib/agent-tools/tools/query-intelligence.js's `lattice` action has called since 2026-07-10, never existed. Built it in cortex/boot.js, verified against system-lattice's real query surface directly (neighbors/clusters/size all confirmed against real fed data)."
    drift_gate: "full.test.js 97/97 (passing) + real test against system-lattice's actual query methods with real nodes/edges, matching exactly what the new route calls"

drift_accounting:
  - "between every chunk: tests/full.test.js must stay 97/97 and the module suite must not lose a passing test"
  - "spec version bumps only after a chunk's real output is confirmed (map-first law)"
  - "if a chunk's premise proves wrong on verification (like part_3's CLI finding), the spec records the correction rather than forcing the build"
