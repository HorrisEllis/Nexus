# THE ARCHITECT
## Full System Specification · v1.1.0
**Author:** James Brooks (Erosmancer) + Claude
**Date:** 2026-05-30
**UUID:** architect-spec-0000-2026-0530-rheon-002
**Status:** living · constraint-grounded · growing at the seam
**Supersedes:** ARCHITECT-SPEC-v1.0.0, RHEON-KERNEL-SPEC-v2.1.0, nexus-forge ROADMAP, causal-nexus.spec
**Constitutional law:** Meaning is downstream of constraints. Nothing pretends to work.

---

## AUTHORIAL INTENT — JAMES BROOKS

These are the words that founded this spec, quoted exactly:

> "lets invent the universe, each hook for the wire named with intent,
> type (api, event bus, callto, direct and any invention you can think of,
> like webserver.) and you can add and remove hooks, look at forge.
> make schemas for everything, spec first, then cli, then ui.
>
> The full spec, blueprint builder, reader, opener, compress/decompress/synthesis,
> behavior patterns and macros, reconstruct and replay using clips, translater, etc.
> (causal substrate, and spec builder seem to fit like magnets.)
>
> Maybe call it the architect. always architecture first, then invent a tool for
> mapping file/data structure, then schema builder, then cli, then ui.
>
> then signal to noise at the end to quality check, tag, and prompt or send
> to ollama/raid engine?"

That is the spec. Everything below is its formal elaboration.

The order James gave is the build order:
1. architecture (spec) first
2. file/data structure mapper
3. schema builder
4. CLI
5. UI
6. signal-to-noise gate → ollama / RAID

Nothing deviates from that sequence.

---

## READING THIS DOCUMENT

Everything derives from one axiom established in the Rheon Kernel:

> **Meaning is downstream of constraints.**

The Architect is the tool that makes that axiom operable across every surface.
It is a constraint-first system authoring environment that produces specs,
wires hooks, maps file/data topology, builds schemas, provides a CLI peer,
drives a UI, and ends every session with a signal-to-noise quality gate
before routing output to Ollama or the RAID engine.

The Architect is not a code editor.
The spec file is not documentation.
**The spec IS the system. Code is a projection of the spec.**

---

## 0. THE IRREDUCIBLE KERNEL (inherited from Rheon Kernel v2.1.0)

```
Field        — collection of possible states
Constraint   — reduces valid future states (formal: reduces valid future states)
Transition   — movement between states
Observation  — evidence about states or transitions
Lens         — projection of field geometry (read-only, never modifies field)
Gap          — missing information required to evaluate a constraint
History      — constraint-consistent transition paths
Meaning      — human interpretation of field geometry (late-stage, derived)
```

The Architect adds three operational primitives:

```
Hook         — a named, typed wire between two system surfaces
Blueprint    — a structural digest: shape without implementation
Clip         — a bounded, replayable segment of a causal timeline
```

---

## 1. CONSTITUTIONAL LAWS

Inherited from Rheon Kernel v2.1.0:

```
§1.1  NOTHING PRETENDS TO WORK
      If it doesn't function, it says so loudly.

§1.2  NOTHING SILENTLY FAILS
      Every error: named, typed, logged to JAA + bus event.

§2.1  PERSISTENCE IS THE GOLDEN RULE
      JAA write before behavior. Always.

§3.1  LOAD ORDER IS LAW
      Nothing imports from a layer above it.
      All inter-engine I/O via SISO bus.

§4.1  CLI IS A PEER
      CLI speaks same schema as UI. CLI first. Always.

§5.1  UUID ON EVERYTHING

§5.5  ZERO EXTERNAL RUNTIME DEPS IN CORE

§CF   NO ENGINE CONSUMES RAW MEANING
      All engines consume ConstraintField.
      Meaning is emergent. Never primitive.

§UNFLATTEN  NEVER COLLAPSE COMPETING STRUCTURES EARLY

§SEAM  GROWTH HAPPENS AT THE SEAM
       Highest information is where two systems meet.
```

Architect additions:

```
§A-1  ARCHITECTURE BEFORE IMPLEMENTATION
      No code is written before the spec exists.
      No spec is final — it grows with the system.
      The .spec file IS the source of truth.
      Code is a projection of the spec, not the other way.

§A-2  HOOKS ARE THE WIRE
      All inter-surface communication passes through a declared hook.
      No direct calls between surfaces.
      Every hook has: id, name, intent, type, direction, schema.
      Add and remove hooks freely — but always through the Registry.

§A-3  MAP BEFORE BUILD
      File/data topology is mapped before schemas are written.
      Schemas are written before CLI is built.
      CLI is built before UI is built.
      SNR gate runs before any output leaves the system.

§A-4  SPEC IS LIVING
      The spec is never frozen. It grows append-only.
      Deletions are deprecations with causedBy.
      Every keyword, hook, constraint has a causedBy.

§A-5  SIGNAL BEFORE NOISE
      The SNR gate is the last thing before output.
      Nothing leaves the system without a quality score.
      Low-confidence output is tagged, not suppressed.
      The operator decides what to do with tagged output.
```

---

## 2. SYSTEM LAYERS

Built in strict order. Each layer complete before the next begins.
No layer imports from a layer above it.

```
┌─────────────────────────────────────────────────────────────────────┐
│  L7 — SIGNAL / NOISE GATE                                           │
│  SNR scoring · tagging · routing to Ollama / RAID                  │
├─────────────────────────────────────────────────────────────────────┤
│  L6 — UI (built last)                                               │
│  Canvas · Blueprint viewer · Hook inspector · Timeline              │
│  Topology map · Schema builder · SNR dashboard                      │
├─────────────────────────────────────────────────────────────────────┤
│  L5 — CLI (peer to UI, same schema, built first)                    │
│  architect <command> — full feature parity with UI                  │
├─────────────────────────────────────────────────────────────────────┤
│  L4 — SCHEMA BUILDER                                                │
│  JSON Schema · TypeScript types · validators · constraint gates     │
├─────────────────────────────────────────────────────────────────────┤
│  L3 — FILE / DATA TOPOLOGY MAPPER                                   │
│  File structure · data flows · surface relationships · gap scanner  │
├─────────────────────────────────────────────────────────────────────┤
│  L2 — HOOK REGISTRY + WIRE ENGINE                                   │
│  22 hook types · add/remove/validate/wire · dependency graph        │
├─────────────────────────────────────────────────────────────────────┤
│  L1 — SPEC ENGINE                                                   │
│  Blueprint · Compress · Clip · Reconstruct · Translate · Behavior   │
├─────────────────────────────────────────────────────────────────────┤
│  L0 — CONSTRAINT FIELD (Rheon Kernel — external dependency)         │
│  Field · Constraint · Transition · Gap · Lens · History · Meaning   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. THE HOOK REGISTRY

The Hook Registry is the central nervous system of The Architect.
Every inter-surface connection is declared as a hook before it exists.
Hooks can be added and removed. Removal is always soft (deprecation with causedBy)
unless the hook has zero active bindings, in which case hard removal is permitted.

### 3.1 Hook schema (complete)

```typescript
interface Hook {
  // Identity
  id:        string;   // UUID v4 — permanent, never reassigned
  name:      string;   // kebab-case — permanent once set
  intent:    string;   // one sentence: what this wire does and why it exists
  version:   string;   // semver

  // Wire nature
  type:      HookType;        // exactly one — see §3.2
  direction: HookDirection;   // unidirectional | bidirectional | broadcast | sink

  // Endpoints
  from: {
    surface: string;   // surface id or '*'
    layer:   number;   // layer number (0–7)
    module?: string;   // module uuid if within a surface
  };
  to: {
    surface: string;   // surface id or '*' (broadcast)
    layer:   number;
    module?: string;
  };

  // Type-specific config (varies by HookType — see §3.3)
  config: HookConfig;

  // Schemas — every hook has all three declared
  schema: {
    input:  JSONSchema;    // what enters this wire (null if source-only)
    output: JSONSchema;    // what exits this wire (null if sink-only)
    errors: ErrorDef[];    // named failure modes with codes and shapes
  };

  // Contract
  contract: {
    axioms:       string[];   // §laws this hook enforces (e.g. '§A-2', '§I-3')
    sideEffects:  string[];   // declared external effects ('db.write', 'http.post')
    idempotent:   boolean;
    replayable:   boolean;    // safe to replay during reconstruct?
    snrGated:     boolean;    // output must pass SNR gate before leaving system
    timeout?:     number;     // ms — required for api, ollama, raid types
    retryPolicy?: RetryPolicy;
  };

