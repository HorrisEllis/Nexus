spec:
  meta:
    name:     agent-memory
    version:  1.0.0
    date:     2026-09-27
    release:  0.39.269
    uuid:     nexus-lib-agent-memory-v1-0000-2026-0927-jamesbrooks-001
    file:     lib/agent-memory.js
    status:   built — proven by tests/modules/test-agent-memory.test.js (M-001..M-008)
    phasemap: docs/2026-09-27-agent-hat-memory-download-manager-phasemap.spec (M1-M5)
  purpose: >-
    An agent's memory is the Clear Glass download manager. One write path (record) and one read path (recall) over it,
    for every backend: Ollama, copilot and the Guardian agents.
  contract:
    agentIdFor: >-
      ({ repoUuid, specUuid, sessionId }) -> 'repo-<uuid>' | 'spec-<uuid>' | 'copilot-<session>' | 'copilot'.
      repo-<uuid> is the id lib/repo-agent.js and Guardian already use.
    record: >-
      ({ agentId, provider, prompt, response, jobId, model, compartmentId, repoUuid, kind, path, source, intent, force })
      -> Promise<{ ok, jobId, sinks: { deliver, index, chatlog } }>, never throws. Writes through
      guardian/lib/response-sink.js deliver() (.response node, ledger, Clear Glass downloads list with its pending
      queue), artifact-chat-index recordResponse() (kind chat, raw { prompt, response, agentId, provider, codeBlocks,
      declaredFileName, ... } — the shape guardian/lib/code-artifact.js writes) and lib/chat-logger.js log().
      Guardian providers are skipped unless force — Guardian records its own replies.
    recall: >-
      ({ agentId, query, siblings, budget, semantic }) -> { text, sources, chars }, never throws. text is one block,
      "[MEMORY ...] ... [END MEMORY]", or '' when nothing is recalled. Sections: the agent's own exchanges from the
      index (ranked by words shared with query, then recency; code replies as "wrote <file> (N lines)"); siblings
      [{ path, content }] as exports/requires/top-level definitions; chat_log via vector memory only when it runs and
      matched. budget default AGENT_MEMORY_BUDGET_CHARS (3500). sources names each section's count or why it is absent.
  invariants:
    I1: nothing recalled is generated — every line is a recorded exchange or a real file.
    I2: one write authority — no store of its own; the download manager and chat_log are the stores.
    I3: another agent's exchanges are never recalled.
    I4: a failure in any sink is reported in sinks, never thrown into the caller.
  env:
    AGENT_MEMORY_ROOT: the index root (default the 'clearglass-downloads-index' COS compartment)
    AGENT_MEMORY_BUDGET_CHARS: recall budget (default 3500)
  consumers: >-
    ollama/lib/dispatch.js (record), copilot/lifeline.js + copilot/analysis.js (recall), lib/repo-agent.js (recall,
    record), idearium/api/index.js (recall in speceng.build), idearium/agent-suite/index.js (record).
