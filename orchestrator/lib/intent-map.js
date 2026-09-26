'use strict';
/**
 * lib/intent-map.js — NEXUS Interaction Intent Map
 * UUID: nexus-intent-map-v001-000000000001
 *
 * Gap 2 of the "UIs float on a verified interaction contract" architecture.
 *
 * The api-map (orchestrator /api/api-map) lists ROUTES. This lists INTENTS:
 * for each interaction point — what a HUMAN wants, the verb, the system, the
 * route that serves it, the component it belongs to (UUID-resolvable via the
 * uid backbone), what's required, what proves success, what failure looks like.
 *
 * A UI reads this and organizes by intent ("see what I've forgotten",
 * "give the system a job") instead of by raw routes. Because the UI can only
 * reach the API, and the API only exposes what's here, the map IS the contract:
 * the topology enforces it — a UI cannot act off-map (CLI -> API -> map -> UI).
 *
 * §A-flex: append-only, declarative. New capability = new entry, not new wiring.
 * Each entry's `component` resolves through lib/uid -> registry -> intent.
 */

// intent categories — how a UI groups actions for a human, NOT by system
const CATEGORIES = {
  OBSERVE:  'See what the system knows or is doing',
  ACT:      'Give the system something to do',
  MEMORY:   'Work with what the system remembers',
  CREATE:   'Make or capture something new',
  CONTROL:  'Start, check, or steer the system',
  HEAL:     'Find and fix problems',
};