  // Friction score (from Forge Registry pattern)
  frictionScore: {
    latency:          number;   // 0..1
    failureRate:      number;   // 0..1
    semanticDistance: number;   // 0..1
  };

  // Router policy
  routerPolicy: {
    blockIfFrictionGt: number;   // 0..1 — block if composite friction exceeds this
    requiresApproval:  boolean;
    allowedSources:    string[]; // surface ids or ['*']
    executionMode:     'sync' | 'async' | 'deferred';
  };

  // Bindings (auto-generated from hook declaration)
  bindings: {
    cli:    string;    // exact CLI command string: 'architect hook <name> <action>'
    event:  string;    // bus event type this hook emits on the SISO bus
    nexus?: string;    // nexus:// address if on mesh
    webserver?: {      // only present if type === 'webserver'
      port:   number;
      method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'WS' | 'SSE';
      path:   string;
      cors:   CORSPolicy;
      auth:   AuthRequirement;
      rateLimit?: RateLimit;
    };
  };

  // Provenance
  meta: {
    causedBy:    string;   // session_id or decision_id that created this hook
    createdAt:   number;   // epoch ms
    updatedAt:   number;   // epoch ms
    deprecatedAt?: number;
    deprecationReason?: string;
    status:      'active' | 'deprecated' | 'seed';
    tags:        string[];
    notes:       string;
  };
}

// Supporting types
interface ErrorDef {
  code:        string;    // e.g. 'SCHEMA_INVALID', 'TIMEOUT'
  description: string;
  recoverable: boolean;
  shape:       JSONSchema; // payload shape on error
}

interface RetryPolicy {
  maxAttempts: number;
  backoff:     'none' | 'linear' | 'exponential';
  baseMs:      number;
}

interface CORSPolicy {
  origins:     string[];
  credentials: boolean;
}

interface AuthRequirement {
  required: boolean;
  type?:    'bearer' | 'api-key' | 'session' | 'none';
  header?:  string;
}

interface RateLimit {
  windowMs: number;
  max:      number;
}

type HookDirection =
  | 'unidirectional'   // A → B. No reply on this wire.
  | 'bidirectional'    // A ↔ B. Both surfaces send and receive.
  | 'broadcast'        // A → *. All subscribers receive. No reply.
  | 'sink';            // * → A. Many sources, one consumer.
```

### 3.2 Hook types — complete taxonomy

Every hook has exactly one type. The type encodes the *nature* of the communication.

```typescript
type HookType =
  // ── PRIMITIVE TYPES (transport-agnostic) ──────────────────────────

  | 'api'          // HTTP request/response. Caller blocks for answer.
                   // Timeout required. Error shapes required.
                   // Config: method, path, timeout, retryPolicy
                   // Example: POST /architect/spec/validate

  | 'event-bus'    // Fire and forget on the SISO bus.
                   // Causal edge type declared at emit time.
                   // No return value. Subscribers zero or many.
                   // Config: eventType, causalEdgeType, deduplication
                   // Example: architect.spec.changed

  | 'callto'       // Browser DOM action relay via Guardian extension.
                   // Carries: action, selector, origin, params.
                   // Config: action, allowedOrigins, calltoMapKey
                   // Example: callto:highlight-gap

  | 'direct'       // In-process function call. Same memory space.
                   // Only permitted within the same layer. Throws cross-layer.
                   // Config: functionRef, syncOrAsync
                   // Example: registry.getHook(uuid)

  | 'stream'       // Continuous, long-lived data flow.
                   // Backpressure declared. Chunk schema declared.
                   // Config: transport ('sse'|'ws'), chunkSchema, heartbeatMs
                   // Example: architect.timeline.stream (SSE)

  | 'webserver'    // HTTP server surface binding. The route IS the hook.
                   // No route exists without a declared webserver hook.
                   // Config: port, method, path, cors, auth, rateLimit
                   // Example: GET :3747/architect/health

  // ── STRUCTURAL TYPES (architecture-native) ────────────────────────

  | 'blueprint'    // A structural digest wire. Carries shape, not data.
                   // Read-only. Never modifies field.
                   // Config: sourceType ('spec'|'session'|'kernel'|'scan')
                   // Used by: mapper, schema builder, UI renderer

  | 'clip'         // A bounded causal timeline segment wire.
                   // From eventIndex A to eventIndex B.
                   // Replayable. Diffable. Compressible.
                   // Config: integrityCheck required, sideEffectPolicy
                   // Example: architect.session.clip.export

  | 'macro'        // A detected recurring causal pattern wire.
                   // Emitted by macro projection engine.
                   // NOT a kernel event (§C-2 from causal-nexus).
                   // Config: minOccurrences, minConfidence
                   // Carries: pattern[], frequency, sigmaScore

  | 'gate'         // A constraint enforcement wire.
                   // Input enters. Decision exits: allow|deny|observe|tag.
                   // Every gate has: name, priority, rule, failureCost.
                   // Config: priority (lower runs first), failureCost, rule
                   // Gates compose in declared priority order.

  | 'lens'         // A read-only field projection wire.
                   // Never modifies what it reads. Produces View, not mutation.
                   // Config: projectionFn, cacheMs
                   // Used by: UI panels, timeline viewer, gap inspector

  | 'translate'    // A surface-crossing conversion wire.
                   // Converts representation without changing constraint geometry.
                   // Config: fromSurface, toSurface, preservesConstraints: true
                   // Example: ConstraintField → JSON Schema
                   // Example: .urck clip → readable timeline
                   // Example: Seam grammar phrase → JavaScript expression

  | 'synthesize'   // A multi-source aggregation wire.
                   // Takes N inputs, produces 1 structured output.
                   // Config: strategy ('union'|'intersect'|'weighted'|'compete')
                   // Config: weights?: number[], quorum?: number
                   // Used by: blueprint builder, SNR compositor

  | 'reconstruct'  // A rewind/replay wire.
                   // Input: sessionId + eventIndex (or checkpoint UUID).
                   // Output: restored kernel state + rewind metadata.
                   // Config: sideEffectPolicy per registered side effect
                   // sideEffectPolicy: 'no-op' | 'undo' | 'execute'

  | 'compress'     // A structure-preserving encoding wire.
                   // Input: kernel or timeline.
                   // Output: .urck or .nex artifact.
                   // Config: format ('urck'|'nex'), embedBaseline, embedSchemas
                   // Lossless. Versioned. Never modifies kernel. (§I-7)

  | 'decompress'   // The inverse of compress.
                   // Input: .urck or .nex artifact path.
                   // Output: kernel or timeline.
                   // Config: ringCap override, strict version gate (§I-8)
                   // Validates version gate before parsing. No bypass.

  | 'behavior'     // A behavioral pattern wire.
                   // Carries .beh asset: grammar + macros + checkpoints.
                   // Config: operation ('capture'|'deploy'|'recover'|'diff')
                   // Used for: deployment, recovery, tacit knowledge capture

  // ── QUALITY TYPES ─────────────────────────────────────────────────

  | 'snr'          // Signal-to-noise quality scoring wire.
                   // The last hook before output leaves the system.
                   // Input: any structured output.
                   // Output: SNRResult with score, tags, recommendation.
                   // Config: axes[], thresholds, autoRoute

  | 'gap'          // A missing-information wire.
                   // Emitted when constraint cannot be evaluated.
                   // Carries: Gap object (id, missingVariable, pressure, density).
                   // Config: severity ('critical'|'high'|'medium'|'low'|'seed')
                   // Consumed by: GapHunter, UI inspector, LLM router.

  | 'tension'      // A competing-constraint wire.
                   // Emitted when two constraints cannot simultaneously maximize.
                   // Never collapsed early (§UNFLATTEN).
                   // Carries: Tension object persisted in JAA as-is.
                   // Config: magnitude threshold for emission

  | 'seam'         // A grammar negotiation wire.
                   // Carries: keyword proposal + causedBy + trust_score.
                   // Bidirectional: proposal out, acceptance/rejection in.
                   // Negative space (rejection) is data. Both directions recorded.
                   // Config: trustDecayRate, votingQuorum

  | 'ollama'       // Local LLM routing wire.
                   // Only receives SNR-gated output. (§I-6)
                   // Config: model, temperature, maxTokens, contextWindow
                   // Returns: completion, confidence, tokens_used, model_version

  | 'raid';        // Multi-model ensemble routing wire.
                   // Routes to N models, synthesizes results.
                   // Config: models[], strategy, quorum (for 'vote')
                   // Returns: synthesized output + per-model scores + winning_model
