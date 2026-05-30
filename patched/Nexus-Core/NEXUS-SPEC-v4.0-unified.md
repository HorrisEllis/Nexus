# NEXUS — Unified Specification v4.0
## Code Generation Platform · CrystalBall Module · Memory Crystallization · Automation

```
UUID:   nexus-platform-0000-4000-0000-000000000001
DATE:   2026-05-16
BUILT:  nexus-core (35 files — foundation through healer — DO NOT REWRITE)
PORTS:  7771 (Guardian/extension bridge) · 11434 (Ollama)
MODEL:  deepseek-coder-v2:16b-lite-instruct-q4_K_M · localhost · 7 threads · 4096 ctx
```

---

## 0. CONSTITUTIONAL LAWS

```
LAW I    LOCAL FIRST
         Ollama always evaluated first. RAID routes away only at usage > 90%
         or confirmed failure. Cloud agents are fallback sensors, not peers.

LAW II   EVENT AUTHORITY
         No state changes directly. Only events. Every transition is an
         immutable event on the bus. History replayable from seq:0.

LAW III  LAYER SOVEREIGNTY
         Each layer has one job. No direct module calls. All communication
         via kernel.emit() only.

LAW IV   SCHEMA OVER CODE
         Behavior from schemas, not conditionals. Manifest always temp:0,
         schema-constrained. Plugins declare capabilities; runtime composes.
```

**Axioms (all modules inherit):**
```
§1.1   Nothing pretends to work.
§1.2   Nothing silently fails. Every error is loud and specific.
§1.3   No stubs in production.
§2.1   Persistence is the golden rule. JAA on everything.
§3.1   Bottom-up only. Data → schema → inference → action.
§4.3   Enterprise and military grade from line one.
§5.1   UUID on everything that does anything.
§5.7   Zero direct module calls. All I/O via kernel events.
§M1    Everything that happens gets stored. No exceptions.
§M2    Failures are first-class data. Always structured, tagged, stored.
§M3    The system improves by accumulation, not retraining.
§M4    Agents know themselves. Every agent carries a live self-model.
```

---

## 1. WHAT IS ALREADY BUILT (nexus-core — DO NOT REWRITE)

All 35 files in nexus-core.zip are complete. They are the platform foundation.

```
foundation/siso.js            SISOEvent (immutable, tick+causedBy+relatedTo),
                              StreamLog (10k ring), SISOBus (wildcard on/emit)
foundation/kernel.js          ALKKernel: ring buffer, causal graph (ancestors +
                              descendants), Law enforcement at boot
foundation/store/FileStore.js SHA256 content-addressed, atomic write, dedup
foundation/store/FileRefs.js  Named pointers to content hashes

core/manifest/index.js        Ollama temp:0, AJV schema validation, reject+retry (3x)
core/raid/index.js            Law I enforced structurally. cost×capability×usage×drift.
                              Manual overrides. Decision log.
core/raid/learner.js          AgentSignature EMA (alpha=0.15). Drift detection.
                              Failure profile per agent per task type.
core/raid/fallback.js         Exhaustion detection → escalation chain
core/translation/index.js     IntentIR: concept grounding, ambiguity resolution,
                              clarification queue. CONCEPT_GRAPH seeded.
core/translation/learner.js   IntentLearner: IntentSignature EMA on user vocabulary
core/translation/alignment.js AlignmentScanner: IR→manifest delta, shadow/missing/broken
                              detection, live score update on gate events
core/usage/index.js           Per-service usage state, thresholds, scheduler
core/index/query.js           JAA FileStore query — reuse before generate

agents/base.js                BaseAgent: complete(), stream(), ping(),
                              _emitStart/_emitDone/_emitError lifecycle
agents/ollama/index.js        deepseek-coder-v2 complete+stream+ping+orchestrate()
                              orchestrate() reads delta logs → assigns identities
agents/index.js               ChatGPT/Claude/Gemini via guardianRequest()
                              guardianRequest: POST localhost:7771/api/complete
                              pingAll(), AGENTS registry

gate/gap-finder.js            GapHunter: MISSING/BROKEN/SHADOW/WEAK/INTENT gaps.
                              Emits gap.found per gap. Healer subscribes.
gate/runner.js                Gate execution per manifest node
healer/index.js               gap.found → fix spec → manifest.ready (MAX_DEPTH:5)
                              Exhaustion → escalate to human

cli.js                        Dynamic grammar — plugins register commands at init.
                              Every command emits an event. Never executes directly.
boot.js                       Full wire order. Law enforcement at boot.
                              Emits system.booted when all modules ready.
tauri/ws-server.js            Rust/Tauri WS server. Port 7771. Extension↔NEXUS bridge.
admin/index.html              2500 lines. All pages: Dashboard, Pipeline, Agents,
                              RAID, Gate, Manifest, Changelog, Settings, Extension.
admin/alignment.html          Live alignment monitor. IR vs build graph divergence.
schemas/                      manifest.schema.json, event.schema.json
plugins/_example/             schema.json + index.js — plugin contract template
```

**What's missing from nexus-core (build next, in order):**
```
agents/chatgpt/selectors.js   DOM selectors for chatgpt.com
agents/chatgpt/limits.js      DOM patterns: rate limit, usage bars
agents/claude/selectors.js    DOM selectors for claude.ai
agents/claude/limits.js
agents/gemini/selectors.js
agents/gemini/limits.js
guardian/                     Full Firefox extension (see §5)
canvas/spec-a/                React Flow pipeline canvas (Phase 5)
admin pages:                  /guardian + /crystalball + /memory + /automation
                              + full CRUD on all existing pages
config/intent.config.json     Concept graph seed + menu config
config/services.json          Per-agent capabilities, limits, cost tier
schemas/                      callto, intent, plugin, gap, bep, crystal, schedule
logs/failures/                gate-failures.jsonl, agent-failures.jsonl,
                              code-catalog.jsonl, healer-exhausted.jsonl
logs/deltas/                  gate-deltas.jsonl, build-deltas.jsonl, alignment-deltas.jsonl
.nex fork logic               Saves but does not fork on gate boundaries yet
Homepage                      Welcome screen, recent projects, module library
```

---

## 2. DIRECTORY STRUCTURE (COMPLETE)

