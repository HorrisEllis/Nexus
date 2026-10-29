spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # idearium-history-nodes.spec — Idearium's history kept as nodes, one node per unit: what was asked (.input), what came back
  # (.response), each tool the agent called (.tool_call), each code block it wrote (.code_block), and the exchange that ties them
  # (.exchange). Format: emerge's module spec, compiled by lib/emerge/compiler/kg-builder.js at specDepth 1.0
  # (tests/modules/test-substrate-spec.test.js). Phases: docs/2026-10-29-history-nodes-phasemap.spec.
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        idearium-history-nodes
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-29T00:00:00Z
    status:      specced
    uuid:        nexus-idearium-history-nodes-spec-v1-0000-2026-1029-jamesbrooks-001
    origin: >-
      James, 2026-10-29: "i want all the history in idearium saved as nodes per unit. like a .reponse, .input, all of the taxonomy and
      expand if needed." · "what about .node types for each language/code block for each agent?"
    purpose: >-
      Every exchange with a repo's agent becomes nodes a person or an agent can open, search, export and link: the full message, the
      full reply (nothing cut at 4000/8000 characters as the log row is), each tool call with its arguments and result, and each code
      block with its language and the agent that wrote it. The log row stays (it is the index the screens read); the nodes are the record.
    target_runtime: [node]
    language_stack: [javascript]
    paradigm: [SISO, nodes, lose-nothing]
    axioms: ["§0.3 nothing lost", "§1.2 nothing fails silently", "§8.6 reuse (node-export envelopes, the node registry, the .input/.response schemas)",
      "NC0 the neutral core: a language is data, not a type", "§5.13 syntax is not architecture"]
    deps:
      - { name: js-yaml, version: ">=4.1.0", required: true, purpose: "node files" }

    constraints:
      - id: HN-001
        description: "A node holds the whole unit: the message, the reply, a tool call's arguments and result, a code block's code — never cut. A unit too large for one file (over 2 MB) is said, with its size and hash."
        type: hard
        enforced_by: [GATE-HN-WHOLE]
      - id: HN-002
        description: "Writing nodes never fails an exchange: a write error is logged with the exchange id and the reason."
        type: hard
        enforced_by: [GATE-HN-NEVER-BLOCKS]
      - id: HN-003
        description: "One code-block type for every language: .code_block with language (as written and normalized) and the agent (provider, model, hat) that wrote it. A language is a field, never a type."
        type: hard
        enforced_by: [GATE-HN-ONE-CODE-TYPE]
      - id: HN-004
        description: "A backfill from the old log marks what the log had cut (truncated: true) instead of presenting it as whole."
        type: hard
        enforced_by: [GATE-HN-HONEST-BACKFILL]

  schemas:

    - id: Exchange
      name: Exchange
      description: "One turn with a repo's agent, and the ids of the nodes that hold its parts."
      fields:
        exchangeId: "string — the log row's uuid"
        repoUuid:   "string"
        hat:        "string | null — the agent's hat"
        provider:   "string | null — who answered"
        model:      "string | null"
        backend:    "string | null"
        ok:         "boolean"
        error:      "string | null"
        elapsedMs:  "number | null"
        parts:      "object — { input, response, toolCalls[], codeBlocks[], injects[] } node ids"
        ts:         "number"
      behavioral_contracts: ["the exchange id is the key every part shares"]
      error_paths: ["no repoUuid → refused"]

    - id: ToolCall
      name: ToolCall
      description: "One tool the agent called inside an exchange."
      fields:
        exchangeId: "string"
        index:      "number — order in the exchange"
        name:       "string — the tool"
        arguments:  "object"
        result:     "any — the tool's result, whole"
        ok:         "boolean"
        iteration:  "number | null"
      behavioral_contracts: ["a refused tool call is kept with its refusal"]
      error_paths: ["no name → refused"]

    - id: CodeBlock
      name: CodeBlock
      description: "One fenced code block in an agent's reply."
      fields:
        exchangeId: "string"
        index:      "number"
        language:   "string — as written after the fence ('js', 'py', '' when none)"
        lang:       "string — normalized (javascript, python, shell, json, yaml, text …)"
        code:       "string — whole"
        lines:      "number"
        sha:        "string — sha256 of the code"
        agent:      "object — { provider, model, hat }"
      behavioral_contracts: ["the same code in two exchanges is two blocks with the same sha"]
      error_paths: ["an unclosed fence → the block to the end of the reply, said (unclosed: true)"]

  interfaces:

    - id: IF-NODE-EXPORT
      name: node-export
      path: lib/node-export.js
      description: "The node envelope (wrap, toYaml, fileIdOf, KNOWN_TYPES)."
      exports: ["wrap(type, id, payload, meta) → envelope", "toYaml(envelope)", "fileIdOf(id)"]
      behavioral_contracts: ["a type outside KNOWN_TYPES is refused"]
      error_paths: ["invalid envelope → throws"]

    - id: IF-NODE-REGISTRY
      name: node-registry
      path: lib/node-registry.js
      description: "A system's node folders (<system>/data/nodes/<type>/) indexed and watched; a file dropped in goes live."
      exports: ["createNodeRegistry({ system })", "startForSystem(system)"]
      behavioral_contracts: ["the registry validates each node against its schema"]
      error_paths: ["an invalid node is counted, not indexed"]

    - id: IF-REPO-AGENT
      name: repo-agent
      path: lib/repo-agent.js
      description: "The repo's agent: every exchange passes through _log(repoUuid, { message, out, started, hat, backend })."
      exports: ["_log", "history(repoUuid, limit)"]
      behavioral_contracts: ["a log write never takes down a dispatch"]
      error_paths: ["the store unavailable → the log row is skipped, said"]

  modules:

    - id: MOD-HISTORY-NODES
      name: history-nodes
      uuid: nexus-idearium-history-nodes-v1-0000-2026-1029-001
      path: lib/repo-history-nodes.js
      phase: HN1_exchange_to_nodes
      description: "codeBlocks(text) parses fenced blocks; nodesFor(exchange) builds .exchange, .input, .response, .tool_call and .code_block envelopes; write(envelopes, { root }) puts each in idearium/data/nodes/<type>/ where Idearium's registry picks it up; record(...) is what repo-agent's _log calls."
      deps: [{ name: node-export }, { name: node-registry }]
      schema_refs: [Exchange, ToolCall, CodeBlock]
      exports:
        - "codeBlocks(text) → [{ index, language, lang, code, lines, sha, unclosed }]"
        - "nodesFor({ exchangeId, repoUuid, message, text, ok, error, provider, model, hat, backend, toolCalls, injects, elapsedMs, ts, truncated }) → envelope[]"
        - "write(envelopes, { root }) → { written, files, errors }"
        - "record(row, { text, message, toolCalls, root }) → { ok, written, why }"
      gate_pipeline:
        - "GATE-HN1-001: the exchange row → the parts; ids ex:/in:/re:/tc:/cb: + exchange id"
        - "GATE-HN1-002: the reply → code blocks (fence, language, normalized lang, sha)"
        - "GATE-HN1-003: each part → a node envelope (its schema's required fields)"
        - "GATE-HN1-004: write each to idearium/data/nodes/<type>/<file id>.<type>; an error is collected, never thrown"
      behavioral_contracts:
        - "the whole message and reply are in the nodes even when the log row cut them"
      error_paths:
        - "a unit over 2 MB → its node holds the first 2 MB, size and sha, oversize: true"
      acceptance:
        - "an exchange with two tool calls and three code blocks writes 1 exchange, 1 input, 1 response, 2 tool_call and 3 code_block nodes, each valid against its schema"

    - id: MOD-HISTORY-WIRE
      name: history-wire
      uuid: nexus-idearium-history-wire-v1-0000-2026-1029-001
      path: lib/repo-agent.js
      phase: HN2_every_exchange_and_the_backfill
      description: "repo-agent's _log calls record() with the reply's whole text and the tool calls; backfill(repoUuid) turns the old log rows into nodes, marking the cut ones truncated."
      deps: [{ name: history-nodes }, { name: repo-agent }]
      exports: ["_log → record()", "backfill({ repoUuid, root }) → { exchanges, written, truncated }"]
      gate_pipeline: ["GATE-HN2-001: each new exchange → record()", "GATE-HN2-002: backfill skips an exchange already written"]
      behavioral_contracts: ["a second backfill writes nothing new"]
      error_paths: ["a node write error → logged with the exchange id"]
      acceptance: ["a new exchange appears as nodes; a backfill of old rows marks the 8000-character replies truncated"]

    - id: MOD-HISTORY-DOOR
      name: history-door
      uuid: nexus-idearium-history-door-v1-0000-2026-1029-001
      path: idearium/api/index.js
      phase: HN3_route_and_command
      description: "GET /api/repos/:uuid/history-nodes (an exchange with its parts, newest first, filtered by type, lang or provider), POST /api/repos/:uuid/history-nodes/backfill; the command repo history-nodes <repo> [--lang l] [--type t] [--backfill]."
      deps: [{ name: history-nodes }, { name: history-wire }]
      exports: ["routes repo.history-nodes, repo.history-nodes.backfill", "command repo.history-nodes"]
      gate_pipeline: ["GATE-HN3-001: read the node files of the repo (by repoUuid)"]
      behavioral_contracts: ["read-only except the backfill"]
      error_paths: ["no such repo → 404"]
      acceptance: ["the command lists an exchange with its code blocks by language"]

  events:
    idearium:
      - "idearium.history.nodes { repoUuid, exchangeId, written }"

  enforcement:
    gates:
      - { id: GATE-HN-WHOLE, name: whole, severity: fatal, check: "nodes hold the untruncated message, reply, tool result and code", on_failure: "suite red" }
      - { id: GATE-HN-NEVER-BLOCKS, name: never-blocks, severity: fatal, check: "record() never throws into _log", on_failure: "suite red" }
      - { id: GATE-HN-ONE-CODE-TYPE, name: one-code-type, severity: fatal, check: "no node type per language; .code_block carries lang", on_failure: "suite red" }
      - { id: GATE-HN-HONEST-BACKFILL, name: honest-backfill, severity: fatal, check: "a backfilled reply of 8000 characters is marked truncated", on_failure: "suite red" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0"
    - "tests/modules/test-history-nodes.test.js — each module's acceptance"