```

### 3.3 Hook type config schemas (complete)

```typescript
// Config varies by type. Only the relevant fields apply.
type HookConfig =
  | APIConfig
  | EventBusConfig
  | CalltoConfig
  | DirectConfig
  | StreamConfig
  | WebserverConfig
  | BlueprintConfig
  | ClipConfig
  | MacroConfig
  | GateConfig
  | LensConfig
  | TranslateConfig
  | SynthesizeConfig
  | ReconstructConfig
  | CompressConfig
  | DecompressConfig
  | BehaviorConfig
  | SNRConfig
  | GapConfig
  | TensionConfig
  | SeamConfig
  | OllamaConfig
  | RAIDConfig;

interface APIConfig {
  method:      'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path:        string;       // e.g. '/architect/spec/validate'
  timeout:     number;       // ms — required
  retryPolicy: RetryPolicy;
}
interface EventBusConfig {
  eventType:      string;    // dot-namespaced e.g. 'architect.spec.changed'
  causalEdgeType: 'causal' | 'semantic' | 'temporal' | 'rule';
  deduplication:  boolean;
  ringBuffer:     boolean;   // store in causal ring
}
interface CalltoConfig {
  action:         string;    // e.g. 'highlight', 'click', 'inject'
  allowedOrigins: string[];
  calltoMapKey:   string;
}
interface DirectConfig {
  functionRef:    string;    // module.method
  sync:           boolean;
}
interface StreamConfig {
  transport:      'sse' | 'ws';
  chunkSchema:    JSONSchema;
  heartbeatMs:    number;
  reconnect:      boolean;
}
interface WebserverConfig {
  port:        number;
  method:      'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'WS' | 'SSE';
  path:        string;
  cors:        CORSPolicy;
  auth:        AuthRequirement;
  rateLimit?:  RateLimit;
}
interface BlueprintConfig {
  sourceType:  'spec' | 'session' | 'kernel' | 'scan';
  embedGaps:   boolean;
  embedSchemas:boolean;
}
interface ClipConfig {
  integrityCheckRequired: boolean;
  sideEffectPolicy: 'no-op' | 'undo' | 'execute';
}
interface MacroConfig {
  minOccurrences: number;
  minConfidence:  number;
  windowSize:     number;   // event count sliding window
}
interface GateConfig {
  priority:    number;       // lower = runs first
  failureCost: number;       // 0..1
  rule:        string;       // constraint expression
  onFail:      'block' | 'observe' | 'tag';
}
interface LensConfig {
  projectionFn: string;      // module.method reference
  cacheMs:      number;
  memoize:      boolean;
}
interface TranslateConfig {
  fromSurface:          string;
  toSurface:            string;
  preservesConstraints: true;   // always true — translation law
}
interface SynthesizeConfig {
  strategy: 'union' | 'intersect' | 'weighted' | 'compete';
  weights?: number[];
  quorum?:  number;
}
interface ReconstructConfig {
  sideEffectPolicy: {
    [sideEffectName: string]: 'no-op' | 'undo' | 'execute';
  };
  dryRunDefault: boolean;
}
interface CompressConfig {
  format:        'urck' | 'nex';
  embedBaseline: boolean;
  embedSchemas:  boolean;
  checkpointEvery?: number;  // event count
}
interface DecompressConfig {
  ringCap?:      number;
  strictVersion: true;       // always true — version gate invariant §I-8
}
interface BehaviorConfig {
  operation: 'capture' | 'deploy' | 'recover' | 'diff' | 'version';
}
interface SNRConfig {
  axes:       SNRAxis[];
  thresholds: SNRThresholds;
  autoRoute:  boolean;
}
interface GapConfig {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'seed';
  autoRecord: true;           // always true — §I-10
}
interface TensionConfig {
  magnitudeThreshold: number; // only emit if tension.magnitude >= this
}
interface SeamConfig {
  trustDecayRate: number;     // per session without use
  votingQuorum:   number;     // min voters for keyword acceptance
}
interface OllamaConfig {
  model:         string;      // e.g. 'qwen2:0.5b' | 'deepseek-r1:8b'
  temperature:   number;
  maxTokens:     number;
  contextWindow: number;
  snrRequired:   true;        // always true — §I-6
}
interface RAIDConfig {
  models:   string[];
  strategy: 'vote' | 'merge' | 'compete' | 'cascade';
  quorum?:  number;           // required when strategy === 'vote'
  snrRequired: true;          // always true — §I-6
}
```

### 3.4 Hook Registry operations

```typescript
// Register — creates hook, assigns UUID, validates schema
// Throws if name already exists, if schema invalid, if type config missing
architect.hooks.register(descriptor: Omit<Hook, 'id' | 'meta'>): Hook

// Get by UUID or name
architect.hooks.get(idOrName: string): Hook

// List — filterable by type, direction, surface, status, tags
architect.hooks.list(filter?: {
  type?:      HookType | HookType[];
  direction?: HookDirection;
  surface?:   string;
  status?:    'active' | 'deprecated' | 'seed';
  tags?:      string[];
  layer?:     number;
}): Hook[]

// Update mutable fields (intent, version, config, contract, meta.tags, meta.notes)
// id, name, type, from, to are immutable after registration
architect.hooks.update(id: string, patch: Partial<Hook>): Hook

// Soft remove — marks deprecated, records causedBy
// Hook remains in registry. Active bindings are not affected immediately.
architect.hooks.deprecate(id: string, reason: string, causedBy: string): void

// Hard remove — only if zero active bindings
// Throws if bindings exist
architect.hooks.remove(id: string): void

// Wire — creates a HookBinding between two hooks
// Validates schema compatibility: from.schema.output must satisfy to.schema.input
architect.hooks.wire(fromId: string, toId: string): HookBinding

// Unwire — removes a HookBinding
architect.hooks.unwire(bindingId: string): void

// Validate all wiring
// Checks: schema compatibility, no dangling endpoints, no cross-layer directs,
//         gate priority conflicts, circular direct calls
architect.hooks.validate(): HookValidationReport

// Get dependency graph
architect.hooks.graph(format?: 'json' | 'mermaid' | 'svg'): HookGraph | string
```

### 3.5 HookBinding schema

```typescript
interface HookBinding {
  id:       string;   // UUID
  fromId:   string;   // hook UUID
  toId:     string;   // hook UUID
  createdAt: number;
  meta: {
    causedBy: string;
    notes:    string;
  };
}
```

---

## 4. CORE OBJECT SCHEMAS

Every object in the system. Complete. No omissions.

### 4.1 Constraint

```typescript
interface Constraint {
  id:            string;   // UUID
  name:          string;
  type:
    | 'hard'          // violation impossible — system refuses
    | 'soft'          // violation costly but permitted
    | 'probabilistic' // violation has weighted cost
    | 'temporal'      // reduces states within a time window
    | 'causal'        // A must precede B
    | 'relational';   // requires relationship between entities
  strength:      number;   // [0..1] how strongly states are reduced
  source:        string;   // which engine detected this
  condition:     object;   // formal expression of the rule
  violationCost: number;   // [0..1]
  confidence:    number;   // [0..1] Bayesian trust
  causedBy:      string;   // session_id
  createdAt:     number;
}
```

### 4.2 Gap

```typescript
interface Gap {
  id:                 string;   // UUID
  missingVariable:    string;   // what information is absent
  affectedConstraint: string;   // Constraint UUID
  uncertainty:        number;   // [0..1]
  pressure:           number;   // composite: how much this gap costs
  density:            number;   // how much is implied vs expressed
  severity:           'critical' | 'high' | 'medium' | 'low' | 'seed';
  source:             string;   // engine that detected this gap
  status:             'open' | 'closed' | 'wont-fix';
  closedAt?:          number;
  closedBy?:          string;   // session_id
  filledWith?:        unknown;  // the value that closed the gap
  causedBy:           string;   // session_id
  createdAt:          number;
}
```

### 4.3 Tension

```typescript
interface Tension {
  id:          string;   // UUID
  constraints: [string, string];   // two Constraint UUIDs
  magnitude:   number;   // [0..1] how irreconcilable
  reason:      string;
  status:      'open' | 'resolved';
  resolution?: string;   // how it was resolved (never collapsed — always recorded)
  causedBy:    string;
  createdAt:   number;
}
```

### 4.4 Event (SISO / Causal Nexus)

```typescript
interface ArchitectEvent {
  id:         string;   // UUID v4
  type:       string;   // dot-namespaced: 'architect.spec.changed'
  payload:    object;   // frozen on construction (§K1)
  meta: {
    tick:       number;   // logical clock — strictly monotone (§K4)
    wall:       number;   // wall timestamp ms
    causedBy:   string | null;   // parent event id
    sourceUUID: string | null;   // emitting module UUID
    sessionId:  string | null;
    relatedTo:  string[];        // semantic lattice edges
    edgeType:   'causal' | 'semantic' | 'temporal' | 'rule';
    hash:       string;          // FNV-1a of type + payload + causedBy
  };
}
```

### 4.5 Clip

```typescript
interface Clip {
  id:          string;   // UUID
  sessionId:   string;
  from:        number;   // event index (inclusive)
  to:          number;   // event index (inclusive)
  events:      ArchitectEvent[];
  edges:       CausalEdge[];
  checkpoints: Checkpoint[];
  macros:      MacroPattern[];

