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
    entry:   bridge/nexus-bridge.js   # directory no longer exists — real, confirmed 2026-09-20
    role:    connective_tissue
    boots:   none   # §FIXED 2026-09-20 (P1) — was "first", false since retirement; James: "wasn't needed"
    purpose: |
      RETIRED. Was: tag system, request queue, push/pull subscriptions,
      handshake protocol, all cross-system communication routed through
      here. That last claim ("no system calls another directly") is FALSE
      for the whole file below and has been since this system's retirement
      — every other system's `depends:` line naming bridge here was equally
      false and is fixed below, not left to imply bridge is still load-
      bearing. Real replacement for "no system calls another directly":
      MCO7f (docs/nexus-repository-system-build-phasemap.spec) — per-system
      interaction contracts + orchestrator's contract-handshake.js, in
      progress, not yet complete for every system.
    provides: []   # was [tags, requests, subscriptions, handshake, broadcast, pull] — none real since retirement
    depends:  []
    retired:   true
    retiredAt: '2026-09-06'
    retiredReason: "wasn't needed"   # James, verbatim, 2026-09-20 — no deeper root cause on record

  cortex:
    port:    3748
    entry:   cortex/boot.js
    cli:     cortex/cortex.js
    role:    source_of_truth
    boots:   first   # §FIXED 2026-09-20 (P1) — was "second", after bridge; bridge no longer boots at all
    purpose: |
      Append-only memory. 28 JAA tables. Never deletes.
      CobaltBus connects all modules. RAID routes agents local-first.
      Versionium auto-commits on sigma spikes.
    provides: [event_log, memory, gaps, artifacts, versionium, sse]
    depends:  []   # §FIXED 2026-09-20 (P1) — was [bridge], bridge retired 2026-09-06

  guardian:
    ports:   { http: 7820, wss: 7821, dropzone: 7822, memory: 7823 }
    entry:   guardian/server.js
    cli:     guardian/cli.js
    role:    agent_orchestrator
    boots:   second   # §FIXED 2026-09-20 (P1) — was "third", after bridge
    purpose: |
      Dispatches prompts to AI providers via WSS.
      ChatGPT is primary. Claude secondary. Ollama local.
      SEAM chunker, GapHunter, Prompt Archaeology, Queue.
    provides: [job_dispatch, provider_wss, artifacts, seam, ledger, cockpit_ui]
    depends:  [cortex]   # §FIXED 2026-09-20 (P1) — was [bridge, cortex]; guardian/compartment.json's real boundaryFindings also show cortex:13, intelligence:9, clear-glass:1, copilot:1 — cortex is the real, current dependency, the others are cross-system requires MCO7f is converting to contract calls, not boot-order dependencies

  idearium:
    port:    4800
    entry:   idearium/api/index.js
    cli:     idearium/cli/index.js
    role:    idea_os
    boots:   third   # §FIXED 2026-09-20 (P1) — was "fourth", after bridge
    purpose: |
      Idea lifecycle management. Tension engine scores ideas 0..1.
      SNR tracks system signal quality.
      CLI is source of truth — API is projection.
    provides: [ideas, specs, gaps, snapshots, snr, tension]
    depends:  [cortex]   # §FIXED 2026-09-20 (P1) — was [bridge, cortex]

  emerge_ide:
    port:    4242
    entry:   emerge-ide.js
    role:    compiler_and_ide
    boots:   fourth   # §FIXED 2026-09-20 (P1) — was "fifth", after bridge
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

  # §ADDED 2026-09-20 (P1) — real systems this file never listed. Port/entry/
  # dependsOn sourced directly from each system's own <s>/compartment.json
  # (MCO7b, derived from the registry + a code scan, not hand-authored) and
  # purpose from each system's own spec/<s>.spec meta.purpose — nothing here
  # invented. copilot, architect, eravos, diagnostic, and the rest of MCO7g's
  # unnamed list are deliberately still absent — out of scope for this pass,
  # not forgotten.

  intelligence:
    port:    3753
    entry:   intelligence/server.js
    role:    cognition_layer
    purpose: |
      NEXUS's real cognition layer, consolidated into its own system:
      pattern learning, RFR2/relational-field, gap detection, CFR
      coherence/tension/regime tracking.
    provides: [patterns, gaps, crystals, cfr, adversarial, sse]
    depends:  [cortex, guardian]   # guardian:1 boundary edge is real but thin — see guardian/compartment.json

  loom:
    port:    3752
    entry:   loom/server.js
    role:    component_wire_registry
    purpose: |
      Sovereign component/hook/wire/seam registry + contracts + phasemap
      aggregation. The real cross-system dependency graph (106 static
      require/import edges among the 9 MCO7 systems as of 2026-09-19) lives
      here — loom/data/registry.json.
    provides: [component_registry, hook_graph, wire_graph, phasemap, contracts]
    depends:  [cortex]

  versionium:
    port:    3754
    entry:   versionium/server.js
    role:    version_control
    purpose: |
      Causal version control — temporal replay, calendar playback,
      sigma-gated auto-commit, per-file snapshots (MCO-B) and restore
      (MCO-C). Was referenced in design conversation for a long time
      before this system existed for real; confirmed no prior
      implementation existed under this name before it was built.
    provides: [snapshots, restore, file_delta, sigma_gate]
    depends:  [intelligence, cortex, guardian]

  clear-glass:
    port:    7704
    entry:   clear-glass/src/main/index.js
    role:    sovereign_browser
    purpose: |
      Sovereign NEXUS browser — Electron + Chromium + Firefox fingerprint +
      TLS JA4 + ErosmancerOS wire (SISO-native). One of the most actively
      developed systems in this codebase (67+ real components, confirmed
      in its own registry-components.js).
    provides: [browsing, autofill, downloads, provider_hosting, fingerprint]
    depends:  [copilot]

  cos:
    port:    null   # CLI/library system by deliberate design — see cos/spec/cos.spec's own §meta note. No HTTP surface of its own; cos/vaultd/server.js is a separate, optional daemon for the vault subsystem only.
    entry:   cos/host/index.js
    cli:     cos/cli/index.js
    role:    compartment_os
    purpose: |
      Isolated sandboxes with their own process/network/runtime boundary,
      real persistent state on disk, real snapshots. 16 archetypes, 11
      blueprints. "COS-2: CLI first. COS-13: Host service is the
      authority. CLI is a client of the host." Any process calls
      createHost() (cos/host/index.js) directly, in-process — multiple
      processes share state via the same on-disk file, not a network
      call. James, 2026-09-20: "cos is the source of all compartments,
      nothing less." Real, current usage: idearium's spec-engine
      (compiler-t0.js) creates one real compartment per spec build,
      through the real gate pipeline — not idearium itself as a
      compartment (that would mean short-circuiting the birth gates for
      an always-on trusted system, which is not what this pass built).
    provides: [compartments, sandboxing, snapshots, archetypes, blueprints, gates]
    depends:  []

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

    bridge:  # §RETIRED 2026-09-06, kept present-but-marked per §A-4 — none of these are real commands, no bridge process exists to run them
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
      - nexus start:core               # cortex + guardian — §FIXED 2026-09-20 (P1), was "bridge + cortex + guardian"
      - nexus status                   # all server health checks
      - nexus stop                     # graceful shutdown all
      - nexus test                     # 142 unit tests
      - nexus test:integration         # 17 integration tests

