spec:
  meta:
    name:        diagnostic-phase-map
    version:     1.0.0
    uuid:        nexus-diagnostic-phase-map-v1-0000-2026-0617
    file:        service/nexus-diagnostic.js
    port:        7825
    purpose: >
      The active remediation engine for NEXUS. Detects problems, attempts fixes,
      escalates through a defined ladder, and never silently fails.

# ══════════════════════════════════════════════════════════════════════
# PHASE MAP — DIAGNOSTIC REMEDIATION ENGINE
# ══════════════════════════════════════════════════════════════════════

phases:

  # ── DETECTION ──────────────────────────────────────────────────────

  detect_1:
    name:    System health poll
    cadence: 15s (pollAll)
    method:  HTTP probe each system's healthPath
    output:  systemState[name] = { online, friction, sigma, stuckCount }
    systems:
      - orchestrator :9000 /health
      - bridge       :9999 /health
      - cortex       :3748 /api/health
      - guardian     :7820 /health
      - idearium     :4800 /api/health
      - architect    :3747 /api/health
      - emerge       :4242 /health
      - diagnostic   :7825 /status  (self)
      - forge-shell  :9000 /ui/forge-shell.html  (virtual — orch proxy)

  detect_2:
    name:    Ledger watching
    cadence: fs.watch (real-time, debounced 500ms per system)
    method:  Watch data/<system>/ for new .jsonl writes
    output:  baseline.observe() per event — updates friction + sigma

  detect_3:
    name:    Queue scan
    cadence: 15s (within pollSystem)
    method:  Scan data/<system>/queue/ for items stuck >2min in 'processing'
    output:  Gap opened: stuck_queue_item (severity: high)

  detect_4:
    name:    Cortex gap sync
    cadence: 30s (remediationScan)
    method:  GET cortex :3748/api/gaps?status=open
    output:  Untracked gaps added to openGaps, broadcast on SSE

  detect_5:
    name:    Syntax check (critical files)
    cadence: 5min (within remediationScan)
    files:
      - orchestrator.js
      - lib/ncp.js
      - lib/request-handler.js
      - cortex/boot.js
      - guardian/server.js
      - lib/intent-classifier.js
    output:  Gap opened: syntax_error (severity: critical), logged to data/diagnostic/remediation.jsonl

  detect_6:
    name:    Forge Shell availability
    cadence: 30s (remediationScan)
    method:  Check ui/forge-shell.html exists + orchestrator online
    output:  Gap logged if missing or orch offline

  # ── REMEDIATION LADDER ─────────────────────────────────────────────
  # Each level is attempted in sequence. On success → stop.
  # On failure → add friction, escalate to next level.
  # Friction accumulates in fault_taxonomy (JAA long-term memory).

  remediation_0:
    name:    Known fix replay
    trigger: Any gap with type matching a previously applied forge_patches entry
    action:  Replay the most recent successful patch for this fault class
    friction_cost: 0.10 if replayed fix fails
    on_success: reduceFriction(-0.15), return resolved

  remediation_1:
    name:    Safe fix (no code changes)
    trigger: friction < 0.4 (ELEVATED threshold)
    actions:
      stale_module:      POST /api/system/restart → orchestrator, probe health
      timeout:           clear_and_retry
      api_degraded:      probe_and_wait (5s × 6)
      queue_saturated:   drain_queue
      memory_pressure:   evict_working_mem
      bottleneck:        log_and_throttle
      circuit_breaker:   wait_and_reset (30s)
      import_error:      check_deps
      recurring_failure: restart_module
    friction_cost: 0.20 if restart attempted but health not confirmed
    on_success: addFriction(+0.05), return resolved

  remediation_2:
    name:    Snapshot + Forge
    trigger: friction < 0.4 (after level 1 fallthrough)
    action:
      1. Take cortex snapshot (safe rollback point, §2.1)
      2. Dispatch forge_repair event to event_log
      3. Self-heal picks up and attempts AI patch (if NEXUS_FORGE_APPLY=true)
    friction_cost: 0.35
    returns: pending_review (human must approve patch)

  remediation_3:
    name:    Diagnostic deep scan
    trigger: friction ≥ 0.4 and < 1.0
    action:
      1. Run all 12 diagnostic engines (lib/diagnostic-engines.js)
      2. Causal chain trace from failure event
      3. Fault tree evaluation
      4. Write full evidence to fault_taxonomy (JAA long-term)
    friction_cost: 0.50

  remediation_3_5:
    name:    RAID routing + Guardian dispatch
    trigger: After level 3, friction < 1.0
    action:
      1. GET :3748/api/raid/decide?intent=<gap.type + path>
         → RAID decides best agent (ollama/claude/chatgpt)
      2. POST :7820/command with diagnose_and_repair prompt
         → Guardian dispatches to chosen provider via NCP
      3. If guardian unreachable: attempt to open guardian URL
         then retry once
    returns:
      pending_agent: job dispatched, gap.status = pending_agent
      failed:        drop to level 4
    note: >
      This is the diagnostic service's bridge to the full agent system.
      Gap context, type, path, body, attempts are all included in prompt.

  remediation_4:
    name:    Failure mode
    trigger: friction ≥ 1.0 OR level 3.5 failed
    action:
      1. Write failure_mode record to JAA failure_modes table
      2. Mark gap status = failure_mode
      3. Generate human action item (specific per fault class)
      4. Log escalation.failure_mode event
      5. No further automated attempts — system enters DEGRADED for this fault class
    output:
      - failure_modes table entry with full evidence chain
      - humanAction string (specific, actionable, not generic)
      - Console error: [diagnostic] FAILURE MODE: <type>

  # ── ESCALATION FLOW SUMMARY ────────────────────────────────────────

  escalation_flow: |

    DETECT (poll 15s / fs.watch real-time / gap sync 30s)
       │
       ▼
    OPEN GAP → write to openGaps + cortex + SSE broadcast
       │
       ▼  (remediationScan, 30s)
    ┌─ Level 0: Known fix? ──── known fix exists? → replay → resolved?
    │     No known fix ↓
    ├─ Level 1: Safe fix ─────── friction < 0.4 → restart/probe → resolved?
    │     Not resolved ↓
    ├─ Level 2: Snapshot+Forge ─ friction < 0.4 → snapshot → forge → pending_review
    │     High friction ↓
    ├─ Level 3: Deep scan ────── friction 0.4-1.0 → 12 engines → fault_taxonomy
    │     ↓
    ├─ Level 3.5: RAID→Guardian ─ raid.decide → guardian /command → agent job
    │     Agent not reachable ↓
    └─ Level 4: Failure mode ─── friction ≥ 1.0 → human action required

  # ── MONITORED SURFACES ─────────────────────────────────────────────

  monitored_surfaces:
    services:
      - orchestrator  :9000  (boot authority, SSE hub)
      - bridge        :9999  (trust relay, must boot first)
      - cortex        :3748  (memory, JAA, gap engine)
      - guardian      :7820  (AI dispatch, NCP)
      - idearium      :4800  (ideas, specs)
      - architect     :3747  (hooks, blueprints)
      - emerge        :4242  (compiler, LLM)
      - diagnostic    :7825  (self)
    ui_surfaces:
      - forge-shell   virtual (orch proxy, file existence check)

  # ── OUTPUTS ────────────────────────────────────────────────────────

  outputs:
    http:
      GET /status      → full system health + gap counts + friction per system
      GET /gaps        → all open gaps (filterable by severity, system, status)
      GET /friction    → per-system friction scores + sigma
      GET /audit       → full audit: syntax, offline, orphaned files, baselines
      GET /self-heal   → gap stats: pending, processing, forge_ready, human_required
      GET /events      → SSE stream of all diagnostic events
      POST /gaps/:uuid/fix → trigger HEAL_REQUESTED on nexus-bus for specific gap

    files:
      data/diagnostic/remediation.jsonl  → all remediation actions taken
      data/diagnostic/ledger/            → ICO kernel ledger
      data/diagnostic/gaps/              → gap snapshots
      data/diagnostic/friction/          → per-system friction history

    cortex_events:
      diagnostic.remediation   → every action taken
      escalation.level_N       → per escalation level attempt
      escalation.failure_mode  → when a fault class reaches failure mode
      escalation.friction.*    → every friction change

  axioms:
    - §1.2 nothing silently fails — all detection and remediation logged
    - §2.1 snapshot before any forge (level 2+)
    - §3.1 diagnostic boots last — all other systems must be up first
    - friction accumulates and never resets silently
    - RAID decides the agent — diagnostic never hardcodes provider
    - failure mode is not failure — it is honest acknowledgment of limits