  integrity: {
    valid:           boolean;
    hashMismatches:  number[];   // event indices with hash failures
    orphanedEdges:   string[];   // causedBy refs with no event
  };

  snrScore:    number;
  label?:      string;
  tags:        string[];

  sideEffects: SideEffectRecord[];   // all external effects within this clip
  meta: {
    causedBy:  string;
    createdAt: number;
  };
}

interface CausalEdge {
  from:     string;   // event UUID
  to:       string;   // event UUID
  type:     'causal' | 'semantic' | 'temporal' | 'rule';
  tick:     number;
}

interface Checkpoint {
  seq:        number;
  ts:         number;
  eventCount: number;
  hash:       string;
}

interface MacroPattern {
  id:         string;
  sequence:   string[];   // event type sequence
  frequency:  number;
  confidence: number;
  sigmaScore: number;
  firstSeen:  number;
  lastSeen:   number;
}

interface SideEffectRecord {
  id:       string;
  name:     string;   // registered side effect name
  payload:  object;
  policy:   'no-op' | 'undo' | 'execute';
  ts:       number;
}
```

### 4.6 Blueprint

```typescript
interface Blueprint {
  id:       string;   // UUID
  name:     string;
  version:  string;
  source:   'spec' | 'session' | 'live-kernel' | 'file-scan';
  sourceId: string;   // path or session UUID

  // Declared structure
  hooks:        HookSummary[];
  surfaces:     SurfaceSummary[];
  constraints:  ConstraintSummary[];
  gaps:         GapSummary[];
  tensions:     TensionSummary[];

  // Observed from sessions
  vocabulary: {
    type:         string;
    count:        number;
    successors:   string[];   // types that follow this type
    parents:      string[];   // types this follows
    isRoot:       boolean;
  }[];
  macros:      MacroPattern[];
  grammar: {
    transitions: { [from: string]: string[] };  // which types follow which
    roots:       string[];                       // event types with no parent
  };

  // Inferred payload shapes
  schemas: {
    [eventType: string]: JSONSchema;
  };

  // Health
  baseline: {
    invariants: Invariant[];
    composite:  number;           // mean of invariant scores
    trend:      'improving' | 'stable' | 'degrading';
    peak:       { score: number; ts: number };
  };

  snrScore:  number;
  compiled?: string;   // standalone JS module if compile() was called

  meta: {
    causedBy:  string;
    createdAt: number;
    updatedAt: number;
  };
}

interface Invariant {
  id:      string;   // e.g. 'I-1'
  text:    string;
  score:   number;   // 0..1
  history: number[];
  mean:    number;
  std:     number;
  trend:   'improving' | 'stable' | 'degrading';
  peak:    { score: number; ts: number };
  nadir:   { score: number; ts: number };
  status:  'pass' | 'warn' | 'fail';
}
```

### 4.7 Topology Map

```typescript
interface TopologyMap {
  id:         string;   // UUID
  name:       string;
  rootPath:   string;
  scannedAt:  number;

  files: TopologyFile[];
  dataFlows: DataFlow[];
  surfaces:  Surface[];
  gaps:      TopologyGap[];

  snrScore: number;
  summary:  string;   // one-paragraph human digest

  meta: {
    causedBy:  string;
    createdAt: number;
  };
}

interface TopologyFile {
  path:     string;
  relative: string;   // relative to rootPath
  type:     'spec' | 'schema' | 'module' | 'config' | 'test' | 'data' | 'artifact' | 'unknown';
  size:     number;   // bytes
  layer?:   number;   // architect layer 0–7 if determinable
  imports:  string[];   // resolved absolute paths
  exports:  string[];   // exported symbol names
  hooks:    string[];   // hook ids declared or used in this file
  gaps:     string[];   // gap ids detected in this file
  events:   string[];   // event types emitted or consumed
}

interface DataFlow {
  id:        string;
  from:      string;    // file path or surface id
  to:        string;
  hookId:    string;    // hook UUID governing this flow
  volume?:   string;    // qualitative: 'low' | 'medium' | 'high'
  latency?:  string;    // qualitative: 'sync' | 'async' | 'deferred'
}

interface Surface {
  id:     string;
  name:   string;
  layer:  number;
  files:  string[];   // file paths belonging to this surface
  hooks:  string[];   // hook ids this surface owns
}

interface TopologyGap {
  id:          string;
  type:        'missing-file' | 'broken-import' | 'undeclared-hook' |
               'no-schema' | 'orphaned-surface' | 'missing-test';
  description: string;
  location:    string;   // file path or surface id
  severity:    'critical' | 'high' | 'medium' | 'low';
  suggestion:  string;
}
```

### 4.8 Schema Set

```typescript
interface SchemaSet {
  id:       string;   // UUID
  sourceId: string;   // blueprint id or topology map id
  version:  string;

  schemas: {
    [entityName: string]: EntitySchema;
  };

  invariants: SchemaInvariant[];
  gates:      GateDef[];

  snrScore: number;

  meta: {
    causedBy:    string;
    generatedAt: number;
  };
}

interface EntitySchema {
  name:       string;
  jsonSchema:  object;   // JSON Schema draft-07
  tsType:      string;   // TypeScript interface source
  validator:   string;   // compiled validation function (no deps)
  gate:        GateDef;  // constraint enforcement gate
  examples:    object[]; // valid instances for testing
}

interface GateDef {
  id:       string;
  name:     string;
  priority: number;     // lower runs first
  rule:     string;     // constraint expression
  onFail:   'block' | 'observe' | 'tag';
  failureCost: number;
  appliesTo: string[];  // entity names
}

interface SchemaInvariant {
  id:          string;
  description: string;
  type:        'hard' | 'soft';
  enforced_by: string[];   // gate ids
}
```

### 4.9 Behavioral Asset (.beh)

```typescript
interface BehavioralAsset {
  magic:         'FORGE-BEH';
  fmt:           1;
  id:            string;   // UUID
  name:          string;
  version:       string;   // semver
  parentId:      string | null;   // previous version's id
  sourceSession: string | null;   // sessionId
  capturedAt:    number;

  grammar: {
    vocab:      VocabEntry[];
    patterns:   MacroPattern[];
    gates:      GateDef[];
    invariants: Invariant[];
    session: {
      id:         string;
      eventCount: number;
      duration:   number;
    };
  };

  compiled: string;   // standalone JS module from compile()

  sideEffects: {
    [name: string]: {
      policy:      'no-op' | 'undo' | 'execute';
      idempotent:  boolean;
      description: string;
    };
  };

  meta: {
    eventCount:       number;
    primaryCount:     number;
    uniqueEventTypes: number;
    avgCausalDepth:   number;
    macroCount:       number;
    bottleneckCount:  number;
    sigmaScore:       number;   // composite health score
    snrScore:         number;
  };
}

interface VocabEntry {
  type:       string;
  count:      number;
  successors: string[];
  parents:    string[];
  isRoot:     boolean;
  payloadSchema: object;   // inferred from live events
}
```

### 4.10 Compression artifacts

```typescript
// .urck artifact
interface UrckArtifact {
  magic:   'URCK';
  version: number;   // format version — backward compat guaranteed (§C-6)
  sessionId: string;

  header: {
    typeDictionary:   string[];   // index → event type string
    sourceDictionary: string[];   // index → source UUID string
    stringPool:       string[];   // interned string values
  };

  events: UrckEvent[];   // encoded per-event tuples

  meta: {
    eventCount:       number;
    primaryCount:     number;
    compressionRatio: number;
    checkpoints:      Checkpoint[];
    lcpCandidates:    number[];
    divergencePoints: number[];
    integrity:        'valid' | 'corrupt' | 'structurally-invalid';
    bottlenecks:      number;
    macroCount:       number;
    ringCap:          number;
  };

  // optional — present if compressed with embedBaseline: true
  baseline?: {
    invariants: Invariant[];
    composite:  number;
  };

