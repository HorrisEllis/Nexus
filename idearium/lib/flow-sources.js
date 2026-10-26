// idearium/lib/flow-sources.js — BrainOS's FlowGraph, gathered server-side (MOD-BX-SOURCES / BX2).
// comp_id: nexus.idearium.flow-sources
// Spec: docs/brainos-in-idearium.spec (MOD-BX-SOURCES, schema FlowGraph). Map: docs/2026-10-21-brainos-into-idearium-phasemap.spec (BX2).
//
// James, 2026-09-11 (kept in the spec): "brainos needs to be the entire ui for agent orchestration — clear-glass, agent mesh, ncp,
// jobs, userscripts, agent router, RAID. deploying nodes on the canvas spawn agents." · 2026-10-24: "Now make something. I don't do
// CLI." · "What about BrainOS?"
//
// One place to watch and steer a build: the plan's phases and their DAG, the run moving through them, and the agents the mesh has
// spawned — next to the code they act on. This module is the DATA for that screen (flow-canvas.js draws it). It COMPOSES what already
// exists (§8.6):
//   phases + DAG   idearium/repo/phases.js managerView + mapsFor, then lib/phase-dag.js build (the same gather GET …/phases/dag uses)
//   runs           lib/run-state.js list (the run moving through steps)
//   agents+routes  Clear Glass's mesh at :7704 (agent-mesh view / route-graph), fetched server-side, best-effort
// Every source's failure is NAMED in sources[], never thrown (§1.2): a source that does not answer leaves its part empty and the rest
// still draws (the FlowGraph contract). No secret crosses — only the mesh view, no cookie, no token.
//
// idearium is an ES module package (package.json type:module); CommonJS deps are reached through createRequire, like its siblings.
import { createRequire } from 'module';
import { managerView, mapsFor } from '../repo/phases.js';
const require = createRequire(import.meta.url);

export const MODULE_ID = 'nexus.idearium.flow-sources';
export const VERSION = '1.0.0';

const MESH_ORIGIN = process.env.CLEAR_GLASS_MESH || `http://127.0.0.1:${process.env.EROS_WIRE_PORT || 7704}`;

function _http(url, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const http = require('http'); const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET', timeout: timeoutMs }, r => {
      let b = ''; r.on('data', c => b += c); r.on('end', () => { try { resolve(JSON.parse(b)); } catch (_) { reject(new Error(`bad JSON from ${u.pathname}`)); } });
    });
    req.on('error', e => reject(new Error(e.code === 'ECONNREFUSED' ? 'Clear Glass :7704 not answering' : e.message)));
    req.on('timeout', () => { req.destroy(); reject(new Error('Clear Glass timed out')); });
    req.end();
  });
}

// phases + the whole DAG of this repo's phasemaps, reusing the exact builder GET …/phases/dag uses.
function _phasesAndDag({ repo, repoDir }) {
  const view = managerView({ repo, repoDir, runs: [] });
  const { maps } = mapsFor({ repo, repoDir });
  const PD = require('../../lib/phase-dag.js');
  const mb = {}; for (const p of view.phases || []) if (p.mapped) mb[`${p.map}::${p.phase_key}`] = p.mapped;
  const dag = PD.build((maps || []).map(m => ({ path: m.path, text: m.text || '' })), { mapped: mb });
  const phases = (view.phases || []).map(p => ({ id: p.phase_key, map: p.map, status: p.status || null, layer: (dag.layers && dag.layers[`${p.map}::${p.phase_key}`]) ?? null, depends_on: p.depends_on || [] }));
  return { phases, dag: { layers: dag.layers || {}, edges: dag.edges || [], ready: dag.ready || [], critical: dag.critical || [], cycles: dag.cycles || [], stats: dag.stats || {} } };
}

// the runs moving through the plan, best-effort.
function _runs() {
  try {
    const RS = require('../../lib/run-state.js');
    const list = (RS.list && RS.list()) || [];
    return list.map(r => ({ runId: r.id || r.runId || null, phase: r.phase || null, step: r.step || (r.steps ? r.steps.length : null), state: r.state || r.status || null, agent: r.agent || r.provider || null, startedAt: r.startedAt || r.begunAt || null }));
  } catch (_) { return []; }
}

// the mesh: live agents and the routes between them, from Clear Glass, heartbeat-gated (a node exists only while it pulses).
export async function mesh() {
  const out = { agents: [], routes: [], source: 'clear-glass:7704' };
  try { const v = await _http(`${MESH_ORIGIN}/agent-mesh/view`); out.agents = (v && (v.agents || v.nodes || v.view)) || []; }
  catch (e) { out.error = e.message; return out; }
  try { const r = await _http(`${MESH_ORIGIN}/agent-mesh/routes`); out.routes = (r && (r.routes || r.edges)) || []; } catch (e) { out.routesError = e.message; }
  return out;
}

/** flowFor({ repo, repoDir }) → FlowGraph. Each source best-effort; a failure is named in sources[], never thrown (§1.2). */
export async function flowFor({ repo, repoDir } = {}) {
  if (!repo || !repo.uuid) return { ok: false, error: 'repo with a uuid is required' };
  const sources = []; let phases = [], dag = { layers: {}, edges: [], ready: [], critical: [], cycles: [], stats: {} }, runs = [], agents = [], routes = [];
  try { const pd = _phasesAndDag({ repo, repoDir }); phases = pd.phases; dag = pd.dag; sources.push({ source: 'phases+dag', ok: true, n: phases.length }); }
  catch (e) { sources.push({ source: 'phases+dag', ok: false, error: e.message }); }
  try { runs = _runs(); sources.push({ source: 'runs', ok: true, n: runs.length }); } catch (e) { sources.push({ source: 'runs', ok: false, error: e.message }); }
  const m = await mesh();
  agents = m.agents || []; routes = m.routes || [];
  sources.push({ source: 'mesh', ok: !m.error, n: agents.length, ...(m.error ? { error: m.error } : {}) });

  const edges = [
    ...dag.edges.map(e => ({ from: e.from || e[0], to: e.to || e[1], kind: 'depends', live: false })),
    ...routes.map(r => ({ from: r.from || r.a, to: r.to || r.b, kind: 'routes', live: true })),
  ];
  return { ok: true, repo: repo.uuid, phases, dag, runs, agents, routes, edges, sources, meshOrigin: MESH_ORIGIN };
}

export { _http };
