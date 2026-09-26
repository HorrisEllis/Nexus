'use strict';
/**
 * lib/agent-tools/tools/agent-mesh/route.js
 * James: "wires tools for copilot for... agentmesh." Real, confirmed
 * endpoint — clear-glass's own WIRE_PORT (:7704) POST /agent-mesh/
 * route, built this session specifically as a direct, testable entry
 * point into src/mesh/agent-mesh.js's real route() — DA1's Guardian-
 * first dispatch gate with DOM-automation fallback. Not a second
 * implementation of routing logic; this just gives copilot's own
 * agentic tool loop a way to reach the same real mesh.
 */
const http = require('http');

const WIRE_PORT = parseInt(process.env.WIRE_PORT || '7704', 10);

function _post(path, body, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { hostname: '127.0.0.1', port: WIRE_PORT, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        timeout: timeoutMs },
      (res) => {
        let out = ''; res.on('data', c => out += c);
        res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { reject(new Error(`bad response from clear-glass: ${e.message}`)); } });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('clear-glass unreachable — is it running?')); });
    req.write(data);
    req.end();
  });
}

module.exports = {
  name: 'agent_mesh_route',
  description:
    'Dispatch a real prompt through clear-glass\'s agent-mesh — the same real Guardian-first routing gate (DA1) ' +
    'that checks live NCP provider connectivity before falling through to DOM automation. Needs prompt; ' +
    'preferAgent optionally names which agent to try first (e.g. "claude", "gemini"). Honestly fails if ' +
    'clear-glass is unreachable — never fabricates a response.',
  parameters: {
    type: 'object',
    properties: {
      prompt:        { type: 'string', description: 'the prompt to route through the mesh' },
      preferAgent:   { type: 'string', description: 'optional — which agent to try first, e.g. claude, chatgpt, gemini, perplexity' },
      fallbackOrder: { type: 'array', description: 'optional — explicit ordered fallback list, overrides the mesh\'s own default ordering' },
    },
    required: ['prompt'],
  },
  execute: async (a) => {
    if (!a.prompt) return { error: 'prompt required' };
    try {
      return await _post('/agent-mesh/route', { prompt: a.prompt, preferAgent: a.preferAgent, fallbackOrder: a.fallbackOrder });
    } catch (e) {
      return { error: `agent_mesh_route failed: ${e.message}` };
    }
  },
};