  // optional — present if compressed with embedSchemas: true
  schemas?: { [eventType: string]: object };
}

// Per-event encoding tuple (null-stripped)
type UrckEvent = [
  typeIndex:    number,   // index into typeDictionary
  tsDelta:      number,   // ms delta from previous event
  causedByPos:  number,   // position in events array (-1 = root)
  sourceIndex:  number,   // index into sourceDictionary
  edgeTypeCode: string,   // 'x'=causal 'r'=relational 'a'=analytic 'o'=observed
  payloadDelta: object,   // numeric fields as deltas; strings as pool indices
];

// .nex artifact (causal-nexus format — subset compatibility)
interface NexArtifact {
  magic:   'NEX';
  version: number;
  // ... (versioned via version-gate module — §CONS-004)
}
```

### 4.11 SNR Result

```typescript
interface SNRResult {
  id:        string;   // UUID
  sourceId:  string;   // id of what was scored
  scoredAt:  number;

  score:     number;   // 0..1 composite

  axes: {
    structural:  number;   // shape matches declared schema
    causal:      number;   // causal edges present and consistent
    constraint:  number;   // constraints evaluate without violations
    gap:         number;   // 1 - (unresolved_gaps / total_gaps)
    tension:     number;   // 1 - (unresolved_tensions / total_tensions)
    vocabulary:  number;   // event types match blueprint vocabulary
    temporal:    number;   // timestamps and ordering consistent
    behavioral:  number;   // proximity to behavioral asset baseline
  };

  tags:     SNRTag[];
  gaps:     Gap[];       // unresolved gaps found in this pass
  tensions: Tension[];   // competing constraints found in this pass

  recommendation:  'send' | 'hold' | 'rewrite' | 'flag';
  confidence:      number;
  reasoning:       string;   // one sentence

  routing?: {
    target:   'ollama' | 'raid' | 'hold';
    model?:   string;
    strategy?: string;
  };
}

interface SNRTag {
  axis:        string;
  severity:    'critical' | 'high' | 'medium' | 'low';
  description: string;
  suggestion:  string;
}

// SNR thresholds
const SNR_THRESHOLDS = {
  send:    0.85,   // score >= 0.85 → send
  hold:    0.65,   // score >= 0.65 → hold (tag and surface)
  rewrite: 0.45,   // score >= 0.45 → rewrite (flag gaps)
  flag:    0,      // score <  0.45 → flag (do not send without override)
};
```

### 4.12 JAA Tables (complete)

The JAA store is the persistence substrate. All engines write before acting.
All tables are append-only. No row is ever deleted — only soft-deprecated.

```typescript
// Table: hooks
// Every hook registration, update, deprecation
interface HookRecord {
  id:          string;   // UUID — primary key
  version:     number;   // incrementing on each update
  data:        Hook;     // full hook object
  op:          'create' | 'update' | 'deprecate' | 'remove';
  causedBy:    string;
  ts:          number;
}

// Table: hook_bindings
interface HookBindingRecord {
  id:        string;
  fromId:    string;
  toId:      string;
  op:        'create' | 'remove';
  causedBy:  string;
  ts:        number;
}

// Table: blueprints
interface BlueprintRecord {
  id:       string;
  version:  number;
  data:     Blueprint;
  causedBy: string;
  ts:       number;
}

// Table: topology_maps
interface TopologyMapRecord {
  id:       string;
  data:     TopologyMap;
  causedBy: string;
  ts:       number;
}

// Table: schema_sets
interface SchemaSetRecord {
  id:       string;
  version:  number;
  data:     SchemaSet;
  causedBy: string;
  ts:       number;
}

// Table: clips
interface ClipRecord {
  id:       string;
  data:     Clip;
  causedBy: string;
  ts:       number;
}

// Table: behaviors
interface BehaviorRecord {
  id:        string;
  version:   number;
  data:      BehavioralAsset;
  parentId:  string | null;
  causedBy:  string;
  ts:        number;
}

// Table: snr_results
interface SNRResultRecord {
  id:        string;
  sourceId:  string;
  data:      SNRResult;
  ts:        number;
}

// Table: gaps
interface GapRecord {
  id:       string;
  version:  number;
  data:     Gap;
  op:       'open' | 'update' | 'close' | 'wont-fix';
  causedBy: string;
  ts:       number;
}

// Table: tensions
interface TensionRecord {
  id:       string;
  version:  number;
  data:     Tension;
  op:       'open' | 'resolve';
  causedBy: string;
  ts:       number;
}

// Table: constraints
interface ConstraintRecord {
  id:       string;
  version:  number;
  data:     Constraint;
  causedBy: string;
  ts:       number;
}

// Table: sessions
interface SessionRecord {
  id:         string;
  startedAt:  number;
  endedAt?:   number;
  eventCount: number;
  snrScore?:  number;
  artifacts:  string[];   // .urck paths, .beh ids, blueprint ids
}

// Table: grammar (Seam language — from Rheon Kernel v2.1.0)
interface GrammarRecord {
  id:          string;
  keyword:     string;
  definition:  string;
  causedBy:    string;   // session where negotiated
  field_coord: object;   // Constraint operation it maps to
  trust_score: number;
  first_seen:  number;
  usage_count: number;
  template?:   string;   // forge template if compiled
  status:      'emerging' | 'active' | 'deprecated';
}

// Table: personal_vectors (from Rheon Kernel v2.1.0)
interface PersonalVectorRecord {
  id:          string;
  person_id:   string;
  node_id:     string;
  session_id:  string;
  ts:          number;
  vector:      string;   // JSON Float32Array(7)
  theta:       string;   // JSON { H, I, C, M, P_c, P_e }
  contentHash: string;
}
```

---

## 5. THE SPEC ENGINE (Layer 1)

### 5.1 Spec file format (.spec.json)

The spec file is the source of truth. It is JSON. It is append-only.
The Architect reads it, validates it, and builds everything from it.

```typescript
interface SpecFile {
  // Meta block
  meta: {
    name:          string;
    version:       string;
    author:        string;
    created_at:    string;   // ISO 8601
    last_modified: string;
    status:        'seed' | 'growing' | 'complete' | 'deprecated';
    uuid:          string;
    checksum:      string;   // SHA-256 of content before checksum field
    target_os:     string[];
    execution_mode:'sync' | 'async' | 'hybrid';
    paradigm:      string[];
    language_stack:string[];
    runtime_deps:  RuntimeDep[];
    supersedes:    string;
    notes:         string;
  };

  // Intent block — why this system exists
  intent: {
    purpose:           string;   // what it is
    problem_statement: string;   // what it solves
    non_goals:         string[]; // what it explicitly does not do
    authorial_intent?: string;   // direct quote from author if available
    stakeholders: {
      name: string;
      role: string;
    }[];
  };

  // Constraints block
  constraints: ConstraintDecl[];

  // Architecture block — layers and surfaces
  architecture: {
    layers: LayerDecl[];
    surfaces: SurfaceDecl[];
    loadOrder: string[];   // surface ids in strict import order
  };

  // Hooks block — all wire declarations
  hooks: HookDecl[];

  // Schemas block — entity type declarations
  schemas: SchemaDecl[];

  // Gates block — constraint enforcement gates
  gates: GateDecl[];

  // Events block — bus event type declarations
  events: EventDecl[];

  // Files block — expected file topology
  files: FileDecl[];

  // Gaps block — known missing information
  gaps: GapDecl[];

  // Risks block — known risks and mitigations
  risks: RiskDecl[];

  // Delta block — version history (append-only)
  delta: DeltaEntry[];
}

interface ConstraintDecl {
  id:          string;   // e.g. 'CONS-001'
  description: string;
  type:        'hard' | 'soft' | 'probabilistic' | 'temporal' | 'causal' | 'relational';
  source:      string;
  enforced_by: string[];   // gate ids
}

interface LayerDecl {
  number:    number;   // 0–7
  name:      string;
  surfaces:  string[];
  imports_from: number[];   // layer numbers this layer may import from
}

interface SurfaceDecl {
  id:      string;
  name:    string;
  layer:   number;
  path:    string;
  exports: string[];
}

interface HookDecl {
  id:       string;
  name:     string;
  intent:   string;
  type:     HookType;
  version:  string;
  from:     string;   // surface id
  to:       string;   // surface id or '*'
  direction: HookDirection;
  config:   object;   // type-specific config
  schema: {
    input:  object;
    output: object;
    errors: { code: string; description: string; recoverable: boolean }[];
  };
  contract: {
    axioms:      string[];
    sideEffects: string[];
    idempotent:  boolean;
    replayable:  boolean;
    snrGated:    boolean;
  };
}