```
nexus/
├── foundation/
│   ├── siso.js                    ✓ BUILT
│   ├── kernel.js                  ✓ BUILT
│   └── store/
│       ├── FileStore.js           ✓ BUILT
│       ├── FileRefs.js            ✓ BUILT
│       └── Canonicalize.js        BUILD
│
├── core/
│   ├── manifest/index.js          ✓ BUILT
│   ├── raid/                      ✓ BUILT (index, learner, weights, fallback)
│   ├── translation/               ✓ BUILT (index, learner, alignment)
│   ├── usage/index.js             ✓ BUILT
│   └── index/query.js             ✓ BUILT
│
├── agents/
│   ├── base.js                    ✓ BUILT
│   ├── ollama/index.js            ✓ BUILT
│   ├── index.js                   ✓ BUILT
│   ├── chatgpt/selectors.js       BUILD
│   ├── chatgpt/limits.js          BUILD
│   ├── claude/selectors.js        BUILD
│   ├── claude/limits.js           BUILD
│   ├── gemini/selectors.js        BUILD
│   └── gemini/limits.js           BUILD
│
├── gate/
│   ├── gap-finder.js              ✓ BUILT
│   ├── runner.js                  ✓ BUILT
│   ├── generator.js               BUILD
│   ├── recursive.js               BUILD
│   └── verifier.js                BUILD
│
├── healer/
│   ├── index.js                   ✓ BUILT
│   ├── fix-spec.js                BUILD
│   ├── retry.js                   BUILD
│   └── escalator.js               BUILD
│
├── guardian/                      BUILD — see §5
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── popup.html / popup.js
│   ├── urck.js
│   ├── bridge-sync.js
│   └── modules/
│       ├── base-module.js
│       ├── chatgpt.js
│       ├── claude.js
│       └── gemini.js
│
├── crystalball/                   NEW MODULE — §3
│   ├── index.js                   Entry point, plugin contract, boot integration
│   ├── schema.json                Plugin schema
│   ├── lattice-bridge.js          ALK lattice → NEXUS kernel bridge + entity index
│   ├── bep-engine.js              Behavioral Execution Pattern engine
│   ├── mcl.js                     Memory Crystallization Layer
│   ├── mql.js                     Memory Query Layer (5-lane retrieval)
│   ├── signal-adapter.js          CB signal axes → NEXUS code signal axes
│   └── tests/crystalball.test.js
│
├── memory/                        NEW — §4
│   ├── jaa-db.js                  Dual-backend JaaDB (IndexedDB/JSONL)
│   ├── ring-adapter.js            Causal-nexus ring wrapper
│   ├── lattice-index.js           ALK lattice + JAA persistence
│   ├── agent-memory.js            ASE adaptation for agent self-models
│   ├── continuous-stream.js       LLM session ring buffer
│   ├── fix-map.js                 Failure→fix accumulator
│   └── feedback-weighter.js       Rating→retrieval weight update
│
├── automation/                    NEW — §6
│   ├── engine.js                  Scheduler + workflow runner
│   ├── variable-resolver.js       System-aware variable namespace
│   ├── step-executor.js           Per-step type handlers
│   └── condition-evaluator.js     Safe expression evaluator (no eval())
│
├── canvas/
│   ├── spec-a/                    BUILD Phase 5 (React Flow)
│   └── spec-b/                    EXISTS in CrystalBall — wire bus-to-cfr.js
│       └── bridge/bus-to-cfr.js  BUILD (NEXUS events → CFR node attributes)
│
├── admin/
│   ├── index.html                 ✓ BUILT
│   ├── alignment.html             ✓ BUILT
│   └── pages/                     BUILD: guardian, crystalball, memory, automation
│
├── logs/
│   ├── failures/                  BUILD
│   └── deltas/                    BUILD
│
├── schemas/
│   ├── manifest.schema.json       ✓ BUILT
│   ├── event.schema.json          ✓ BUILT
│   ├── plugin.schema.json         BUILD
│   ├── gap.schema.json            BUILD
│   ├── callto.schema.json         BUILD
│   ├── intent.schema.json         BUILD
│   ├── bep-pattern.schema.json    BUILD
│   ├── crystal.schema.json        BUILD
│   └── schedule.schema.json       BUILD
│
├── config/
│   ├── intent.config.json         BUILD
│   ├── services.json              BUILD
│   ├── raid-weights.json          BUILD
│   └── thresholds.json            BUILD
│
├── plugins/
│   ├── _example/                  ✓ BUILT
│   └── _registry.js               BUILD
│
├── tauri/ws-server.js             ✓ BUILT (port 7771)
├── cli.js                         ✓ BUILT
├── boot.js                        ✓ BUILT (extend for CrystalBall — see §3.7)
└── package.json                   ✓ BUILT
```

---

## 3. CRYSTALBALL MODULE — ALK AS NEXUS PLUGIN

CrystalBall (the ALK behavioral runtime in CrystalBall-1.zip) becomes a
NEXUS plugin. This is not a dependency import. It is a module that wires
into the NEXUS kernel bus and contributes three capabilities nothing else
can provide:

**1. Lattice** — The ALK causal lattice (kernel.js from CrystalBall) is the
structural memory backbone. Every NEXUS event becomes a lattice node.
Associative traversal (not just direct causedBy) makes memory retrieval
multi-hop: a gap can find the agent that built the failing module, the test
that exposed the failure, and the prior BEP pattern that was attempted — in
one traversal.

**2. Behavioral Execution Patterns (BEP)** — CrystalBall's behavior-module.js,
speech-state-module.js, and framework-model.js detect patterns in human
behavioral signals using composable detectors, SlidingWindow, EMA, and
confidence tiers. The BEP engine adapts this exact structural pattern to
code execution signals. Same architecture. Same composability. Different domain.

**3. CFR Canvas** — The CFR physics renderer (modules/ALK/modules/cfr/alk-gl.js)
already exists in CrystalBall and is complete. It becomes the Phase 6 pipeline
visualization layer. Wire the bus. No CFR code changes needed.

### 3.1 Plugin schema (crystalball/schema.json)

```json
{
  "name": "crystalball",
  "uuid": "nexus-mod-crystalball-0000-4000-0000-000000000001",
  "version": "1.0.0",
  "hook": "nexus.module.crystalball:alk-bridge:00001",
  "intent": "Provide ALK causal lattice, BEP pattern engine, MCL, and CFR canvas to NEXUS",
  "layer": "foundation",
  "status": "active",
  "axioms": ["§1.1", "§1.2", "§5.1", "§5.7", "§M1", "§M3"],

  "subscribes": [
    { "channel": "system.booted",           "handler": "_onBoot" },
    { "channel": "gate.passed",             "handler": "_onGatePassed" },
    { "channel": "gate.failed",             "handler": "_onGateFailed" },
    { "channel": "gap.found",               "handler": "_onGapFound" },
    { "channel": "agent.response.received", "handler": "_onAgentResponse" },
    { "channel": "manifest.ready",          "handler": "_onManifestReady" },
    { "channel": "healer.resolved",         "handler": "_onHealerResolved" },
    { "channel": "healer.exhausted",        "handler": "_onHealerExhausted" },
    { "channel": "alignment.scanned",       "handler": "_onAlignmentScanned" },
    { "channel": "crystalball.bep.query",   "handler": "_onBEPQuery" },
    { "channel": "crystalball.mcl.sweep",   "handler": "_onMCLSweep" }
  ],

  "publishes": [
    { "channel": "crystalball.ready",          "schema": "{ uuid, latticeSize, bepCount }" },
    { "channel": "crystalball.bep.matched",    "schema": "{ patternId, score, reuseMode }" },
    { "channel": "crystalball.bep.stored",     "schema": "{ patternId, intent, version }" },
    { "channel": "crystalball.bep.degrading",  "schema": "{ patternId, regressionCount }" },
    { "channel": "crystalball.crystal.formed", "schema": "{ crystalId, stability, fields }" },
    { "channel": "crystalball.memory.retrieved","schema": "{ queryId, items[], traceId }" },
    { "channel": "crystalball.cfr.updated",    "schema": "{ nodeId, entropy, fidelity }" }
  ],

  "cli": [
    { "command": "cb.lattice.query",  "args": ["<terms>"],   "emits": "crystalball.lattice.query" },
    { "command": "cb.lattice.trace",  "args": ["<event-id>"],"emits": "crystalball.lattice.trace" },
    { "command": "cb.bep.list",       "args": [],            "emits": "crystalball.bep.list" },
    { "command": "cb.bep.match",      "args": ["<intent>"],  "emits": "crystalball.bep.query" },
    { "command": "cb.bep.show",       "args": ["<uuid>"],    "emits": "crystalball.bep.show" },
    { "command": "cb.bep.stats",      "args": [],            "emits": "crystalball.bep.stats" },
    { "command": "cb.crystal.sweep",  "args": [],            "emits": "crystalball.mcl.sweep" },
    { "command": "cb.crystal.list",   "args": [],            "emits": "crystalball.crystal.list" },
    { "command": "cb.memory.recall",  "args": ["<query>"],   "emits": "crystalball.memory.recall" },
    { "command": "cb.cfr.status",     "args": [],            "emits": "crystalball.cfr.status" }
  ],

  "ui": {
    "panel": "CrystalBallPanel",
    "icon": "◈",
    "color": "#4af0b8",
    "draggable": true,
    "resizable": true,
    "slots": ["lattice", "bep", "crystals", "cfr"],
    "controls": [
      { "type": "button",  "label": "Sweep MCL",   "emits": "crystalball.mcl.sweep" },
      { "type": "button",  "label": "CFR View",    "emits": "crystalball.cfr.open" },
      { "type": "display", "label": "Crystals",    "reads": "crystalball.crystal.count" },
      { "type": "display", "label": "BEP Library", "reads": "crystalball.bep.count" }
    ]
  },

  "tests": {
    "suite": "crystalball/tests/crystalball.test.js",
    "coverage": ["init", "lattice-bridge", "bep-engine", "mcl", "mql", "cfr-bridge"]
  }
}
```

### 3.2 Lattice bridge (crystalball/lattice-bridge.js)

The NEXUS ALKKernel already has a causal graph (ancestors + descendants).
The bridge replicates every NEXUS bus event into the ALK lattice from
CrystalBall, gaining multi-hop associative traversal and entity indexing.

