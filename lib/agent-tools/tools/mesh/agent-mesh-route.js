'use strict';
/**
 * lib/agent-tools/tools/mesh/agent-mesh-route.js — agent_mesh_route tool
 * UUID: nexus-agent-tools-agent-mesh-route-v1-0000-2026-0919-jamesbrooks-001
 *
 * §BUILT 2026-09-19 — closes a real, confirmed, previously-unbuilt gap.
 * `agent_mesh_route` was already named in copilot's own tool guide, and
 * a dangling-hook GAP for it (nexus.lib.agent-tools.tools.agent-mesh-route)
 * had already been observed in a real boot log earlier this same
 * session — declared, never built. clear-glass/src/mesh/agent-mesh.js's
 * AgentMesh (1,118 real lines: spawn/send/route/enqueue task queue with
 * retry+escalation, listNodes/listMeshView/listAgents) was completely
 * unreachable from copilot's tool-calling loop. Guardian's own cockpit
 * INTERACTION_CONTRACT (29 real commands, checked directly) has zero
 * mesh coverage either.
 *
 * §REAL, ALREADY-WIRED PATH, NOT INVENTED — checked clear-glass/src/
 * gates/index.js directly: mesh.spawn/mesh.send/mesh.route/mesh.enqueue
 * gates already exist and are already registered (`mesh && meshSpawnGate
 * (mesh)` etc., conditional on a real mesh instance — confirmed wired,
 * not just declared). This tool is the missing OTHER end: the same real
 * Guardian-job dispatch + poll mechanism browser_action.js already uses
 * for driver.exec/dom.query, pointed at these four real mesh gates
 * instead. No new dispatch mechanism invented — copied because
 * browser_action.js's own _createGuardianJob/_pollJob pair is already
 * completely generic (references nothing browser-specific anywhere in
 * either function).
 *
 * §HONEST, NAMED GAP LEFT OPEN — AgentMesh.listNodes()/listMeshView()/
 * listAgents() have no real gate at all (checked directly: only
 * spawn/send/route/enqueue are registered). This tool does not cover
 * them; calling action 'list' here fails loudly with that exact
 * explanation rather than silently returning nothing or guessing at a
 * shape. Adding those three needs new gates in clear-glass/src/gates/
 * index.js first — a real, separate, smaller follow-up, not done here.
 *
 * §HONEST LIMIT — traced against real source (agent-mesh.js, gates/
 * index.js, browser-action.js's own proven job mechanism), not guessed;
 * has NOT been run against a live Electron instance (no Electron
 * runtime in this environment, same honest limit every ClearGlass-
 * facing tool this session names). Confirm against the real app before
 * trusting it further than "traced correct."
 */

const http = require('http');

const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_PORT || '7820');

// Real event types — the exact gate names registered in clear-glass/src/
// gates/index.js, confirmed by reading that file directly, not guessed
// from AgentMesh's method names (which don't have a fixed naming
// convention that would let you derive 'mesh.spawn' from `spawn()` safely).
const REAL_ACTIONS = {
  spawn:   'mesh.spawn',    // { agentKey, ...options } -> mesh.agent.spawned { key, contextId } | mesh.error
  send:    'mesh.send',     // { agentKey, prompt, contextId?, waitForResponse?, timeout?, useEros?, profile? } -> mesh.task.complete | mesh.error
  route:   'mesh.route',    // { prompt, preferAgent?, fallbackOrder? } -> mesh.task.complete | mesh.error — RAID-governed pick of the best agent
  enqueue: 'mesh.enqueue',  // { ...task } -> mesh.queued { ...result } — real task queue with retry+escalation, not synchronous
  // §BUILT 2026-09-19 — James: "do the structural fix." Real audit
  // found AgentMesh's own automation engine (the same real, richer
  // workflow system that already backs BrainOS's UI — trigger/
  // condition/agent/delay/command/branch/http/notification step types)
  // was completely unreachable from the agent-tool loop, even though
  // it's the exact same real `mesh` object spawn/send/route/enqueue
  // above already dispatch to. New real gates added in clear-glass/src/
  // gates/index.js alongside this; a human editing a workflow in
  // BrainOS and an agent creating/running one here now touch the same
  // real data, not two forks of "automation."
  workflow_list:          'mesh.workflow.list',        // {} -> mesh.workflow.list.result { workflows }
  workflow_get:           'mesh.workflow.get',         // { id } -> mesh.workflow.get.result { workflow }
  workflow_create:        'mesh.workflow.create',      // { name, ... } -> mesh.workflow.created { ...workflow }
  workflow_update:        'mesh.workflow.update',      // { id, patch } -> mesh.workflow.updated { ... }
  workflow_remove:        'mesh.workflow.remove',      // { id } -> mesh.workflow.removed { ... }
  workflow_run:           'mesh.workflow.run',         // { id, reason? } -> mesh.workflow.run.result { ... } — runs real steps (agent/http/delay/branch), can take real time
  workflow_step_add:      'mesh.workflow.step.add',    // { id, step } -> mesh.workflow.step.added { ... }
  workflow_step_update:   'mesh.workflow.step.update', // { id, stepId, patch } -> mesh.workflow.step.updated { ... }
  workflow_step_remove:   'mesh.workflow.step.remove', // { id, stepId } -> mesh.workflow.step.removed { ... }
  workflow_step_move:     'mesh.workflow.step.move',   // { id, stepId, dir } -> mesh.workflow.step.moved { ... }
  // §BUILT 2026-09-19 — James: "finish it." The last three real gaps,
  // closed the same way as everything above: real gates now exist
  // (clear-glass/src/gates/index.js) for AgentMesh's own listNodes/
  // listMeshView/listAgents. Every action this tool exposes now has a
  // real gate — NO_GATE_ACTIONS and its refusal branch are gone, not
  // because the honesty convention stopped mattering, but because
  // there is nothing left to honestly refuse.
  list_nodes:      'mesh.list.nodes',     // {} -> mesh.list.nodes.result { nodes }
  list_mesh_view:  'mesh.list.meshView',  // {} -> mesh.list.meshView.result { view }
  list_agents:     'mesh.list.agents',    // {} -> mesh.list.agents.result { agents }
};

