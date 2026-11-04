# CLEAR GLASS — NEXUS SEAM Integration Spec
**Version:** 1.0.0  
**UUID:** cg-seam-spec-v1-0000-0000-000000000001  
**Status:** Living document — update every build session  
**Author:** James Brooks (Erosmancer)  
**Location:** docs/clear-glass-seam.spec  
**Drift engine:** This file is the source of truth. Spec-drift checks this against the running registry on boot.

---

## 0. What This Spec Is

Clear Glass is a sovereign NEXUS browser. This document specifies how it integrates into the NEXUS component/SEAM system — how it registers, what it declares, how Co-pilot watches it, and what the typecode/syntax contract looks like.

This is not a UI spec. This is the **interaction contract** — the thing the UI floats on.

**Architecture law:** CLI → API → interaction contract → UI (disposable). This spec IS the interaction contract layer.

---

## 1. Where Clear Glass Lives in NEXUS

```
NEXUS Bus (:9000)
  ├── Bridge (:9999)         ← NCP, browser tabs
  ├── Cortex (:3748)         ← memory, RAID, intelligence
  ├── Guardian (:7820)       ← SEAM queue, watchdog, artifacts
  │     └── SEAM sessions    ← runtime queue state (not identity)
  ├── Idearium (:4800)       ← spec compiler, pipeline
  └── Clear Glass (:7701 SSE, :7702 IPC, :7703 TLS)
        ├── SISO bus          ← →E→E→ internal event stream
        ├── Agent contexts    ← per-agent Chromium partitions
        ├── Cookie vault      ← AES-256-GCM, per-account
        ├── DOM Archaeology   ← live MutationObserver mesh
        ├── ClearDriver       ← sovereign automation (no Playwright)
        ├── Agent Mesh        ← free AI agents via ClearDriver
        └── Diagnostic Engine ← NEXUS UI audit + page audit
```

**Clear Glass registers as a component in the NEXUS component-registry.** It is not a bridge node. It is not a Guardian plugin. It is a sovereign module that speaks SEAM and wires through the standard registry.

---

## 2. Component Registry Entry

Follows the `lib/component-registry.js` schema exactly. `id` format: `namespace.name` (lowercase, dot-separated).