```js
// crystalball/lattice-bridge.js
// UUID: nexus-cb-lattice-0000-4000-0000-000000000010

// WHAT IT ADDS OVER THE NEXUS KERNEL'S OWN GRAPH:
// The NEXUS kernel graph (foundation/kernel.js) tracks direct causedBy edges.
// The ALK lattice from CrystalBall adds:
//   - addRelated: semantic edges (not just causal — "related to this gap")
//   - Multi-hop traversal: traceToRoot traverses N levels of causedBy
//   - Entity index: keyword → Set<eventId> for MQL Lane A retrieval
//   - relatedTo edges from event metadata (gap → manifestNodeId, etc.)
//
// NOVEL DESIGN: entity extraction runs on every event payload without LLM.
// Pure regex. Fast. Zero dependencies. Covers 80% of retrieval needs.

class LatticeBridge {
  constructor({ nexusKernel, jaaDB }) {
    this._nk  = nexusKernel;
    this._jaa = jaaDB;
    // In-memory entity index (hot layer — also persisted to JaaDB)
    this._entityIdx = new Map();  // keyword → Set<eventId>
    this._typeIdx   = new Map();  // eventType → Set<eventId>
  }

  attach() {
    // Wildcard — every event enters the lattice
    this._nk.on('**', (ev) => this._ingest(ev));
  }

  _ingest(ev) {
    if (!ev?.id || !ev?.type) return;

    // Type index
    if (!this._typeIdx.has(ev.type)) this._typeIdx.set(ev.type, new Set());
    this._typeIdx.get(ev.type).add(ev.id);

    // Entity extraction from payload
    const entities = extractEntities(ev.payload, ev.type);
    for (const entity of entities) {
      const key = entity.value.toLowerCase();
      if (!this._entityIdx.has(key)) this._entityIdx.set(key, new Set());
      this._entityIdx.get(key).add(ev.id);

      // Persist to JaaDB (async, non-blocking — §1.2: log errors, never crash)
      this._jaa.insert('memory_index', {
        uuid:       `mi-${ev.id}-${key.slice(0,8)}`,
        keyword:    key,
        entityType: entity.type,
        eventId:    ev.id,
        eventType:  ev.type,
        tick:       ev.tick,
        wall:       ev.wall ?? Date.now(),
      }).catch(e => this._nk.emit('crystalball.lattice.error',
        { code: 'INDEX_WRITE_FAILED', message: e.message, eventId: ev.id }));
    }
  }

  // ── Query API ──────────────────────────────────────────────────────────────

  queryByKeyword(keyword, limit = 30) {
    const ids = this._entityIdx.get(keyword.toLowerCase()) ?? new Set();
    return [...ids].slice(0, limit);
  }

  queryByType(typePattern, limit = 30) {
    // Supports wildcard: 'gate.*' matches gate.passed, gate.failed
    const regex = new RegExp('^' + typePattern.replace('.', '\\.').replace('*', '[^.]+') + '$');
    const ids = [];
    for (const [type, set] of this._typeIdx) {
      if (regex.test(type)) ids.push(...set);
    }
    return ids.slice(0, limit);
  }

  causalChain(eventId, depth = 10) {
    return this._nk.ancestors(eventId, depth);
  }

  causalDescendants(eventId, depth = 5) {
    return this._nk.descendants(eventId, depth);
  }
}

function extractEntities(payload, eventType) {
  const text = JSON.stringify(payload ?? {});
  const entities = [];
  // File paths
  for (const m of text.matchAll(/[\w/.-]+\.(js|ts|json|html|md)/g))
    entities.push({ type: 'file', value: m[0] });
  // Event channels
  for (const m of text.matchAll(/(nexus|alk|gate|agent|healer|raid|manifest|crystalball)\.[a-z.]+/g))
    entities.push({ type: 'channel', value: m[0] });
  // Gap types
  for (const m of text.matchAll(/\b(missing|broken|shadow|weak|intent)\b/gi))
    entities.push({ type: 'gap_type', value: m[0].toLowerCase() });
  // Agent IDs
  for (const m of text.matchAll(/\b(ollama|chatgpt|claude|gemini)\b/gi))
    entities.push({ type: 'agent', value: m[0].toLowerCase() });
  // UUIDs
  for (const m of text.matchAll(/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/gi))
    entities.push({ type: 'uuid', value: m[0] });
  return entities;
}
```

### 3.3 Behavioral Execution Pattern Engine (crystalball/bep-engine.js)

BEP is code memory. Adapted from CrystalBall's behavioral detection engine.
The structural parallel is exact:

| CrystalBall (human signals) | NEXUS BEP (code execution) |
|---|---|
| Hedge density detector | Constraint escape detector |
| Pronoun displacement | Symbol hallucination detector |
| Somatic arousal mismatch | Schema fidelity mismatch |
| Shadow field detection | Scope creep detection |
| SlidingWindow (N=20-30) | SlidingWindow (N=10-20 calls) |
| EMA alpha=0.15 on signals | EMA alpha=0.15 on outcomes |
| Confidence tiers LOW/MED/HIGH | Same tiers on successRate |
| Composable detector classes | Composable detector classes |
| All I/O via bus only | All I/O via bus only |

```js
// crystalball/bep-engine.js
// UUID: nexus-cb-bep-0000-4000-0000-000000000020

// BEP PATTERN SCHEMA (stored in JaaDB 'bep_patterns' table):
// {
//   uuid, version, createdAt, updatedAt,
//   intentHash,       — FNV-1a hash of intent + inputContract (for exact match)
//   intent,           — "Convert raw bus event stream into structured gap records"
//   tags,             — ["gap-detection", "streaming"]
//   layer,            — "gate"
//   inputContract,    — { type: "gate.failed | gap.*", required: ["id","type","payload"] }
//   outputContract,   — { emits: "gap.found", schema: "...", guarantees: [...] }
//   behaviorGraph: {
//     steps: [
//       { id: "validate_input",  desc: "Check required fields present and typed" },
//       { id: "classify_type",   desc: "Assign gap type from taxonomy" },
//       { id: "score_severity",  desc: "Assign severity from evidence density" },
//       { id: "persist_to_jaa", desc: "Write to gaps table (before emit — §M1)" },
//       { id: "emit_gap_event",  desc: "Emit gap.found with full record" }
//     ],
//     invariants: ["persist_to_jaa runs before emit_gap_event"]
//   },
//   constraints,      — ["UUID per gap", "severity in [low,medium,high,fatal]"]
//   failureModes,     — [{ mode, mitigation }]
//   implementations,  — [{ lang: "js", file: "...", hash: "sha256:..." }]
//   metrics: { useCount, successRate, avgLatencyMs, regressionCount, lastUsed }
// }

class BEPEngine {
  constructor({ jaaDB, nexusKernel }) {
    this._jaa = jaaDB;
    this._nk  = nexusKernel;
    this._cache = new Map();  // uuid → pattern (warm cache)
  }

  // ── Retrieval (runs before every Ollama call) ──────────────────────────────

  async match(intent, inputContract = {}) {
    // Step 1: Exact hash match → reuse immediately, no Ollama call
    const exactKey = fnv1a(intent + JSON.stringify(inputContract));
    const exact = await this._jaa.query('bep_patterns', r => r.intentHash === exactKey, 1);
    if (exact.length) {
      this._nk.emit('crystalball.bep.matched', { patternId: exact[0].uuid, score: 1.0, reuseMode: 'reuse' });
      return { mode: 'reuse', pattern: exact[0], score: 1.0 };
    }

    // Step 2: Jaccard similarity over intent tokens + tags
    const candidates = await this._jaa.query('bep_patterns',
      r => r.metrics.successRate > 0.5 && r.metrics.useCount > 2, 200);
    const intentTokens = tokenize(intent);
    const scored = candidates.map(p => ({
      ...p,
      _score: jaccardScore(tokenize(p.intent + ' ' + (p.tags ?? []).join(' ')), intentTokens)
    })).filter(p => p._score > 0.25).sort((a, b) => b._score - a._score);

    if (!scored.length) return null;

    const best = scored[0];

    // Step 3: Reject degraded patterns
    if (best.metrics.regressionCount > 3) {
      this._nk.emit('crystalball.bep.degraded_skip', { patternId: best.uuid });
      return null;
    }

    const mode = best._score > 0.75 ? 'mutation' : best._score > 0.40 ? 'partial' : null;
    if (!mode) return null;

    this._nk.emit('crystalball.bep.matched', { patternId: best.uuid, score: best._score, reuseMode: mode });
    return { mode, pattern: best, score: best._score };
  }

  // ── Storage ────────────────────────────────────────────────────────────────

  async store(pattern) {
    pattern.intentHash  = fnv1a(pattern.intent + JSON.stringify(pattern.inputContract ?? {}));
    pattern.metrics     = pattern.metrics ?? { useCount: 0, successRate: 0, avgLatencyMs: 0, regressionCount: 0, lastUsed: null };
    pattern.createdAt   = pattern.createdAt ?? Date.now();
    pattern.updatedAt   = Date.now();
    await this._jaa.insert('bep_patterns', pattern);
    this._cache.set(pattern.uuid, pattern);
    this._nk.emit('crystalball.bep.stored', { patternId: pattern.uuid, intent: pattern.intent, version: pattern.version });
    return pattern;
  }

  // ── Post-gate update (EMA) ──────────────────────────────────────────────────

  async onGateResult(patternId, passed, latencyMs) {
    const p = this._cache.get(patternId) ??
      (await this._jaa.query('bep_patterns', r => r.uuid === patternId, 1))[0];
    if (!p) return;

    const a = 0.20;
    p.metrics.successRate  = ema(p.metrics.successRate,  passed ? 1 : 0, a);
    p.metrics.avgLatencyMs = ema(p.metrics.avgLatencyMs, latencyMs, a);
    p.metrics.useCount    += 1;
    p.metrics.lastUsed     = Date.now();
    if (!passed) {
      p.metrics.regressionCount += 1;
      if (p.metrics.regressionCount > 3)
        this._nk.emit('crystalball.bep.degrading', { patternId, regressionCount: p.metrics.regressionCount });
    }
    p.updatedAt = Date.now();
    await this._jaa.insert('bep_patterns', p);
    this._cache.set(p.uuid, p);
  }

  get patternCount() { return this._cache.size; }
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
function tokenize(s) { return s.toLowerCase().split(/\W+/).filter(t => t.length > 2); }
function ema(cur, val, a) { return cur == null ? val : cur * (1 - a) + val * a; }
function jaccardScore(a, b) {
  const sa = new Set(a), sb = new Set(b);
  const inter = [...sa].filter(x => sb.has(x)).length;
  return inter / (sa.size + sb.size - inter || 1);
}
```

