'use strict';
/**
 * lib/agent-tools/tools/clear-glass/command-index.js — James: "hooked
 * into co-pilot so it can use clearglass at full compatibility."
 *
 * The real, final piece closing this session's own CLI-command work:
 * clear-glass/src/ipc/bridge.js's _buildCommandIndex()/_writeCommandIndex()
 * build a real, LIVE index (introspected from Express's own actual route
 * table, not a hand-maintained list) of every real ClearGlass command —
 * written to data/clear-glass/command-index.json and served live at
 * GET /cli/commands. This tool is co-pilot's real door to all of it: one
 * real HTTP call, matched against the real, current index, not a
 * hardcoded list of endpoints that could drift the moment a new /cli/*
 * route gets added.
 *
 * §DESIGN — "full compatibility" means never needing to update THIS file
 * when a new ClearGlass command ships. call() takes a real method+path
 * (or a path fragment matched against the live index) and fires it
 * directly; discover() reads the real, current index so co-pilot can see
 * what's actually available before calling anything, the same way a
 * person would check `--help` before running an unfamiliar CLI.
 */

const http = require('http');

// §FIXED 0.39.259 — this pointed every call at :7704 (CLEAR_GLASS_PORT default). :7704 is Clear Glass's WIRE server
// (agent-mesh, automation, /dom/query, /provider/*, /userscripts/*, /bridge/driver). Every /cli/* route this tool
// exists to reach — and GET /cli/commands, the live index itself — is on the IPC bridge, :7702 (clear-glass/src/
// main/index.js IPC_PORT; ipc/bridge.js). So discover() never got a live index (it always fell back to the disk
// copy and said "ClearGlass unreachable" while Clear Glass was up), and call('/cli/...') reached the wire server,
// which has no /cli routes: every call 404'd. Found mapping the copilot↔Clear Glass surface, not reported by anyone —
// no test called this tool against a server. Now: two named surfaces, the path picks the surface (overridable).
const IPC_PORT  = parseInt(process.env.CLEARGL_IPC_PORT || process.env.CLEAR_GLASS_PORT || '7702', 10);
const WIRE_PORT = parseInt(process.env.WIRE_PORT || '7704', 10);
const SURFACES = Object.freeze({ ipc: IPC_PORT, wire: WIRE_PORT });
// Path prefixes served by the wire server (main/index.js _startWire). Everything else is the IPC bridge.
const WIRE_PREFIXES = ['/agent-mesh', '/automation', '/dom/query', '/commands', '/window/settings', '/userscripts/',
  '/provider/', '/eros/', '/bridge/driver', '/hook/', '/open', '/wire/health', '/network'];
function surfaceFor(path, explicit) {
  if (explicit && SURFACES[explicit]) return explicit;
  return WIRE_PREFIXES.some(p => String(path || '').startsWith(p)) ? 'wire' : 'ipc';
}

function _request(method, path, body, surface = null) {
  const s = surfaceFor(path, surface);
  const port = SURFACES[s];
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1', port, path, method,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
      timeout: 30000, // real dispatch (macros.run, /cli/driver navigate, userscripts.inject) can genuinely take longer than a read
    }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, surface: s, body: JSON.parse(data) }); }
        catch (_) { resolve({ ok: false, status: res.statusCode, surface: s, body: data }); }
      });
    });
    req.on('error', (err) => resolve({ ok: false, status: 0, surface: s, error: `ClearGlass ${s} surface unreachable on :${port} — ${err.code || err.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, surface: s, error: 'ClearGlass request timed out' }); });
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * discover(query) — the real, live index, straight from ClearGlass's own
 * GET /cli/commands (falls back to the on-disk copy if ClearGlass isn't
 * currently running, so a caller can still see what SHOULD be available
 * even mid-restart — clearly labeled which source answered).
 */
async function discover({ query } = {}) {
  const live = await _request('GET', '/cli/commands');
  let index = live.ok ? live.body : null;
  let source = 'live';
  if (!index) {
    try {
      const fs = require('fs'), path = require('path');
      index = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'data', 'clear-glass', 'command-index.json'), 'utf8'));
      source = 'disk (ClearGlass unreachable — last known real index)';
    } catch (e) {
      return { ok: false, error: `no live ClearGlass and no on-disk index available: ${e.message}` };
    }
  }
  const commands = query
    ? index.commands.filter(c => c.path.toLowerCase().includes(query.toLowerCase()) || c.method.toLowerCase() === query.toLowerCase())
    : index.commands;
  return { ok: true, source, commandCount: commands.length, totalReal: index.commandCount, commands };
}

/**
 * call({method, path, body}) — real, direct dispatch to any real
 * ClearGlass command. Deliberately does NOT validate the path against
 * the index first (a real, extra network round trip for every call) —
 * ClearGlass's own real Express routing is the actual source of truth;
 * an unknown path correctly 404s from ClearGlass itself, which this
 * tool reports honestly rather than pre-guessing.
 */
async function call({ method, path, body, surface } = {}) {
  if (!method || !path) return { ok: false, error: 'method and path are required — use discover() first if unsure what is available' };
  return _request(method.toUpperCase(), path, body, surface);
}

module.exports = {
  name: 'clear_glass_command_index',
  description:
    'Full compatibility with every real ClearGlass command via its live, self-updating command index — ' +
    'never hardcoded, always reflects what ClearGlass actually has running right now. Use discover to see ' +
    'what is available (optionally filtered by a path fragment like "history" or "userscripts"), then call ' +
    'to actually invoke one.',
  parameters: {
    type: 'object',
    properties: {
      action:  { type: 'string', enum: ['discover', 'call'], description: 'discover: list real, live commands. call: invoke one directly.' },
      query:   { type: 'string', description: 'discover only — filter commands by a path fragment or HTTP method' },
      method:  { type: 'string', description: 'call only — the real HTTP method (GET/POST/PUT/PATCH/DELETE)' },
      path:    { type: 'string', description: 'call only — the real path, e.g. "/cli/history" or "/cli/macros/my-macro/run"' },
      body:    { type: 'object', description: 'call only — the real JSON body for POST/PUT/PATCH calls' },
      surface: { type: 'string', enum: ['ipc', 'wire'], description: 'call only — optional; picked from the path (/cli/* → ipc :7702, /agent-mesh|/automation|/provider/* → wire :7704)' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    if (args.action === 'discover') return discover({ query: args.query });
    if (args.action === 'call') return call({ method: args.method, path: args.path, body: args.body, surface: args.surface });
    return { ok: false, error: `unknown action "${args.action}" — use "discover" or "call"` };
  },
  _request, discover, call, surfaceFor, SURFACES, // exported for direct testing
};
