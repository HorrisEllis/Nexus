'use strict';
/**
 * loom/maps/observability-map.js — maps the observability/tablet arc's components
 * into LOOM's component/hook/wire registry, one component per FILE, wired only by
 * REAL require() edges (verified against the actual source, not recalled) —
 * mirroring loom/maps/warp-map.js exactly.
 * comp_id: nexus.loom.maps.observability
 * UUID: nexus-loom-map-observability-v1-0000-2026-0730-001
 *
 * WHY (James, 2026-07-30): the registry is how the system stays aware of ITSELF —
 * "everything is connected to everything else". A component declared without its
 * wires is an isolated dot: the system can't see how it connects, so it can't
 * find friction, tension, or gaps in that wiring. The earlier bootstrap seed
 * added these components as bare declarations (id/name/uuid) with NO edges. This
 * map fixes that — every component here carries its real require() edges as wires,
 * so the connection graph is complete and the system can reason over it.
 *
 * Edge rule (same as warp-map): node builtins (fs/path/http/crypto/os) don't
 * count; only real internal NEXUS require() edges are wires. Edges to systems
 * OUTSIDE this set (cfr, mastermind, capability-registry, jaa-db) are declared as
 * wires to those existing component ids so the graph joins the rest of NEXUS.
 */

// [file, namespace.id, requires (real internal edges, verified against source)]
// Edges use the target's registry id. External-but-real targets (cfr/field,
// mastermind, capability-registry) are included so the graph connects to NEXUS.
const FILES = [
  ['copilot/diagnostics.js',       'nexus.copilot.diagnostics',
    ['nexus.copilot.system-status', 'nexus.intelligence.cfr.field', 'nexus.copilot.movement-map', 'nexus.cortex.jaa-db']],
  ['copilot/diagnostic-sweep.js',  'nexus.copilot.diagnostic-sweep',
    ['nexus.copilot.diagnostics', 'nexus.meta.gap.hunter']],
  ['copilot/movement-map.js',      'nexus.copilot.movement-map',
    ['nexus.lib.capability-registry', 'nexus.intelligence.cfr.field', 'nexus.intelligence.cfr.delta']],
  ['copilot/optimizer.js',         'nexus.copilot.optimizer',
    ['nexus.copilot.diagnostics', 'nexus.copilot.movement-map', 'nexus.lib.pattern-leverage', 'nexus.lib.sigma-roles', 'nexus.intelligence.mastermind']],
  ['copilot/adversarial.js',       'nexus.copilot.adversarial', ['nexus.intelligence.adversarial']],
  ['lib/sigma-roles.js',           'nexus.lib.sigma-roles',
    ['nexus.cortex.jaa-db']],
  ['lib/pattern-leverage.js',      'nexus.lib.pattern-leverage', []],
  ['lib/edge-cases.js',            'nexus.lib.edge-cases',
    ['nexus.cortex.jaa-db']],
  ['tablet/homepage.html',         'nexus.tablet.homepage',
    ['nexus.copilot.diagnostics']],   // fetches copilot /api/prompt (diagnostics) + autopilot :7799
  ['tablet/map3d.html',            'nexus.tablet.map3d',
    ['nexus.copilot.diagnostics']],   // renders report.movement + report.bottlenecks
  ['intelligence/relational-field.js', 'nexus.intelligence.relational-field',
    ['nexus.lib.rfr2-bridge', 'nexus.intelligence.mastermind']],  // RFR2 wired into intelligence (causality + sigma) — §2026-08-22 moved from cortex/intelligence/ per intelligence.spec
  ['lib/gemini-toolbox/injection.js', 'nexus.lib.gemini-injection',
    ['nexus.lib.gemini-toolbox', 'nexus.lib.gemini-agent-contracts', 'nexus.lib.fs-tree']],  // P2 — tree/parseAny/recall injection payload
  ['lib/gemini-toolbox/agent-contracts.js', 'nexus.lib.gemini-agent-contracts',
    ['nexus.lib.gemini-toolbox', 'nexus.lib.agent-router']],  // P1 — per-agent contracts (identity/axioms/scoped toolbox)
  ['lib/chunk-service.js',        'nexus.lib.chunk-service',
    ['nexus.lib.chunker']],  // chunking consolidated through RAID — canonical chunker as one capability
  ['lib/seam/spec-parser.js',     'nexus.lib.seam.spec-parser', []],
  ['lib/agent-pull.js',           'nexus.lib.agent-pull',
    ['nexus.lib.gemini-agent-contracts', 'nexus.lib.chunk-service', 'nexus.lib.schema-registry', 'nexus.lib.tool-index']],  // AP1 — agents pull schemas/contracts/chunks/capabilities, scoped
  ['lib/tool-index.js',           'nexus.lib.tool-index',
    []],  // living tool index in cortex — file/dir/consumer/intent/edge-cases populate over time
  ['loom/scanners/phasemap-map.js','nexus.loom.scanners.phasemap-map',
    []],  // the phasemap SECTION of loom — roadmap per system (what each is becoming)
  ['loom/doc-generator.js',       'nexus.loom.doc-generator',
    []],  // §R6 2026-08-12 — documentation GENERATED from loom's own live API (/api/component/:system, /api/phasemap, /api/gaps), no new data source, no hand-maintained prose that can drift (the exact way lib/version.js's architect comment drifted this session). GATE PROVEN LIVE: generated architect's doc (2/3 active), made a real state change to hooks/architect.hooks.js, regenerated with zero manual edit (1/3 active, correctly reflecting reality), reverted, regenerated again (back to 2/3) — a closed, honest loop, not a one-shot demo.
  ['loom/config.js', 'nexus.loom.config', []],
  ['loom/server.js',              'nexus.loom.server',
    ['nexus.lib.gap-field', 'nexus.lib.connections', 'nexus.loom.scanners.phasemap-map', 'nexus.lib.component-ledger', 'nexus.loom.config']],  // §2026-08-09 — the process itself: /api/phasemap, /api/gaps, /api/friction, /api/tension — the last two proxy the real diagnostic kernel (:7825) live via CA4's connections.js, not a second computation. §R4 2026-08-12 — /api/history + /api/history/system|component|session/:id now read the real, existing component-ledger (never touched before this phase). Found 10,300 rows of accumulated test pollution along the way (system ids like bl7-<timestamp> and srctest-*, leaked from tests lacking real cleanup) and cleaned it from all three places component-ledger.write() lands (component_ledger table, event_log, physical files) — the honest real total is 5,290 rows, not the 15,472 first reported hours earlier this session, a real correction, not hidden. §R5 2026-08-12 — /api/component/:system, the real zoom-in aggregation. loom's own graph() only carries generic auto-scanned export/import edges — the real nuance (deprecated/active per-hook status) lives in hooks/<system>.hooks.js's own exports, a genuinely separate source, confirmed before building. Combines both + open gaps + history, live. "Look at architect" gate proven exactly: activeCount 2/3, hook-registration shown deprecated, SNR-gate and topology-scan shown active — not flattened.
  ['lib/fs-tree.js',              'nexus.lib.fs-tree',
    []],  // agnostic file-structure tree — promoted from gemini injection, any system uses it
  ['lib/line-edit.js',            'nexus.lib.line-edit',
    []],  // agnostic line addressing + verified edits — promoted from gemini-toolbox
  ['lib/gemini-toolbox/index.js',  'nexus.lib.gemini-toolbox',
    ['nexus.lib.chunker', 'nexus.lib.line-edit']],  // the shared line-addressing backend for Gemini coding
  ['lib/gemini-toolbox/routes.js', 'nexus.lib.gemini-toolbox.routes',
    ['nexus.lib.gemini-toolbox']],  // HTTP surface, mounted on guardian /gemini-tool
  ['lib/ledger-fanin/index.js',   'nexus.lib.ledger-fanin',
    []],
  ['lib/activity-log/index.js',   'nexus.lib.activity-log',
    ['nexus.lib.ledger-fanin']],
  ['copilot/lib/self-model.js',   'nexus.copilot.self-model',
    ['nexus.copilot.user-model', 'nexus.copilot.nexus-awareness', 'nexus.lib.gap-field', 'nexus.copilot.intent-learning']],  // P5/P6 — identity + governance + agent-switch + nexus model, wired from lib/reflection, lib/constitutional-ai, lib/agent-router, lib/intent-classifier. §2026-08-09 — buildNexusModel() now includes gap-field's system+user-model gap summary AND intent-learning's per-pattern confidence — a model of NEXUS that only lists what it can do without also carrying how sure it is isn't actually self-aware.
  ['copilot/lib/grammar-router.js','nexus.copilot.grammar-router',
    ['nexus.lib.grammar-engine', 'nexus.copilot.capabilities']],  // P5 — dynamic grammar engine in the conversational path
  ['copilot/lib/autonomy-router.js','nexus.copilot.autonomy-router',
    ['nexus.lib.scheduler', 'nexus.lib.triggers', 'nexus.lib.system-control', 'nexus.lib.command-builder', 'nexus.lib.constant-autonomy', 'nexus.copilot.capabilities', 'nexus.copilot.intent-learning', 'nexus.copilot.user-model', 'nexus.lib.idea-provenance']],  // §2026-08-09 — the wire from co-pilot's actual conversation to CA1-CA7. Landed in the wrong route on the first attempt (/bridge/deliver, not /api/prompt — the primary entry); moved after a real HTTP call against the live server proved it wasn't reached. v2: propose-then-confirm for every state-changing action, confidence-gated via intent-learning, both models updated on outcome. §2026-08-11 — "log this idea" wired to idea-provenance.js, tagged origin:user (never origin:agent — that distinction is idea-provenance's whole reason for existing).
  ['copilot/lib/intent-learning.js','nexus.copilot.intent-learning',
    ['nexus.cortex.memory.jaa-db']],  // §2026-08-09 — Bayesian-ish confidence per intent-resolution PATTERN, not per claim about James (that's user-model.js's job) — co-pilot's model of its OWN understanding. +0.10 confirm, -0.15 reject, mirrors user-model.js's exact confirm/decay math rather than a new formula.
  ['lib/agent-build-learning.js', 'nexus.lib.agent-build-learning',
    ['nexus.cortex.memory.jaa-db', 'nexus.lib.agent-router']],  // §2026-08-11 — a THIRD Bayesian model, same math again: which agent tends to actually produce a working build. Seeded from agent-router's DEFAULT_FALLBACK as a real prior, not a blank 0.5 — James's own encoded judgment shouldn't be thrown away just because nothing's been recorded yet.
  ['lib/chunk-build-orchestrator.js', 'nexus.lib.chunk-build-orchestrator',
    ['nexus.lib.execution-pipeline', 'nexus.lib.agent-router', 'nexus.lib.agent-build-learning', 'nexus.lib.gap-field']],  // §2026-08-11 — James: "if a chunk fails to build, switch agents... try them all, unless it's a system failure." Exhausts the full roster before giving up (stronger evidence for "needs human review" than any partial attempt); a rate-limit/timeout is a skipped turn, not a failed one, and doesn't count. Full exhaustion reports through gap-field, same "what's open right now" view as everything else. §R3 addendum 2026-08-12 — now also includes specPath/outputDir/testCommand in the exhaustion gap's meta, so autonomous-repair.js has something real to verify against.
  ['lib/autonomous-repair.js',    'nexus.lib.autonomous-repair',
    ['nexus.copilot.repair-on-prompt', 'nexus.cortex.core.raid', 'nexus.lib.gap-field', 'nexus.lib.triggers']],  // §R3 2026-08-12 — the real wire: copilot/repair-on-prompt.js (real, correct, zero callers all session) fired from a detected gap instead of only a typed prompt. Scoped honestly to gap types that genuinely carry a specPath (chunk-build.exhausted/all-agents-unreachable), not "every gap" — repair-on-prompt is built for spec-verifiable fixes, checked before assuming it was generic. Live-tested end to end: real exhaustion -> real gap -> real trigger fire -> real raid.verify() (the spine fixed earlier this pass) -> a failing verify leaves nothing applied and reports why, a passing verify results in a real applied-repair report. applyRepair is honest that runPipeline's own success path already promotes to golden during verification — nothing re-done.
  ['copilot/lib/nexus-awareness.js','nexus.copilot.nexus-awareness',
    ['nexus.copilot.capabilities', 'nexus.lib.diagnostic-causal', 'nexus.lib.ledger-fanin']],  // P4 — co-pilot's model of nexus
  ['copilot/lib/capabilities.js', 'nexus.copilot.capabilities',
    ['nexus.loom.scanners.capability-map']],  // P4 slice — co-pilot's real toolbox from loom
  ['lib/diagnostic-causal.js',    'nexus.lib.diagnostic-causal',
    ['nexus.intelligence.relational-field', 'nexus.lib.ledger-fanin', 'nexus.intelligence.snapshot-trigger', 'nexus.lib.gap-field']],  // P3 — conditions behind findings; now defaults findings from gap-field (§2026-08-09 unification)
  ['lib/component-ledger.js',     'nexus.lib.component-ledger',
    ['nexus.cortex.memory.jaa-db']],  // §2026-08-12 — James: "i want everything you do logged to nexus... all history and decisions tracked in cortex." REAL, already written (15,472+ rows, 12+ real systems, a month of history) but never itself registered in loom's own map — found while making it locatable for a 13th real writer (this session's own commits, system:'claude', logged live tonight). Was flagging its own writes as "recorded but not locatable in the architecture" until this entry.
  ['cortex/self-heal/fault-taxonomy.js', 'nexus.cortex.self-heal.fault-taxonomy',
    ['nexus.cortex.memory.jaa-db']],  // §R7 2026-08-12 — real, real fault_taxonomy table (0 rows — the escalation organ that would populate it via raiseFriction() was never built, checked not assumed). Added scoreTension(gap), the function service/nexus-diagnostic.js's /tension route has always tried to call and never found — it required cortex/healer, a directory that never existed. Maps a gap's type to a real fault class (GAP_TYPE_TO_FAULT_CLASS); returns real accumulated friction where history exists, otherwise a fresh estimate from the SAME real FRICTION_DELTA_BY_LEVEL table, not the old crude severity==='high'?2:1 guess. Verified live: 0.35 vs the old fallback's 2 for the same fresh gap; 0.70 with two real raiseFriction() calls behind it.
  ['cortex/self-heal/escalation.js', 'nexus.cortex.self-heal.escalation',
    ['nexus.cortex.self-heal.fault-taxonomy']],  // §BUILT 2026-09-11 — the escalation organ itself: wireAnomalyTrigger(bus) listens to anomaly.detected and HEAL_REQUESTED, calling into fault-taxonomy's raiseFriction/recordSuccess. Found unwired in loom while adding fault-taxonomy.recordAttempt() for this same file's recordAttemptOutcome() to call — a real gap, not new: this file predates this entry and was never registered despite being fault-taxonomy's only real writer-side caller.
  ['lib/stub-scanner.js',         'nexus.lib.stub-scanner',
    []],
  ['cortex/core/raid/index.js',   'nexus.cortex.core.raid',
    ['nexus.lib.execution-pipeline']],  // §2026-08-12 — CRITICAL BUGFIX found while checking R3's real dependencies: verifyInIsolation() called runPipeline(specPath, {outputDir,testCommand}) — a bare STRING as the first arg, but runPipeline destructures {specPath,outputDir,...} FROM its first arg. Every real consequential-action verification has been silently failing at 'validate' with 'specPath required' since this was written — the P3-P6 isolation/verify/compare/rewind spine, the real safety backbone for consequential actions across NEXUS, has never actually run for real. Confirmed live before AND after the fix (before: immediate 'specPath required'; after: genuinely reaches the pipeline, real [t2-gate] compile output). All 22 existing raid tests still pass unchanged — none of them caught this, same depth-of-testing gap R2 had.  // §2026-08-12 — James: "no stubs. we need to do a check for that also." Direct consequence of cortex/snapshot/index.js's own real bug (create() worked against a test mock's private _tables property, silently did nothing against real production jaaDB, all 34 tests passed anyway). Grep-based first pass: stub comments, trivially-empty function bodies, and private-property-access as a candidate to verify against the REAL object, not just a test's mock. Two real bugs caught while BUILDING this (unexported regex, unreset stateful lastIndex corrupting multi-file scans) — same discipline required to build a checker as to build anything else.
  ['lib/nerve-gap-bridge.js',     'nexus.lib.nerve-gap-bridge',
    ['nexus.lib.nerve', 'nexus.lib.gap-field']],  // §R8 2026-08-12 — lib/nerve/index.js's real onChange() subscription wired to gap-field.report(). A real, meaningful signal (snapshot.stresses non-empty, i.e. _field.stressCount > 0), rate-limited to one gap per 30s of persistent stress rather than one per poll tick. Verified live with an injected nerve stub: real stress -> real gap; no stress -> nothing; a second stressed tick within the window -> no duplicate.
  ['clear-glass/src/diagnostic/error-capture.js', 'nexus.clear-glass.error-capture',
    ['nexus.lib.gap-field']],  // §R8 2026-08-12 — optional gapField reporter added to the constructor, mirroring the EXISTING sse pattern exactly (same shape, same fire-and-forget discipline). Was real, working, and genuinely isolated all session — zero references to gap-field/jaaDB/cortex anywhere. Every dev-console/renderer error it's ever caught stayed local until this wire. Fixed a real, pre-existing, unrelated bug found along the way: tests/modules/error-capture.test.js hardcoded an absolute path from a different sandbox (/home/claude/new_nexus/extracted/...) that never existed in this working copy — the test had been unrunnable this whole session, not caused by this change.
  ['lib/relational-context.js',   'nexus.lib.relational-context',
    []],  // §R10 2026-08-12 — the real token-reduction mechanism. Reuses loom's real contextGraph() rather than re-deriving the graph. Found and fixed a REAL, significant bug while building this: the traversal direction was backwards from the actual ingested wire semantic — verified against a known-true relationship (gap-field really calls diagnostic-causal) instead of trusting impactOf()'s own comment, which describes the opposite direction from what's actually ingested. GATE PROVEN LIVE: gap-field's real relevant context is 4 files / 6,702 tokens vs a 237,508-token naive directory baseline — 97% real, measured reduction, not estimated. Also found: loom's live registry does not yet reflect every observability-map.js entry added this session (agent-build-learning, stub-scanner both absent) — a real, separate sync-mechanism gap, noted not chased given time.
  ['lib/gap-field.js',            'nexus.lib.gap-field',
    ['nexus.cortex.memory.jaa-db', 'nexus.lib.resource-monitor', 'nexus.lib.diagnostic-causal']],  // §2026-08-09 — the single agnostic gap-report entry point: system anomalies + user-model contradictions, one dedup rule, one causal-wire convention. §R1 2026-08-12 — report() carries the full repair_contract_schema (requested/received/systemsInvolved/location/error/resourceState), resourceState auto-populated from lib/resource-monitor (cheap, real), why populated on-demand via explainWhy() -> diagnostic-causal.explainFinding() (real causal tracing, not run on every report — §0.5).
  // §2026-08-23 — found genuinely unregistered while wiring the new,
  // real, dynamic delta-based tension signal into both. gap-priority
  // now depends on jaaDB directly (tensionFromDelta's own real, windowed
  // read); predicate depends on gap-priority as its new fallback path.
  ['lib/gap-priority.js', 'nexus.lib.gap-priority', ['nexus.cortex.memory.jaa-db']],
  ['intelligence/gap/predicate.js', 'nexus.intelligence.gap.predicate', ['nexus.lib.gap-priority']],
  ['lib/rfr2-bridge.js', 'nexus.lib.rfr2-bridge', ['nexus.intelligence.rfr2']],
  ['lib/nexus-expansion-boot.js', 'nexus.lib.nexus-expansion-boot', ['nexus.intelligence.gap.ledger']],
  ['lib/open-loop-taxonomy.js', 'nexus.lib.open-loop-taxonomy', ['nexus.intelligence.gap.predicate']],
  ['copilot/lib/lifeline-contracts.js', 'nexus.copilot.lifeline-contracts',
    ['nexus.lib.gap-field']],  // §2026-08-12 — James: "each time it uses lifeline it needs to know what it's asking and how to receive it... a contract or schema, a way to interact with each agent." Per-intent (ask/build/yes_no/json/etc) validation of what a real provider response actually needs to look like — a mismatch is a real, logged gap, not a silently-accepted guess.
  ['copilot/lifeline.js',         'nexus.copilot.lifeline',
    ['nexus.copilot.lifeline-contracts', 'nexus.lib.gap-field']],  // §2026-08-12 — three real silent-failure paths fixed: _tryOllama's job-failed/timeout/thrown-error branches all `return null`ed with zero record; _tryGuardian's empty-response/thrown-error paths did the same. Every one now reports a real gap via gap-field before falling through, same cascade behavior, real record instead of silence.
  ['cortex/gap-finder/index.js',  'nexus.cortex.gap-finder',
    ['nexus.lib.gap-field']],  // system anomaly.detected + sigma.event.* → gap-field.report(); was writing directly to 'gaps' with its own inline dedup before the unification — that logic is now shared, not duplicated
  ['lib/intent-classifier.js',    'nexus.lib.intent-classifier',
    ['nexus.lib.gap-field']],  // §2026-08-09 — the SIXTH independent gap-writer found (James asked to verify "intention" was really wired in): _emitLowConfidenceGap() had a raw jaaDB.insert with no dedup, same bug class as user-model's checkContradictions. Now shares gap-field's dedup/occurrence treatment. Verified live: two identical low-confidence classifications bump occurrences 1->2, not two rows.
  ['lib/integrity-revert.js',     'nexus.lib.integrity-revert',
    ['nexus.lib.file-integrity', 'nexus.intelligence.snapshot-trigger', 'nexus.lib.replay-engine']],  // integrity sigma → guarded revert (only when broken)
  ['cortex/snapshot/index.js',    'nexus.cortex.snapshot',
    ['nexus.cortex.memory.jaa-db']],  // §R2 2026-08-12 — the one genuine gap in docs/repair-contract-and-loom-hub-phasemap.spec. Real hash-chained, disk-first (.nex files), tamper-evident snapshot/rollback — create/load/verifySnapshotIntegrity/checkChainIntegrity/rollback. Built to the exact contract 3 real pre-existing tests already specced (11/11 snapshot-integrity, 23/23 compartment-engine, both real rewind-on-fail tests passing for the first time). lib/replay-engine.js checked first — adjacent but genuinely different API (request-decision replay, not hash-chain integrity) — not reused because it doesn't fit, not because it wasn't checked.
  ['intelligence/snapshot-trigger.js',     'nexus.intelligence.snapshot-trigger',
    ['nexus.lib.replay-engine', 'nexus.intelligence.relational-field', 'nexus.lib.ledger-fanin']],  // P2 — snapshot on every sigma, tracing conditions via RFR2. §2026-08-22 moved from lib/ per intelligence.spec phase 2
  ['intelligence/baseline.js', 'nexus.intelligence.baseline', []],  // §2026-08-22 — real, new registration; had none before the move
  ['intelligence/cfr/index.js', 'nexus.intelligence.cfr', ['nexus.intelligence.cfr.ledger', 'nexus.intelligence.cfr.field', 'nexus.intelligence.cfr.sigma', 'nexus.intelligence.cfr.delta', 'nexus.intelligence.cfr.graph', 'nexus.intelligence.cfr.contract-verifier']],
  ['intelligence/cfr/field.js', 'nexus.intelligence.cfr.field', []],
  ['intelligence/cfr/sigma.js', 'nexus.intelligence.cfr.sigma', ['nexus.lib.component-ledger']],
  ['intelligence/cfr/delta.js', 'nexus.intelligence.cfr.delta', []],
  ['intelligence/cfr/graph.js', 'nexus.intelligence.cfr.graph', []],
  // §2026-08-23 — added a real, new dependency: jaaDB, for the new
  // continuous cfr_tension_history writes (dynamic delta-based tension).
  ['intelligence/cfr/ledger.js', 'nexus.intelligence.cfr.ledger', ['nexus.intelligence.cfr.sigma', 'nexus.intelligence.cfr.delta', 'nexus.intelligence.cfr.field', 'nexus.intelligence.cfr.graph', 'nexus.intelligence.causal.compound', 'nexus.cortex.jaa-db']],
  ['intelligence/causal/index.js', 'nexus.intelligence.causal', ['nexus.intelligence.causal.anomaly', 'nexus.intelligence.causal.compound']],
  ['intelligence/causal/anomaly.js', 'nexus.intelligence.causal.anomaly', []],
  ['intelligence/causal/compound.js', 'nexus.intelligence.causal.compound', ['nexus.intelligence.cfr.graph', 'nexus.intelligence.domain-nodes']],
  ['intelligence/cfr/contract-verifier.js', 'nexus.intelligence.cfr.contract-verifier', []],
  ['lib/scheduler.js',            'nexus.lib.scheduler',
    ['nexus.copilot.self-model', 'nexus.lib.ledger-fanin', 'nexus.lib.agent-pull']],  // CA1 — schedule tasks/jobs/alarms/timed payloads, RAID-gated
  ['lib/triggers.js',             'nexus.lib.triggers',
    ['nexus.copilot.self-model', 'nexus.lib.ledger-fanin', 'nexus.lib.agent-pull']],  // CA2 — fire an action WHEN a fan-in condition matches, RAID-gated (scheduler's reactive twin)
  ['lib/chains.js',               'nexus.lib.chains',
    ['nexus.copilot.self-model', 'nexus.lib.agent-pull', 'nexus.lib.ledger-fanin']],  // CA3 — sequential agent/command/http/fn steps, RAID-gated per step, halts on failure
  ['lib/connections.js',          'nexus.lib.connections',
    ['nexus.copilot.self-model', 'nexus.lib.ledger-fanin']],  // CA4 — scoped http/sse connection tool, default-deny domain allowlist, RAID-gated
  ['lib/system-control.js',       'nexus.lib.system-control',
    ['nexus.copilot.self-model', 'nexus.lib.ledger-fanin', 'nexus.guardian.clear-glass-bridge']],  // CA5 — governed settings (get/set/revert) + governed clear-glass incl. DOM storage
  ['lib/command-builder.js',      'nexus.lib.command-builder',
    ['nexus.copilot.self-model', 'nexus.copilot.capabilities', 'nexus.lib.tool-index', 'nexus.lib.chains']],  // CA6 — self-building commands: resolve a real capability, store in tool-index (loom-registered), run via CA3
  ['lib/constant-autonomy.js',    'nexus.lib.constant-autonomy',
    ['nexus.lib.scheduler', 'nexus.lib.autonomous-loop', 'nexus.lib.tool-index', 'nexus.lib.ledger-fanin', 'nexus.copilot.self-model']],  // CA7 — propose/govern/execute on a loop (CA1's scheduler), halts on ambiguity, every cycle traceable
  ['lib/nexus-cli-interface.js',  'nexus.lib.nexus-cli-interface',
    ['nexus.copilot.capabilities', 'nexus.copilot.nexus-awareness', 'nexus.copilot.self-model', 'nexus.copilot.grammar-router', 'nexus.loom.scanners.phasemap-map']],  // --cli interface routing to the co-pilot additions
  ['lib/autopilot-intelligence.js','nexus.lib.autopilot-intelligence',
    ['nexus.intelligence', 'nexus.intelligence.relational-field', 'nexus.intelligence.baseline', 'nexus.intelligence.snapshot-trigger', 'nexus.lib.ledger-fanin']],  // autopilot boot — wire+verify the whole intelligence substrate
  ['lib/ledger-fanin/boot.js',    'nexus.lib.ledger-fanin.boot',
    ['nexus.lib.ledger-fanin', 'nexus.lib.activity-log']],  // P1 — subscribes intelligence/autopilot/copilot/logging to the fan-in at boot  // subscribes the fan-in → persists all activity + errors to cortex  // the unified event fan-in — every system emits, every consumer subscribes once
  ['ui/agents/gemini/code-suite.html', 'nexus.ui.gemini.code-suite',
    ['nexus.lib.gemini-toolbox.routes']],  // the code suite UI → toolbox over HTTP
];