### 3.4 Memory Crystallization Layer (crystalball/mcl.js)

Without crystallization, stored events become sludge. MCL is the selection
pressure layer that determines what becomes stable intelligence vs what decays.

**The four states:**
```
RAW EVENT → ACTIVE TRACE → CANDIDATE CRYSTAL → STABLE CRYSTAL
```

Only Stable Crystals receive priority retrieval weighting. Everything else
decays unless reinforced. This is what prevents log inflation from destroying
cognition over time.

```js
// crystalball/mcl.js
// UUID: nexus-cb-mcl-0000-4000-0000-000000000030

// NOVEL DESIGN DECISIONS:
//
// 1. TYPE WEIGHTS — not all events are equal intelligence sources
//    failure:          1.50   (failures teach most)
//    fix_map:          1.40
//    bep_pattern:      1.35
//    agent_call:       1.20
//    gap.found:        1.15
//    alignment.scanned:1.10
//    gate.failed:      1.30   (failures > passes)
//    gate.passed:      0.90
//    bridge_message:   0.70
//    event_log:        0.60
//
// 2. DECAY PHYSICS — exponential decay with reinforcement brake
//    decay = e^(-0.1 × ageHours) × (1 - reinforcementScore)
//    No reinforcement → fades in ~7 hours (half-life)
//    Reinforcement (retrieval access, feedback) → resists decay
//
// 3. CANDIDATE CONDITIONS (any 2 of 5)
//    A. Referenced ≥ 3 times in retrieval
//    B. Appears in ≥ 2 retrieval lanes
//    C. Feedback score > 7
//    D. Participates in a causal loop (causes something that causes it)
//    E. BEP pattern with successRate > 0.75 AND useCount > 5
//
// 4. STABILITY SCORE (all 3 required for promotion)
//    stability > 0.85
//    recurrenceHalfLife > 86,400,000ms (24 hours)
//    crossLaneCount >= 2
//
//    stability = (recurrence × 0.25) + (causal × 0.25) + (crossLane × 0.20)
//              + (feedback × 0.20) + (bepSuccess × 0.10) - (contradiction × 0.15)
//
// 5. CONTRADICTIONS REDUCE STABILITY (not deletion)
//    A memory item with conflicting evidence has lower stability_score.
//    It still exists. It still retrieves. It just doesn't become a crystal.
//    This prevents hallucinated patterns from crystallizing into "facts."
//
// 6. FIVE CRYSTAL FIELDS (multi-dimensional positioning)
//    causal:     upstream causes + downstream effects
//    semantic:   keyword cluster + concept overlap
//    behavioral: BEP links + agent success history
//    temporal:   recurrence timing + decay resistance
//    relational: entity graph (module → gap → agent → fix)

class MemoryCrystallizationLayer {
  constructor({ jaaDB, nexusKernel, latticeBridge }) {
    this._jaa  = jaaDB;
    this._nk   = nexusKernel;
    this._lb   = latticeBridge;
    this._activeTraces  = new Map();  // traceId → trace (decaying hot cache)
    this._crystals      = new Map();  // crystalId → crystal
  }

  async process(event, context = {}) {
    const score = computeSignalScore(event, context);

    if (score < 0.30) {
      return { state: 'archived', eventId: event.id };
    }

    const trace = await this._toActiveTrace(event, score);
    const cluster = await this._updateCluster(trace);

    if (this._isCandidate(cluster)) {
      const crystal = await this._formCandidateCrystal(cluster, event);
      if (this._isStable(crystal)) {
        await this._promoteToStable(crystal);
        this._nk.emit('crystalball.crystal.formed', {
          crystalId:    crystal.uuid,
          stability:    crystal.stabilityScore,
          fields:       Object.keys(crystal.fields),
          eventId:      event.id,
        });
        return { state: 'crystallized', crystalId: crystal.uuid };
      }
      return { state: 'candidate', crystalId: crystal.uuid };
    }
    return { state: 'trace', traceId: trace.uuid };
  }

  _isCandidate(cluster) {
    let n = 0;
    if ((cluster.accessCount ?? 0) >= 3)            n++;
    if ((cluster.laneCount ?? 0) >= 2)              n++;
    if ((cluster.feedbackScore ?? 0) > 7)           n++;
    if (cluster.inCausalLoop)                       n++;
    if ((cluster.bepSuccessRate ?? 0) > 0.75 && (cluster.bepUseCount ?? 0) > 5) n++;
    return n >= 2;
  }

  _isStable(crystal) {
    return crystal.stabilityScore > 0.85
      && (crystal.recurrenceHalfLife ?? 0) > 86_400_000
      && (crystal.crossLaneCount ?? 0) >= 2;
  }

  _computeStability(cluster) {
    const recur   = Math.min((cluster.accessCount ?? 0) / 10, 1);
    const causal  = cluster.causalIntegration ?? 0;
    const cross   = (cluster.laneCount ?? 0) >= 2 ? 1 : (cluster.laneCount ?? 0) / 2;
    const feed    = Math.min((cluster.feedbackScore ?? 5) / 10, 1);
    const bep     = cluster.bepSuccessHistory ?? 0;
    const contra  = cluster.contradictionScore ?? 0;
    return (recur * 0.25) + (causal * 0.25) + (cross * 0.20)
         + (feed * 0.20) + (bep * 0.10) - (contra * 0.15);
  }

  async sweep() {
    // Promotion sweep — runs on automation schedule or manual cb.crystal.sweep
    let promoted = 0;
    for (const [id, crystal] of this._crystals) {
      if (crystal.state === 'candidate' && this._isStable(crystal)) {
        await this._promoteToStable(crystal);
        promoted++;
      }
    }
    this._nk.emit('crystalball.mcl.sweep.complete', { promoted, total: this._crystals.size });
    return promoted;
  }

  async _promoteToStable(crystal) {
    crystal.state         = 'stable';
    crystal.promotedAt    = Date.now();
    crystal.stabilityScore = this._computeStability(crystal);
    await this._jaa.insert('crystals', crystal);
    this._crystals.set(crystal.uuid, crystal);
  }

  async _toActiveTrace(event, score) {
    const trace = {
      uuid:       `trace-${event.id}`,
      eventId:    event.id,
      eventType:  event.type,
      signalScore:score,
      accessCount:0,
      laneCount:  0,
      createdAt:  Date.now(),
      wall:       event.wall ?? Date.now(),
    };
    await this._jaa.insert('active_traces', trace).catch(() => {});
    this._activeTraces.set(trace.uuid, trace);
    return trace;
  }

  async _updateCluster(trace) {
    // Cluster: aggregate of all traces referencing the same event or entity
    // Simplified: treat trace itself as cluster for now.
    // Future: merge traces that share entities within a time window.
    return {
      ...trace,
      bepSuccessRate:    0,
      bepUseCount:       0,
      bepSuccessHistory: 0,
      inCausalLoop:      false,
      causalIntegration: 0,
      contradictionScore:0,
    };
  }

  async _formCandidateCrystal(cluster, event) {
    const stability = this._computeStability(cluster);
    const crystal = {
      uuid:             `crystal-${event.id}`,
      state:            'candidate',
      coreEventId:      event.id,
      coreEventType:    event.type,
      stabilityScore:   stability,
      crossLaneCount:   cluster.laneCount ?? 0,
      recurrenceHalfLife: 0,
      accessCount:      cluster.accessCount ?? 0,
      feedbackAlignment:Math.min((cluster.feedbackScore ?? 5) / 10, 1),
      causalIntegration:cluster.causalIntegration ?? 0,
      contradictionScore:cluster.contradictionScore ?? 0,
      fields: {
        causal:     this._lb.causalChain(event.id, 3).map(n => n.id),
        semantic:   [],
        behavioral: [],
        temporal:   { createdAt: Date.now(), firstAccessAt: null },
        relational: [],
      },
      createdAt: Date.now(),
    };
    this._crystals.set(crystal.uuid, crystal);
    return crystal;
  }

  get stableCrystals()   { return [...this._crystals.values()].filter(c => c.state === 'stable'); }
  get candidateCrystals(){ return [...this._crystals.values()].filter(c => c.state === 'candidate'); }
}

function computeSignalScore(ev, ctx) {
  const W = {
    'failures': 1.50, 'fix_map': 1.40, 'bep_patterns': 1.35, 'agent_calls': 1.20,
    'gap.found': 1.15, 'gate.failed': 1.30, 'alignment.scanned': 1.10,
    'manifest.ready': 1.05, 'gate.passed': 0.90, 'bridge_message': 0.70,
  };
  const tw      = W[ev.type] ?? W[ev._sourceTable] ?? 0.60;
  const ageH    = (Date.now() - (ev.wall ?? Date.now())) / 3_600_000;
  const recency = Math.exp(-0.1 * ageH);
  const feed    = ctx.feedbackScore ? Math.min(ctx.feedbackScore / 10, 1) : 0.5;
  const causal  = Math.min((ctx.causalDepth ?? 0) / 10, 1);
  return tw * recency * (0.4 + 0.2 * feed + 0.2 * causal);
}
```