// Each interaction point. system+route are the existing API surface (from api-map);
// intent/verb/category/inputs/success/failure are the NEW intent layer.
// component is the UID-registry id this point belongs to (resolveAny-compatible).
const INTERACTIONS = [
  // ── OBSERVE ──────────────────────────────────────────────────────────────
  { id: 'sys.status',   category: 'OBSERVE', component: 'nexus-or',
    intent: 'See which parts of the system are alive',
    verb: 'check status', system: 'orchestrator', method: 'GET', route: '/api/status',
    inputs: [], success: 'list of systems with online/offline + latency', failure: 'orchestrator unreachable' },

  { id: 'sys.channels', category: 'OBSERVE', component: 'nexus-bus',
    intent: 'See how the parts talk to each other',
    verb: 'view channels', system: 'orchestrator', method: 'GET', route: '/api/channels',
    inputs: [], success: 'the SISO event channels map', failure: 'orchestrator unreachable' },

  { id: 'mem.events',   category: 'OBSERVE', component: 'nexus-jaa',
    intent: 'See the live stream of what just happened',
    verb: 'watch events', system: 'cortex', method: 'GET', route: '/api/events?limit=N&type=T',
    inputs: ['limit (optional)', 'type (optional filter)'],
    success: 'recent events, newest first; filterable by type', failure: 'cortex down -> no memory visible' },

  { id: 'heal.gaps',    category: 'HEAL', component: 'nexus-cx',
    intent: 'See what the system thinks is broken or forgotten',
    verb: 'list gaps', system: 'cortex', method: 'GET', route: '/api/gaps',
    inputs: [], success: 'open gaps with severity + age', failure: 'cortex down' },

  { id: 'heal.failures', category: 'HEAL', component: 'nexus-cx',
    intent: 'See what has gone wrong recently',
    verb: 'list failures', system: 'cortex', method: 'GET', route: '/api/failures',
    inputs: [], success: 'recorded failures with source + error', failure: 'cortex down' },

  // ── MEMORY ───────────────────────────────────────────────────────────────
  { id: 'mem.recall',   category: 'MEMORY', component: 'nexus-jaa',
    intent: 'Look up what the system remembers about something',
    verb: 'recall', system: 'cortex', method: 'GET', route: '/api/memory?table=T&n=N',
    inputs: ['table', 'n'], success: 'matching memory rows', failure: 'cortex down / unknown table' },

  { id: 'mem.search',   category: 'MEMORY', component: 'nexus-jaa',
    intent: 'Search memory by meaning, not exact match',
    verb: 'search memory', system: 'cortex', method: 'POST', route: '/api/memory/search',
    inputs: ['query'], success: 'ranked memory matches', failure: 'cortex down' },

  { id: 'mem.forget',   category: 'MEMORY', component: 'nexus-jaa',
    intent: 'Make the system forget something on purpose',
    verb: 'forget', system: 'cortex', method: 'POST', route: '/api/memory/forget',
    inputs: ['id or query'], success: 'entry marked forgotten', failure: 'cortex down / not found' },

  // ── ACT ──────────────────────────────────────────────────────────────────
  { id: 'act.dispatch', category: 'ACT', component: 'nexus-gu',
    intent: 'Give the system a job and let it pick the best AI',
    verb: 'dispatch', system: 'guardian', method: 'POST', route: '/command',
    inputs: ['prompt', 'provider (optional — RAID decides if omitted)'],
    success: 'job id returned, routed via RAID', failure: 'guardian down / no provider connected' },

  { id: 'act.route',    category: 'ACT', component: 'nexus-cx',
    intent: 'Ask which AI should handle a given task',
    verb: 'decide route', system: 'cortex', method: 'GET', route: '/api/raid/decide?intent=X',
    inputs: ['intent', 'preferred (optional)'],
    success: '{ agent, reason, cluster }', failure: 'cortex/RAID down -> caller falls back' },

  { id: 'act.jobstatus', category: 'ACT', component: 'nexus-gu',
    intent: 'Check how a job is going',
    verb: 'job status', system: 'guardian', method: 'GET', route: '/status/:jobId',
    inputs: ['jobId'], success: 'job state + result if done', failure: 'unknown job id' },

  // ── CREATE ───────────────────────────────────────────────────────────────
  { id: 'create.idea',  category: 'CREATE', component: 'nexus-id',
    intent: 'Capture a new idea before it slips away',
    verb: 'capture idea', system: 'idearium', method: 'POST', route: '/api/ideas',
    inputs: ['text'], success: 'idea stored with uuid', failure: 'idearium down' },

  { id: 'create.spec',  category: 'CREATE', component: 'nexus-id',
    intent: 'Turn an idea into a buildable spec',
    verb: 'make spec', system: 'idearium', method: 'POST', route: '/api/ideas/:uuid/spec',
    inputs: ['idea uuid'], success: 'spec created from idea', failure: 'idea not found' },

  { id: 'create.build', category: 'CREATE', component: 'nexus-id',
    intent: 'Build code from a spec',
    verb: 'build spec', system: 'idearium', method: 'POST', route: '/api/specs/:uuid/build',
    inputs: ['spec uuid'], success: 'build started, artifacts produced', failure: 'spec not found / build error' },

  { id: 'repo.drop',    category: 'CREATE', component: 'nexus-id',
    intent: 'Drop a whole project zip and track it as an idea',
    verb: 'ingest repo', system: 'idearium', method: 'POST', route: '/api/repos/ingest',
    inputs: ['zip (or dropped into data/drop/)'], success: 'repo tracked as idea + spec', failure: 'idearium down / bad zip' },

  { id: 'repo.fork',    category: 'CREATE', component: 'nexus-id',
    intent: 'Fork a project to experiment without losing the original',
    verb: 'fork repo', system: 'idearium', method: 'POST', route: '/api/repos/:uuid/fork',
    inputs: ['repo uuid', 'new name'], success: 'new forked repo, lineage tracked', failure: 'repo not found' },

  { id: 'repo.list',    category: 'OBSERVE', component: 'nexus-id',
    intent: 'See all your projects, organized by spec',
    verb: 'list repos', system: 'idearium', method: 'GET', route: '/api/repos',
    inputs: [], success: 'repos grouped by .spec, with phase + fork lineage', failure: 'idearium down' },

  { id: 'create.push',  category: 'CREATE', component: 'nexus-or',
    intent: 'Drop a file in and let the system route it where it belongs',
    verb: 'push file', system: 'orchestrator', method: 'POST', route: '/api/push/file',
    inputs: ['file'], success: 'file routed to the right subsystem', failure: 'unsupported / rejected (e.g. private key)' },

  // ── CONTROL ──────────────────────────────────────────────────────────────
  { id: 'ctrl.health',  category: 'CONTROL', component: 'nexus-or',
    intent: 'Confirm the whole system is up',
    verb: 'health', system: 'orchestrator', method: 'GET', route: '/health',
    inputs: [], success: 'overall health + per-system', failure: 'orchestrator down' },

  { id: 'ctrl.apimap',  category: 'CONTROL', component: 'nexus-or',
    intent: 'See every route the system exposes',
    verb: 'view api map', system: 'orchestrator', method: 'GET', route: '/api/api-map',
    inputs: [], success: 'all routes across all systems', failure: 'orchestrator down' },
];

// ── build the served map: grouped by intent category, component resolved ──────
function buildIntentMap() {
  // resolve component intent via the uid registry (the backbone Gap 1 made real)
  let COMPONENT_MAP = {};
  try { COMPONENT_MAP = require('../../lib/uid/component-map').COMPONENT_MAP || {}; } catch (_) {}

  const grouped = {};
  for (const key of Object.keys(CATEGORIES)) grouped[key] = { label: CATEGORIES[key], interactions: [] };

  for (const ix of INTERACTIONS) {
    const comp = COMPONENT_MAP[ix.component];
    grouped[ix.category].interactions.push({
      ...ix,
      componentName:   comp ? comp.name : ix.component,
      componentIntent: comp ? comp.intent : null,   // intent inherited from the UID registry
    });
  }
  return {
    ok: true,
    generated: new Date().toISOString(),
    categories: CATEGORIES,
    totalInteractions: INTERACTIONS.length,
    map: grouped,
  };
}

module.exports = { CATEGORIES, INTERACTIONS, buildIntentMap };