function mapObservability(driver) {
  const results = { components: [], hooks: [], wires: [], failures: [] };

  // Pass 1 — components (one per file)
  for (const [file, id] of FILES) {
    const r = driver.declare('component', {
      id, namespace: id.split('.').slice(0, 2).join('.'), name: file, version: '1.0.0',
      uuid: `nexus-loom-map-${id}-v1-0000-2026-0730-001`,
    });
    (r.ok ? results.components : results.failures).push({ id, r });
  }

  // which ids are required by at least one file → need an .export hook
  const requiredBy = new Set();
  for (const [, , requires] of FILES) for (const dep of requires) requiredBy.add(dep);

  // Pass 2 — hooks (export if required elsewhere, import if this file requires others)
  for (const [, id, requires] of FILES) {
    if (requiredBy.has(id)) {
      const r = driver.declare('hook', {
        id: `${id}.export`, component_id: id, name: 'export', type: 'direct', direction: 'out',
        uuid: `nexus-loom-map-${id}-export-v1-0000-2026-0730-001`,
      });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.export`, r });
    }
    if (requires.length > 0) {
      const r = driver.declare('hook', {
        id: `${id}.import`, component_id: id, name: 'import', type: 'direct', direction: 'in',
        uuid: `nexus-loom-map-${id}-import-v1-0000-2026-0730-001`,
      });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.import`, r });
    }
  }

  // Pass 3 — wires: dependency's .export → dependant's .import (real require edges)
  let wireN = 0;
  for (const [, id, requires] of FILES) {
    for (const dep of requires) {
      wireN++;
      const r = driver.declare('wire', {
        id: `observability.wire.${wireN}.${dep}--${id}`,
        from_hook_id: `${dep}.export`, to_hook_id: `${id}.import`,
        uuid: `nexus-loom-map-obs-wire-${wireN}-v1-0000-2026-0730-001`,
      });
      (r.ok ? results.wires : results.failures).push({ from: dep, to: id, r });
    }
  }

  return results;
}

module.exports = { mapObservability, FILES };
