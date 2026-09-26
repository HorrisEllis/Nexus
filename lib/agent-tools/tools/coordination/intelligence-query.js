'use strict';
/**
 * lib/agent-tools/tools/coordination/intelligence-query.js — real,
 * comprehensive copilot access to the intelligence system. James: "make
 * sure co-pilot can access the new system, commands."
 *
 * Two genuinely different real access patterns, not one uniform
 * mechanism papering over the difference (§0.0 — reality is authority):
 *   - patterns/status/context/failures/reuse/map: intelligence/index.js
 *     is a shared, stateless-per-process module — reached IN-PROCESS,
 *     same as framework_builder.js's tool wrapper already does. No live
 *     server needed.
 *   - CFR field state: genuinely lives inside the RUNNING server's own
 *     ledger instance, accumulated from real events over time. A fresh,
 *     in-process instance would report fabricated defaults, not the
 *     real current state. Reached via a real HTTP call to the actual
 *     running intelligence/server.js — and if that's not running, this
 *     honestly fails rather than returning invented numbers.
 *   - framework creation is deliberately NOT duplicated here — the real
 *     framework_builder tool already does this in-process; use that.
 */
const http = require('http');
const intelligence = require('../../../../intelligence/index.js');

const INTEL_PORT = process.env.INTELLIGENCE_PORT || 3753;

function _httpGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port: INTEL_PORT, path, timeout: 2000 }, (res) => {
      let body = ''; res.on('data', c => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('intelligence server unreachable — is intelligence/server.js running?')); });
  });
}

const ACTIONS = {
  patterns: () => ({ ok: true, patterns: intelligence.getPatterns(), total: intelligence.getPatterns().length }),
  status:   () => ({ ok: true, context: intelligence.getContext({}) }),
  failures: () => ({ ok: true, failures: intelligence.getFailures() }),
  reuse:    () => ({ ok: true, reuse: intelligence.getReuseIndex() }),
  map:      () => ({ ok: true, map: intelligence.getLoomMap() }),
  commands: () => ({ ok: true, commands: require('../../../../intelligence/registry-components.js') }),
  cfr: async () => {
    try { return await _httpGet('/cfr/field'); }
    catch (e) { return { ok: false, error: `real CFR field state unreachable: ${e.message}` }; }
  },
};

module.exports = {
  name: 'intelligence_query',
  description:
    'Real access to the intelligence system (patterns, status, failures, reuse index, loom map, CFR field state, ' +
    'and the live command list). "patterns"/"status"/"failures"/"reuse"/"map"/"commands" are reached in-process, ' +
    'always available. "cfr" needs intelligence/server.js actually running — genuinely fails, not fabricated ' +
    'numbers, if it is not. For generating a real WARP framework skeleton, use the separate framework_builder tool.',
  parameters: {
    type: 'object',
    properties: { action: { type: 'string', enum: Object.keys(ACTIONS) } },
    required: ['action'],
  },
  execute: async (a) => {
    const fn = ACTIONS[a.action];
    if (!fn) return { error: `unknown action "${a.action}" — try: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(); } catch (e) { return { error: `intelligence_query failed: ${e.message}` }; }
  },
};