### 3.5 Memory Query Layer (crystalball/mql.js)

Five-lane parallel retrieval. Scored. Compressed. Recall-traced.
Ollama receives assembled intelligence, not a log dump.

```js
// crystalball/mql.js
// UUID: nexus-cb-mql-0000-4000-0000-000000000040

// FIVE LANES (parallel, each answers a different question):
//
// Lane A — Lexical      "what mentions this keyword?"
//           → memory_index entity query via latticeBridge
//
// Lane B — Causal       "what caused or was caused by the anchor event?"
//           → ancestors(id, 5) + descendants(id, 3)
//
// Lane C — Failure      "what has failed like this + what fixed it?"
//           → failures table (open, matching keywords)
//           → fix_map table (matching recurrenceKey)
//
// Lane D — BEP          "what patterns solved this before?"
//           → bep_patterns Jaccard intent similarity
//
// Lane E — Recency      "what just happened?"
//           → ring buffer tail (last 20 events)
//           → agent_calls last 5 for session
//
// INTENT CLASSIFICATION (local, no LLM):
//   "why | fail | error | broke"     → debug_failure   lanes [B,C,E]
//   "fill | gap | implement | stub"  → gap_fill         lanes [A,D,E]
//   "continue | resume | last"       → session_resume   lanes [E,B,A]
//   "caused | trace | chain"         → causal_trace     lanes [B,C]
//   "pattern | bep | reuse"          → pattern_lookup   lanes [D,A]
//   (default)                        → general          lanes [A,B,D,E]
//
// SCORING PHYSICS:
//   score = typeWeight
//         × recencyDecay        e^(-0.1 × ageHours)
//         × (kwMatch × 0.30
//            + causalProx × 0.25
//            + freqBoost × 0.20
//            + laneWeight × 0.25)
//         × failurePenalty      (0.4 if fix failed more than succeeded)
//
// TOKEN BUDGET: 12,000 tokens for memory section of ContextPacket.
//   Truncation order (never truncate: open failures, fix_map, stable crystals):
//   1. Low-score lane A (score < 0.30)
//   2. Old ring tail (age > 2h)
//   3. Bridge messages (keep latest 5)
//   4. Agent calls (keep last 3)
//
// RECALL TRACE: stored in 'memory_queries' table.
//   Includes: lanes_fired, items_used[] with id+type+lane+score.
//   Ollama system prompt: "Cite sources by id from recall_trace.items_used."
//   Structural hallucination prevention — no invented source IDs possible.

class MemoryQueryLayer {
  constructor({ jaaDB, nexusKernel, latticeBridge, bepEngine }) {
    this._jaa = jaaDB;
    this._nk  = nexusKernel;
    this._lb  = latticeBridge;
    this._bep = bepEngine;
  }

  async query(input, sessionId) {
    const qi = interpretQuery(input, sessionId);

    const [lA, lB, lC, lD, lE] = await Promise.all([
      qi.lanes.includes('A') ? this._laneA(qi)          : [],
      qi.lanes.includes('B') ? this._laneB(qi)          : [],
      qi.lanes.includes('C') ? this._laneC(qi)          : { failures: [], fixes: [] },
      qi.lanes.includes('D') ? this._laneD(qi)          : [],
      qi.lanes.includes('E') ? this._laneE(qi.sessionId): { ringTail: [], calls: [] },
    ]);

    const all = [
      ...lA.map(i => ({ ...i, _lane: 'A', _sourceTable: i._sourceTable ?? 'memory_index' })),
      ...lB.map(i => ({ ...i, _lane: 'B' })),
      ...(lC.failures ?? []).map(i => ({ ...i, _lane: 'C', _sourceTable: 'failures' })),
      ...(lC.fixes    ?? []).map(i => ({ ...i, _lane: 'C', _sourceTable: 'fix_map' })),
      ...lD.map(i => ({ ...i, _lane: 'D', _sourceTable: 'bep_patterns' })),
      ...(lE.ringTail ?? []).map(i => ({ ...i, _lane: 'E', _sourceTable: 'event_log' })),
      ...(lE.calls    ?? []).map(i => ({ ...i, _lane: 'E', _sourceTable: 'agent_calls' })),
    ];

    const now = Date.now();
    const scored = all
      .map(i => ({ ...i, _score: scoreItem(i, qi, now) }))
      .sort((a, b) => b._score - a._score);

    const compressed = compress(scored, 48_000);

    const traceId = `trace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,5)}`;
    const trace = {
      uuid:              traceId,
      queryIntent:       qi.mode,
      wall:              now,
      lanes_fired:       qi.lanes,
      retrieval_counts:  { A: lA.length, B: lB.length, C: (lC.failures?.length ?? 0), D: lD.length, E: (lE.ringTail?.length ?? 0) },
      final_included:    compressed.included.length,
      items_used:        compressed.included.map(i => ({ id: i.uuid ?? i.id, type: i.type ?? i.eventType, lane: i._lane, score: Math.round((i._score ?? 0) * 100) / 100 })),
      truncated:         compressed.truncated,
    };
    await this._jaa.insert('memory_queries', trace).catch(() => {});

    this._nk.emit('crystalball.memory.retrieved', {
      queryId:   traceId,
      itemCount: compressed.included.length,
      intent:    qi.mode,
    });

    return { sections: compressed.sections, trace };
  }

  async _laneA(qi) {
    const ids = new Set();
    for (const kw of qi.keywords) {
      const hits = this._lb.queryByKeyword(kw, 30);
      hits.forEach(id => ids.add(id));
    }
    // Resolve event IDs to records
    const resolved = await this._jaa.query('event_log',
      r => ids.has(r.uuid ?? r.id), 50);
    return dedup(resolved);
  }

  async _laneB(qi) {
    let anchorId = qi.anchorId;
    if (!anchorId && qi.entities.length) {
      const hits = await this._jaa.query('event_log',
        r => qi.entities.some(e => JSON.stringify(r.payload ?? {}).includes(e.value)), 5);
      anchorId = hits[0]?.uuid ?? hits[0]?.id;
    }
    if (!anchorId) return [];
    const chain = this._lb.causalChain(anchorId, 5);
    const desc  = this._lb.causalDescendants(anchorId, 3);
    return [...chain, ...desc].map((n, i) => ({ ...n, _causalDistance: i }));
  }

  async _laneC(qi) {
    const failures = await this._jaa.query('failures', r =>
      !r.resolved && qi.keywords.some(kw =>
        ((r.type ?? '') + (r.code ?? '')).toLowerCase().includes(kw)), 20);
    const fixes = [];
    for (const f of failures) {
      const fm = await this._jaa.query('fix_map', r => r.recurrenceKey === f.recurrenceKey, 5);
      fixes.push(...fm);
    }
    return { failures, fixes };
  }

  async _laneD(qi) {
    const match = await this._bep.match(qi.intent, {});
    return match?.pattern ? [match.pattern] : [];
  }

  async _laneE(sessionId) {
    const ringTail = this._nk.snapshot(20);
    const calls = sessionId
      ? await this._jaa.query('agent_calls', r => r.sessionId === sessionId, 5)
      : [];
    return { ringTail, calls };
  }
}

function interpretQuery(input, sessionId) {
  const text  = typeof input === 'string' ? input : (input?.text ?? '');
  const lower = text.toLowerCase();
  let mode, lanes;
  if (/\b(why|fail|error|broke|crash|exception)\b/.test(lower)) { mode = 'debug_failure';  lanes = ['B','C','E']; }
  else if (/\b(fill|gap|implement|stub|missing)\b/.test(lower)) { mode = 'gap_fill';        lanes = ['A','D','E']; }
  else if (/\b(continue|resume|last session)\b/.test(lower))    { mode = 'session_resume';  lanes = ['E','B','A']; }
  else if (/\b(caused|trace|chain|upstream)\b/.test(lower))     { mode = 'causal_trace';    lanes = ['B','C']; }
  else if (/\b(pattern|bep|reuse|similar)\b/.test(lower))       { mode = 'pattern_lookup';  lanes = ['D','A']; }
  else                                                           { mode = 'general';          lanes = ['A','B','D','E']; }
  return {
    mode, lanes,
    intent:    text,
    keywords:  tokenize(text),
    entities:  extractEntities({ query: text }, ''),
    sessionId: sessionId ?? (typeof input === 'object' ? input.sessionId : null),
    anchorId:  typeof input === 'object' ? input.anchorId : null,
  };
}

function scoreItem(item, qi, now) {
  const W = { 'failures': 1.50, 'fix_map': 1.40, 'bep_patterns': 1.35,
              'agent_calls': 1.20, 'gaps': 1.15, 'event_log': 0.80 };
  const tw    = W[item._sourceTable ?? 'event_log'] ?? 0.80;
  const ageH  = (now - (item.wall ?? item.ts ?? now)) / 3_600_000;
  const decay = Math.exp(-0.1 * ageH);
  const acc   = Math.log1p(item.accessCount ?? item.useCount ?? item.occurrenceCount ?? 0) / Math.log1p(100);
  const text  = JSON.stringify(item).toLowerCase();
  const kw    = qi.keywords.length ? qi.keywords.filter(k => text.includes(k)).length / qi.keywords.length : 0.5;
  const prox  = item._causalDistance != null ? Math.max(0, 1 - item._causalDistance / 10) : 0;
  const lw    = { A: 0.7, B: 1.0, C: 0.95, D: 0.9, E: 0.85 }[item._lane ?? 'A'];
  const failP = (item._sourceTable === 'fix_map' && (item.failCount ?? 0) > (item.successCount ?? 0)) ? 0.4 : 1.0;
  return tw * decay * (kw * 0.30 + prox * 0.25 + acc * 0.20 + lw * 0.25) * failP;
}

function compress(scored, budgetChars) {
  const seen = new Set();
  const deduped = scored.filter(i => {
    const id = i.uuid ?? i.id;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const sections = { causal_thread: [], known_failures: [], fix_strategies: [], bep_matches: [], recent_state: [], related_events: [] };
  const included = [];
  let used = 0, truncated = false;
  const PROTECTED = i => (i._sourceTable === 'failures' && !i.resolved) || i._sourceTable === 'fix_map' || i._crystalState === 'stable';
  for (const item of deduped) {
    const sz = JSON.stringify(item).length;
    if (used + sz > budgetChars && !PROTECTED(item)) { truncated = true; continue; }
    used += sz;
    included.push(item);
    const { _lane, _score, _causalDistance, _sourceTable, _crystalState, ...clean } = item;
    const s = { ...clean, _relevance: Math.round((_score ?? 0) * 100) / 100 };
    if (_lane === 'B')                        sections.causal_thread.push(s);
    else if (_sourceTable === 'failures')     sections.known_failures.push(s);
    else if (_sourceTable === 'fix_map')      sections.fix_strategies.push(s);
    else if (_lane === 'D')                   sections.bep_matches.push(s);
    else if (_lane === 'E')                   sections.recent_state.push(s);
    else                                      sections.related_events.push(s);
  }
  return { sections, included, truncated };
}

function dedup(arr) {
  const seen = new Set();
  return arr.filter(i => { const id = i.uuid ?? i.id; if (seen.has(id)) return false; seen.add(id); return true; });
}
```