function _createGuardianJob(command, content) {
  return new Promise((resolve) => {
    // Same real route as browser-action.js: guardian's raw job dispatch
    // is POST /command (guardian/server.js), not /api/jobs.
    const body = Buffer.from(JSON.stringify({ command, provider: 'mesh', content: JSON.stringify(content || {}) }));
    const req = http.request({
      hostname: '127.0.0.1', port: GUARDIAN_PORT, path: '/command', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
      timeout: 20000,
    }, (res) => {
      let raw = ''; res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { resolve({ ok: false, error: `bad response from guardian: ${e.message}` }); } });
    });
    req.on('error', (e) => resolve({ ok: false, error: `could not reach guardian (:${GUARDIAN_PORT}): ${e.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'guardian job submission timed out' }); });
    req.write(body);
    req.end();
  });
}

function _pollJob(jobId, deadlineMs) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      // Same real limitation as browser-action.js: no GET /jobs/:id —
      // only a bulk listing, found by id.
      const req = http.request({ hostname: '127.0.0.1', port: GUARDIAN_PORT, path: '/jobs?limit=200', method: 'GET', timeout: 5000 }, (res) => {
        let raw = ''; res.on('data', c => raw += c);
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }
          const job = parsed?.jobs?.find(j => j.id === jobId);
          if (job?.status === 'complete') { resolve({ ok: true, response: job.response }); return; }
          if (job?.status === 'error')    { resolve({ ok: false, error: job.error || 'mesh action failed' }); return; }
          if (Date.now() - started > deadlineMs) { resolve({ ok: false, error: `mesh action did not complete within ${deadlineMs}ms` }); return; }
          setTimeout(tick, 500);
        });
      });
      req.on('error', (e) => resolve({ ok: false, error: `lost contact with guardian while polling: ${e.message}` }));
      req.end();
    };
    tick();
  });
}

module.exports = {
  name: 'agent_mesh_route',
  description:
    'Spawn, message, route to, or queue work for a real ClearGlass agent-mesh node (clear-glass/src/mesh/' +
    'agent-mesh.js) — a real, separate orchestration layer from a single provider chat (agent_chat) or a ' +
    'browser action (browser_action). "route" is RAID-governed pick-the-best-agent for a prompt; "send" ' +
    'addresses one already-spawned mesh node directly; "enqueue" adds to the real retry/escalation task ' +
    'queue instead of waiting synchronously. workflow_* actions reach the same mesh object\'s own real ' +
    'automation engine (the same one BrainOS\'s UI edits) — a real multi-step DSL (trigger/condition/agent/' +
    'delay/command/branch/http/notification), not a separate system. ' +
    `Params: action (required — one of: ${Object.keys(REAL_ACTIONS).join(', ')}), data (object — action-specific: ` +
    'spawn needs {agentKey}, send needs {agentKey, prompt}, route needs {prompt}, enqueue needs a real task ' +
    'object, workflow_get/update/remove/run need {id}, workflow_create needs {name, ...}, workflow_step_* ' +
    'need {id, stepId, ...}, list_nodes/list_mesh_view/list_agents need {}. Every action here has a real, ' +
    'confirmed gate in clear-glass/src/gates/index.js — none of AgentMesh\'s real surface is unreachable now.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: Object.keys(REAL_ACTIONS), description: 'Which mesh action to perform' },
      data:   { type: 'object', description: 'Action-specific parameters' },
    },
    required: ['action'],
  },
  execute: async ({ action, data = {} } = {}) => {
    const eventType = REAL_ACTIONS[action];
    if (!eventType) return { error: `unknown action "${action}" — expected one of: ${Object.keys(REAL_ACTIONS).join(', ')}` };

    const created = await _createGuardianJob(eventType, data);
    if (!created.ok) return { error: created.error || 'guardian rejected the job' };

    const result = await _pollJob(created.jobId, 20000);
    if (!result.ok) return { error: result.error };
    return { ok: true, action, result: result.response };
  },
};
