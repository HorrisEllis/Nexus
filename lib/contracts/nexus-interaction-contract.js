'use strict';
/**
 * contracts/nexus-interaction-contract.js
 * UUID: nexus-interaction-contract-v1-0000-4000
 * Status: pre-release
 *
 * THE single source of truth for every system endpoint, port,
 * expected shape, SSE event name, and CLI command.
 *
 * §DEPRECATED 2026-09-13 (MCO18, Track B item 3) — this file's SYSTEMS
 * object had already, confirmably drifted from every real system it
 * described (guardian's copy diverged route-by-route, found and fixed
 * earlier this session; the same reconciliation has now been done for
 * every other real key here: architect, cortex, orchestrator, idearium,
 * copilot, diagnostic). Each of those systems now has its own real,
 * reconciled interaction-contract.json, checked directly against that
 * system's own live route dispatcher, not against this file. This
 * object is left in place per §A-4 (append-only, deprecate never
 * delete) but should no longer be read as authoritative for any system
 * — read <system>/interaction-contract.json instead. orchestrator.js's
 * real GET /api/contract/:system endpoint should be repointed to read
 * from each system's own file rather than this one — that repointing
 * is real, separate work this pass did not do (orchestrator.js itself
 * was not modified).
 *
 * 'bridge' below is NOT reconciled and should not be — Bridge itself
 * was retired earlier this session; a per-system contract file for a
 * system that no longer exists would be fabricating relevance for
 * something real evidence says doesn't exist. Left as-is, historical.
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
// §FOUND & FIXED 2026-09-08 — James: "we need this consistent, following
// the axioms." This file's own real §A-4 ("Living — append-only") was
// not actually being followed: bridge and emerge were both retired
// earlier this session, and this "single source of truth" still listed
// them as live, real ports — while copilot (:3750) and clear-glass
// (:7704), two of the most actively developed real systems this whole
// session, were entirely absent. Bridge/emerge removed per §A-4's own
// real instruction ("deprecate, never delete" — moved to a real,
// labeled RETIRED block instead of silently vanishing).
const PORTS = {
  orchestrator: 9000,
  bridge:       9999, // §RETIRED 2026-09-06 — kept per §A-4, see RETIRED_PORTS.bridge and SYSTEMS.bridge.retired for the real record
  cortex:       3748,
  guardian:     7820,
  architect:    3747,
  idearium:     4800,
  emerge:       4242, // §RETIRED 2026-09-07 — kept per §A-4, see RETIRED_PORTS.emerge for the real record
  ollama:       11434,
  diagnostic:   7825,  // §A-4: added
  copilot:      3750,  // §FOUND & FIXED 2026-09-08 — real, live, was entirely missing
  'clear-glass': 7704, // §FOUND & FIXED 2026-09-08 — real, live (WIRE_PORT), was entirely missing
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
      // §RETIRED 2026-09-06 — the real /api/bridge/* proxy route this
      // entry described no longer exists (confirmed directly earlier
      // this session when removing the orchestrator UI's own dead
      // bridge buttons — the underlying proxy route was already gone).
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
    role:     'Memory, self-healing — 28+ JAA tables (intelligence moved to its own system 2026-09-19)',
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
      { method:'GET',  path:'/api/snapshots',            params:['n?'], description:'Snapshot list' },
      { method:'POST', path:'/api/snapshots/create',     body:['message?'], description:'Create snapshot' },
      { method:'POST', path:'/api/snapshots/rollback',   body:['snapId','apply'], description:'Rollback to snapshot' },
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

  // ── INTELLIGENCE :3753  (moved out of cortex 2026-09-19) ──
  intelligence: {
    id:       'intelligence',
    port:     3753,
    color:    '#f0abfc',
    label:    'Intelligence',
    role:     'Cognition + system-health: patterns, failure taxonomy, reuse, intuition/mastermind/adversarial, unified query, lattice, liminal-space, CFR ledger',
    health:   { method:'GET', path:'/health' },
    sse:      { path:'/sse', description:'Intelligence system event stream' },
    routes: [
      { method:'GET',  path:'/health',                              description:'Intelligence health + field source + RAID registration state' },
      { method:'GET',  path:'/api/intelligence/status',             description:'Intelligence core status' },
      { method:'GET',  path:'/api/intelligence/context',            params:['intent?','command?','provider?'], description:'Pre-request context for agents' },
      { method:'GET',  path:'/api/intelligence/patterns',           description:'Crystallised BEP patterns' },
      { method:'GET',  path:'/api/intelligence/crystals',           params:['limit?'], description:'Crystals-derived pattern list' },
      { method:'GET',  path:'/api/intelligence/failures',           description:'Fault taxonomy' },
      { method:'GET',  path:'/api/intelligence/reuse',              params:['q?'], description:'Reuse index' },
      { method:'POST', path:'/api/intelligence/intuition',          body:['prompt'], description:'Fast-path answer' },
      { method:'POST', path:'/api/intelligence/mastermind',         body:['prompt','context?'], description:'Causal analysis' },
      { method:'POST', path:'/api/intelligence/mastermind/patterns',body:['limit?'], description:'Recurring causal-shape detection' },
      { method:'POST', path:'/api/intelligence/adversarial',        body:['prompt','context?'], description:'Reconcile intuition vs mastermind' },
      { method:'GET',  path:'/api/intelligence/rca',                params:['limit?'], description:'Root cause analysis over open gaps' },
      { method:'GET',  path:'/api/intelligence/query',              params:['about','window?'], description:'Unified query surface' },
      { method:'GET',  path:'/api/intelligence/lattice',            params:['about?'], description:'System associative lattice' },
      { method:'GET',  path:'/api/liminal-space/status',            description:'Liminal-space status' },
      { method:'GET',  path:'/api/liminal-space/list',              params:['focalPoint?'], description:'Liminal-space items' },
      { method:'POST', path:'/api/intelligence/bus',                body:['type','payload','source?','causedBy?'], description:'Allowlisted event intake for in-process organs' },
      { method:'POST', path:'/api/intelligence/event',              body:['type','payload'], description:'Feed an external event for analysis' },
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
  // §RETIRED 2026-09-06 (James: "it has to go") — kept in SYSTEMS per
  // this file's own real §A-4 ("deprecate, never delete") rather than
  // removed outright, which this file's own real, existing test
  // (§INV append-only) correctly caught as a real violation when first
  // attempted. Marked retired:true instead — present, not live.
  bridge: {
    id:       'bridge',
    port:     9999,
    color:    '#22d3ee',
    label:    'Bridge',
    role:     'RETIRED 2026-09-06 — was the trust relay; direct dispatch replaces it everywhere it was used',
    retired:  true,
    retiredAt: '2026-09-06',
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

  // ── COPILOT :3750 ──────────────────────────────────────────────────────────
  // §FOUND & FIXED 2026-09-08 — real, live, entirely missing before this.
  copilot: {
    id:     'copilot',
    port:   PORTS.copilot,
    color:  '#a78bfa',
    label:  'Co-Pilot',
    role:   'The sovereign assistant layer — lifeline routing (ollama/guardian), tool-calling, RAID-gated actions',
    health: { method: 'GET', path: '/health' },
    sse:    { path: '/events', description: 'Live co-pilot chat stream' },
    routes: [
      { method: 'POST', path: '/api/prompt',       body: ['prompt', 'sessionId?', 'channel?', 'provider?'], description: 'Ask co-pilot — provider: a real agent name, "ollama", "auto", or omitted for the real, configured DEFAULT_PROVIDER' },
      { method: 'POST', path: '/api/prompt/tools',  body: ['prompt', 'sessionId?'], description: 'Ask co-pilot with the real, full tool-calling loop (all 86 real agent tools)' },
      { method: 'GET',  path: '/health',            description: 'Co-pilot health' },
    ],
    cli: [
      { cmd: 'copilot <prompt>', description: 'Ask co-pilot from the canonical CLI (copilot/cli.js)' },
      { cmd: 'switch <ollama|guardian|claude|chatgpt|gemini|perplexity|auto>', description: 'Real, explicit routing switch — see copilot/cli.js §2026-09-08' },
    ],
  },

  // ── CLEAR-GLASS :7704 ────────────────────────────────────────────────────
  // §FOUND & FIXED 2026-09-08 — real, live (WIRE_PORT), entirely missing before this.
  'clear-glass': {
    id:     'clear-glass',
    port:   PORTS['clear-glass'],
    color:  '#38bdf8',
    label:  'Clear Glass',
    role:   'The sovereign browser — NCP-connected agent tabs, DOM tools, macros, real plugins',
    health: { method: 'GET', path: '/health' },
    routes: [
      { method: 'GET',  path: '/health',                  description: 'Clear Glass health' },
      { method: 'GET',  path: '/cli/commands',             description: 'Live, introspected command index — the real "living command index" this whole system\'s routes are discoverable from' },
      { method: 'GET',  path: '/plugins',                  description: 'List installed real plugins (adblocker/captcha-pause/guardian-listeners/zoom/permissions/passwords) and their real state' },
      { method: 'POST', path: '/plugins/:id/disable',      description: 'Disable a real, installed plugin' },
    ],
    cli: [
      { cmd: 'clearglass', description: 'Real, live pass-through — same status this contract already gives every other real system' },
    ],
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
