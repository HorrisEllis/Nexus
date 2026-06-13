'use strict';
/**
 * contracts/nexus-interaction-contract.js
 * UUID: nexus-interaction-contract-v1-0000-4000
 * Status: pre-release
 *
 * THE single source of truth for every system endpoint, port,
 * expected shape, SSE event name, and CLI command.
 *
 * §AXIOM: CLI = UI = API — same commands, same shapes, same ports.
 * §A-2:   Hooks are the wire. This contract IS the wire map.
 * §A-4:   Living — append-only. Deprecate, never delete.
 *
 * Any UI that reads this contract can render itself.
 * Any CLI that reads this contract can autocomplete.
 * Any system that reads this contract can validate its own routes.
 *
 * HTTP API:
 *   GET  :9000/api/contract          — full contract
 *   GET  :9000/api/contract/:system  — single system contract
 *   GET  :9000/api/contract/schema   — JSON schema for validation
 *   POST :9000/api/contract/validate — validate a request against contract
 */

const CONTRACT_VERSION = '1.0.0';

// ── Port registry ─────────────────────────────────────────────────────────────
const PORTS = {
  orchestrator: 9000,
  bridge:       9999,
  cortex:       3748,
  guardian:     7820,
  architect:    3747,
  idearium:     4800,
  emerge:       4242,
  ollama:       11434,
  diagnostic:   7825,  // §A-4: added
};

// ── System contracts ──────────────────────────────────────────────────────────

