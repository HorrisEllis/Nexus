# NEXUS MODULES (Module Contract + Cobalt Registry)
**UUID:** nexus-modules-0000-4000-0000-modules0001
**Layer:** cross-cutting — applies to all systems
**Status:** active
**Source:** NEXUS-MODULES.spec, NEXUS-CORE.spec

---

## What it is

The module contract, cobalt registry, schema registry, and complete catalog of all registered modules.

Every module without exception follows the contract here. Every schema must exist before any module writes to its table. This is the source of truth for what modules exist, what they own, and how they wire together.

---

## Axioms

| Axiom | Rule |
|-------|------|
| §5.1 | UUID on everything that does anything |
| §K6 | No module calls another directly — all via JAA |
| §A3 | Every JAA insert carries `causedBy` or `source` |
| LAW_III | Layer sovereignty — each layer has exactly one job |
| LAW_IV | Schema over code — schema is source of truth |

---

## The Module Contract (every module follows this exactly)

```js
'use strict';

const COBALT = {
  id:      'layer.module-name',    // dot-namespaced
  uuid:    'nexus-mod-{name}-{ts}', // permanent, never reuse
  file:    __filename,
  layer:   'foundation|core|gate|healer|memory|agent|guardian|automation|canvas|ui',
  version: '1.0.0',
  intent:  'what this module does in one sentence',
  reads:   ['table_a'],            // only declared tables may be read
  writes:  ['own_table'],          // only declared tables may be written
  pollMs:  3000,
  cli:     [{ command, args, flags, intent, emits, example, toastOnSuccess, toastOnFail }],
  hooks:   { 'event.type': 'handlerMethod' },
  expectation: { summary, successCondition, failureCondition, slaMs },
  gapContract: { bridges, fills, creates }
};

const MODULE_ID = COBALT.id;
let _interval = null;

async function init(cfg = {}) {
  await jaaDB.insert('agent_signatures', { ...COBALT, registeredAt: Date.now() });
  _interval = setInterval(_tick, cfg.pollMs ?? COBALT.pollMs);
  _interval.unref();
  await _toast('toast.boot', `${MODULE_ID} initialized`);
}

function stop() { clearInterval(_interval); _interval = null; }

async function _tick() {
  try {
    const work = jaaDB.query(TABLE, r => r.status === 'pending', 50);
    for (const item of work) {
      await jaaDB.update(TABLE, item.uuid, { status: 'processing', claimedAt: Date.now() });
      const claimed = await jaaDB.get(TABLE, item.uuid);
      if (claimed?.status !== 'processing') continue; // claim pattern
      const result = await _process(item);
      await jaaDB.update(TABLE, item.uuid, {
        status: result.ok ? 'complete' : 'failed',
        result: result.data ?? null,
        error:  result.error ?? null,
        completedAt: Date.now()
      });
      if (!result.ok) await _toast('toast.error', result.error, { causedBy: item.uuid });
    }
  } catch (err) {
    await jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID,
      error: err.message, stack: err.stack, ts: Date.now() }).catch(() => {});
    await _toast('toast.error', `${MODULE_ID}: ${err.message}`);
  }
}

module.exports = { init, stop, COBALT };
```

---

## Component ID System

**Pattern:** `<namespace>-<system>-<module>-<component>-<5char-suffix>`
**Example:** `nexus-snr-raid-plugin-a4f2c`

**Suffix rule:** The 5-character suffix is the last 5 characters of the component's permanent UUID. It appears at the END of every ID that refers to this component — everywhere. Same 5-char suffix in a `.spec`, compiled JS, JAA row, seam contract, and toast message = same component.

**Family rule:** Every seam, hook, function, and class declared IN a file inherits the file's 5-char suffix as its family suffix.

**Enforcement:**
- `cobalt-registry` validates COBALT.id ends with correct 5-char suffix on `init()`
- `map-builder` validates component IDs in `.map` files match JAA `agent_signatures`
- seam compiler stamps every compiled artifact with component ID of source file

---

## Schema Registry

### Existing schemas (confirmed in Nexus-Cobalt/schemas/)