### 3.6 CFR bridge (canvas/spec-b/bridge/bus-to-cfr.js)

```js
// NEXUS bus events → CFR node attributes
// CFR code (CrystalBall modules/ALK/modules/cfr/) unchanged — bus subscriber only

const BUS_TO_CFR = {
  'gate.passed':              (ev, cfr) => cfr.updateNode(ev.payload.nodeId, { fidelity: 0.2 }),
  'gate.failed':              (ev, cfr) => cfr.updateNode(ev.payload.nodeId, { entropy: 0.5 }),
  'gap.found':                (ev, cfr) => cfr.spawnNode({ entropy: 0.8, type: 'gap', sourceId: ev.payload.manifestNodeId }),
  'healer.resolved':          (ev, cfr) => cfr.updateNode(ev.payload.gapId,  { entropy: -0.4 }),
  'healer.exhausted':         (ev, cfr) => cfr.setNodeRed(ev.payload.gapId),
  'agent.response.received':  (ev, cfr) => cfr.attentionPulse(ev.payload.agentId),
  'agent.rate_limited':       (ev, cfr) => cfr.updateNode(ev.payload.agentId, { entropy: 0.3 }),
  'usage.exhausted':          (ev, cfr) => cfr.expelNode(ev.payload.agentId),
  'manifest.ready':           (_,  cfr) => cfr.fidelityField(),
  'ollama.ping.ok':           (_,  cfr) => cfr.pulseGreen('ollama'),
  'ollama.unavailable':       (_,  cfr) => cfr.globalDrift(),
  'crystalball.crystal.formed':(ev, cfr) => cfr.spawnNode({ entropy: 0.1, type: 'crystal', stable: true }),
  'crystalball.bep.matched':  (ev, cfr) => cfr.wiresPulse(ev.payload.patternId),
};
```

### 3.7 Boot integration (addition to boot.js)

```js
// boot.js — ADDITION after existing module wiring

const { jaaDB }            = require('./memory/jaa-db');
const { LatticeBridge }    = require('./crystalball/lattice-bridge');
const { BEPEngine }        = require('./crystalball/bep-engine');
const { MemoryCrystallizationLayer } = require('./crystalball/mcl');
const { MemoryQueryLayer } = require('./crystalball/mql');

// ── JaaDB v2 ─────────────────────────────────────────────────────────────────
await jaaDB.open();  // opens all tables (browser: IndexedDB, Node: JSONL)

// ── CrystalBall Module ────────────────────────────────────────────────────────
const lb  = new LatticeBridge({ nexusKernel: kernel, jaaDB });
lb.attach();   // wildcard subscription — every event enters lattice

const bep = new BEPEngine({ jaaDB, nexusKernel: kernel });
const mcl = new MemoryCrystallizationLayer({ jaaDB, nexusKernel: kernel, latticeBridge: lb });
const mql = new MemoryQueryLayer({ jaaDB, nexusKernel: kernel, latticeBridge: lb, bepEngine: bep });

// Process all significant events through MCL
kernel.on('gate.failed',             e => mcl.process(e, { causalDepth: 3 }));
kernel.on('gap.found',               e => mcl.process(e, { causalDepth: 2 }));
kernel.on('healer.exhausted',        e => mcl.process(e, { causalDepth: 4 }));
kernel.on('agent.response.received', e => mcl.process(e));
kernel.on('alignment.scanned',       e => mcl.process(e));

// BEP updates after gate results
kernel.on('gate.passed', e => {
  if (e.payload.bepPatternId) bep.onGateResult(e.payload.bepPatternId, true,  e.payload.latencyMs ?? 0);
});
kernel.on('gate.failed', e => {
  if (e.payload.bepPatternId) bep.onGateResult(e.payload.bepPatternId, false, e.payload.latencyMs ?? 0);
});

// Expose MQL for Ollama context-builder
module.exports.mql = mql;
module.exports.bep = bep;
module.exports.mcl = mcl;

kernel.emit('crystalball.ready', {
  uuid:        'nexus-mod-crystalball-0000-4000-0000-000000000001',
  latticeSize: 0,
  bepCount:    0,
  mclActive:   true,
});
```

