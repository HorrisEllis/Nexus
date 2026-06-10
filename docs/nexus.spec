# nexus.spec — v2.0.0
# Systems thinking spec for the full Nexus ecosystem
# Format: YAML. Machine-readable by cockpit/spec-parser.
# Author: James Brooks (Erosmancer)

meta:
  name:        nexus
  version:     2.0.0
  status:      active
  uuid:        nexus-spec-v2-0-0-2026-jamesbrooks
  author:      james-brooks
  paradigm:    [event-driven, memory-first, cli-first, bottom-up]
  runtime:     node >= 18

# ── Systems ──────────────────────────────────────────────────────────────────

systems:

  bridge:
    port:    9999
    entry:   bridge/nexus-bridge.js
    role:    connective_tissue
    boots:   first
    purpose: |
      Tag system, request queue, push/pull subscriptions, handshake protocol.
      All cross-system communication goes through here.
      No system calls another directly.
    provides: [tags, requests, subscriptions, handshake, broadcast, pull]
    depends:  []

  cortex:
    port:    3748
    entry:   cortex/boot.js
    cli:     cortex/cortex.js
    role:    source_of_truth
    boots:   second
    purpose: |
      Append-only memory. 28 JAA tables. Never deletes.
      CobaltBus connects all modules. RAID routes agents local-first.
      Versionium auto-commits on sigma spikes.
    provides: [event_log, memory, gaps, artifacts, versionium, sse]
    depends:  [bridge]

  guardian:
    ports:   { http: 7820, wss: 7821, dropzone: 7822, memory: 7823 }
    entry:   guardian/server.js
    cli:     guardian/cli.js
    role:    agent_orchestrator
    boots:   third
    purpose: |
      Dispatches prompts to AI providers via WSS.
      ChatGPT is primary. Claude secondary. Ollama local.
      SEAM chunker, GapHunter, Prompt Archaeology, Queue.
    provides: [job_dispatch, provider_wss, artifacts, seam, ledger, cockpit_ui]
    depends:  [bridge, cortex]

  idearium:
    port:    4800
    entry:   idearium/api/index.js
    cli:     idearium/cli/index.js
    role:    idea_os
    boots:   fourth
    purpose: |
      Idea lifecycle management. Tension engine scores ideas 0..1.
      SNR tracks system signal quality.
      CLI is source of truth — API is projection.
    provides: [ideas, specs, gaps, snapshots, snr, tension]
    depends:  [bridge, cortex]

  emerge_ide:
    port:    4242
    entry:   emerge-ide.js
    role:    compiler_and_ide
    boots:   fifth
    purpose: |
      SNR gate compiler for .eg/.emerge files.
      595 keywords, 7 axioms. IR decompressor.
      Ollama-powered AI assist.
      NOTE: .eg files are spec descriptions, not executable programs.
      Replace with YAML .spec for new work.
    provides: [snr_gate, ir, axiom_check, ide_ui, lsp, voice]
    depends:  []

  ollama:
    port:    11434
    entry:   external
    role:    local_inference
    purpose: Local-first AI inference. No cloud call if Ollama can handle it.
    models:  [qwen2.5-coder:1.5b, mistral:7b-instruct-q4_K_M]

# ── Providers ─────────────────────────────────────────────────────────────────

providers:
  chatgpt:
    priority: 1
    method:   userscript_wss
    url:      chatgpt.com
    script:   guardian/userscript-chatgpt.js
    connect:  wss://127.0.0.1:7821

  claude:
    priority: 2
    method:   userscript_wss
    url:      claude.ai
    script:   guardian/userscript-claude.js
    connect:  wss://127.0.0.1:7821

  ollama:
    priority: 3
    method:   http_direct
    url:      localhost:11434
    routing:  RAID_local_first

# ── CLI Contract ──────────────────────────────────────────────────────────────

