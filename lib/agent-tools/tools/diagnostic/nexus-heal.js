'use strict';
/**
 * lib/agent-tools/tools/nexus-heal.js — copilot's access to nexus-healer
 * comp_id: nexus.lib.agent-tools.nexus-heal
 * UUID: nexus-tool-nexus-heal-v1-0000-2026-0812-001
 *
 * §WIRED 2026-08-12. nexus-heal proposes fixes for gaps/diagnostics found
 * elsewhere (query_movement, nexus_status, loom_scan) and tracks them through
 * review. Same http-to-real-server shape as query-movement.js's cortex calls.
 *
 * §1.1 HONESTY — nexus-healer/api/index.js's own dispatch() has 'merge' and
 * 'archive' as literal stub handlers ("replace with real logic"). Those two
 * are NOT exposed here. Offering a tool that returns a stub success is worse
 * than not offering it — the agent would report a merge that never happened.
 * Only propose/list/evaluate are wired, because only those are real.
 */
const http = require('http');

const HEALER_PORT = process.env.NEXUS_HEALER_PORT || 3755;

function _req(method, path, body) {
  return new Promise(resolve => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({
      hostname: '127.0.0.1', port: HEALER_PORT, path, method, timeout: 10000,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {},
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (_) { resolve({ error: `nexus-healer returned unparseable body (${res.statusCode})` }); } });
    });
    req.on('error', e => resolve({ error: `nexus-healer unreachable on :${HEALER_PORT}: ${e.code || e.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'nexus-healer timed out' }); });
    if (data) req.write(data);
    req.end();
  });
}

const ACTIONS = {
  propose: (a) => {
    if (!a.text) return { error: 'propose needs text — what should be fixed and why' };
    return _req('POST', '/proposals', { text: a.text, causedBy: a.causedBy });
  },
  list: () => _req('GET', '/proposals'),
  evaluate: (a) => {
    if (!a.id) return { error: 'evaluate needs id' };
    return _req('POST', `/proposals/${encodeURIComponent(a.id)}/evaluate`, { targetFile: a.targetFile });
  },
};

module.exports = {
  name: 'nexus_heal',
  description:
    'Propose and track fixes for gaps/diagnostics found elsewhere in NEXUS. Actions: "propose" (needs ' +
    'text describing the fix, optional causedBy naming the evidence), "list" (open proposals), ' +
    '"evaluate" (needs id, optional targetFile — checks a proposal against real code before it can be ' +
    'merged). merge/archive are NOT exposed — nexus-healer\'s own handlers for those are unfinished ' +
    'stubs; calling them would report success for something that did not happen.',
  parameters: {
    type: 'object',
    properties: {
      action:     { type: 'string', enum: Object.keys(ACTIONS) },
      text:       { type: 'string', description: 'proposal text — required for propose' },
      causedBy:   { type: 'string', description: 'what evidence/gap this proposal addresses' },
      id:         { type: 'string', description: 'proposal id — required for evaluate' },
      targetFile: { type: 'string', description: 'file the proposal targets, for evaluate' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `nexus_heal ${args.action} failed: ${e.message}` }; }
  },
};
