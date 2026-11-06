spec:
  meta:
    name:     recall-tool
    version:  1.0.0
    date:     2026-10-26
    release:  "0.60.261"
    uuid:     recall-tool-phasemap-v1-0000-2026-1026-jamesbrooks-001
    owner:    "core (lib/agent-tools/tools/nexus/recall.js) + guardian (GET /api/responses/recent) + idearium (the `recall` row)"
    voice: "The ideas and the calls are James's. `james:` is his, verbatim. `does:` is the coder's reading, his to correct."
    origin: >-
      James (Glass_Engine.md, 2026-10-26): "what if we have a tool for the agents to capture the recent event ledger or orchastrator? using the
      .response nodes, chat ledgers for the repo, and log for context. for persistent memory?" · then: "make the tool."
    axioms: "docs/AXIOMS-v3.1.md — §8.6 reuse (every source already existed; one tool joins them), sovereignty (each source through its owner's route, never another system's files), §1.2 (each source says ok or why not), his leverage rule (a compact projection within a budget)"
  phases:
    RC1_the_recall_tool:
      status: DONE (0.60.261)
      depends_on: []
      files: [lib/agent-tools/tools/nexus/recall.js, guardian/lib/response-sink.js, guardian/server.js, lib/agent-tools/index.js, lib/agent-tools/tool-catalog.js, lib/agent-tools/tool-guide.js, lib/hat-seed.js, idearium/cli/route-commands.js, loom/maps/economy-map.js, tests/modules/test-recall-tool.test.js, tests/modules/run-all.js]
      does: "nexus.recall.tool and the `recall` row: activity (Idearium, a repo's or all), runs (a repo's), the orchestrator ledger counts, the newest .response nodes (Guardian's new GET /api/responses/recent), the chat ledgers (Clear Glass), a log's end; one text within a budget; on the co-pilot hat."
    RC2_memory_written_back:
      status: OPEN
      depends_on: [RC1_the_recall_tool]
      files: [lib/agent-tools/tools/nexus/recall.js]
      does: "Persistent memory proper: a recall's digest saved as a node an agent reads at the start of its next session (with the session it came from). Mapped, not built."