---

## 4. JAADB — PERSISTENT STORAGE

Dual-backend: IndexedDB in browser contexts, JSONL filesystem in Node.js.
Same API across both. The browser already has jaa-browser.js. Node.js
context uses the causal-nexus persist filesystem backend as the equivalent.

**All tables (complete list):**
```
EXISTING (jaa-browser.js v1):
  events              ALK behavioral events
  debug_log           StreamLog archival
  attractor_maps      Trajectory attractor landscape
  session_log         ALK session records
  landmark_log        MediaPipe landmark log

NEW (JaaDB v2 — open all in memory/jaa-db.js):
  event_log           Every NEXUS bus event (wildcard subscription)
  artifacts           Content-addressed files, all versions
  gaps                Detected gaps, status, fill history
  failures            All failures: classified, tagged, recurrenceKey
  fix_map             Failure→fix accumulator (confidence EMA)
  bep_patterns        BEP pattern library
  agent_calls         Every Ollama + Guardian request + response
  agent_signatures    ASE live self-models per agent
  memory_index        Entity/keyword/type retrieval index
  memory_queries      MQL query records + recall traces
  crystals            MCL crystal records (candidate + stable)
  active_traces       MCL active trace buffer
  bridge_messages     WS bridge message log
  schedules           Automation schedule definitions
  workflow_runs       Automation execution records
  feedback_scores     HITL ratings per agent call
  conditioning_log    Inter-agent conditioning records
```

---

## 5. GUARDIAN — IDENTITY BRIDGE

```
guardian/
├── manifest.json      MV2, Firefox, all permissions
├── background.js      Service worker. Listens port 7771. BroadcastChannel
│                      heartbeat (detects other Guardians on network → peer routing).
│                      CDP attach. Connects pipelines for distributed fallback.
├── content.js         Element picker → callto UUIDs. MutationObserver →
│                      response completion detection. Message relay.
├── popup.html         3 tabs: STATUS · CALLTOS · DEVICES
├── popup.js           Lean, URCK-aware
├── urck.js            URCK kernel: event ledger, snapshot, replay.
│                      Every callto execution logged. Replayable.
├── bridge-sync.js     Sync with NEXUS ws-server (port 7771)
└── modules/
    ├── base-module.js  GuardianModule: attach(), observe(), inject(text), scrape()
    ├── chatgpt.js      chatgpt.com — textarea inject, response scrape, usage DOM
    ├── claude.js       claude.ai — inject, scrape, usage
    └── gemini.js       gemini.google.com — inject, scrape, usage

CALLTO SCHEMA:
{ uuid, selector, site, intent, hookPath }

GUARDIAN FLOW:
  raid.routed { agent: 'chatgpt' }
  → guardianRequest('chatgpt', prompt) → POST localhost:7771/api/complete
  → background.js → content.js: inject textarea
  → MutationObserver: watches response completion
  → scrape → return → agent.response.received
```

---

## 6. CONTEXT PACKET — OLLAMA REQUEST FORMAT

```json
{
  "uuid":      "ctx-uuid",
  "sessionId": "session-uuid",
  "causedBy":  "triggering-event-id",

  "agent": {
    "agentId":  "deepseek-coder-v2",
    "model":    "deepseek-coder-v2:16b-lite-instruct-q4_K_M",
    "options":  { "temperature": 0, "num_ctx": 4096, "num_thread": 7, "repeat_penalty": 1.1 }
  },

  "gap": {
    "id":             "gap-uuid",
    "type":           "missing_implementation",
    "file":           "gate/gap-finder.js",
    "lineRange":      [42, 58],
    "allowedScope":   "function_body_only",
    "allowedImports": ["SlidingWindow", "clamp", "mean"],
    "fim_mode":       true
  },

  "bep": {
    "matchedPattern":  "bep-uuid",
    "matchScore":      0.82,
    "reuseMode":       "mutation",
    "behaviorGraph":   ["validate_input", "classify_type", "score_severity", "persist_to_jaa", "emit_gap_event"]
  },

  "memory": {
    "causal_thread":   [],
    "known_failures":  [],
    "fix_strategies":  [],
    "bep_matches":     [],
    "recent_state":    [],
    "recall_trace_id": "trace-uuid"
  },

  "agentProfile": {
    "gatePassRate":         0.78,
    "hallucinationRate":    0.08,
    "constraintEscapeRate": 0.14,
    "appliedMitigations":   ["hard_stop_enforcement", "allowed_imports_enumerated"]
  },

  "constraints": [
    "STOP at line 58. Do not write beyond this point.",
    "ALLOWED IMPORTS ONLY: SlidingWindow, clamp, mean",
    "Output: unified diff only. No full file. No explanation.",
    "GAP_UNFILLABLE: <reason> if constraint cannot be satisfied."
  ],

  "systemPrompt": "You are operating inside NEXUS — a causal memory system. You receive a ContextPacket. Cite every claim using an id from memory.recall_trace.items_used. Do not invent source IDs. If context is insufficient: INSUFFICIENT_CONTEXT: <what is missing>."
}
```

---

## 7. AUTOMATION ENGINE

### Trigger types
```
cron:       standard cron expression (0 2 * * *)
interval:   every N ms with drift correction
event:      bus channel subscription with safe filter expression
condition:  polling at checkEvery ms, fires on leading edge (false→true only)
chain:      fires after another schedule succeeds/fails
manual:     trigger only via CLI or admin UI
```

### System variable namespace
```
{{system.wall}}                    current timestamp
{{system.tick}}                    current kernel tick
{{agent.<id>.status}}              available | busy | error | unreachable
{{agent.<id>.gatePassRate}}        live from agent_signatures
{{agent.<id>.hallucinationRate}}   live from agent_signatures
{{jaa.gaps.openCount}}             open gaps in JaaDB
{{jaa.failures.unresolvedCount}}   unresolved failures
{{schedule.lastRunAt}}             prior run timestamp
{{step-<id>.result}}               prior step full result
{{step-<id>.status}}               pass | fail | skip | timeout
{{memory.ring.tail(10)}}           last 10 ring events
{{memory.failures.recent(5)}}      5 most recent unresolved failures
{{crystalball.crystals.count}}     total crystal count
{{crystalball.bep.topPatterns(3)}} top 3 BEP patterns by successRate
```

### Step types
```
emit:       kernel.emit(channel, payload) + optional waitFor + timeout
agent_call: build ContextPacket + route to agent via RAID
loop:       iterate over array variable, nested step per item
condition:  branch to onTrue/onFalse step based on expression
store:      write record to JaaDB table
memory:     run MQL query, result stored in step variable
delay:      wait N ms (rate limiting, pacing)
notify:     broadcast to bridge (admin UI sees it)
cli:        emit CLI event (same as running nexus command)
```

### Example: self-review loop
```json
{
  "name": "Gap fill with self-review",
  "trigger": { "type": "event", "channel": "gap.found",
    "filter": "payload.severity === 'high' || payload.severity === 'fatal'" },
  "steps": [
    { "id": "s1", "type": "agent_call", "agentId": "ollama", "mode": "gap-fill",
      "payload": { "gapId": "{{trigger.payload.uuid}}" } },
    { "id": "s2", "type": "agent_call", "agentId": "ollama", "mode": "review",
      "payload": { "patchDiff": "{{s1.result.diff}}",
                   "contract":  "{{trigger.payload.contract}}" } },
    { "id": "s3", "type": "condition", "check": "{{s2.result.approved}} === true",
      "onTrue":  { "type": "emit", "channel": "nexus.code.diff.apply",
                   "payload": { "diffId": "{{s1.result.diffId}}" } },
      "onFalse": { "type": "agent_call", "agentId": "ollama", "mode": "gap-fill",
                   "payload": { "gapId": "{{trigger.payload.uuid}}",
                                "priorCritique": "{{s2.result.critique}}" },
                   "maxRetries": 2 } },
    { "id": "s4", "type": "store", "table": "conditioning_log",
      "payload": { "agentId": "ollama", "conditionType": "quality_relay",
                   "signal": { "score": "{{s2.result.score}}", "outcome": "{{s3.status}}" } } }
  ]
}
```