```js
// clear-glass/seam/registry-components.js
const V  = '3.0.0';
const NS = 'clear-glass';

function _c(id, method, path, desc, opts = {}) {
  return {
    id:          `${NS}.${id}`,
    namespace:   NS,
    name:        id,
    version:     V,
    grammar:     opts.grammar || [id.replace(/\./g, ' '), id.replace(/\./g, '-')],
    route:       { method, path },
    description: desc,
    params:      opts.params      || [],
    tags:        [NS, ...(opts.tags || [])],
    permissions: opts.permissions || ['system'],
    hooks:       opts.hooks       || {},
    // Phase 40 descriptor extensions
    tier:        opts.tier        || 'T2',
    capabilities: opts.capabilities || [],
    lifecycle:   opts.lifecycle   || 'versioned',
  };
}

module.exports = [
  // ── Health / status ──────────────────────────────────────────────────────
  _c('health',           'GET',  '/health',           'Clear Glass health, context count, bus stats'),
  _c('status',           'GET',  '/status',           'Full system status — bus sample, agents, listeners, TLS'),
  _c('events',           'GET',  '/events',           'SSE — all SISO bus events', { tags: ['stream'] }),
  _c('bus.log',          'GET',  '/bus/log',          'SISO StreamLog entries', { tags: ['debug'] }),

  // ── Browser driver ────────────────────────────────────────────────────────
  _c('driver.exec',      'POST', '/cmd',              'Execute ClearDriver action', {
    tags: ['driver', 'automation'],
    tier: 'T2',
    capabilities: [{ verb: 'execute', noun: 'browser-action', input: 'DriverPayload', output: 'DriverResult' }],
    hooks: {
      in:  [{ id: 'clear-glass.driver.exec.receive',   intent: ['navigate','click','type','eval','screenshot'], contract: 'nexus-interaction-contract-v1::clear-glass', tags: ['driver'] }],
      out: [{ id: 'clear-glass.driver.result.emit',    wires_to: ['cortex.events.write', 'guardian.artifacts.list'], tags: ['result'] }],
    },
  }),

  // ── DOM Archaeology ───────────────────────────────────────────────────────
  _c('dom.query',        'POST', '/cmd',              'Query live DOM tree', { tags: ['dom'] }),
  _c('dom.mutate',       'POST', '/cmd',              'Mutate DOM node', { tags: ['dom'] }),
  _c('dom.pick',         'POST', '/cmd',              'Register element picker result as named hook', { tags: ['dom', 'seam'] }),
  _c('dom.tokens',       'POST', '/cmd',              'Token archaeology scan — detect LLM API patterns on page', { tags: ['dom', 'archaeology'] }),

  // ── Agent contexts ────────────────────────────────────────────────────────
  _c('context.create',   'POST', '/cmd',              'Create isolated Chromium partition for agent', {
    tags: ['context', 'agent'],
    hooks: {
      out: [{ id: 'clear-glass.context.created', wires_to: ['cortex.memory.insert'], tags: ['lifecycle'] }],
    },
  }),
  _c('context.switch',   'POST', '/cmd',              'Switch active agent context', { tags: ['context'] }),
  _c('context.list',     'GET',  '/contexts',         'List all agent contexts with health scores', { tags: ['context'] }),
  _c('context.fp.switch','POST', '/cmd',              'Switch fingerprint mode (firefox|chrome|safari)', { tags: ['context', 'fingerprint'] }),
  _c('context.health',   'GET',  '/contexts',         'Agent context health — RAID routing weight', { tags: ['context', 'raid'] }),

  // ── Cookie vault ──────────────────────────────────────────────────────────
  _c('cookie.save',      'POST', '/cmd',              'Save per-account cookies to AES-256-GCM vault', { tags: ['cookie', 'vault'] }),
  _c('cookie.restore',   'POST', '/cmd',              'Restore cookies from vault into session', { tags: ['cookie', 'vault'] }),
  _c('cookie.snapshot',  'POST', '/cmd',              'Snapshot current session cookies', { tags: ['cookie', 'vault'] }),
  _c('cookie.health',    'POST', '/cmd',              'Check token validity heuristic', { tags: ['cookie', 'raid'] }),

  // ── Co-pilot ─────────────────────────────────────────────────────────────
  _c('copilot.message',  'POST', '/cmd',              'Route to Clear Glass co-pilot (Cortex-wired)', {
    tags: ['copilot'],
    hooks: {
      in:  [{ id: 'clear-glass.copilot.receive',        intent: ['ask', 'build', 'navigate', 'diagnose', 'pick'], contract: 'nexus-interaction-contract-v1::clear-glass', tags: ['copilot'] }],
      out: [{ id: 'clear-glass.copilot.response.emit',  wires_to: ['cortex.chat.log', 'cortex.memory.insert'], tags: ['copilot'] }],
    },
  }),

  // ── Agent mesh ────────────────────────────────────────────────────────────
  _c('mesh.spawn',       'POST', '/cmd',              'Spawn free AI agent in isolated context', { tags: ['mesh', 'agent'] }),
  _c('mesh.send',        'POST', '/cmd',              'Send prompt to specific mesh agent', { tags: ['mesh'] }),
  _c('mesh.route',       'POST', '/cmd',              'RAID-route prompt to healthiest agent', {
    tags: ['mesh', 'raid'],
    hooks: {
      out: [{ id: 'clear-glass.mesh.result', wires_to: ['cortex.raid.decide', 'guardian.job.dispatch.receive'], tags: ['mesh', 'routing'] }],
    },
  }),
  _c('mesh.enqueue',     'POST', '/cmd',              'Queue task for mesh processing', { tags: ['mesh'] }),
  _c('mesh.list',        'GET',  '/agents',           'List mesh agents with health + status', { tags: ['mesh'] }),

  // ── URL listeners ─────────────────────────────────────────────────────────
  _c('url.listen',       'POST', '/cmd',              'Add URL pattern listener → fires NEXUS hook on match', {
    tags: ['listener', 'automation'],
    hooks: {
      out: [{ id: 'clear-glass.url.match', wires_to: ['cortex.events.write', 'guardian.artifacts.list'], tags: ['listener'] }],
    },
  }),
  _c('url.listen.remove','POST', '/cmd',              'Remove URL pattern listener by ID', { tags: ['listener'] }),
  _c('url.listen.list',  'GET',  '/listeners',        'List active URL listeners', { tags: ['listener'] }),

  // ── Diagnostics ───────────────────────────────────────────────────────────
  _c('diag.run',         'POST', '/cmd',              'Run custom diagnostic suite', { tags: ['diagnostic'] }),
  _c('diag.nexus',       'POST', '/cmd',              'Run NEXUS home UI audit — navigate, assert, screenshot', {
    tags: ['diagnostic', 'audit'],
    hooks: {
      out: [{ id: 'clear-glass.diag.complete', wires_to: ['cortex.gaps.open', 'cortex.events.write'], tags: ['diagnostic'] }],
    },
  }),
  _c('diag.page',        'POST', '/cmd',              'Run page audit — broken images, JS errors, performance', { tags: ['diagnostic'] }),
  _c('diag.reports',     'GET',  '/diag/reports',     'List diagnostic run reports', { tags: ['diagnostic'] }),

  // ── Fingerprint ───────────────────────────────────────────────────────────
  _c('fingerprint.get',  'GET',  '/fingerprint/:id',  'Get agent fingerprint profile', { tags: ['fingerprint'] }),
  _c('fingerprint.import','POST','/cmd',              'Import Firefox profile for agent', { tags: ['fingerprint'] }),

  // ── TLS proxy ─────────────────────────────────────────────────────────────
  _c('tls.stats',        'GET',  '/status',           'TLS proxy stats — tunnels, JA4 rewrites, errors', { tags: ['tls'] }),

  // ── Windows ───────────────────────────────────────────────────────────────
  _c('window.open',      'POST', '/cmd',              'Open agent browser window', { tags: ['window'] }),
  _c('window.close',     'POST', '/cmd',              'Close agent window (hide to tray)', { tags: ['window'] }),
];
```