cli:
  # WANTED: unified binary — `nexus <system> <command>`
  # CURRENT: separate CLIs per system

  unified_command: nexus
  status: not_built

  subcommands:

    bridge:
      - nexus bridge health
      - nexus bridge handshake <system>
      - nexus bridge requests [--status pending]
      - nexus bridge request <type> --from <s> --to <s> --payload <json>
      - nexus bridge accept <uuid>
      - nexus bridge reject <uuid> [--reason <text>]
      - nexus bridge tag <entityId> --tags <csv>
      - nexus bridge tags <entityId>
      - nexus bridge find --tag <tag>
      - nexus bridge subscribe <channel>
      - nexus bridge pull <channel> [--since <ts>]

    cortex:
      - nexus cortex status
      - nexus cortex events [--n 20]
      - nexus cortex post --type <type> --payload <json>
      - nexus cortex gaps [--status open]
      - nexus cortex failures
      - nexus cortex memory search <query>
      - nexus cortex tail <table> [--n 50]
      - nexus cortex ask <prompt>

    guardian:
      - nexus guardian dispatch --provider <p> --command <cmd> --prompt <text>
      - nexus guardian jobs [--status pending]
      - nexus guardian status <jobId>
      - nexus guardian response <jobId>
      - nexus guardian watch <jobId>
      - nexus guardian providers
      - nexus guardian artifacts [--lang <lang>]
      - nexus guardian gaps

    idearium:
      - nexus idea add <text>
      - nexus idea list [--phase <phase>]
      - nexus idea show <uuid>
      - nexus idea phase <uuid> <phase>
      - nexus idea tension <uuid>
      - nexus spec new <idea-uuid>
      - nexus spec build <uuid>
      - nexus gap open <description>
      - nexus gap resolve <uuid> <resolution>
      - nexus push [--message <text>]
      - nexus snr

    system:
      - nexus start                    # boots all servers in order
      - nexus start:core               # bridge + cortex + guardian
      - nexus status                   # all server health checks
      - nexus stop                     # graceful shutdown all
      - nexus test                     # 142 unit tests
      - nexus test:integration         # 17 integration tests

# ── Event Channels ────────────────────────────────────────────────────────────

channels:
  guardian.job.complete:    { from: guardian, to: [cortex, versionium] }
  guardian.artifact:        { from: guardian, to: [cortex, bridge.tags] }
  guardian.gaps:            { from: guardian, to: [cortex, ledger] }
  guardian.ledger:          { from: guardian, to: [jaa.ledger_entries] }
  guardian.session.named:   { from: guardian, to: [jaa.sessions] }
  cortex.gap.found:         { from: cortex,   to: [guardian.ledger] }
  cortex.gap.resolved:      { from: cortex,   to: [bridge.broadcast] }
  idearium.idea.created:    { from: idearium, to: [cortex, bridge.tags] }
  idearium.snapshot.pushed: { from: idearium, to: [cortex.versionium] }
  bridge.request.created:   { from: bridge,   to: [all_subscribers] }
  bridge.request.accepted:  { from: bridge,   to: [all_subscribers] }
  bridge.request.complete:  { from: bridge,   to: [all_subscribers] }

# ── Axioms (active laws) ──────────────────────────────────────────────────────

axioms:
  NO_SILENT_DROP:
    statement: Every failure surfaces as a typed event with a specific message.
    enforced_by: [validator, siso_gate, gap_finder]

  EXECUTION_IS_TRACEABLE:
    statement: Every compartment has id + uuid. Every event has causedBy.
    enforced_by: [validator, jaa_schema]

  RECORD_IS_TRUTH:
    statement: JAA write happens before any behavior. No side effects without persistence.
    enforced_by: [jaa_db, validator]

  GAP_IS_FIRST_CLASS:
    statement: Every gap has a pressure score. Gaps are not exceptions — they are data.
    enforced_by: [validator, gap_finder, cortex_jaa]

  PROOF_REQUIRED_FOR_PROMOTION:
    statement: No component promotes to production without passing validation.
    enforced_by: [validator]

  GRAMMAR_APPLIES_TO_ITSELF:
    statement: The spec validates itself against its own rules.
    enforced_by: [emerge_kernel]

  CLI_IS_TRUTH:
    statement: Every feature exists as a CLI command before it exists in the UI.
    enforced_by: [interaction_contract, hotswap_test]

