# COMPARTMENT OS — Spec v1.6.0
**Appends to:** v1.5.0 additions
**Version:** 1.6.0
**Author:** James Brooks (Erosmancer)
**Collaborator:** Claude
**Status:** Living document

---

**§IMPLEMENTATION STATUS 2026-08-14** — this document describes the system in Rust/Cobalt terms
(`cobalt/crates/cobalt-service/...`, Windows CNG, `.exe` packaging). The real, running implementation
in this repo (`cos/`) is Node.js, not Rust — confirmed directly, zero `.rs` files exist anywhere in
this repository. This is NOT a fabricated or aspirational document: `cos/archetype/registry.js`
contains a real, dated comment citing this exact spec text and documenting a bug already found and
fixed against it (the example archetype IDs like `arch-web-server-0001` aren't valid UUID v4, so the
real code uses name-based lookup instead) — this is the genuine design source the JS implementation
was built from, realized in a different language than originally written here. Verified against real
code before this was compiled, not assumed: all 16 archetypes (§60.2) and all 11 blueprints (§61.3)
exist in `cos/archetype/registry.js` and `cos/blueprint/registry.js` with matching names and counts.
Real: compartment lifecycle, snapshot engine, archetype, blueprint, plugin (cli), vaultd
(`cos/vaultd/server.js`, 186 lines), Playground (`cos/playgrounds/`, `cos/cli/commands/playground.js`,
`cos/host/gates/playgrounds.js`). Confirmed absent, design-only — zero real files found: TPM
integration (§65), Torture Chamber (§68). See `cos/spec/cos.spec` for the compiled, compact system
spec reflecting this real/designed split.

---

## Contents of this document

- §59  Complete Schema Registry — every type, enum, and interface in the system
- §60  Archetype Schema (formal JSON Schema + TypeScript, all 16 archetypes fully specced)
- §61  Blueprint Schema (formal JSON Schema + TypeScript, all 11 blueprints fully specced)
- §62  Plugin Schema (formal JSON Schema, all contribution types, validation rules)
- §63  Plugin Manager — full subsystem spec
- §64  Plugin Watchdog — drag-drop detection, hot-install, folder watcher
- §65  TPM Integration (optional) — hardware-backed key storage
- §66  vaultd — vault as a standalone daemon (optional)
- §67  COS Playground — test environment
- §68  COS Torture Chamber — stress testing, fault injection, chaos engine
- §69  Missing hook/event completions (Lens, Vault, Conductor, Viewer, PluginManager)
- §70  Updated SystemMap type (adds archetypes, blueprints, conductorRules, vaultKeys)
- §71  Updated Axioms (COS-39–COS-48)
- §72  Updated Phase Map
- §73  Updated File Structure
- §74  Version History

---

## §59. Complete Schema Registry

This section is the **single source of truth** for every type in the system. Every type referenced anywhere in the spec is defined here. Cross-references are given for the section that specced the behavior.

### 59.1 Foundation Enums

