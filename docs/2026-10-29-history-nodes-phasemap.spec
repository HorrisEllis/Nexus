# Idearium's history as nodes, one per unit (2026-10-29)

origin: >-
  James, 2026-10-29, after pasting a full run log: "i want all the history in idearium saved as nodes per unit. like a .reponse, .input,
  all of the taxonomy and expand if needed." · "what about .node types for each language/code block for each agent?"

spec: docs/idearium-history-nodes.spec
status: "HN1–HN3 built 0.60.285; HN4 (other history: runs, activity, notes) and HN5 (a screen) open"

## Grounded (read from the code, 2026-10-29)
- Every exchange with a repo's agent is one row in repo_agent_log (lib/repo-agent.js _log): the message cut at 4000 characters, the
  reply at 8000, no tool calls, no code blocks — a lossy record (§0.3).
- Node types .input and .response exist (lib/node-schemas), written for Guardian jobs; .response requires a jobId, which an Idearium
  exchange does not always have. Idearium has its own node registry: idearium/data/nodes/<type>/ is watched and indexed.
- The agent's result carries its tool calls (out.toolCalls) — dropped by the log.

decisions:
  HN_D1_reuse_input_and_response_expand_the_rest:
    status: DECIDED 2026-10-29 by his axioms
    chosen: >-
      .input and .response are reused (his words name them); .response's jobId is widened by a dated addendum to "the job id, or for an
      Idearium exchange with no job its exchange id, said by source". New types for what had none: .exchange (the unit that ties the
      parts), .tool_call, .code_block.
    by_the_axioms: "§8.6 reuse; his 'expand if needed'; §0.3 the old meaning kept (addendum, not rewrite)"
  HN_D2_one_code_block_type_language_is_a_field:
    status: "DECIDED 2026-10-29 by his axioms — his to overturn"
    chosen: >-
      Answering "what about .node types for each language/code block for each agent?": one .code_block type with language (as the agent
      wrote it and normalized) and the agent (provider, model, hat) as fields, not a type per language or per agent. A type per language
      would be the same schema dozens of times; the registry filters by any field, so "every Python block Claude wrote" is a query.
    by_the_axioms: "NC0 the neutral core (any language, one contract); §5.13 syntax is not architecture"

phases:
  HN1_exchange_to_nodes:
    status: DONE 0.60.285
    depends_on: [HN_D1_reuse_input_and_response_expand_the_rest, HN_D2_one_code_block_type_language_is_a_field]
    files: [lib/repo-history-nodes.js, lib/node-export.js, lib/node-schemas/schema.exchange, lib/node-schemas/schema.tool_call, lib/node-schemas/schema.code_block, lib/node-schemas/schema.response]
    spec: docs/idearium-history-nodes.spec
    blocks: [MOD-HISTORY-NODES]
    does: "code blocks parsed; an exchange's nodes built and written to idearium/data/nodes/<type>/"
  HN2_every_exchange_and_the_backfill:
    status: DONE 0.60.285
    depends_on: [HN1_exchange_to_nodes]
    files: [lib/repo-agent.js, lib/repo-history-nodes.js]
    spec: docs/idearium-history-nodes.spec
    blocks: [MOD-HISTORY-WIRE]
    does: "_log writes the nodes with the whole reply and the tool calls; backfill turns old rows into nodes, cut ones marked truncated"
  HN3_route_and_command:
    status: DONE 0.60.285
    depends_on: [HN2_every_exchange_and_the_backfill]
    files: [idearium/api/index.js, idearium/cli/route-commands.js]
    spec: docs/idearium-history-nodes.spec
    blocks: [MOD-HISTORY-DOOR]
    does: "GET /api/repos/:uuid/history-nodes, POST …/backfill; command repo history-nodes"