# ── Gaps (open work) ──────────────────────────────────────────────────────────

gaps:
  - id: GAP-001
    title: No unified CLI binary
    pressure: 0.9
    status: open
    description: |
      Each system has its own CLI. No single `nexus` binary.
      Developer must know which CLI to use for each operation.
    proposed_fix: |
      Build cli/nexus.js — reads package.json scripts and interaction contracts
      from all systems, routes `nexus <system> <command>` to the right CLI.

  - id: GAP-002
    title: Idearium ESM requires special boot
    pressure: 0.7
    status: open
    description: |
      idearium/api/index.js uses ES modules (import/export).
      Node requires --input-type=module or .mjs extension.
      npm run idearium calls `node idearium/index.js` which re-exports ESM.
    proposed_fix: |
      Add CJS wrapper at idearium/index.cjs that uses dynamic import().
      Or convert idearium to CJS.

  - id: GAP-003
    title: Emergence .eg files don't execute
    pressure: 0.85
    status: decision_needed
    description: |
      .eg files are spec descriptions compiled to IR + JSON.
      They describe systems but don't run them.
      The JS runtime must be written separately.
      Writing .eg and then writing the JS is double the work.
    proposed_fix: |
      Replace .eg files with YAML .spec (already used in cockpit/cockpit.spec).
      Keep the SNR gate concept as a YAML linter.
      Drop emerge-kernel.js from active boot path.

  - id: GAP-004
    title: Guardian → Cortex realtime bridge not fully validated
    pressure: 0.6
    status: open
    description: |
      Bridge crossSync is wired but hasn't been tested with a live job.
      Guardian completes a job → POST to cortex is async and fire-and-forget.
      If cortex is down, the sync is silently dropped.
    proposed_fix: |
      Use bridge request queue for sync. Submit memory.ingest request.
      If cortex is down, request stays pending and retries.

  - id: GAP-005
    title: Userscript GTCI inject not fully wired
    pressure: 0.7
    status: open
    description: |
      guardian-userscript.eg describes the explicit inject flow.
      The actual userscript-chatgpt.js has the basic inject but not:
      - GTCI context prepend (gap questions before every prompt)
      - DOM mapper stable poll → GUARDIAN_DONE channel close
      - Console sync to cortex SSE
    proposed_fix: |
      Apply guardian/userscript-patch.js to userscript-chatgpt.js.
      Wire openDataChannel() → explicitInject() → DOM mapper.

  - id: GAP-006
    title: No unified healthcheck command
    pressure: 0.5
    status: open
    description: |
      Must manually curl 5 different ports to check system health.
    proposed_fix: |
      nexus status — hits all 5 health endpoints, reports pass/fail per system.

# ── Test Coverage ─────────────────────────────────────────────────────────────

tests:
  unit:
    file:    tests/kernel.test.js
    count:   142
    passing: 142
    covers:
      - spec loading (10 tests)
      - tokenizer (16 tests)
      - snr_gate (10 tests)
      - parser_ir (10 tests)
      - validator_axioms (8 tests)
      - full_compile_pipeline (12 tests)
      - adversarial_inputs (18 tests)
      - file_emission (4 tests)
      - real_eg_files (40 tests — first 20 files × 2)
      - emerge_spec_integrity (6 tests)

  integration:
    file:    inline (build session)
    count:   17
    passing: 17
    covers:
      - bridge_online
      - cortex_online
      - guardian_online
      - cortex_event_write_read
      - bridge_handshake
      - tag_store_and_find
      - request_lifecycle_pending_accepted_complete
      - guardian_job_created
      - guardian_jobs_list
      - bridge_stats
      - bridge_pull_events

## ── v3.1 INTEGRATION — 2026-06-09 ────────────────────────────────────────────
REQUEST: integrate everything into ui/index.html — idearium (drag-drop, upload,
repo suite), versionium, cortex/data persistence, forge, cfr, diagnostics; then bugs.

