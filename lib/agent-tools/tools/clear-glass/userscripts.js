'use strict';
/**
 * lib/agent-tools/tools/clear-glass/userscripts.js — real agent access
 * to ClearGlass's userscript manager. James: "need to create a full
 * userscript suite... also a command/tool to disable and re-enable
 * them."
 *
 * Same real, checked architecture as dom-archaeology.js in this same
 * folder: this runs in copilot's own Node process; UserscriptManager
 * lives in clear-glass's separate Electron main process. Reached via
 * the real HTTP bridge (clear-glass's own wire server, :7704) ->
 * UserscriptManager's already-real list()/toggle() — nothing here is a
 * new script-management mechanism, this is wiring an existing one.
 *
 * Honestly fails, never fabricates: if ClearGlass isn't running, or
 * the named script id doesn't exist, this returns a real, specific
 * error — not an invented, empty-looking "success."
 */
const http = require('http');

const WIRE_PORT = process.env.WIRE_PORT || 7704;

function _req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const req = http.request(
      { hostname: '127.0.0.1', port: WIRE_PORT, path, method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}, timeout: 5000 },
      (res) => {
        let out = ''; res.on('data', c => out += c);
        res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { reject(e); } });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('ClearGlass wire server unreachable — is ClearGlass running?')); });
    if (data) req.write(data);
    req.end();
  });
}

const ACTIONS = {
  list: (a) => _req('GET', `/userscripts/list${a.agentId ? `?agentId=${encodeURIComponent(a.agentId)}` : ''}`),
  enable: (a) => {
    if (!a.scriptId) return Promise.resolve({ error: 'scriptId required' });
    return _req('POST', '/userscripts/toggle', { scriptId: a.scriptId, enabled: true });
  },
  disable: (a) => {
    if (!a.scriptId) return Promise.resolve({ error: 'scriptId required' });
    return _req('POST', '/userscripts/toggle', { scriptId: a.scriptId, enabled: false });
  },
};

module.exports = {
  name: 'clear_glass_userscripts',
  description:
    'Real userscript management for ClearGlass — the exact same UserscriptManager the Userscripts panel itself ' +
    'uses. "list" (optional agentId filter) returns every real script and its current enabled state. "enable"/' +
    '"disable" (need scriptId, from a prior list call) toggle one script. Honestly fails — with a specific reason ' +
    '— if ClearGlass is not running or the scriptId does not exist, rather than a fabricated success.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: Object.keys(ACTIONS) },
      agentId: { type: 'string', description: 'for "list" — filter to one agent, e.g. claude' },
      scriptId: { type: 'string', description: 'for "enable"/"disable" — a real script id from a prior list call' },
    },
    required: ['action'],
  },
  execute: async (a) => {
    const fn = ACTIONS[a.action];
    if (!fn) return { error: `unknown action "${a.action}" — try: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(a); } catch (e) { return { error: `clear_glass_userscripts failed: ${e.message}` }; }
  },
};