| Schema | Title | Key fields |
|--------|-------|------------|
| behavior.schema.json | NEXUS Behavioral Expectation | id, module, version, flows, invariantChecks |
| bep-pattern.schema.json | NEXUS BEP Pattern | uuid, intentHash, behaviorGraph, constraints, metrics |
| build-queue.schema.json | NEXUS Build Queue | |
| callto.schema.json | NEXUS Callto | |
| causality.schema.json | NEXUS Causality Map | |
| cobalt.schema.json | NEXUS Cobalt Provenance | cobaltId, origin, rationale, expectation, gapContract |
| crystal.schema.json | NEXUS MCL Crystal | uuid, state, stabilityScore, crossLaneCount, contradictionScore |
| event.schema.json | NEXUS Event | type, tick, causedBy, relatedTo |
| gap.schema.json | NEXUS Gap | uuid, type, path, body, severity, status, causedBy |
| intent.schema.json | NEXUS Intent IR | sessionId, input, lang, framework, features, ambiguities |
| manifest.schema.json | NEXUS Manifest | id, tick, **temp** (MUST be 0), nodes, constraints |
| module.schema.json | NEXUS Module Definition | name, uuid, layer, axioms, subscribes, publishes |
| plugin.schema.json | NEXUS Plugin Manifest | name, uuid, hook, intent, layer, axioms |
| rewind.schema.json | NEXUS Module Rewind | module, tick, found, prefixes, fork, streamId |
| schedule.schema.json | NEXUS Automation Schedule | uuid, name, trigger, steps |
| shape.schema.json | NEXUS Runtime Shape | sampledAt, sigma, delta, slope, oscillation, snr |
| versionium.schema.json | NEXUS Versionium | |

### BUILD REQUIRED (not yet created)

```
guardian-chat.schema.json     — chat_sessions, chat_messages, chat_completions, guardian_nodes
guardian-health.schema.json   — guardian_health
gap-question.schema.json      — gap_questions (GTCI)
artifact.schema.json          — artifacts (extend: name, ext, file_path, confidence)
snr-record.schema.json        — snr_records
delta.schema.json             — delta_records
seam.schema.json              — seam_records
intent-node.schema.json       — intent_nodes
self-model.schema.json        — self_model
memory-index.schema.json      — memory_index
toast.schema.json             — toasts
failure.schema.json           — failures
```

---

## Complete Module Catalog

### Foundation layer

| Module | UUID suffix | Intent | Boot |
|--------|-------------|--------|------|
| foundation/siso.js | siso | SISO event primitives — SISOBus, SISOEvent, StreamLog, ALKKernel | 0 |
| foundation/kernel.js | kernel | ALK Kernel — causal graph, ring buffer, law enforcement | 1 |
| foundation/admin-server.js | 00001 | Zero-dep HTTP+SSE on :3748 | 12 |
| foundation/cobalt-registry.js | — | Auto-registration of all modules | 1 |
| foundation/bus-log.js | — | event_log → StreamLog bridge. Load order 1. | 1 |
| foundation/shape-sampler.js | 00012 | sigma/delta/slope/snr every 100 ticks | 1 |
| foundation/validator.js | — | NanoValidator — zero-dep AJV replacement | — |
| foundation/nano-ws.js | — | NanoWSServer — zero-dep WebSocket | — |
| foundation/store/FileStore.js | — | SHA-256 content-addressed blob store | — |
| foundation/store/FileRefs.js | — | Named refs → hashes | — |

### Core layer

| Module | Intent |
|--------|--------|
| core/raid/index.js | Route tasks to agents. LAW_I enforcement. cost×capability×history×drift |
| core/raid/learner.js | EMA-based routing outcome recorder |
| core/raid/weights.js | Agent weight table (config/raid-weights.json) |
| core/raid/fallback.js | Fallback chain logic when primary fails |
| core/manifest/index.js | Build, validate, distribute runtime manifest. temp:0 enforcement. |
| core/translation/index.js | Intent translation — raw text → structured Intent IR |
| core/translation/learner.js | Learn from successful translations |
| core/translation/alignment.js | Align translated intent to known BEP patterns |
| core/usage/index.js | Token usage tracking per agent. >90% → RAID fallback. |

### Gate / Healer layer

| Module | Intent |
|--------|--------|
| gate/gap-finder.js | Scan all JAA tables for behavioral deviations. Emit `gap.found`. |
| gate/runner.js | Manifest gate runner — executes gate checks in order |
| healer/index.js | gap.found → fix loop (max 5 depth) → resolved | exhausted |

### Memory layer