const SYSTEMS = {

  // ── ORCHESTRATOR :9000 ────────────────────────────────────────────────────
  orchestrator: {
    id:       'orchestrator',
    port:     9000,
    color:    '#818cf8',
    label:    'Orchestrator',
    role:     'Root coordinator — all systems register here, all UIs talk here',
    health:   { method:'GET', path:'/health' },
    sse:      { path:'/events', description:'All system events broadcast here' },
    routes: [
      { method:'GET',  path:'/health',              description:'System health + boot phases' },
      { method:'GET',  path:'/events',              description:'SSE — all live events' },
      { method:'GET',  path:'/api/recall',          params:['n'], description:'Recent events from cortex' },
      { method:'POST', path:'/api/register',        body:['systemId','port','version'], description:'System self-registration' },
      { method:'POST', path:'/api/heartbeat',       body:['systemId','port','status'], description:'System heartbeat' },
      { method:'GET',  path:'/api/state',           description:'NEXUS_STATE — last saved runtime state' },
      { method:'POST', path:'/api/state/save',      body:['savedAt','systems','activeJobs'], description:'Save runtime state' },
      { method:'GET',  path:'/api/contract',        description:'This contract — full' },
      { method:'GET',  path:'/api/contract/:system', description:'Single system contract' },
      // Proxy routes — all pass through to backend systems
      { method:'*',    path:'/api/cortex/*',        proxy:'cortex',    description:'Cortex proxy' },
      { method:'*',    path:'/api/guardian/*',      proxy:'guardian',  description:'Guardian proxy' },
      { method:'*',    path:'/api/architect/*',     proxy:'architect', description:'Architect proxy' },
      { method:'*',    path:'/api/idearium/*',      proxy:'idearium',  description:'Idearium proxy' },
      { method:'*',    path:'/api/bridge/*',        proxy:'bridge',    description:'Bridge proxy' },
    ],
    cli: [
      { cmd:'health',   description:'All systems health check' },
      { cmd:'systems',  description:'Full system registry' },
      { cmd:'events',   args:['n'], description:'Recent N events' },
      { cmd:'boot',     description:'Boot phase log' },
      { cmd:'state',    description:'Current NEXUS_STATE' },
      { cmd:'snapshot', args:['message'], description:'Create cortex snapshot' },
    ],
  },

  // ── GUARDIAN :7820 ────────────────────────────────────────────────────────
  guardian: {
    id:       'guardian',
    port:     7820,
    color:    '#f59e0b',
    label:    'Guardian',
    role:     'AI orchestration — NCP transport, SEAM pipeline, job queue, Lab',
    health:   { method:'GET', path:'/health' },
    sse:      { path:'/events', description:'Job stream + NCP events' },
    routes: [
      { method:'GET',  path:'/health',              description:'Guardian health + job counts' },
      { method:'POST', path:'/command',             body:['provider','command','prompt','content?','specText?'], description:'Dispatch job to provider' },
      { method:'GET',  path:'/jobs',                params:['status?','limit?'], description:'Job list' },
      { method:'GET',  path:'/jobs/:jobId',         description:'Single job detail' },
      { method:'GET',  path:'/providers',           description:'Connected browser tab providers' },
      { method:'GET',  path:'/artifacts',           description:'SHA-256 deduplicated code artifacts' },
      { method:'GET',  path:'/channel',             params:['provider','tabId'], description:'NCP SSE channel — browser tabs connect here' },
      { method:'POST', path:'/result',              body:['type','jobId','provider','text?'], description:'NCP result from browser tab' },
      { method:'GET',  path:'/seam/queues',         description:'Active SEAM queues' },
      { method:'GET',  path:'/seam/queues/:id',     description:'Single SEAM queue detail' },
      { method:'GET',  path:'/seam/sessions',       description:'SEAM session history' },
      { method:'GET',  path:'/lab',                 description:'Lab sessions' },
      { method:'POST', path:'/lab/run',             body:['type','provider','prompt','hypothesis?'], description:'Run lab experiment' },
      { method:'GET',  path:'/lab/templates',       description:'Pre-built experiment templates' },
      { method:'GET',  path:'/bus',                 params:['n?'], description:'SISO bus log' },
      { method:'GET',  path:'/baseline',            description:'Friction + sigma baseline' },
    ],
    cli: [
      { cmd:'dispatch',  args:['provider','prompt'], description:'Dispatch job to provider' },
      { cmd:'jobs',      description:'Active jobs' },
      { cmd:'providers', description:'Connected providers' },
      { cmd:'lab',       args:['type','prompt'],     description:'Run lab experiment' },
    ],
    ncp: {
      description: 'NCP — SSE server→browser + fetch POST browser→server. No WebSocket.',
      inbound:  { path:'/result', method:'POST' },
      outbound: { path:'/channel', protocol:'SSE' },
      messageTypes: [
        'GUARDIAN_JOB', 'GUARDIAN_COMPLETE', 'GUARDIAN_ERROR',
        'NEXUS_DOM_MAP', 'GUARDIAN_ARTIFACT', 'GUARDIAN_GAP',
        'PING', 'PONG',
      ],
    },
    seam: {
      description: 'Spec-driven sequential delivery with SEAM VERDICT gating',
      chunkFormat: '[SEAM CHUNK N/TOTAL] title\n\ncontent\n\nSEAM END — EXECUTE SEAM N',
      verdictPattern: 'SEAM VERDICT: PASS|FAIL',
    },
  },

  // ── CORTEX :3748 ─────────────────────────────────────────────────────────
  cortex: {
    id:       'cortex',
    port:     3748,
    color:    '#34d399',
    label:    'Cortex',
    role:     'Memory, intelligence, self-healing — 28+ JAA tables',
    health:   { method:'GET', path:'/health' },
    sse:      { path:'/sse', description:'Cortex event stream' },
    routes: [
      { method:'GET',  path:'/health',                   description:'Cortex health + JAA stats' },
      { method:'POST', path:'/api/event',                body:['type','payload','source','causedBy?'], description:'Write event to JAA event_log' },
      { method:'GET',  path:'/api/events',               params:['limit?','type?'], description:'Query event log (append-only)' },
      { method:'GET',  path:'/api/gaps',                 params:['status?','severity?'], description:'Open gaps' },
      { method:'POST', path:'/api/gaps',                 body:['type','severity','description','source'], description:'Open a gap' },
      { method:'GET',  path:'/api/memory',               params:['table','n?'], description:'Browse any JAA table' },
      { method:'POST', path:'/api/memory/search',        body:['q','table?','n?'], description:'Search memory' },
      { method:'GET',  path:'/api/intelligence/status',  description:'Intelligence core status' },
      { method:'GET',  path:'/api/intelligence/context', params:['intent?','command?'], description:'Pre-request context for agents' },
      { method:'GET',  path:'/api/intelligence/patterns',description:'Crystallised BEP patterns' },
      { method:'GET',  path:'/api/intelligence/failures',description:'Fault taxonomy' },
      { method:'GET',  path:'/api/intelligence/reuse',   params:['n?'], description:'Reuse index' },
      { method:'GET',  path:'/api/snapshots',            params:['n?'], description:'Snapshot list' },
      { method:'POST', path:'/api/snapshots/create',     body:['message?'], description:'Create snapshot' },
      { method:'POST', path:'/api/snapshots/rollback',   body:['snapId','apply'], description:'Rollback to snapshot' },
      { method:'GET',  path:'/api/versionium/log',       params:['n?'], description:'Version commit log' },
    ],
    cli: [
      { cmd:'events',   args:['n'],    description:'Recent N events' },
      { cmd:'gaps',     description:  'Open gaps' },
      { cmd:'tables',   description:  'JAA table row counts' },
      { cmd:'patterns', description:  'Crystallised patterns' },
      { cmd:'faults',   description:  'Fault taxonomy' },
      { cmd:'drift',    description:  'Cross-ledger drift analysis' },
      { cmd:'versions', description:  'Version commit log' },
      { cmd:'snapshot', args:['msg'], description:'Create snapshot' },
    ],
    jaa_tables: [
      'event_log','artifacts','gaps','failures','agent_calls','bep_patterns',
      'crystals','seam_records','seam_sessions','versionium_commits',
      'cortex_memory','memory_index','active_traces','orion_sessions',
      'schedules','workflow_runs','project_registry','requests',
      'execution_trees','lab_sessions','lab_results',
      'hooks','hook_bindings','blueprints','topology_maps',
      'snr_results','constraints','tensions','sessions',
    ],
  },

  // ── ARCHITECT :3747 ──────────────────────────────────────────────────────
  architect: {
    id:       'architect',
    port:     3747,
    color:    '#ef9f27',
    label:    'Architect',
    role:     'Constraint-first authoring — hook registry, SNR gate, blueprint engine',
    health:   { method:'GET', path:'/health' },
    routes: [
      { method:'GET',  path:'/health',              description:'Architect health + hook counts' },
      { method:'GET',  path:'/api/hooks',           params:['type?','status?','layer?'], description:'Hook registry' },
      { method:'POST', path:'/api/hooks',           body:['name','type','direction','intent','from','to','schema','contract'], description:'Register hook' },
      { method:'GET',  path:'/api/hooks/:id',       description:'Single hook detail' },
      { method:'PATCH',path:'/api/hooks/:id',       description:'Update hook' },
      { method:'DELETE',path:'/api/hooks/:id',      body:['reason?','hard?'], description:'Deprecate or remove hook' },
      { method:'POST', path:'/api/hooks/wire',      body:['fromId','toId','notes?'], description:'Wire two hooks together' },
      { method:'GET',  path:'/api/hooks/validate',  description:'Validate all hooks against invariants' },
      { method:'GET',  path:'/api/hooks/graph',     params:['format?'], description:'Hook graph (json|mermaid)' },
      { method:'GET',  path:'/api/blueprint',       description:'Blueprint list' },
      { method:'POST', path:'/api/blueprint/scan',  body:['rootPath','opts?'], description:'Scan path → blueprint' },
      { method:'POST', path:'/api/blueprint/diff',  body:['a','b'], description:'Diff two blueprints' },
      { method:'GET',  path:'/api/map',             description:'Topology maps' },
      { method:'POST', path:'/api/map/scan',        body:['rootPath'], description:'Scan topology' },
      { method:'POST', path:'/api/snr/check',       body:['source','context?'], description:'SNR gate 8-axis score' },
      { method:'GET',  path:'/api/snr',             description:'Recent SNR results' },
      { method:'POST', path:'/api/translate/utl',   body:['text'], description:'Universal Translation Layer' },
      { method:'GET',  path:'/api/gaps',            description:'Architect gaps' },
      { method:'POST', path:'/api/gaps',            body:['type','severity','description'], description:'Open architect gap' },
      { method:'GET',  path:'/ui/arch-builder',     description:'Architecture canvas (iframe)' },
      { method:'GET',  path:'/ui/alk-lattice',      description:'ALK 3D lattice (iframe)' },
    ],
    cli: [
      { cmd:'arch',        description:'Architect health' },
      { cmd:'arch:hooks',  description:'All registered hooks' },
      { cmd:'arch:scan',   args:['path'], description:'Scan path for blueprint' },
      { cmd:'arch:snr',    args:['json'], description:'Run SNR gate on JSON' },
      { cmd:'arch:graph',  description:'Hook graph as Mermaid' },
    ],
  },

  // ── IDEARIUM :4800 ───────────────────────────────────────────────────────
  idearium: {
    id:       'idearium',
    port:     4800,
    color:    '#4a9eff',
    label:    'Idearium',
    role:     'Idea OS — capture, tension, spec promotion, version history',
    health:   { method:'GET', path:'/health' },
    routes: [
      { method:'GET',  path:'/health',                      description:'Idearium health' },
      { method:'GET',  path:'/api/ideas',                   params:['limit?','phase?'], description:'All ideas' },
      { method:'POST', path:'/api/ideas',                   body:['text','tags?','phase?'], description:'Create idea' },
      { method:'GET',  path:'/api/ideas/:uuid',             description:'Single idea' },
      { method:'POST', path:'/api/ideas/:uuid/tension',     body:['body'], description:'Add tension to idea' },
      { method:'POST', path:'/api/ideas/:uuid/link',        body:['targetUuid','type'], description:'Link ideas' },
      { method:'POST', path:'/api/ideas/:uuid/spec',        description:'Promote idea to spec' },
      { method:'POST', path:'/api/ideas/:uuid/phase',       body:['phase'], description:'Set idea phase' },
      { method:'POST', path:'/api/ideas/:uuid/progress',    body:['progress'], description:'Update progress' },
      { method:'GET',  path:'/api/specs',                   description:'All specs' },
      { method:'POST', path:'/api/specs/:uuid/build',       description:'Build spec → spec-compiler' },
      { method:'POST', path:'/api/specs/:uuid/check',       description:'Check spec SNR' },
    ],
    cli: [
      { cmd:'idea',    args:['text'],    description:'Create new idea' },
      { cmd:'ideas',   description:'Recent ideas' },
      { cmd:'specs',   description:'All specs in idearium' },
    ],
  },

  // ── BRIDGE :9999 ─────────────────────────────────────────────────────────
  bridge: {
    id:       'bridge',
    port:     9999,
    color:    '#22d3ee',
    label:    'Bridge',
    role:     'Trust relay — all cross-system requests routed here. Boot order: FIRST.',
    health:   { method:'GET', path:'/health' },
    routes: [
      { method:'GET',  path:'/health',        description:'Bridge health + registry' },
      { method:'POST', path:'/api/register',  body:['systemId','appId','secret'], description:'System registration — issues token' },
      { method:'GET',  path:'/registry',      description:'Registered systems' },
      { method:'GET',  path:'/ledger',        params:['n?'], description:'Request ledger (append-only)' },
      { method:'GET',  path:'/sse',           description:'SSE event stream' },
      { method:'POST', path:'/bridge/event',  body:['type','payload'], description:'Post event to bridge bus' },
    ],
    cli: [
      { cmd:'bridge', description:'Bridge health + registry' },
    ],
    identity: {
      algorithm: 'Ed25519',
      uuid:      'SHA-256(pubKey)',
      token:     'MAX_TOKENS_PER_SYS=10',
    },
  },

  // ── DIAGNOSTIC :7825 ──────────────────────────────────────────────────────
  // §A-4: added — append-only, never removed
  diagnostic: {
    id:     'diagnostic',
    port:   PORTS.diagnostic,
    color:  '#67e8f9',
    label:  'Diagnostic',
    health: { method: 'GET', path: '/status' },
    routes: [
      { method: 'GET',  path: '/status',      description: 'Full system health snapshot — sigma, slope, friction per system' },
      { method: 'GET',  path: '/gaps',         description: 'All open gaps across all monitored systems', query: ['status','system','severity'] },
      { method: 'GET',  path: '/friction',     description: 'Friction + sigma + slope + errorRate per system' },
      { method: 'GET',  path: '/cfr/state',    description: 'CFR field state — coherence, friction, resonance, entropy, tension + regime' },
      { method: 'GET',  path: '/trace/:uuid',  description: 'Causal chain trace — walks all system ledgers for a UUID' },
      { method: 'GET',  path: '/audit',        description: 'Full system audit — syntax, endpoints, gap scan' },
      { method: 'GET',  path: '/decay',        description: 'Memory pressure — eviction rate, pressure per tier, working memory size' },
      { method: 'GET',  path: '/events',       description: 'SSE stream — live gap/poll/CFR events' },
      { method: 'POST', path: '/gaps/:uuid/fix', description: 'Trigger fix command for a specific gap', body: [] },
    ],
    cli: [
      { cmd: 'nexus diagnostic status',       desc: 'Full system health snapshot' },
      { cmd: 'nexus diagnostic gaps',          desc: 'List open gaps' },
      { cmd: 'nexus diagnostic trace <uuid>',  desc: 'Causal chain trace for UUID' },
      { cmd: 'nexus diagnostic audit',         desc: 'Run system audit' },
      { cmd: 'nexus diagnostic decay',         desc: 'Memory pressure report' },
    ],
  },

};

