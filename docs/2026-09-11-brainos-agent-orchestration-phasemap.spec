spec:

  # ════════════════════════════════════════════════════════════════
  # BRAINOS — Enterprise Agent Orchestration Suite
  # Supersedes docs/brainos-live-control-panel.spec (v0.1.0, specced,
  # never built past phase 5/clear-glass) — that spec's real findings
  # are carried forward below, corrected against current code, not
  # re-derived from scratch (§8.6).
  # ════════════════════════════════════════════════════════════════

  meta:
    name:    brainos-agent-orchestration
    version: 0.1.0
    uuid:    nexus-brainos-orchestration-v1-0000-2026-0911-001
    status:  specced
    james:   "brainos needs to be the entire ui for agent orchestration — clear-glass, agent mesh, ncp, jobs, userscripts, agent router, RAID. deploying nodes on the canvas spawn agents. right-click nodes, context menu, feedback loop, route data, pipelines, nodes auto-detected from heartbeat/pulse."

  # ────────────────────────────────────────────────────────────────
  # CORRECTIONS to the 2026-09-03 spec (checked directly, not assumed)
  # ────────────────────────────────────────────────────────────────
  corrections:
    - "bridge/ referenced as a data source in the old spec — bridge was fully removed (changelog 0.39.52-era). Drop entirely, not a gap to fill."
    - "old spec assumed the canvas would be ui/eravos/runtime/alk-gl.js (WebGL2 particle field) — confirmed still real and unused by BrainOS today. Current ui/brainos/brainos-canvas.js is plain SVG circle-layout (mount/pulse/renderMeshView/onNodeClick only) — read-only, zero write-back, zero context menu, zero node CRUD. The WebGL swap is real, separable work, not a prerequisite for orchestration features below."
    - "deepseek is now a 6th real agent-mesh AGENT_REGISTRY entry (v0.39.86) — route_graph/agent panels must not hardcode the old 5."
    - "agent-mesh.js's queue now has a real 4-tier drainer (v0.39.85) — its mesh.queue.* events (add/processing/retry/diagnostic.*/escalated/complete) are additional real, confirmed-live data this spec's old data_sources section didn't have yet."

  # ────────────────────────────────────────────────────────────────
  # REUSE MAP — every real, already-built piece this draws on (§8.6).
  # Nothing in this list gets rebuilt.
  # ────────────────────────────────────────────────────────────────
  reuse:
    canvas_engine:       "ui/eravos/runtime/alk-gl.js — WebGL2 particle field, real, unused by BrainOS today"
    field_mapping:       "ui/eravos/runtime/canvas-intelligence.js — cfr.entropy/coherence/friction/resonance -> field uniforms, real"
    node_discovery:      "lib/system-registry.js (build/get/list — real aggregator over autopilot kernels, diagnostic systems, versions) + clear-glass/src/network/pulse-registry.js (class PulseRegistry — real per-node heartbeat/idle/dead state) — together ARE the 'auto-detect nodes from heartbeat/pulse' James asked for. No new discovery mechanism needed, only a renderer for what these two already produce."
    agent_spawn:         "clear-glass/src/mesh/agent-mesh.js — spawn()/route()/enqueue(), AGENT_REGISTRY (6 real agents incl. deepseek), the v0.39.85 drainer"
    ncp_jobs:            "guardian/lib/jobs.js (.job files, real), guardian/server.js GET /providers + /jobs"
    userscripts:         "guardian/userscripts.yaml (single real registry, 6 components) — already the source manager.js reads; BrainOS's userscript panel reads the SAME file, not a second list"
    agent_router:        "lib/agent-router.js — real per-agent strength map (routing ADVICE, distinct from agent-intent-contract.js's gate — see that file's own header)"
    raid:                "cortex/core/raid/router.js, envelope.js, officiator.js, worker.js — module list confirmed real; own event-taxonomy.js/HTTP surface still §HONEST unconfirmed, carried forward from the old spec as an open gap, not silently resolved here"
    node_import_export:  "lib/hat-forge.js's real exportHat/importHat (hats), lib/node-export.js's real wrap()/toYaml()/importFromFile() envelope (used by guardian .job files, node-schemas) — the real, existing 'node type' import/export mechanism BrainOS's canvas should call, not a new format"
    tool_forge:          "lib/tool-forge.js — real, declarative (steps: [{call,args}], forge-time existence-checked, zero codegen) — BrainOS's per-node 'capability' panel lists/forges via this, not a second tool-authoring UI"
    intent_gate:         "lib/agent-intent-contract.js — the real AM1 permission gate (allowedIntents on a hat), distinct from agent-router's routing advice; a node's context menu 'route to agent' action must check this before dispatch, not just call route() blind"
    macros_rewind:       "lib/agent-tools/tools/clear-glass/macro.js (real, already copilot's own path), clear-glass rewind (real, per-tab snapshot/restore) — BrainOS's node actions call these directly, no second execution path"

  # ────────────────────────────────────────────────────────────────
  # OPEN GAPS — carried forward + new, named honestly, not assumed away
  # ────────────────────────────────────────────────────────────────
  open_gaps:
    - "RAID's own event/transport shape — still unconfirmed (carried from old spec)"
    - "copilot's own event channel vs riding guardian's job.* events — still unconfirmed"
    - "ollama/RAID/copilot command-index phases (docs/command-index-per-system.spec phases 1-4) — still SPECCED not DONE; route_graph for those 3 systems renders 'not yet indexed' until they are, same honest placeholder the old spec specified, not fabricated"
    - "'intent field with injection configuration' (James, this session) — NEW, no existing module. Nearest real precedent is userscripts' own pre-prompt 'intelligence injection' (per-provider, hardcoded in each userscript) and agent-intent-contract.js's allowedIntents gate — neither is a configurable injection surface today. Scoped as its own phase below, not folded silently into node CRUD."
    - "DOM-observer -> arbitrary endpoint streaming (HTTP/FTP/SFTP/WS), ollama continuous-event-stream injection, clearglass-to-clearglass WebRTC pairing, external-API-to-system data injection (James, prior turn) — none of these exist anywhere in the codebase (checked). Explicitly OUT OF SCOPE for this spec — BrainOS's orchestration UI is the canvas/control layer; these are separate transport/pipeline builds this spec's node context-menu can eventually point AT once they exist, not something this spec silently absorbs."

  # ────────────────────────────────────────────────────────────────
  # BUILD ORDER — bottom-up (§3.1), each phase independently verifiable
  # ────────────────────────────────────────────────────────────────
  build_order:
    - phase: 1
      name: "auto-discovered nodes + right-click context menu on existing canvas"
      why_first: "highest leverage, zero new infra — system-registry.js + pulse-registry.js already produce exactly the real node/heartbeat data James asked for; the only real gap is a renderer + a context menu, on the canvas that already exists"
      scope: "GET endpoint aggregating system-registry.build() + pulse-registry state -> brainos-canvas.js renders one real node per entry (not the current hardcoded REAL_AGENTS/REAL_SYSTEMS arrays); right-click opens a real context menu with actions wired to already-real mechanisms only (spawn agent via mesh.spawn, open job via guardian, run macro, view userscript) — no action invented that lacks a real target function"
      status: "DONE (v0.39.87) — §DRIFT-CORRECTED 2026-09-12: was still marked BUILDING; auto-discovered nodes + right-click context menu (onNodeContextMenu, spawn/respawn/dispatch actions) shipped in 0.39.87, confirmed present in brainos-canvas.js/brainos-app.js this pass, not re-verified beyond that"

    - phase: 2
      name: "node-to-node routing / pipeline edges"
      why_second: "depends on phase 1's real node objects existing on canvas to attach edges to"
      scope: "a drawn edge between two nodes creates a real, persisted routing rule (reuses lib/seam/ Stream/Gate primitives per WARP vocabulary, not a new pipeline engine) — 'feedback loop' = an edge whose target is its own source, same primitive, no special case"
      status: "DONE (v0.39.88) — §DRIFT-CORRECTED 2026-09-12: was still marked SPECCED, not built; clear-glass/src/mesh/route-graph.js + canvas drag-to-connect (onNodeConnect) shipped in 0.39.88, direct response-chaining only per that version's own stated scope (no per-edge filters/branching/transforms yet)"

    - phase: 3
      name: "node import/export"
      scope: "wraps lib/hat-forge.js exportHat/importHat + lib/node-export.js envelope for a canvas node's underlying real object (agent, job, userscript) — reuses both verbatim, no new file format"
      status: SPECCED, not built

    - phase: 4
      name: "intent field + injection configuration"
      scope: "NEW module (no reuse candidate exists) — a per-node config panel for what gets injected into a dispatch (system prompt fragment, tool scope, allowedIntents) before it reaches agent-intent-contract.js's gate. Needs its own hostile-review pass before build, given it directly feeds a permission gate."
      status: SPECCED, not built

    - phase: 5
      name: "WebGL canvas swap (alk-gl.js) + RAID/ollama/copilot panels"
      why_last: "blocked on command-index-per-system.spec phases 1-4 for 3 of the 4 remaining panels; WebGL swap is a real but separable visual upgrade over phase 1's node renderer"
      status: BLOCKED (external dependency) / SPECCED