---

## 8. AGENT SELF-MODELS

### deepseek-coder-v2:16b-lite-instruct-q4_K_M (Law I — always primary)
```
context:    4096 tokens (R7 3700x, 7 threads)
strengths:  surgical patch in tight lineRange, FIM format, schema-constrained output
weaknesses: hallucinated imports, constraint escape above 3K output, full-file tendency
fim:        prefix <｜fim▁begin｜>  suffix <｜fim▁hole｜>  middle <｜fim▁end｜>
failures:   constraint_violated (0.15) → hard stop + lineRange in line 1 of system
            hallucinated_import (0.08) → enumerate all allowed imports explicitly
            schema_mismatch (0.12)     → bad-output example in system prompt
optimal:    gap-fill ≤50 lines, debug root cause, test-gen from event schema
dynamic:    updated from agent_signatures via ASE EMA alpha=0.15 after every call
```

### ChatGPT (priority 2 — small scripts, quick fixes)
```
access:     Guardian → chatgpt.com/c/
context:    32K (GPT-4o)
optimal:    small utilities, quick fixes, wherever Ollama fails
weakness:   truncation above 10k tokens
```

### Gemini (priority 3 — adversarial testing)
```
access:     Guardian → gemini.google.com
optimal:    adversarial test generation, logic verification, alternative designs
```

### Claude (priority 4 — large files, last resort before API)
```
access:     Guardian → claude.ai/chat
context:    200K tokens
optimal:    large complex files, full module rewrites, last before API call
```

---

## 9. FULL EVENT FLOW

```
input.received
  → translation.normalizing         (IntentIR — concept grounding, CONCEPT_GRAPH)
  → translation.clarifying          (ambiguous terms → clarification queue)
  → translation.complete
  → manifest.generating             (Ollama temp:0, AJV, reject+retry ×3)
  → manifest.validated | manifest.rejected
  → manifest.ready
  → alignment.scanned               (IR→manifest delta, shadow/missing detection)
  → index.querying                  (JAA FileStore reuse check)
  → index.hit (reuse) | index.miss
  → crystalball.bep.query           (BEP match before RAID/Ollama)
      hit → reuse or mutation (Ollama call may be skipped entirely)
      miss → proceed to RAID
  → raid.deciding                   (Law I: Ollama first unless >90%)
      Ollama orchestrate(): reads delta logs + code catalog + agent signatures
      → raid.routed { agent, fallbackChain }
  → agent.received_task
  → (ollama) localhost:11434/api/generate  (streaming, FIM mode for gap-fill)
    (cloud)  guardian.callto → inject → scrape → return
  → agent.response.streaming
  → agent.response.received
  → crystalball.mcl.process         (signal score → trace/candidate/crystal)
  → gate.running
  → gate.passed | gate.failed
      (passed) → crystalball.bep.update (successRate ↑)
               → nex.updated
      (failed) → gap.found
               → crystalball.mcl.process (failure → type weight 1.30)
               → healer.started (MAX_DEPTH:5)
               → if 2nd fail: raid.reroute to fallback chain
  → output.ready
  → nex.updated  (every 2s + fork on phase/gate boundary)
```

---

## 10. BUILD PHASES

```
PHASE 1  Foundation (COMPLETE — nexus-core.zip)
         siso.js, kernel.js, FileStore, FileRefs
         manifest, RAID, usage, translation, alignment
         agents (Ollama + Guardian bridge), gate, healer, cli, boot
         admin/index.html, admin/alignment.html

PHASE 2  CrystalBall Module (build next)
         memory/jaa-db.js              Dual-backend (G8 — blocks everything)
         crystalball/lattice-bridge.js
         crystalball/bep-engine.js
         crystalball/mcl.js
         crystalball/mql.js
         crystalball/index.js
         crystalball/schema.json
         Boot integration (boot.js additions)
         crystalball/tests/crystalball.test.js

PHASE 3  Completion of missing nexus-core pieces
         agents/*/selectors.js + limits.js  (all 3 cloud agents)
         guardian/ full Firefox extension
         gate/generator.js, recursive.js, verifier.js
         healer/fix-spec.js, retry.js, escalator.js
         .nex fork logic on gate boundaries
         logs/ directory + failure/delta loggers
         schemas/ remaining (plugin, gap, callto, intent, bep, crystal, schedule)
         config/ (intent.config.json, services.json, raid-weights.json, thresholds.json)
         plugins/_registry.js
         Homepage (welcome screen, project list, module library)

PHASE 4  Memory + Automation
         memory/agent-memory.js       ASE for agent self-models
         memory/continuous-stream.js  LLM session ring buffer
         memory/lattice-index.js      Full lattice persistence
         memory/fix-map.js
         memory/feedback-weighter.js
         automation/engine.js
         automation/variable-resolver.js
         automation/step-executor.js
         automation/condition-evaluator.js  (hand-rolled, no eval())

PHASE 5  Spec A Canvas + Admin Completion
         canvas/spec-a/ (React Flow pipeline, all node types, Zustand)
         NodeInspector + RewindScrubber
         admin/ new pages: Guardian, CrystalBall, Memory, Automation, Feedback
         Full CRUD on all existing admin pages

PHASE 6  Spec B Canvas (CFR — wire only, no CFR code changes)
         canvas/spec-b/bridge/bus-to-cfr.js
         CFR drops in as bus subscriber plugin
         Projects tab: CFR + timeline + diagnostic + test suite
```

---

## 11. OPEN GAPS (§1.2)

```
G1  .nex fork missing  — saves but does not fork on gate boundaries.
    Add in Phase 3.

G2  Cloud agent selectors/limits not built  — blocks reliable fallback routing.
    All cloud fallback currently untested end-to-end. Build first in Phase 3.

G3  Guardian Firefox extension not built  — all cloud paths route through it.
    Build in Phase 3 immediately after G2.

G4  AST parser choice  — Acorn (JS, mature, zero deps) recommended for Phase 2.
    tree-sitter as optional Phase 6 extension for Rust/Python/Go.

G5  Safe expression evaluator for automation  — hand-rolled subset evaluator.
    No eval(). Supports: dot-path access, comparison, boolean, ternary.
    Build in Phase 4 before automation engine ships.

G6  BEP Jaccard thresholds (0.25 mutation, 0.75 reuse) are priors.
    Calibrate after first 100 patterns. Not a blocker.

G7  MCL stability thresholds (0.85, 24h, 2 lanes) are priors.
    Validate empirically in Phase 4. Not a blocker.

G8  JaaDB dual-backend  — jaa-browser.js uses IndexedDB (browser only).
    Node.js (CLI, boot.js) needs filesystem backend.
    Use causal-nexus persist layer (filesystem JSONL) as Node.js equivalent.
    Same API surface. Two backends. Implement in memory/jaa-db.js FIRST.
    This blocks Phase 2 start. Build first.
```

---

## 12. .NEX FILE (SNAPSHOT FORMAT)

```js
{
  version:   '1.0.0',
  forkId:    'nex-phase2-gate3-ts1716123456',  // fork on every gate boundary
  tick:      847,
  phase:     2,
  gate:      3,
  events:    StreamLog.entries,           // compressed
  fileRefs:  FileRefs.snapshot(),
  manifest:  current_manifest,
  agentSigs: raid.learner.allSignatures(),
  deltas:    delta_log_since_last_fork,
  crystals:  mcl.stableCrystals(),       // NEW: stable crystal snapshot
  bepLib:    bep.topPatterns(20),         // NEW: top BEP patterns
  metadata: {
    totalGates:    12,
    passRate:      0.83,
    healerLoops:   3,
    buildDuration: 45000,
    ollamaModel:   'deepseek-coder-v2:16b-lite-instruct-q4_K_M',
    crystalCount:  7,
    bepCount:      23,
  }
}
```

---

*Spec v4.0 complete. All prior specs (v1–v3 addon specs) are superseded by this document.*
*CrystalBall is a NEXUS plugin — not a dependency, not a subprocess.*
*The lattice is the memory backbone. BEP is the intelligence. MCL is the selection pressure.*
*Nothing pretends to work. Build JaaDB v2 first. Phase 2 follows immediately.*