interface SchemaDecl {
  name:        string;
  version:     string;
  description: string;
  schema:      object;   // JSON Schema draft-07
  examples:    object[];
}

interface GateDecl {
  id:          string;
  name:        string;
  priority:    number;
  rule:        string;
  onFail:      'block' | 'observe' | 'tag';
  failureCost: number;
  appliesTo:   string[];
}

interface EventDecl {
  type:        string;   // dot-namespaced
  description: string;
  schema:      object;
  emittedBy:   string[];   // surface ids
  consumedBy:  string[];   // surface ids
  causalEdge:  'causal' | 'semantic' | 'temporal' | 'rule';
}

interface FileDecl {
  path:    string;
  type:    string;
  layer:   number;
  exports: string[];
  purpose: string;
}

interface GapDecl {
  id:          string;
  severity:    string;
  description: string;
  affects:     string[];
  status:      'open' | 'wont-fix';
}

interface RiskDecl {
  id:           string;
  description:  string;
  impact:       string;
  probability:  'low' | 'medium' | 'high';
  mitigation:   string;
  residual:     string;
}

interface DeltaEntry {
  version:    string;
  date:       string;
  author:     string;
  causedBy:   string;
  changes:    string[];
  status:     string;
}

interface RuntimeDep {
  name:     string;
  version:  string;
  required: boolean;
  purpose:  string;
}
```

### 5.2 Blueprint operations (complete API)

```typescript
architect.blueprint.fromSpec(specPath: string): Promise<Blueprint>
architect.blueprint.fromKernel(kernel: object): Promise<Blueprint>
architect.blueprint.fromSession(sessionId: string): Promise<Blueprint>
architect.blueprint.fromScan(rootPath: string, opts?: ScanOpts): Promise<Blueprint>
architect.blueprint.read(id: string): Blueprint
architect.blueprint.open(id: string): void   // triggers UI panel
architect.blueprint.diff(a: Blueprint, b: Blueprint): BlueprintDiff
architect.blueprint.compile(blueprint: Blueprint): CompiledModule
architect.blueprint.export(id: string, format: 'svg' | 'mermaid' | 'json' | 'spec'): string
architect.blueprint.list(): BlueprintSummary[]

interface BlueprintDiff {
  addedHooks:         HookSummary[];
  removedHooks:       HookSummary[];
  addedEventTypes:    string[];
  removedEventTypes:  string[];
  macroChanges:       MacroDiff[];
  schemaChanges:      SchemaDiff[];
  snrDelta:           number;
  baselineDelta:      number;
  summary:            string;
}
```

### 5.3 Compress / Decompress / Synthesize

```typescript
architect.compress(kernel: object, opts?: CompressOpts): UrckArtifact
architect.decompress(artifact: UrckArtifact, opts?: DecompressOpts): object
architect.compressionReport(kernel: object, artifact: UrckArtifact): CompressionReport
architect.synthesize(blueprints: Blueprint[], strategy?: SynthesisStrategy): Blueprint

interface CompressOpts {
  format:          'urck' | 'nex';
  embedBaseline:   boolean;
  embedSchemas:    boolean;
  checkpointEvery: number;
}
interface DecompressOpts {
  ringCap?: number;
  // strictVersion always true — §I-8
}
interface CompressionReport {
  rawBytes:   number;
  snapBytes:  number;
  ratio:      number;
  primaryCount: number;
  totalCount:   number;
  bytesPerEvent: number;
  stringPoolSize: number;
  summary:    string;   // '1024.0 KB raw → 102.4 KB snap (10×)'
}
type SynthesisStrategy = 'union' | 'intersect' | 'weighted' | 'compete';
```

### 5.4 Clip operations (complete)

```typescript
architect.clips.extract(sessionId: string, from: number, to: number, opts?: ClipOpts): Clip
architect.clips.replay(clip: Clip, opts?: ReplayOpts): ReplayResult
architect.clips.reconstruct(clip: Clip, atIndex: number): object   // kernel
architect.clips.diff(a: Clip, b: Clip): ClipDiff
architect.clips.export(clip: Clip): UrckArtifact
architect.clips.translate(clip: Clip, format: 'markdown' | 'json' | 'seam'): string
architect.clips.integrity(clip: Clip): IntegrityReport
architect.clips.list(sessionId?: string): ClipSummary[]

interface ClipOpts {
  label?:    string;
  tags?:     string[];
  integrityCheck: boolean;   // default true — §I-9
}
interface ReplayOpts {
  until?:         number;
  filter?:        (event: ArchitectEvent) => boolean;
  dryRun:         boolean;
  replayEffects:  boolean;   // default false (§14 side-effect boundary)
}
interface ReplayResult {
  replayed:   number;
  skipped:    number;
  diverged:   boolean;
  newSession: string | null;
  sideEffectsAffected: SideEffectRecord[];
}
interface IntegrityReport {
  valid:           boolean;
  corruptAt:       number | null;
  orphanedEdges:   string[];
  hashMismatches:  number[];
}
```

### 5.5 Reconstruct + Replay

```typescript
architect.reconstruct.rewindTo(sessionId: string, eventIndex: number): RewindResult
architect.reconstruct.replayFrom(eventIndex: number, opts: ReplayOpts): ReplayResult
architect.reconstruct.validate(sessionId: string): IntegrityReport
architect.reconstruct.findLCP(sessionA: string, sessionB: string): LCPResult
architect.reconstruct.detectDivergence(baseline: string, live: string): DivergenceResult

interface RewindResult {
  kernel:          object;
  restoredAt:      number;   // event index
  checkpointUsed:  Checkpoint;
  eventsReplayed:  number;
  wallMs:          number;   // time taken
}
interface LCPResult {
  eventIndex:        number;
  eventId:           string;
  checkpointBefore:  number;
  confidence:        number;
}
interface DivergenceResult {
  diverged:           boolean;
  firstDivergenceAt:  number;
  divergenceType:     'sequence' | 'causal' | 'statistical' | 'structural';
  expected:           { type: string; causedBy: string };
  observed:           { type: string; causedBy: string };
  confidence:         number;
}
```

### 5.6 Translate

```typescript
architect.translate.utl(rawInput: string): UTLOutput
architect.translate.fieldToSchema(field: object): object   // JSONSchema
architect.translate.schemaToTypes(schema: object): string  // TypeScript
architect.translate.clipToTimeline(clip: Clip, format: 'markdown' | 'json' | 'seam'): string
architect.translate.seamToJs(phrase: string): string
architect.translate.blueprintToSpec(blueprint: Blueprint): SpecFile

interface UTLOutput {
  raw:         string;
  constraints: Constraint[];
  gaps:        Gap[];
  tensions:    Tension[];
  confidence:  number;
  type_signature: string;   // drives engine routing
}
```

### 5.7 Behavior patterns and macros

```typescript
architect.behavior.capture(sessionId: string, name: string): BehavioralAsset
architect.behavior.version(assetId: string, sessionId: string): BehavioralAsset
architect.behavior.diff(assetA: string, assetB: string): BehaviorDiff
architect.behavior.deploy(assetId: string, targetKernel: object): void
architect.behavior.recover(liveSession: string, assetId: string): RecoveryResult
architect.behavior.detectMacros(sessionId: string): MacroPattern[]
architect.behavior.list(): BehavioralAsset[]

interface BehaviorDiff {
  addedEventTypes:   string[];
  removedEventTypes: string[];
  macroChanges:      MacroDiff[];
  sigmaChange:       number;
  snrChange:         number;
  summary:           string;
}
interface RecoveryResult {
  lcp:             LCPResult;
  rewoundTo:       number;
  resumedWith:     string;   // asset id used as guide
  divergence:      DivergenceResult;
}
```

---

## 6. FILE / DATA TOPOLOGY MAPPER (Layer 3)

### 6.1 Scanner

```typescript
architect.map.scan(rootPath: string, opts?: ScanOpts): Promise<TopologyMap>
architect.map.diff(before: TopologyMap, after: TopologyMap): TopologyDiff
architect.map.findGaps(map: TopologyMap): TopologyGap[]
architect.map.export(map: TopologyMap, format: 'svg' | 'mermaid' | 'json'): string
architect.map.watch(rootPath: string): EventEmitter   // emits 'topology:changed'

interface ScanOpts {
  ignore?:         string[];   // glob patterns
  maxDepth?:       number;
  followSymlinks?: boolean;
  detectHooks?:    boolean;    // parse files for hook declarations
  detectEvents?:   boolean;    // parse files for event type usage
}

