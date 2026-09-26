'use strict';
/**
 * lib/agent-tools/tools/ncp/status.js
 * James: "wires tools for copilot for... ncp." Real, confirmed
 * endpoint — guardian/server.js's GET /providers, backed by
 * ncp.getProviders() — the exact same real, heartbeat-verified
 * connection map DA1's fix in clear-glass/src/mesh/agent-mesh.js
 * already reads live. Not a new mechanism, a copilot-side tool
 * wrapper around one that already exists and is already proven.
 */
const http = require('http');

const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_PORT || '7820', 10);

function _get(path, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: GUARDIAN_PORT, path, method: 'GET', timeout: timeoutMs },
      (res) => {
        let out = ''; res.on('data', c => out += c);
        res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { reject(new Error(`bad response from guardian: ${e.message}`)); } });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('guardian unreachable — is it running?')); });
    req.end();
  });
}

module.exports = {
  name: 'ncp_status',
  description:
    'Check which real agent providers (claude, chatgpt, gemini, perplexity, ollama) are actually connected ' +
    'right now via NCP — guardian\'s real, heartbeat-verified connection map (GET /providers), the same live ' +
    'data DA1\'s Guardian-first dispatch gate already checks before routing. Optional provider filters to just ' +
    'one; omit for the full real map.',
  parameters: {
    type: 'object',
    properties: {
      provider: { type: 'string', description: 'optional — check just this one provider instead of the full map' },
    },
    required: [],
  },
  execute: async (a) => {
    try {
      const result = await _get('/providers');
      if (!a.provider) return result;
      const status = result?.providers?.[a.provider];
      if (status === undefined) return { error: `unknown provider "${a.provider}" — guardian has no coverage for it` };
      return { provider: a.provider, status, connected: status === 'connected' };
    } catch (e) {
      return { error: `ncp_status failed: ${e.message}` };
    }
  },
};
