'use strict';
/**
 * clear-glass/src/mesh/route-graph.js — real, persisted node-to-node
 * routing edges for BrainOS's canvas (docs/2026-09-11-brainos-agent-
 * orchestration-phasemap.spec, Phase 2).
 *
 * James: "route data, create pipelines... maybe a feedback loop." A drawn
 * edge from agent A to agent B is a real, persisted rule: when A's task
 * completes, its response is automatically enqueued as B's next prompt.
 * A -> A is the same primitive with no special case — a feedback loop.
 *
 * §HONEST SCOPE — this is direct agent-to-agent response chaining, not a
 * general dataflow/transform pipeline (no per-edge filters, no branching
 * conditions, no WARP Gate/Stream composition yet — lib/seam/stream.js's
 * Event/Gate/Stream primitives are the real next step if that's needed,
 * not built here since nothing today calls for more than "pass the
 * response along"). One edge per (from,to) pair — creating an existing
 * edge again just no-ops rather than double-firing on every completion.
 */
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const ROUTES_DIR = path.join(__dirname, '..', '..', '..', 'data', 'brainos', 'routes');

function _loadAll() {
  const out = [];
  try {
    if (!fs.existsSync(ROUTES_DIR)) return out;
    for (const f of fs.readdirSync(ROUTES_DIR)) {
      if (!f.endsWith('.route.json')) continue;
      try { out.push(JSON.parse(fs.readFileSync(path.join(ROUTES_DIR, f), 'utf8'))); }
      catch (e) { console.warn(`[route-graph] skipping unreadable ${f} (non-fatal): ${e.message}`); }
    }
  } catch (e) {
    console.warn(`[route-graph] _loadAll failed (non-fatal, starting empty): ${e.message}`);
  }
  return out;
}

class RouteGraph {
  constructor({ enqueueFn, busEmit } = {}) {
    this._enqueue = typeof enqueueFn === 'function' ? enqueueFn : () => {};
    this._busEmit = typeof busEmit === 'function' ? busEmit : () => {};
    this._routes = _loadAll(); // real boot-time hydration, same pattern as guardian/lib/jobs.js's loadPersistedJobs
  }

  list() { return this._routes.slice(); }

  add({ from, to, kind, systemPrompt, transform }) {
    if (!from || !to) return { ok: false, error: 'from and to are required' };
    const existing = this._routes.find(r => r.from === from && r.to === to);
    if (existing) return { ok: true, route: existing, existed: true };
    // §BUILT — Phase 2b, James: "don't lose any... pipeline... capability"
    // (from the uploaded external BrainOS reference's per-step system
    // prompt / transform config). Extends the same edge record rather
    // than a second pipeline engine (§10.3, docs/2026-09-11-brainos-
    // external-concept-mapping.spec) — both fields optional, a plain
    // response-chain edge (no systemPrompt/transform) behaves exactly
    // as before.
    const route = {
      id: randomUUID(), from, to, kind: kind || (from === to ? 'feedback' : 'pipeline'),
      systemPrompt: systemPrompt || null, transform: transform || null,
      createdAt: Date.now(),
    };
    this._routes.push(route);
    try {
      fs.mkdirSync(ROUTES_DIR, { recursive: true });
      fs.writeFileSync(path.join(ROUTES_DIR, `${route.id}.route.json`), JSON.stringify(route, null, 2), 'utf8');
    } catch (e) {
      // §1.2 — a failed persist must not lose the in-memory edge for this
      // process's own lifetime; it just won't survive a restart.
      console.warn(`[route-graph] failed to persist ${route.id} (non-fatal): ${e.message}`);
    }
    this._busEmit('mesh.route.added', route);
    return { ok: true, route, existed: false };
  }

  remove(id) {
    const idx = this._routes.findIndex(r => r.id === id);
    if (idx === -1) return { ok: false, error: 'no such route' };
    const [route] = this._routes.splice(idx, 1);
    try { fs.unlinkSync(path.join(ROUTES_DIR, `${route.id}.route.json`)); } catch (_) {}
    this._busEmit('mesh.route.removed', route);
    return { ok: true, route };
  }

  /**
   * onAgentComplete(agentKey, response) — the real trigger point, called
   * from AgentMesh.send() right after a task genuinely completes. Best-
   * effort and non-blocking by design (§1.2): a routing failure must never
   * turn a real, already-successful task into a reported error.
   *
   * §SECURITY — transform is a plain {{output}} template string, never
   * evaluated as code. The uploaded external reference's own transform
   * field ran arbitrary JS via `new Function(...)` — safe enough client-
   * side in a user's own browser tab, but this runs server-side in
   * clear-glass's privileged Electron main process; eval'ing a string
   * that reached this file via a local HTTP POST is a real RCE surface
   * this file will not open, matching lib/tool-forge.js's own real
   * design principle: "a forged tool is DATA, not code."
   */
  onAgentComplete(agentKey, response) {
    if (!response) return;
    const outgoing = this._routes.filter(r => r.from === agentKey);
    for (const route of outgoing) {
      try {
        const transformed = route.transform ? route.transform.split('{{output}}').join(response) : response;
        const prompt = route.systemPrompt ? `${route.systemPrompt}\n\n${transformed}` : transformed;
        this._enqueue({ agentKey: route.to, prompt });
        this._busEmit('mesh.route.fired', { routeId: route.id, from: route.from, to: route.to, ts: Date.now() });
      } catch (e) {
        this._busEmit('mesh.route.fire_failed', { routeId: route.id, error: e.message, ts: Date.now() });
      }
    }
  }
}

module.exports = { RouteGraph, ROUTES_DIR };
