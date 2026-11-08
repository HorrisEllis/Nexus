'use strict';
/**
 * cos/manager/hub.js — COS as the hub of all automation: one table of slots, each read live from the system that owns it (OC8a, 0.60.446).
 * Spec: docs/orchestration-console.spec MOD-OC-HUB (schema HubSlot) · Map: docs/2026-11-01-orchestration-console-phasemap.spec OC8 (OC8a),
 * docs/2026-10-25-automation-engine-to-orchestrator-phasemap.spec AE_D4_the_hub_structural.
 *
 * James, 2026-11-08: "basically i want it to be the main subrate for all automation like a hub for the automation pipeline, workflows, tasks,
 * including or using raid as the authentication and tracking system. queues, contracts, dag, it should all be there, waiting to be wired in."
 * · "yes, pick the structural solution."
 *
 * Decided by his axioms (AE_D4): slots now, each wired as its phase lands (1a); RAID stays Cortex's and is reached by its route (2a, §5.15:
 * swappable). A slot is never pretended (§1.1): it is wired only when its owner answered just now; a slot with no route yet says the phase
 * that wires it; an owner that does not answer is said (§1.2). COS reads; it never writes another system's data from here.
 *
 *   createHub(sup, { fetch, timeoutMs }) → { slots(), read() → Promise<{ slots: HubSlot[], wired, waiting, down }> }
 */
const http = require('http');

// owner 'cos' = COS's own route, answered in process. route null = not wired yet; phase names what wires it.
const SLOTS = Object.freeze([
  { id: 'automation', does: 'workflows and automations, the union of every source (AU1)', owner: 'idearium', route: 'GET /api/automation', moves: 'AE6 moves the engine into COS' },
  { id: 'pipelines', does: 'Clear Glass\'s gated pipelines and macros (PL1–PL11)', owner: 'clear-glass', route: 'GET /automation/pipelines' },
  { id: 'tasks', does: 'tasks deployed to any system (OC4a)', owner: 'cos', route: 'GET /api/cos/deployments' },
  { id: 'queues', does: 'held acts waiting for a take (COS proposals)', owner: 'cos', route: 'GET /api/cos/proposals' },
  { id: 'raid', does: 'RAID, the authentication and tracking: who may act, and the record of what was decided', owner: 'cortex', route: 'GET /api/raid/health' },
  { id: 'contracts', does: 'RAID\'s contract queue, dependsOn and onFail (RD0)', owner: 'cortex', route: 'GET /api/raid/queue?n=20' },
  { id: 'dag', does: 'the phase DAG: what can be built now, and why the rest waits (SL0, DG3)', owner: 'idearium', route: 'GET /api/phases/next' },
  { id: 'agents', does: 'an agent deployed to a system, and run there', owner: 'cos', route: null, phase: 'OC4b' },
  { id: 'dag-per-input', does: 'a DAG per input: what is needed to understand the request', owner: null, route: null, phase: 'RQ14_the_spine_end_to_end' },
  { id: 'context', does: 'context asked of every source at once (vector, lattice, ledgers, repos, components)', owner: null, route: null, phase: 'RQ7_the_context_obligations' },
  { id: 'gaps', does: 'what is not found: asked of him, of other agents (lifeline), or the web (Clear Glass)', owner: null, route: null, phase: 'RQ8_the_gap_is_a_question' },
  { id: 'hypotheses', does: 'hypotheses with confidence scores; below the gate they are not acted on', owner: null, route: null, phase: 'RQ16_hypotheses_in_parallel' },
  { id: 'experiments', does: 'RAID makes a compartment from a contract, the test and the DAG; the DAG\'s end is the stop', owner: null, route: null, phase: 'RQ15_cells_in_parallel' },
]);

function call(origin, method, p, timeoutMs) {
  return new Promise((resolve) => {
    const u = new URL(p, origin);
    const q = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, timeout: timeoutMs,
      headers: { 'X-Nexus-Caller': 'cos-hub' } }, (r) => { r.resume(); r.on('end', () => resolve({ status: r.statusCode })); });
    q.on('timeout', () => { q.destroy(); resolve({ status: null, error: `no answer in ${timeoutMs / 1000} s` }); });
    q.on('error', (e) => resolve({ status: null, error: e.code || e.message }));
    q.end();
  });
}

function createHub(sup, { fetch = call, own = null, timeoutMs = 3000 } = {}) {
  const originOf = (system) => {
    const d = sup.declarations().find(x => x.name === system || x.system === system);
    try { return d && d.healthUrl ? new URL(d.healthUrl).origin : null; } catch (_) { return null; }
  };
  async function readOne(s) {
    const base = { id: s.id, does: s.does, owner: s.owner, route: s.route, ...(s.phase ? { phase: s.phase } : {}), ...(s.moves ? { moves: s.moves } : {}) };
    if (!s.route) return { ...base, state: 'waiting', why: `not wired yet: ${s.phase} wires it` };
    const [method, p] = s.route.split(' ');
    if (s.owner === 'cos') {
      if (!own) return { ...base, state: 'wired', why: 'COS\'s own route' };
      const r = await own(method, p); return r && r.status < 400 ? { ...base, state: 'wired', why: 'COS\'s own route answered' } : { ...base, state: 'refused', why: `COS's own route answered ${r && r.status}` };
    }
    const origin = originOf(s.owner);
    if (!origin) return { ...base, state: 'down', why: `${s.owner} is not declared to COS, or declares no address` };
    const r = await fetch(origin, method, p, timeoutMs);
    if (r.status && r.status < 400) return { ...base, state: 'wired', why: `${s.owner} answered ${r.status}` };
    if (r.status) return { ...base, state: 'refused', why: `${s.owner} answered ${r.status} on ${s.route}` };
    return { ...base, state: 'down', why: `${s.owner} did not answer: ${r.error}` };
  }
  async function read() {
    const slots = await Promise.all(SLOTS.map(readOne));
    const n = (st) => slots.filter(x => x.state === st).length;
    return { slots, wired: n('wired'), waiting: n('waiting'), down: n('down') + n('refused'), at: Date.now() };
  }
  return { slots: () => SLOTS.map(s => ({ ...s })), read };
}

module.exports = { createHub, SLOTS, MODULE_ID: 'cos.manager.hub', VERSION: '1.0.0' };