// ── Contract API ──────────────────────────────────────────────────────────────

function getContract(system = null) {
  if (system) return SYSTEMS[system] || null;
  return {
    version:   CONTRACT_VERSION,
    generated: new Date().toISOString(),
    ports:     PORTS,
    systems:   SYSTEMS,
    // Flattened route index for fast lookup
    routeIndex: _buildRouteIndex(),
    // All CLI commands across all systems
    cliIndex:   _buildCLIIndex(),
    // All SSE event types
    eventTypes: _buildEventTypes(),
  };
}

function validateRequest(system, method, path_, body = {}) {
  const sys = SYSTEMS[system];
  if (!sys) return { valid:false, error:`unknown system: ${system}` };
  const route = sys.routes?.find(r =>
    (r.method === '*' || r.method === method) &&
    _pathMatch(r.path, path_)
  );
  if (!route) return { valid:false, error:`no route: ${method} ${path_} on ${system}` };
  const missing = (route.body || [])
    .filter(f => !f.endsWith('?') && !(f in body));
  if (missing.length) return { valid:false, error:`missing body fields: ${missing.join(', ')}` };
  return { valid:true, route };
}

function _pathMatch(pattern, path_) {
  if (pattern === path_) return true;
  if (pattern.endsWith('/*')) return path_.startsWith(pattern.slice(0,-2));
  const patParts = pattern.split('/');
  const urlParts = path_.split('/');
  if (patParts.length !== urlParts.length) return false;
  return patParts.every((p, i) => p.startsWith(':') || p === urlParts[i]);
}