### Components added/changed
| component_id        | file                                  | change |
|---------------------|---------------------------------------|--------|
| cortex.admin.routes | cortex/foundation/admin-server.js     | +6 routes: versionium/{log,commit}, files/{list,upload,get}, projects, ess/analyse. _readBody Buffer.concat + 25MB cap (BUG-01/06 cross-applied). deps:{fileStore,fileRefs} injected. |
| cortex.boot         | cortex/boot.js                        | CRITICAL: opens the SHARED jaaDB singleton at cortex/data (was: private `new JaaDB` → dual-DB split, all module/API writes volatile). AdminServer gets store deps. |
| jaa-db              | cortex/memory/jaa-db.js               | open(dir) accepts dir override for singleton. |
| orchestrator.proxy  | orchestrator.js (+ui/ copy)           | +7 /api/cortex/* proxies (versionium, files, projects, ess). AXIOM CLI=UI=API held. |
| packaging           | cli/boot-systems.js, lib/pulse.js     | moved from ui/ to require-resolvable paths (zip shipped them only in ui/). |
| ui.shell            | ui/index.html                         | see below. |

### ui/index.html — v3.1
- CRITICAL FIX: Object.assign(window,{...}) exposure block — shell IIFE exposed
  only `go`; all ~60 inline handlers were ReferenceError-dead.
- Implemented 14 dead-button functions: cxLoadVersionium, cxCommit, cxVerChain,
  cxLoadFiles, cxUploadFiles(+dropzone), ideToggleView(+kanban), ideClearConfirm,
  ideOpenGapBar/ideSubmitGap, ideRunESS, ideRunPipeline, ideLoadSNR, ideLoadTension,
  ideLoadKernels/ideRunKernels, ideClearStream/cxClearStream.
- NEW: ide REPO subtab (project_registry × versionium_file_index × commits),
  ide UPLOAD button + board-wide file drop (file→idea + cortex object + linking event),
  guardian FORGE subtab (heading/divider/size chunker → per-chunk dispatch → SEAM
  verdict → versionium commit on all-verified), grid drag→drop = idea link,
  kanban column drop = phase gate (logged to cortex).
- Pipeline: SPEC→CHUNK→DISPATCH→VERIFY→COMMIT; completion commits to versionium
  (idearium↔versionium hook) and emits pipeline.completed to cortex.
- Diagnostics (Bugs.md req): first-script console interceptor ring (error/warn/
  onerror/unhandledrejection w/ file:line), DOM audit (dead inline handlers,
  duplicate ids, runtime-error pressure), wired into DIAGNOSE + diagRun output.
- Bug-class sweep: toast XSS (server error strings → innerHTML) escaped opt-in;
  13 unescaped innerHTML sinks esc()'d (tags, status, severity, uuid-in-attr,
  resilience JSON, gap meta); BUG-10 class: cosmetic init try/caught so a throw
  cannot abort boot; ideRefresh/idePhase respect active view+filters.
- Contracts: C.CORTEX.{versionium,files,projects,ess}; API: versioniumLog/Commit,
  cortexFiles/Upload/FileGet, cortexProjects, essAnalyse (exported on NX_API).

### Verified (live)
- cortex routes E2E: commit→log→chain, upload→roundtrip byte-identical, projects,
  ESS. Persistence across restart: commit B parent = commit A post-restart;
  rows on disk in cortex/data/*.jsonl.
- orchestrator proxies E2E via :9000 incl. upload + commit.
- jsdom UI smoke: 0 dead handlers, 0 dup ids, 0 DOM-audit issues, all new fns
  callable, view toggle + chunker + nav exercised.

### Residue (pending[], not errors)
- root data/ vs cortex/data: historical jsonl seeds exist in both; cortex/data is
  now authoritative. Migrate root data/*.jsonl if history matters.
- ui/orchestrator.js vs root orchestrator.js: root is canonical run location
  (./lib, ./cli resolve there); ui copy kept in sync this pass.
- VERIFY stage samples guardian queue once; full SEAM verdict polling lives in
  FORGE dispatch path.