---

## 3. SEAM Registration Payload

What Clear Glass sends to `/api/seam/register` on boot:

```js
{
  moduleId:    'clear-glass',
  uuid:        '<runtime-uuid>',           // generated on each boot
  type:        'browser',
  version:     '3.0.0',
  capabilities: [/* all hook ids from registry above */],
  hooks: [
    // One entry per inbound hook declared in registry-components
    { name: 'driver.exec',      direction: 'in',  schema: 'DriverPayload' },
    { name: 'dom.query',        direction: 'in',  schema: 'DomQueryPayload' },
    { name: 'dom.mutate',       direction: 'in',  schema: 'DomMutatePayload' },
    { name: 'copilot.message',  direction: 'in',  schema: 'CopilotPayload' },
    { name: 'mesh.route',       direction: 'in',  schema: 'MeshRoutePayload' },
    { name: 'diag.nexus',       direction: 'in',  schema: 'DiagPayload' },
    { name: 'url.listen',       direction: 'in',  schema: 'UrlListenerPayload' },
    // ... all others
  ],
  wires: [
    { name: 'dom.events',       direction: 'out', description: 'Live DOM mutation stream' },
    { name: 'cookie.events',    direction: 'out', description: 'Cookie lifecycle events' },
    { name: 'nav.events',       direction: 'out', description: 'Navigation events' },
    { name: 'driver.result',    direction: 'out', description: 'Automation results' },
    { name: 'copilot.out',      direction: 'out', description: 'Co-pilot responses' },
    { name: 'mesh.result',      direction: 'out', description: 'Agent mesh responses' },
    { name: 'diag.complete',    direction: 'out', description: 'Diagnostic run results' },
    { name: 'url.match',        direction: 'out', description: 'URL listener hits' },
    { name: 'nexus.status',     direction: 'out', description: 'NEXUS bus probe result' },
  ],
  sse: { port: 7701, path: '/events' },
  ipc: { port: 7702, path: '/cmd' },
  tls: { port: 7703 },
  ts: Date.now(),
}
```

---

## 4. Typecode + Syntax Contract

**Typecodes** are short machine-readable identifiers for every payload shape Clear Glass accepts or emits. They live in the interaction contract and allow:
- RAID to route by type without inspecting payload
- Drift engine to detect schema mismatches
- Co-pilot to construct valid calls without guessing

### Inbound typecodes