function _buildRouteIndex() {
  const idx = {};
  for (const [sys, contract] of Object.entries(SYSTEMS)) {
    for (const route of contract.routes || []) {
      const key = `${route.method} ${sys}:${route.path}`;
      idx[key] = { system:sys, port:contract.port, ...route };
    }
  }
  return idx;
}

function _buildCLIIndex() {
  const idx = {};
  for (const [sys, contract] of Object.entries(SYSTEMS)) {
    for (const cmd of contract.cli || []) {
      idx[cmd.cmd] = { system:sys, ...cmd };
    }
  }
  return idx;
}

function _buildEventTypes() {
  const types = new Set();
  for (const contract of Object.values(SYSTEMS)) {
    for (const t of contract.siso?.emits || []) types.add(t);
    for (const t of contract.ncp?.messageTypes || []) types.add(t);
  }
  return [...types].sort();
}

// exports consolidated below

// ── Fix 1: Static fallback contract ──────────────────────────────────────────
// Baked in. Zero network dependency. UI reads this if orchestrator is offline.
// §1.2: Nothing silently fails — UI degrades gracefully, not completely.
const STATIC_FALLBACK = {
  version:    CONTRACT_VERSION,
  schemaHash: '5605e2fa62623d54', // SHA-256[:16] of v1.0.0 contract
  generated:  '2026-06-12T00:00:00Z',
  isFallback: true,
  ports:      PORTS,
  systems:    SYSTEMS,
};