interface TopologyDiff {
  addedFiles:    string[];
  removedFiles:  string[];
  addedFlows:    DataFlow[];
  removedFlows:  DataFlow[];
  newGaps:       TopologyGap[];
  resolvedGaps:  TopologyGap[];
  snrDelta:      number;
}
```

---

## 7. SCHEMA BUILDER (Layer 4)

```typescript
architect.schema.fromBlueprint(blueprint: Blueprint): SchemaSet
architect.schema.fromMap(map: TopologyMap): SchemaSet
architect.schema.fromHooks(hooks: Hook[]): SchemaSet
architect.schema.validate(data: unknown, schemaName: string): ValidationResult
architect.schema.export(schemaSet: SchemaSet, outDir: string): void

interface ValidationResult {
  valid:    boolean;
  errors:   { path: string; message: string; }[];
  warnings: { path: string; message: string; }[];
}
```

---

## 8. CLI (Layer 5)

Built before the UI. Same schema as UI. Full parity. (§4.1 · §I-13)

```bash
# ── Spec ──────────────────────────────────────────────────────────
architect spec new <name>
architect spec open <path>
architect spec validate <path>
architect spec diff <a> <b>
architect spec compile <path>
architect spec export <path> [--format svg|mermaid|json]

# ── Hooks ─────────────────────────────────────────────────────────
architect hook list [--type] [--layer] [--status] [--tags]
architect hook get <id-or-name>
architect hook add                        # interactive declaration
architect hook add --from-json <path>     # from JSON file
architect hook update <id> --field=value
architect hook deprecate <id> --reason --caused-by
architect hook remove <id>                # hard remove; fails if bindings exist
architect hook wire <from-id> <to-id>
architect hook unwire <binding-id>
architect hook validate
architect hook graph [--format json|mermaid|svg]

# ── Blueprint ──────────────────────────────────────────────────────
architect blueprint build --from spec|session|kernel|scan <source>
architect blueprint read <id>
architect blueprint open <id>
architect blueprint diff <a> <b>
architect blueprint compile <id>
architect blueprint export <id> [--format]
architect blueprint list

# ── Map ────────────────────────────────────────────────────────────
architect map scan <path> [--ignore] [--depth]
architect map diff <before-id> <after-id>
architect map gaps <id>
architect map export <id> [--format]
architect map watch <path>

# ── Schema ─────────────────────────────────────────────────────────
architect schema build --from blueprint|map|hooks <source>
architect schema validate <data-path> <schema-name>
architect schema export <id> <out-dir>

# ── Sessions / Replay ──────────────────────────────────────────────
architect session list
architect session validate <id>
architect session diff <a> <b>
architect session clip <id> --from <n> --to <n> [--label]
architect session replay <clip-id> [--dry-run] [--replay-effects]
architect session rewind <id> <event-index>
architect session reconstruct <id>
architect session blueprint <id>
architect session compress <id> [--format urck|nex]
architect session decompress <path>
architect session lcp <session-a> <session-b>
architect session diverge <baseline> <live>

# ── Behavior ───────────────────────────────────────────────────────
architect behavior capture <session-id> <name>
architect behavior list
architect behavior get <id>
architect behavior diff <a> <b>
architect behavior deploy <id> <target-session>
architect behavior recover <live-session> <asset-id>
architect behavior macros <session-id>
architect behavior version <asset-id> <session-id>

# ── Translate ──────────────────────────────────────────────────────
architect translate utl <text>
architect translate field-to-schema <constraint-id>
architect translate schema-to-types <schema-name>
architect translate clip-to-timeline <clip-id> [--format markdown|json|seam]
architect translate seam-to-js <phrase>
architect translate blueprint-to-spec <blueprint-id>

# ── SNR ────────────────────────────────────────────────────────────
architect snr check <source-id>
architect snr tag <source-id>
architect snr route <source-id>
architect snr history <source-id>
architect snr gaps [--recent <n>]

# ── Ollama ─────────────────────────────────────────────────────────
architect ollama models
architect ollama send <source-id> <prompt> [--model]

# ── RAID ───────────────────────────────────────────────────────────
architect raid models
architect raid send <source-id> <prompt> [--strategy vote|merge|compete|cascade]

# ── System ─────────────────────────────────────────────────────────
architect serve [--port]
architect health
architect version
architect gaps                            # all open gaps across entire system
architect tensions                        # all open tensions
```

---

## 9. SNR GATE (Layer 7)

### 9.1 Scoring engine

```typescript
architect.snr.check(source: unknown, context?: SNRContext): SNRResult
architect.snr.tag(source: unknown): object & { snr: SNRResult }
architect.snr.route(source: unknown, opts?: RoutingOpts): RoutingDecision
architect.snr.history(sourceId: string): SNRResult[]
architect.snr.recentGaps(n?: number): Gap[]

interface SNRContext {
  assetId?:  string;   // behavioral asset to compare against
  schema?:   string;   // schema name to validate against
  sessionId?: string;
}
interface RoutingOpts {
  forceRoute?: 'ollama' | 'raid';   // operator override — logged with reason
  reason?:     string;              // required if forceRoute used
}
interface RoutingDecision {
  target:      'ollama' | 'raid' | 'hold';
  snrResult:   SNRResult;
  model?:      string;
  strategy?:   string;
  overridden:  boolean;
}
```

### 9.2 Ollama hook

```typescript
architect.ollama.send(snrResult: SNRResult, prompt: string, opts?: OllamaSendOpts): Promise<OllamaResponse>
architect.ollama.models(): Promise<string[]>

interface OllamaSendOpts {
  model?:       string;
  temperature?: number;
  maxTokens?:   number;
}
interface OllamaResponse {
  completion:    string;
  confidence:    number;
  tokens_used:   number;
  model_version: string;
  snrInput:      SNRResult;
}
```

### 9.3 RAID hook

```typescript
architect.raid.send(snrResult: SNRResult, prompt: string, opts?: RAIDSendOpts): Promise<RAIDResponse>
architect.raid.models(): Promise<string[]>

interface RAIDSendOpts {
  models?:   string[];
  strategy?: 'vote' | 'merge' | 'compete' | 'cascade';
  quorum?:   number;
}
interface RAIDResponse {
  synthesized:    string;
  winning_model:  string;
  per_model: {
    model:   string;
    output:  string;
    score:   number;
    tokens:  number;
  }[];
  strategy_used:  string;
  snrInput:       SNRResult;
}
```

---

## 10. INVARIANTS

Every invariant enforced by a named gate. Violation = loud error + gap record in JAA.

```
§I-1   Every hook has a unique UUID and a unique name.
§I-2   Every hook has a declared schema. Schema validates before hook is active.
§I-3   All inter-surface communication uses a declared hook. No undeclared calls.
§I-4   No hook of type 'direct' crosses layer boundaries. Throws on violation.
§I-5   No engine receives raw text. All input passes through UTL first.
§I-6   SNR gate runs before any output reaches Ollama or RAID.
§I-7   Compress never modifies the kernel. Read-only on event store.
§I-8   Decompress validates version gate before parsing. No bypass (§CONS-004).
§I-9   No clip is replayed without integrity check first.
§I-10  Every gap is recorded to JAA before any engine acts on it.
§I-11  Tensions are never collapsed early. Both constraints persist in JAA.
§I-12  The spec file is append-only. Deletions are deprecations with causedBy.
§I-13  CLI and UI speak the same schema. No UI-only or CLI-only operations.
§I-14  Behavioral assets carry a declared side-effect policy per effect.
       Replay without a declared policy is prohibited.
§I-15  SNR score < 0.45 never routes to Ollama or RAID without operator override.
       Override must include reason. Override is logged to JAA.