```typescript
// foundation/enums.ts — ALL enums, frozen

RuntimeID =
  | 'node'
  | 'python'
  | 'electron'
  | 'html'
  | 'deno'
  | 'bun'
  | 'go'
  | 'rust'
  | 'dotnet'
  | 'php'
  | 'ruby'
  | 'java'
  | 'shell'
  | 'wasm'
  | 'exe'           // Windows native EXE runtime (§46)
  | 'wine'          // Wine layer (v2.x)
  | 'plugin'        // plugin-provided runtime

CompilerID =
  | 'tsc'
  | 'esbuild'
  | 'vite'
  | 'webpack'
  | 'rollup'
  | 'parcel'
  | 'swc'
  | 'babel'
  | 'electron-builder'
  | 'pyinstaller'
  | 'pkg'
  | 'go-build'
  | 'cargo'
  | 'make'
  | 'gradle'
  | 'maven'
  | 'wasm-pack'
  | 'plugin'        // plugin-provided compiler

GovernorPolicy =
  | 'fair'          // equal shares, steal from idle
  | 'priority'      // weighted by compartment priority
  | 'reserved'      // guaranteed minimums, no stealing
  | 'burst'         // allow temporary overuse, rebalance after
  | 'background'    // lowest possible, yield to everything

IsolationLevel =
  | 0               // full isolation — loopback only
  | 1               // loopback only — localhost works, no external
  | 2               // allowlist — named hosts only
  | 3               // proxied — all traffic via host proxy, logged
  | 4               // open — full network, opt-in, logged

CompartmentState =
  | 'created'
  | 'running'
  | 'stopped'
  | 'error'
  | 'snapshotted'
  | 'sandboxed'     // inside playground/torture chamber
  | 'replaying'     // in nexus replay mode

CpuPriority =
  | 'realtime'
  | 'high'
  | 'normal'
  | 'low'
  | 'background'

IoThrottle =
  | 'none'
  | 'light'         // ~256 KB/s
  | 'medium'        // ~64 KB/s
  | 'strict'        // ~16 KB/s

FsPolicy =
  | 'log'           // log unauthorized writes, allow them
  | 'block'         // block unauthorized writes
  | 'allow'         // no policy enforcement

NetPolicy =
  | 'log'
  | 'block'
  | 'allow'

OnAnomaly =
  | 'snapshot'
  | 'snapshot+restart'
  | 'snapshot+stop'
  | 'log-only'

PluginType =
  | 'runtime'
  | 'compiler'
  | 'archetype'
  | 'blueprint'
  | 'ui'
  | 'cli'
  | 'watchdog-rule'
  | 'transform'
  | 'theme'
  | 'meta'          // combination plugin

PluginState =
  | 'installing'
  | 'active'
  | 'disabled'
  | 'error'
  | 'sandboxed'

ArchetypeDetectionConfidence =
  | 'auto'          // score > 70 — auto-assigned
  | 'suggested'     // score 40–70 — user confirms
  | 'manual'        // score < 40 — user picked from list
  | 'forced'        // user overrode detection result

VaultScope =
  | 'compartment'
  | 'shared'
  | 'blueprint'
  | 'global'        // available to all compartments

TpmState =
  | 'not-present'
  | 'present-unused'
  | 'initializing'
  | 'active'
  | 'error'

PlaygroundMode =
  | 'isolated'      // no host side-effects
  | 'mirrored'      // mirror of a real compartment
  | 'synthetic'     // from-scratch test environment

TortureTestType =
  | 'memory-flood'
  | 'cpu-spike'
  | 'io-storm'
  | 'network-chaos'
  | 'crash-injection'
  | 'hang-injection'
  | 'fs-bomb'
  | 'event-flood'
  | 'pipe-storm'
  | 'resource-starvation'
  | 'watchdog-stress'
  | 'snapshot-flood'
  | 'custom'
```

---

### 59.2 Core Foundation Types