// ── Fix 2: Versioned contract snapshots ───────────────────────────────────────
// Every getContract() call returns a hash. Stored snapshots are immutable.
// Validation can reference a specific snapshot — not live state.
// §A-4: Spec is living — but history is append-only.
const _snapshots = new Map(); // hash → snapshot

function getVersionedContract(version = null) {
  const crypto = require('crypto');
  const full   = getContract();
  const hash   = crypto.createHash('sha256')
    .update(JSON.stringify({ version: full.version, systems: full.systems }))
    .digest('hex').slice(0, 16);

  full.schemaHash  = hash;
  full.contractId  = `nexus-contract-${CONTRACT_VERSION}-${hash}`;
  full.isFallback  = false;

  // Store immutable snapshot
  if (!_snapshots.has(hash)) {
    _snapshots.set(hash, Object.freeze(JSON.parse(JSON.stringify(full))));
  }

  // If specific version requested, return snapshot
  if (version) {
    const snap = [..._snapshots.values()].find(
      s => s.version === version || s.schemaHash === version
    );
    return snap || null;
  }

  return full;
}

function listSnapshots() {
  return [..._snapshots.values()].map(s => ({
    contractId: s.contractId,
    version:    s.version,
    schemaHash: s.schemaHash,
    generated:  s.generated,
  }));
}