| Module | UUID suffix | Lines | Intent |
|--------|-------------|-------|--------|
| memory/jaa-db.js | jaadb | 300 | Dual-backend JSONL/IndexedDB. THE shared data surface. |
| memory/agent-memory.js | asm | 285 | Agent Self-model Engine. EMA behavioral fingerprint. |
| memory/lattice-index.js | 00002 | 395 | Persist causal graph + entity index to JAA. |
| memory/fix-map.js | — | — | Gap-type → fix knowledge base. |
| crystalball/index.js | 00001 | 126 | CrystalBall entry — wires LatticeBridge + BEP + MCL + MQL |
| crystalball/bep-engine.js | 00020 | 241 | BEP engine. Code memory. Reuse + mutation + scaffold. |
| crystalball/mcl.js | 00030 | 265 | Memory Crystallization Layer. RAW→TRACE→CANDIDATE→STABLE |
| crystalball/mql.js | 00040 | 314 | Memory Query Layer. 5-lane parallel retrieval. Token-budgeted. |
| crystalball/lattice-bridge.js | — | — | Entity extraction + in-memory lattice (MQL Lane A) |

### Agent layer

| Module | Intent |
|--------|--------|
| agents/base.js | Base agent contract. All agents implement `complete()`, `stream()`, `ping()`. |
| agents/index.js | Guardian HTTP bridge agents (ChatGPT, Claude, Gemini via :3748) |
| agents/ollama/index.js | Primary agent. LAW_I. Streaming via `/api/generate`. model: deepseek-coder-v2 |
| agents/selectors.js | Agent capability selectors — which agent handles which task type |

### Automation layer

| Module | Intent |
|--------|--------|
| automation/engine.js | Scheduler + workflow runner. 6 trigger types. Zero deps. Drift correction. |
| automation/condition-evaluator.js | Safe expression evaluator — no `eval()`. |
| automation/step-executor.js | Execute workflow steps in order |
| automation/variable-resolver.js | Resolve `${var}` expressions in workflow payloads |
| automation/queue-manager.js | Priority queue with `depends_on[]` gating. +10 priority per 60s unprocessed. |

**Automation trigger types:** cron, interval, event, condition, chain, manual
**Queue types:** build, gate, nas-push, replay, agent_call
**Priority aging:** +10 priority per 60s unprocessed (prevents starvation)

### Versionium layer

| Module | UUID suffix | Lines | Intent |
|--------|-------------|-------|--------|
| versionium/index.js | 00020 | 441 | Causality-graph version control. Sigma-gated auto-commit. |
| versionium/causality.js | 00021 | 260 | Per-file causality mapper. Why did this file change? |

### Canvas layer

| Module | Intent |
|--------|--------|
| canvas/spec-a/cfr-rewind.js | CFR Rewind shim — snapshot ring + .nex temporal replay |
| canvas/spec-a/renderer.js | Node graph renderer for causality visualization |
| canvas/spec-a/cfr-physics.js | Physics simulation for node layout |
| canvas/spec-a/node-inspector.js | Inspector panel for selected node |
| canvas/spec-a/rewind-scrubber.js | Timeline scrubber UI for temporal replay |
| canvas/spec-b/bridge/bus-to-cfr.js | Bridge SISO bus events to CFR canvas |

---

## Dependencies

**Runtime deps (only 2):**
- `ajv: ^8.12.0` — JSON Schema validation
- `ws: ^8.16.0` — WebSocket server

**Philosophy:** Zero external dependencies in core modules. `NanoValidator` and `NanoWS` are pure-JS drop-in replacements eliminating even these two.

---

## What it does NOT do

- Does not allow a module to import another module (LAW_III)
- Does not allow a module to write to undeclared tables (§5.7)
- Does not allow a COBALT record without a UUID (§5.1)
- Does not allow any manifest with `temp≠0` (LAW_IV)
- Does not allow module registration without a COBALT object
- Does not allow signature collision in gate registration (§K1)

---

## Open gaps

| ID | Description | Severity |
|----|-------------|----------|
| G-MOD-01 | `jaa-db.js` ALL_TABLES missing 25+ tables — PHASE 3 boot will fail | CRITICAL |
| G-MOD-02 | 13 schemas marked BUILD REQUIRED not yet created | HIGH |
| G-MOD-03 | `automation/queue-manager.js` not yet in module catalog | MEDIUM |
| G-MOD-04 | NAS module (`nas/router.js`) not specced | MEDIUM |
| G-MOD-05 | `tauri/ws-server.js` not integrated into main system | LOW |
| G-MOD-06 | `extension/` directory (content-scripts) not wired to Guardian | MEDIUM |