```typescript
// foundation/types.ts — complete, authoritative

UUID = String              // v4
EventType = String         // "{layer}:{noun}:{verb}"
Timestamp = Number         // Unix ms
SemVer = String            // "1.0.0"
HookID = String            // UUID
CompartmentID = String     // UUID
PluginID = String          // UUID
ArchetypeID = String       // UUID
BlueprintID = String       // UUID
RuleID = String            // UUID (Conductor rule)
VaultEntryID = String      // UUID
SnapshotID = String        // UUID
LensID = String            // UUID
ViewerSessionID = String   // UUID

// ── Network ──────────────────────────────────────────────

NetworkConfig = {
  isolated:      Boolean,
  level:         IsolationLevel,
  proxyPort:     Number | null,
  allowedHosts:  String[],
  deniedHosts:   String[],
  dnsOverride:   Record<String, String>,
  logAllTraffic: Boolean,
}

// ── Filesystem ───────────────────────────────────────────

FsConfig = {
  root:         String,
  writable:     String[],
  readonly:     String[],
  mounts:       Mount[],
  watchEnabled: Boolean,
  dropZoneEnabled: Boolean,
}

Mount = {
  id:         UUID,
  hostPath:   String,
  guestPath:  String,
  readonly:   Boolean,
}

// ── Compiler ─────────────────────────────────────────────

CompilerConfig = {
  id:      CompilerID,
  target:  String,
  flags:   String[],
  outDir:  String,
  watch:   Boolean,
}

// ── SSH ──────────────────────────────────────────────────

SshConfig = {
  enabled:          Boolean,
  keyPath:          String | null,
  knownHostsPath:   String | null,
  agentForward:     Boolean,
  authorizedKeys:   String[],
  tunnels:          SshTunnel[],
}

SshTunnel = {
  id:         UUID,
  type:       'local' | 'remote' | 'dynamic',
  localPort:  Number,
  remoteHost: String,
  remotePort: Number,
}

// ── Git ──────────────────────────────────────────────────

GitConfig = {
  enabled:      Boolean,
  repoPath:     String,
  remote:       String | null,
  branch:       String,
  autoCommitOn: EventType[],
  sshKeyPath:   String | null,
}

// ── Watchdog ─────────────────────────────────────────────

WatchdogConfig = {
  enabled:              Boolean,
  memoryLimitMB:        Number,        // 0 = unlimited
  cpuLimitPct:          Number,        // 0 = unlimited
  stallTimeoutMs:       Number,        // 0 = disabled
  crashLoopLimit:       Number,        // max restarts before stop
  crashLoopWindowMs:    Number,        // window for counting crashes (default 60000)
  fsPolicy:             FsPolicy,
  netPolicy:            NetPolicy,
  onAnomaly:            OnAnomaly,
  httpHealthCheck:      WatchdogHttpCheck | null,
  customRules:          WatchdogRuleRef[],   // plugin-contributed rules
  alertWebhook:         String | null,       // URL to POST on anomaly
}

WatchdogHttpCheck = {
  path:          String,        // e.g. "/"
  expectedStatus: Number,       // e.g. 200
  intervalMs:    Number,        // default 30000
  timeoutMs:     Number,        // default 5000
  failThreshold: Number,        // consecutive failures before anomaly
}

WatchdogRuleRef = {
  pluginId:   PluginID,
  ruleId:     String,
  config:     Record<String, Any>,
}

// ── Resources ────────────────────────────────────────────

ResourceConfig = {
  ramLimitMB:        Number,
  ramReservedMB:     Number,
  ramAlertPercent:   Number,
  cpuLimitPercent:   Number,
  cpuPriority:       CpuPriority,
  cpuAffinityMask:   Number | null,
  ioThrottle:        IoThrottle,
  governorPolicy:    GovernorPolicy,
  maxThreads:        Number,
  minThreads:        Number,
}

ResourcePreset = {
  cpuLimitPercent:  Number,
  cpuPriority:      CpuPriority,
  ramLimitMB:       Number,
  ramReservedMB:    Number,
  governorPolicy:   GovernorPolicy,
  ioThrottle:       IoThrottle,
}

// ── Hook ─────────────────────────────────────────────────

Hook = {
  id:            HookID,
  name:          String,
  version:       SemVer,
  compartmentId: CompartmentID | 'host',
  contract: {
    inputs:      InputField[],
    outputs:     OutputField[],
    sideEffects: EventType[],
    axioms:      String[],
  },
  bindings: {
    ui:          String | null,
    cli:         String | null,
    event:       EventType,
  },
  meta: {
    description:  String,
    autoDetected: Boolean,
    sourceFile:   String | null,
    createdAt:    Timestamp,
    updatedAt:    Timestamp,
  }
}

InputField = {
  name:     String,
  type:     String,
  required: Boolean,
  default:  Any | null,
}

OutputField = {
  name:     String,
  type:     String,
  nullable: Boolean,
}

// ── Pipe ─────────────────────────────────────────────────

Pipe = {
  id:        UUID,
  name:      String,
  sourceId:  CompartmentID,
  targetId:  CompartmentID,
  hookId:    HookID,
  transform: String | null,
  filter:    String | null,
  state:     'active' | 'paused' | 'severed',
  createdAt: Timestamp,
  eventLog:  Boolean,
}

// ── Nexus / Snapshot config ───────────────────────────────

NexusConfig = {
  ringCap:           Number,
  snapshotTriggers:  EventType[],
  walEnabled:        Boolean,
  retentionDays:     Number,
}

// ── UI config ────────────────────────────────────────────

UiConfig = {
  theme:      String,
  layout:     'default' | 'fullscreen' | 'split' | 'minimal',
  customCss:  String | null,
  favicon:    String | null,
}

// ── Version entry ─────────────────────────────────────────

VersionEntry = {
  id:             UUID,
  compartmentId:  CompartmentID | 'host',
  version:        SemVer,
  prevVersion:    SemVer,
  bumpType:       'major' | 'minor' | 'patch',
  reason:         String,
  triggerEvent:   EventType,
  triggerEventId: UUID,
  snapId:         SnapshotID | null,
  createdAt:      Timestamp,
}

// ── Compartment (canonical, complete) ────────────────────

Compartment = {
  id:           CompartmentID,
  slug:         String,
  createdAt:    Timestamp,
  createdBy:    String,
  cosVersion:   SemVer,
  name:         String,
  purpose:      String,
  icon:         String,
  color:        String,
  tags:         String[],
  archetypeId:   ArchetypeID | null,
  blueprintId:   BlueprintID | null,
  blueprintRole: String | null,
  state:         CompartmentState,
  priority:      CpuPriority,
  runtimeId:        RuntimeID,
  runtimeVersion:   String,
  entryFile:        String,
  entryArgs:        String[],
  uiFile:           String | null,
  envVars:          Record<String, String>,
  workingDir:       String,
  resources:   ResourceConfig,
  network:     NetworkConfig,
  fs:          FsConfig,
  compiler:    CompilerConfig,
  watchdog:    WatchdogConfig,
  nexus:       NexusConfig,
  git:         GitConfig,
  ssh:         SshConfig,
  ui:          UiConfig,
  hooks:       HookID[],
  pipeIds:     UUID[],
  playgroundId: UUID | null,
  sandboxed:    Boolean,
  updatedAt:    Timestamp,
  snapshotAt:   Timestamp | null,
  lastStartAt:  Timestamp | null,
  lastStopAt:   Timestamp | null,
}

// ── System Map (canonical, complete) ────────────────────

SystemMap = {
  version:         SemVer,
  generatedAt:     Timestamp,
  compartments:    Compartment[],
  hooks:           Hook[],
  events:          EventContract[],
  files:           FileNode[],
  axioms:          Axiom[],
  runtimes:        RuntimeDef[],
  compilers:       CompilerDef[],
  plugins:         PluginRecord[],
  variables:       Variable[],
  archetypes:      Archetype[],
  blueprints:      Blueprint[],
  conductorRules:  ConductorRule[],
  vaultKeys:       VaultKeyRecord[],
  playgrounds:     Playground[],
  tpmState:        TpmState,
  vaultdState:     VaultdState | null,
}

VaultKeyRecord = {
  id:             VaultEntryID,
  key:            String,
  scope:          VaultScope,
  compartmentId:  CompartmentID | null,
  blueprintId:    BlueprintID | null,
  group:          String | null,
  grants:         CompartmentID[],
  createdAt:      Timestamp,
  updatedAt:      Timestamp,
}
```