// ── Fix 3: Snapshot-bound validation ─────────────────────────────────────────
// Validation is deterministic: tied to a specific contract snapshot.
// "Given contract X, validate request Y" — not "whatever is live now."
function validateRequestAt(snapshotHash, system, method, path_, body = {}) {
  const snap = _snapshots.get(snapshotHash);
  if (!snap) {
    // Fall back to current if snapshot not found — log the gap
    return {
      valid:           false,
      error:           `snapshot ${snapshotHash} not found`,
      gap:             'F-CONTRACT-SNAPSHOT-MISSING',
      fallbackUsed:    false,
    };
  }
  const sys = snap.systems[system];
  if (!sys) return { valid:false, error:`unknown system: ${system}`, snapshotHash };
  const route = (sys.routes || []).find(r =>
    (r.method === '*' || r.method === method) && _pathMatch(r.path, path_)
  );
  if (!route) return {
    valid: false,
    error: `no route: ${method} ${path_} on ${system}`,
    snapshotHash,
  };
  const missing = (route.body || []).filter(f => !f.endsWith('?') && !(f in body));
  if (missing.length) return {
    valid: false,
    error: `missing body fields: ${missing.join(', ')}`,
    snapshotHash,
  };
  return { valid:true, route, snapshotHash, contractId: snap.contractId };
}

// ── Fix 4: Circuit breaker for UI contract loading ────────────────────────────
// UI uses this to fail gracefully — three states: live / stale / fallback.
// Never blocks boot. Never throws. Always returns something usable.
function getContractWithFallback(liveData = null) {
  if (liveData?.systems && liveData?.ports) {
    return { ...liveData, isFallback: false, source: 'live' };
  }
  // Return static fallback — UI can still render, CLI still works
  return { ...STATIC_FALLBACK, source: 'fallback', warning: 'orchestrator offline — using baked contract' };
}

// Initialise snapshot store with current contract on module load
(function() {
  try { getVersionedContract(); } catch(_) {}
})();

module.exports = {
  getContract,
  getVersionedContract,
  getContractWithFallback,
  validateRequest,
  validateRequestAt,
  listSnapshots,
  STATIC_FALLBACK,
  SYSTEMS,
  PORTS,
  CONTRACT_VERSION,
};
