'use strict';
/**
 * lib/agent-tools/tools/clear-glass/net.js — clear_glass_net: read Clear Glass's network routes and the Snowflake transport. (0.60.60, NP9)
 *
 * James, 2026-10-15: "add support for snowflake, using cli, then you can add the commands to the agents, or make agent tools."
 * Reaches Clear Glass's :7702 /cli/net/* (ipc/bridge.js -> src/net/service.js), the same door the `net` command uses.
 *
 * READ-ONLY ON PURPOSE. An agent can see the routes, ask which way a URL would go, and see whether the transport is up. It cannot add or remove a route,
 * change the default, set the bridge, or start/stop the transport: an agent that could remove a rule could quietly send his traffic direct. Those
 * actions are refused here with the reason, and the `net` command refuses them for the nexus.command tool too. He runs them (CLI now, Settings later),
 * or opens a rule for agents on purpose in a later phase.
 * Fails honestly: if Clear Glass is not running this returns ok:false, never an invented answer.
 */
const http = require('http');
const IPC_PORT = parseInt(process.env.CLEARGL_IPC_PORT || '7702', 10);

function _call(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ hostname: '127.0.0.1', port: IPC_PORT, path, method, timeout: 15000,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (res) => {
      let out = ''; res.on('data', c => out += c);
      res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { reject(new Error(`Clear Glass answered with something that is not JSON (${res.statusCode})`)); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Clear Glass is not reachable on :' + IPC_PORT + ' — is it running?')); });
    if (data) req.write(data);
    req.end();
  });
}

// SF6 (0.60.178): bridges (what lines are on this machine) and check (does the circuit exit through Tor) are reads; using a line, the HTTPS-only
// switch and asking the Tor Project are his
const READ = { status: ['GET', '/cli/net/status'], routes: ['GET', '/cli/net/routes'], detect: ['POST', '/cli/net/transport'], resolve: ['POST', '/cli/net/resolve'], bridges: ['GET', '/cli/net/bridge/find'], check: ['POST', '/cli/net/check'] };
const PERSON = new Set(['add', 'remove', 'default', 'start', 'stop', 'bridge', 'paths', 'use', 'https-only', 'builtin']);

module.exports = {
  name: 'clear_glass_net',
  description:
    'Read Clear Glass\'s network routes and Snowflake/Tor transport. action: status (default route, rule count, transport state, whether the leak test has verified anything), ' +
    'routes (every rule), detect (are tor and the Snowflake client installed, is a bridge line set), resolve (give url, optional provider/caller: which way would it go and which rule decided), ' +
    'bridges (Snowflake bridge lines found on this machine, numbered), check (does the running transport exit through Tor, per check.torproject.org). ' +
    'Read-only: changing a route or starting/stopping the transport is the person\'s act and is refused here. Returns ok:false if Clear Glass is not running.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['status', 'routes', 'detect', 'resolve', 'bridges', 'check'] },
      url: { type: 'string', description: 'for resolve' },
      provider: { type: 'string', description: 'for resolve: the provider tab, e.g. chatgpt' },
      caller: { type: 'string', description: 'for resolve: person-tab, cli, agent:<id>, macro:<name>, automation:<id>' },
    },
    required: ['action'],
  },
  execute: async (a = {}) => {
    const action = a.action || 'status';
    if (PERSON.has(action)) return { ok: false, error: `"${action}" changes how his traffic is routed, so it is a person's act and an agent may not do it. Ask him to run: idearium net ${action === 'remove' ? 'rm' : action} ...` };
    const r = READ[action];
    if (!r) return { ok: false, error: `unknown action "${action}" (status, routes, detect, resolve, bridges, check)` };
    if (action === 'resolve' && !a.url) return { ok: false, error: 'resolve needs a url' };
    try {
      const body = action === 'resolve' ? { url: a.url, provider: a.provider, caller: a.caller } : action === 'detect' ? { action: 'detect' } : action === 'check' ? {} : null;
      return await _call(r[0], r[1], body);
    } catch (e) { return { ok: false, error: `clear_glass_net failed: ${e.message}` }; }
  },
  _call,
};