§I-16  No hook of type 'macro' is ingested into the kernel ring. (§C-2)
§I-17  Seam grammar rejections are recorded. Negative space is data.
§I-18  The Hook Registry is persisted to JAA on every write. (§2.1)
§I-19  Hook frictionScore is updated after every execution and persisted.
§I-20  The spec uuid and checksum must match on every load. Mismatch = hard error.
```

---

## 11. OPEN GAPS

```
G-A-001  HIGH    UTL not yet built — raw text still enters some engines
G-A-002  HIGH    SNR gate not composed as final L7 output surface in practice
G-A-003  HIGH    Hook 'webserver' port declaration schema needs canonicalization
G-A-004  MEDIUM  Blueprint compiler does not embed Constraint table (G-014 from RHEON)
G-A-005  MEDIUM  Topology mapper does not detect Seam grammar files
G-A-006  MEDIUM  Clip translate does not output Seam format (defined but not built)
G-A-007  MEDIUM  RAID quorum schema validation not enforced for strategy 'vote'
G-A-008  SEED    History engine (G-013 from RHEON) not wired — single-trajectory only
G-A-009  SEED    Seam grammar negotiation hook not yet declared in Hook Registry
G-A-010  SEED    Personal vectors (JAA table) not yet wired to blueprint behavioral axis
```

---

## 12. FILE STRUCTURE

```
architect/
  architect.spec.json           ← THE source of truth. All else is projection.
  package.json                  ← zero external runtime deps in core (§5.5)

  src/
    index.js                    ← public surface: export all layers

    # L0 — Constraint Field (external — Rheon Kernel)
    constraint-field/

    # L1 — Spec Engine
    spec/
      Blueprint.js
      Compress.js               ← .urck / .nex compress/decompress/synthesis
      Clip.js                   ← clip extract/replay/reconstruct/diff
      Translate.js              ← UTL + all surface translators
      Behavior.js               ← .beh capture/version/diff/deploy/recover
      Reconstruct.js            ← rewind/replay/LCP/divergence

    # L2 — Hook Registry
    hooks/
      Registry.js               ← hook CRUD, validation, wiring, graph
      HookTypes.js              ← 22 type taxonomy + config schemas
      HookGraph.js              ← dependency graph (json|mermaid|svg)

    # L3 — Topology Mapper
    map/
      Scanner.js                ← file system scan + import/export graph
      DataFlow.js               ← data flow detection between surfaces
      GapDetector.js            ← topology gap detection (6 gap types)
      Exporter.js               ← svg | mermaid | json output

    # L4 — Schema Builder
    schema/
      Builder.js                ← JSON Schema + TypeScript type generation
      Validator.js              ← compiled validators (zero deps)
      GateGenerator.js          ← constraint enforcement gates per schema

    # L5 — CLI
    cli/
      index.js                  ← entry point: architect <command>
      commands/
        spec.js
        hook.js
        blueprint.js
        map.js
        schema.js
        session.js
        behavior.js
        translate.js
        snr.js
        ollama.js
        raid.js
        system.js

    # L6 — UI (built last)
    ui/
      canvas/                   ← visual canvas (forge-canvas pattern)
      panels/
        BlueprintPanel.js       ← structural digest, constraint field, gaps
        HookPanel.js            ← add/remove/wire hooks, type inspector
        TimelinePanel.js        ← causal timeline, clip selection, divergence
        TopologyPanel.js        ← file/data flow, surface map
        SchemaPanel.js          ← visual schema editor
        SNRPanel.js             ← live scores, gap registry, routing decisions
      bridge/
        index.js                ← canvas ↔ architect API (same schema as CLI)

    # L7 — SNR Gate
    snr/
      Gate.js                   ← scoring engine (8 axes)
      Router.js                 ← send|hold|rewrite|flag decision
      OllamaHook.js             ← local LLM routing (SNR-gated)
      RAIDHook.js               ← multi-model ensemble routing (SNR-gated)

  data/
    hooks.jsonl                 ← append-only hook registry (JAA pattern)
    blueprints/                 ← .blueprint files
    sessions/                   ← .urck archives
    clips/                      ← extracted .urck clip artifacts
    behaviors/                  ← .beh behavioral assets
    schemas/                    ← generated schema sets
    maps/                       ← topology map snapshots
    snr/                        ← SNR result history
    gaps.jsonl                  ← all gap records
    tensions.jsonl              ← all tension records
    constraints.jsonl           ← all constraint records
    grammar.jsonl               ← Seam grammar table
    personal_vectors.jsonl      ← personal constraint vectors

  test/
    spec.test.js
    hooks.test.js
    compress.test.js
    clip.test.js
    translate.test.js
    behavior.test.js
    reconstruct.test.js
    map.test.js
    schema.test.js
    snr.test.js
    utl.test.js
    integration.test.js

  docs/
    ARCHITECT-SPEC-v1.1.0.md    ← this document
    hooks/                      ← one .md per hook type (22 files)
    schemas/                    ← one .md per schema (all §4 objects)
    examples/
      minimal.spec.json         ← smallest valid spec
      full.spec.json            ← fully populated example
      hooks/                    ← one .json per hook type
```

---

## 13. BUILD SEQUENCE

```
PHASE 1 — SPEC ENGINE CORE                              Target: v1.0
  Hook Registry (§3) — all 22 types, schema, CRUD, validation, wiring
  Blueprint (§5.2) — fromSpec, fromSession, fromScan, diff, compile
  Compress/Decompress (§5.3) — .urck read/write, version gate, synthesis
  JAA tables (§4.12) — hooks, blueprints, gaps, tensions, constraints
  Result: read, write, compress, and validate specs.

PHASE 2 — CLIP + REPLAY                                 Target: v1.1
  Clip (§5.4) — extract, replay, reconstruct, diff, integrity check
  Reconstruct (§5.5) — rewind, replay, LCP, divergence
  Translate (§5.6) — UTL, field→schema, clip→timeline, seam→js
  Result: sessions navigable, clips portable, UTL built.

PHASE 3 — TOPOLOGY MAPPER                               Target: v1.2
  Scanner, DataFlow, GapDetector, Exporter (§6)
  JAA tables: topology_maps
  Result: architecture visible before build.

PHASE 4 — SCHEMA BUILDER                                Target: v1.3
  Builder, Validator, GateGenerator (§7)
  JAA tables: schema_sets
  Result: every surface has a validated type contract.

PHASE 5 — CLI                                           Target: v1.4
  All commands from §8 — full feature parity
  CLI complete before UI starts (§4.1)
  Result: full architect capability from terminal.

PHASE 6 — BEHAVIOR PATTERNS                             Target: v1.5
  Behavioral asset operations (§5.7)
  Macro detection wired into JAA behaviors table
  Result: behavioral patterns are portable assets.

PHASE 7 — SNR GATE + ROUTING                            Target: v1.6
  SNR scoring engine (§9)
  Ollama hook, RAID hook
  Route decision logged to JAA
  Result: nothing leaves without a score.

PHASE 8 — UI                                            Target: v2.0
  6 panels (Blueprint, Hook, Timeline, Topology, Schema, SNR)
  Canvas wired to same API as CLI
  Result: full capability from visual canvas.
```

---

## 14. SIDE-EFFECT BOUNDARY

Every external action is declared before execution.
During replay, the policy is explicit — never implicit.

```typescript
interface SideEffectDecl {
  name:        string;   // e.g. 'db.write', 'http.post', 'file.write'
  execute:     string;   // module.method
  undo?:       string;   // inverse operation module.method (optional)
  replay:      'no-op' | 'execute' | 'undo' | 'custom';
  idempotent:  boolean;
  description: string;
}

// Registration (before any execution)
architect.effects.register(decl: SideEffectDecl): void

// Before rewind: always show affected side effects
architect.effects.preview(sessionId: string, toIndex: number): SideEffectRecord[]
```

---

## 15. DELTA RECORD

```
v1.1.0 — 2026-05-30
  ADDED:
    - §AUTHORIAL INTENT — James Brooks quoted verbatim
    - §3.3 Hook type config schemas — all 22 types fully specified
    - §3.4 HookBinding schema
    - §4 CORE OBJECT SCHEMAS — complete:
        Constraint, Gap, Tension, ArchitectEvent, Clip, Blueprint,
        TopologyMap, SchemaSet, BehavioralAsset (.beh), UrckArtifact,
        SNRResult, all 12 JAA table schemas
    - §5.1 Spec file format (.spec.json) — complete SpecFile interface
            with all sub-interfaces: ConstraintDecl, LayerDecl, SurfaceDecl,
            HookDecl, SchemaDecl, GateDecl, EventDecl, FileDecl, GapDecl,
            RiskDecl, DeltaEntry
    - §5.2–5.7 All Spec Engine APIs fully typed with return types
    - §6.1 ScanOpts and TopologyDiff interfaces
    - §8 CLI — all commands enumerated with flags
    - §9.2–9.3 OllamaResponse, RAIDResponse, RoutingDecision typed
    - §14 Side-effect boundary — SideEffectDecl schema
    - §I-16 through §I-20 — five additional invariants
    - G-A-010 new gap: personal_vectors not wired to blueprint behavioral axis
  STATUS: living · not frozen · growing at the seam

v1.0.0 — 2026-05-30
  FOUNDED. See ARCHITECT-SPEC-v1.0.0.md.
```

---

*"Meaning is downstream of constraints."*
*The Architect never forgets this.*
*The spec is the system. Code is a projection.*

---

*From James: "lets invent the universe"*
*This is the blueprint.*