```
CG-DRV-001   DriverPayload          { action, agentId, ...args }
CG-DOM-001   DomQueryPayload        { agentId, selector?, cgId?, tree? }
CG-DOM-002   DomMutatePayload       { agentId, cgId?, selector?, mutation }
CG-DOM-003   DomPickPayload         { agentId, nodeId, meta?, name? }
CG-CTX-001   ContextCreatePayload   { agentId?, profileOptions? }
CG-CTX-002   ContextFpSwitchPayload { agentId, mode: 'firefox'|'chrome'|'safari' }
CG-CKI-001   CookieSavePayload      { agentId, accountId, domain?, cookies }
CG-CKI-002   CookieRestorePayload   { agentId, accountId?, version? }
CG-CPL-001   CopilotPayload         { message, agentId?, domContext?, systemExtra? }
CG-MSH-001   MeshSpawnPayload       { agentKey: 'claude'|'chatgpt'|'gemini'|'perplexity'|'mistral'|'grok', options? }
CG-MSH-002   MeshSendPayload        { agentKey, prompt, contextId?, waitForResponse? }
CG-MSH-003   MeshRoutePayload       { prompt, preferAgent?, fallbackOrder? }
CG-URL-001   UrlListenerPayload     { pattern, hook, agentId?, intercept?, capture?, label? }
CG-DGN-001   DiagRunPayload         { steps, agentId?, label? }
CG-DGN-002   DiagNexusPayload       { agentId?, nexusUrl? }
CG-DGN-003   DiagPagePayload        { agentId, url }
CG-WIN-001   WindowOpenPayload      { agentId?, url? }
CG-WIN-002   WindowClosePayload     { agentId }
CG-FPR-001   FingerprintImportPayload { agentId, ffProfile: { userAgent?, intlLocale?, timezone? } }
```

### Outbound typecodes

```
CG-OUT-001   DriverResult           { action, agentId, requestId, result }
CG-OUT-002   DriverError            { action, agentId, requestId, error }
CG-OUT-003   DomMutations           { changes: MutationRecord[], ts }
CG-OUT-004   DomPickRegistered      { pickId, agentId, nodeId, name, meta, pickedAt }
CG-OUT-005   CookieEvent            { agentId, cookie, cause, removed, ts }
CG-OUT-006   NavStarted             { agentId, url, ts }
CG-OUT-007   NavLoaded              { agentId, url, title, ts }
CG-OUT-008   ContextCreated         { agentId, uuid, ua, timezone, ts }
CG-OUT-009   ContextRateLimited     { agentId, ts }
CG-OUT-010   CopilotResponse        { text, commands, msgId, agentId, ts }
CG-OUT-011   MeshTaskComplete       { taskId, agentKey, contextId, response, ts }
CG-OUT-012   MeshTaskError          { taskId, agentKey, contextId, error, ts }
CG-OUT-013   UrlMatch               { listenerId, label, hook, agentId, url, method, ts }
CG-OUT-014   DiagComplete           { runId, suiteId, label, total, passed, failed, success, ts }
CG-OUT-015   NexusStatus            { connected, url, ts }
CG-OUT-016   TlsTunnel              { host, port, protocol, cipher, ts }
CG-OUT-017   LifecycleReady         { uuid, ssePort, ipcPort, tlsPort, ts }
```

### Syntax — how to call Clear Glass from NEXUS

Every call follows the same shape:

```
POST http://localhost:7702/cmd
Content-Type: application/json

{
  "eventType": "<typecode-signature>",
  "data":      <payload matching typecode>,
  "requestId": "<optional-uuid>"
}
```

Result arrives on SSE stream at `http://localhost:7701/events`.

**Examples:**

```js
// Navigate to a URL
{ "eventType": "driver.exec", "data": { "action": "navigate", "agentId": "default", "url": "https://claude.ai" } }

// Add URL listener that fires NEXUS hook
{ "eventType": "url.listen", "data": { "pattern": "*://api.anthropic.com/*", "hook": "cortex.events.write", "agentId": "*", "capture": ["requestHeaders"] } }

// Run NEXUS UI audit
{ "eventType": "diag.nexus", "data": { "agentId": "default", "nexusUrl": "http://localhost:9000" } }

// Route prompt to best available AI agent
{ "eventType": "mesh.route", "data": { "prompt": "What is the current status of NEXUS?", "preferAgent": "claude" } }

// DOM archaeology — get full tree
{ "eventType": "dom.query", "data": { "agentId": "default", "tree": true } }
```

---

## 5. Co-pilot as Watchdog

Co-pilot's role in Clear Glass is **active, not passive**. It watches the SISO bus and acts on events it recognizes — it does not wait to be asked.

### What Co-pilot watches

Co-pilot subscribes to the bus via `on('*', handler)` and acts on:

| Event | Co-pilot action |
|---|---|
| `context.rate-limited` | Automatically triggers `mesh.route` fallback |
| `cookie.health.result` where `healthy: false` | Flags to Cortex via `cortex.gaps.open` |
| `diag.complete` where `success: false` | Opens gap in Cortex, suggests fix |
| `url.match` where hook is registered | Relays match data to Cortex memory |
| `driver.error` | Logs to Cortex, attempts retry if retryable |
| `dom.tokens.result` | Surfaces token patterns to Cortex intelligence |
| `mesh.task.error` | Demotes agent health score, reroutes |
| `nexus.status` where `connected: false` | Alerts, queues commands for reconnect |

### Watchdog gate (SISO)

Co-pilot's watchdog is itself a set of Gates registered on the bus — not a polling loop. Each gate owns one concern:

```
rate-limit-watchdog-gate    → 'context.rate-limited'    → emit('mesh.route', ...)
cookie-health-watchdog-gate → 'cookie.health.result'    → emit to Cortex if unhealthy
diag-watchdog-gate          → 'diag.complete'           → open gap if failed
error-watchdog-gate         → 'driver.error'            → log + retry
token-relay-gate            → 'dom.tokens.result'       → relay to Cortex
nexus-offline-gate          → 'nexus.status'            → queue if offline
```

This is the SISO way: watchdog behavior is gates, not a separate monitoring system.

### Co-pilot build permissions

Co-pilot can modify Clear Glass through the bus:
- Inject persistent userscripts → `driver.exec` with `action: 'inject', persistent: true`
- Register new element picks → `dom.pick`
- Add URL listeners → `url.listen`
- Switch fingerprint modes → `context.fp.switch`
- Install new SEAM modules → future: `seam.install`

Every modification is a CFR ledger entry (intent, agent, componentId, ts). Reversible.

---

## 6. Guardian Integration

**Clear Glass does NOT replace Guardian. It extends Guardian's reach.**

Guardian controls browser tabs via NCP (userscripts). Clear Glass IS a sovereign browser context. They complement:

```
Guardian → NCP userscripts → browser tabs (user's existing browser)
Clear Glass → ClearDriver → sovereign browser windows (NEXUS-owned contexts)
```

**Integration point:** Guardian's `/seam/sessions` tracks live SEAM queue state. Clear Glass registers its active contexts as SEAM sessions — Guardian can see them, route to them, and wire them.

Guardian gets a new component entry:
```
guardian.clear-glass.proxy → proxies SEAM commands to Clear Glass :7702
```

This means existing Guardian tooling (seam.watchdog, seam.retry) works on Clear Glass sessions without any Guardian code changes.

---

## 7. Drift Engine Hook

This spec is checked by the drift engine on every NEXUS boot:

```js
// In spec-drift.js or architect boot:
const spec   = require('./docs/clear-glass-seam.spec.js');  // parsed version
const actual = require('../clear-glass/seam/registry-components.js');

// Check: every component declared in spec exists in actual registry
// Check: every typecode declared in §4 has a matching gate in src/gates/index.js
// Check: every wires_to target exists in the receiving system's registry
// Alert: drift → cortex.gaps.open with severity 'high'
```

---

## 8. Build Order

Following §3.1 bottom-up only:

```
Phase 1:  siso/index.js                  ← SISO CJS core (DONE ✓)
Phase 2:  src/core/bus.js                ← singleton stream (DONE ✓)
Phase 3:  src/gates/index.js             ← all gates (DONE ✓)
Phase 4:  seam/registry-components.js    ← component declarations (THIS SPEC)
Phase 5:  seam/watchdog-gates.js         ← co-pilot watchdog gates
Phase 6:  Guardian proxy component       ← guardian.clear-glass.proxy
Phase 7:  Drift engine hook              ← spec vs actual check on boot
Phase 8:  COS integration                ← Clear Glass as COS compartment type
```

---

## 9. Open Questions (Gaps)

| # | Question | Severity |
|---|---|---|
| G-001 | Should Clear Glass register directly on orchestrator :9000 or through Bridge :9999? | high |
| G-002 | Cookie vault encryption key — machine-derived or Cortex-provided? | high |
| G-003 | SEAM session limit — how many concurrent Clear Glass contexts before Guardian throttles? | medium |
| G-004 | Does ClearDriver need to speak the NCP protocol to be compatible with existing userscripts? | medium |
| G-005 | Watchdog gate for `nexus.status` offline — should it queue commands or drop them? | low |
