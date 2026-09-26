spec:
  meta:
    name:        mcp
    version:     1.0.0
    uuid:        nexus-mcp-v1-0000-2026-0625-jamesbrooks-001
    phase:       67
    status:      active
    port:        7821
    entry_point: lib/mcp-server.js
    started_by:  guardian/server.js (co-pilot boot phase)

  purpose: >
    Phase 67 — MCP Tool Bridge.
    Wraps NEXUS routes as MCP (Model Context Protocol) tools.
    A Claude session calls nexus_copilot, nexus_gaps, nexus_status
    instead of grep-exploring the filesystem from scratch each time.
    One session's accumulated context becomes permanent and reusable.

  transport:
    protocol:   MCP 2024-11-05
    primary:    HTTP SSE on :7821
    endpoint:   http://127.0.0.1:7821/sse  (Claude Desktop connects here)
    rpc:        http://127.0.0.1:7821/mcp  (JSON-RPC 2.0 POST)
    health:     http://127.0.0.1:7821/health
    tools_list: http://127.0.0.1:7821/tools

  tools:
    nexus_copilot:
      description: Primary tool. Ask the co-pilot anything. 7-layer context.
      replaces: grep, cat, find across the repo for system state questions
      cost: zero tokens for data questions (token-first architecture)

    nexus_status:
      description: Health of all NEXUS services
      cost: 4 HTTP calls, returns in <100ms

    nexus_gaps:
      description: Open structural gaps by severity
      filters: severity (high/medium/low/all), limit

    nexus_jobs:
      description: Recent Guardian jobs
      filters: status (pending/complete/error/all), limit

    nexus_patterns:
      description: Crystallized intelligence patterns with confidence scores
      requires: 2+ minutes uptime for patterns to crystallise

    nexus_rca:
      description: Root cause analysis findings from the intelligence engine
      notes: reads cortex_memory table, populated by _scanRCA() every 2min

    nexus_cfr:
      description: CFR-Ω field state — sigma, regime, coherence, friction, entropy

    nexus_conversations:
      description: Recent co-pilot conversation history from chat_log JAA table
      notes: persists across sessions, filterable by provider

    nexus_artifacts:
      description: Saved code artifacts from Guardian artifact store
      filters: query string, limit

    nexus_ideas:
      description: Search Idearium — idea and spec store
      required: query string

    nexus_save_idea:
      description: Save insight, decision, or spec fragment to Idearium
      notes: tagged with mcp + claude-session automatically

    nexus_build_organism:
      description: Describe an organism, get a FORGE build plan
      follows: eravos.nexus.build-contract.spec FORGE phases 0-7
      also_saves: description to Idearium compartment mcp-builds

    nexus_read_spec:
      description: Read a spec by name from Idearium or docs/

  claude_desktop_setup:
    config_file: docs/mcp-claude-desktop-config.json
    windows_path: '%APPDATA%\Claude\claude_desktop_config.json'
    step_1: Start NEXUS (npm start or autopilot)
    step_2: Verify MCP running — curl http://127.0.0.1:7821/health
    step_3: Add mcpServers config to Claude Desktop config
    step_4: Restart Claude Desktop
    step_5: In any Claude session — call nexus_status to verify connection

  notes:
    - MCP server starts automatically when Guardian boots (co-pilot phase)
    - No separate process needed — runs inside Guardian's Node.js process
    - :7821 is bound to 127.0.0.1 only — never exposed externally
    - All tool calls are read-only except nexus_save_idea and nexus_build_organism
    - nexus_build_organism routes through co-pilot which is RAID-gated
    - Each tool call logged to guardian event_log as mcp.tool_call