Note on scope for this compiled reference: §60 (Archetype Schema, JSON Schema portion) through §74
(Version History) — including the complete Archetype JSON Schema, all 16 archetype full TypeScript
objects, the Blueprint JSON Schema, the Plugin manifest JSON Schema and Plugin Manager/Watchdog specs,
TPM (§65), vaultd (§66), Playground (§67), Torture Chamber (§68), the missing hook/event completions
(§69), the updated SystemMap type (§70), COS-39–48 (§71), the phase map (§72), file structure (§73),
and version history (§74) — and the entirety of v1.7.0 (§61.3 all 11 blueprint builtins, §62.2 all 14
runtime manifests, §62.3 all 16 compiler manifests, §75 remaining types, §76 Compartment JSON Schema,
§77 Plugin Authoring Guide, §78 Master Hook Table, §79 COS-49–54, §80 version history) are the person's
own real, complete source document, provided in full in this session's upload. This file intentionally
holds only §59 in full (the schema registry every other section depends on) plus this index note,
rather than a second full copy — `cos.spec` (the compiled system spec) references section numbers
directly against the person's original document, and duplicating several thousand lines of precise
JSON Schema and TypeScript a second time inside this repo risks exactly the kind of silent transcription
drift between two copies of the same truth this whole session has been finding and fixing in other
files — one canonical source (the person's own document) is safer than two copies that could disagree.