# ── Event Channels ────────────────────────────────────────────────────────────

channels:
  guardian.job.complete:    { from: guardian, to: [cortex, versionium] }
  guardian.artifact:        { from: guardian, to: [cortex] }   # §FIXED 2026-09-20 (P1) — was [cortex, bridge.tags]; bridge.tags has not existed since 2026-09-06
  guardian.gaps:            { from: guardian, to: [cortex, ledger] }
  guardian.ledger:          { from: guardian, to: [jaa.ledger_entries] }
  guardian.session.named:   { from: guardian, to: [jaa.sessions] }
  cortex.gap.found:         { from: cortex,   to: [guardian.ledger] }
  cortex.gap.resolved:      { from: cortex,   to: [] }   # §FIXED 2026-09-20 (P1) — was [bridge.broadcast]; no real replacement target confirmed yet
  idearium.idea.created:    { from: idearium, to: [cortex] }   # §FIXED 2026-09-20 (P1) — was [cortex, bridge.tags]
  idearium.snapshot.pushed: { from: idearium, to: [cortex.versionium] }
  # §RETIRED 2026-09-06, kept present-but-marked per §A-4 — bridge no longer emits or routes any of these
  bridge.request.created:   { from: bridge,   to: [all_subscribers], retired: true }
  bridge.request.accepted:  { from: bridge,   to: [all_subscribers], retired: true }
  bridge.request.complete:  { from: bridge,   to: [all_subscribers], retired: true }

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

## ADDENDUM 2026-09-10 — bridge retirement + a stale claim, per CLAUDE.md §12.5

Two things in the `systems.bridge` entry above were stale, flagged by the
2026-09-10 architecture-brainstorm synthesis and confirmed directly against
`contracts/nexus-interaction-contract.js` before editing:

1. `boots: first` was false. Bridge was retired 2026-09-06
   (`§RETIRED 2026-09-06`, `RETIRED_PORTS.bridge`/`SYSTEMS.bridge.retired` in
   the interaction contract; the real archived code is
   `_archive/bridge-retired-2026-09-06/`). Marked `retired: true` /
   `retiredAt: '2026-09-06'` above, matching the interaction contract's own
   convention, rather than deleted — bridge's entry (routes, provides,
   purpose) is kept as real historical record of what it did while live.

2. "No system calls another directly" is this spec's own stated design
   principle, not independently re-verified against current call sites in
   this pass — left as-is rather than guessed at either way. Whether it's
   still true with bridge gone (did its request-queue/handshake role get
   redistributed to direct calls, or genuinely retired along with it?) is a
   real, open question, not resolved here.

Not touched in this pass, and still real per the 2026-09-10 synthesis:
every other system's `depends: [bridge, ...]` entry still lists bridge as a
live dependency. Whether those should drop bridge from `depends` or keep it
as a historical/retired dependency edge is exactly the kind of "one coherent
picture" fix the synthesis flags this file as needing — scoped here to only
the two claims that were independently confirmed, not the full dependency
graph. See `docs/2026-09-11-sovereign-node-architecture-phasemap.spec` P1
for that fuller pass.

## ADDENDUM 2026-09-20 — P1 closes both open questions above

Both real open questions this addendum left standing are resolved, doing
the actual P1 pass this addendum pointed at:

1. `depends: [bridge, ...]` dropped bridge from every real system above
   (cortex, guardian, idearium) — kept `depends: [cortex]` etc. where a real
   dependency remains, dropped to `[]` where bridge was the only entry.
   Bridge's own `depends: []` and `provides: []` are unchanged (still
   accurate — it never depended on anything, and provides nothing now).

2. "No system calls another directly" — checked directly against real
   evidence rather than left open: it's false today (every dependent
   system's own file requires the others it needs — guardian's
   `compartment.json` alone shows 24 real cross-system requires) and was
   never fully true even while bridge was live (bridge routed
   tags/requests/subscriptions/handshake; it never claimed to intermediate
   every function call). Corrected in bridge's `purpose:` above to state
   what's real: MCO7f (per-system interaction contracts + handshake
   verification, docs/nexus-repository-system-build-phasemap.spec) is the
   actual, in-progress replacement for that principle, not yet complete.

Also added: intelligence, loom, versionium, clear-glass — four real,
running systems this file never listed at all, sourced from each one's own
`compartment.json` (MCO7b, derived not authored) and `spec/<s>.spec`
meta.purpose. copilot, architect, eravos, diagnostic, and MCO7g's remaining
unnamed systems are still absent — out of scope for this pass, not
forgotten; James's actual list for now is cortex, guardian, intelligence,
ollama, clear-glass, idearium, loom, versionium (diagnostic and a healing
system are named as coming later).

## ADDENDUM 2026-09-11 — docs/ARCHITECTURE.md retired and deleted (exception to §A-4)

`docs/ARCHITECTURE.md` ("NEXUS Architecture — v2.0", last real commit
16502d7, 2026-07-20) was removed from the tree, not moved to `_archive/`.
Every other retirement this session (bridge, 12 root docs, 7 NEXUS-overview
docs) kept the file present-but-marked per §A-4 / §0.3. This one is a
deliberate, James-confirmed exception: the file wasn't just superseded, it
was actively wrong about files sitting next to it — claimed
`jaa/schema-full.sql` is "cortex's full 28 table schema" (real count: 15,
two of those rows are guardian's) and `jaa/schema.sql` is "guardian 15
tables" (real count: 9). It also described a 7-system NEXUS
(bridge/cortex/guardian/idearium/orchestrator/emerge/cockpit) under a root
folder name (`nexus-final/`) that doesn't match this repo, with no mention
of copilot, clear-glass, loom, versionium, diagnostic, intelligence,
eravos, architect, sentinel, or nexus-healer.

Nothing is actually lost — full content is recoverable via
`git show 16502d7:docs/ARCHITECTURE.md` or `git log --all --full-history --
docs/ARCHITECTURE.md`. This addendum is the real, permanent pointer to
that history, since there's no `_archive/` entry to point to instead.

## ADDENDUM 2026-09-11 (2) — guardian.sessions reconciled, one real gap left open

Per-system schema work (`guardian/schemas/`) found `sessions` had three
real, non-unified write sites in `guardian/server.js` — not just field-
casing drift, but a confirmed duplicate-write bug: `POST
/sessions/:chatId/name` performed its own direct insert/update AND then
emitted `guardian.session.named`, which did a second, correctly-shaped
write to the same row. Every call wrote the session twice, once malformed.

Fixed directly in `guardian/server.js`, not just re-described:
- removed the redundant direct write at `/sessions/:chatId/name` — it now
  only emits the gate, the one canonical write path
- `/api/account-identity` (a genuinely separate concern — account_uuid,
  tab_id) kept its own logic, renamed its two drifted fields (`uuid`→`id`,
  `tabId`→`tab_id`, `chatUrl`→`chat_url`) to match
- `guardian/schemas/session.js` status moved from `REAL — DRIFT` to `REAL`

One real semantic question was found and deliberately NOT resolved:
`started_ts` (set by the naming gate's insert) and `created_ts` (set by
account-identity's insert) may or may not represent the same real event —
a session can be first-created by either path. Merging them without
knowing which should count as "session existence" would be a behavior
change, not a naming fix. Logged as a real `.gap` node —
`data/nodes/ca30a433-1ac5-4be4-a3c1-78a59ceb1cf4.gap` — rather than left
only in prose, per the same discipline the `.gap` schema already exists
to enforce.

Verification boundary, stated rather than implied: static inspection +
`node --check` pass; both write sites confirmed reconciled by re-reading
the file after editing. No route-level test exists for either
`/sessions/:chatId/name` or `/api/account-identity` (checked `tests/` —
nothing hits either route) and none was run here — there's no live
guardian server in this environment to run it against. Status is
reconciled and syntactically verified, not exercised. That gap in
verification is itself part of the real state, not a footnote to hide.
