'use strict';
/**
 * lib/agent-tools/tools/diagnose.js — diagnose tool
 * UUID: nexus-agent-tools-diagnose-v1-0000-2026-0707-jamesbrooks-001
 * Expansion map: "Copilot-as-NEXUS" phase, build-order item (1).
 *
 * "Tell him to diagnose parts of the system" — this is that verb, as a
 * real tool. Wraps the diagnostic service's (:7825) real endpoints,
 * every one verified against service/nexus-diagnostic.js's actual route
 * table before being listed here (status, gaps, friction, summary,
 * tension, self-heal — all real routes, none invented):
 *   status   → GET /status            (per-system online/friction/sigma/openGaps)
 *   gaps     → GET /gaps?system=&status=
 *   friction → GET /friction
 *   summary  → GET /summary/:system   (deep single-system diagnosis)
 *   tension  → GET /tension           (cross-system relational tension)
 *   heal     → POST-like GET /self-heal (diagnostic's own self-heal surface)
 *
 * §HONEST BOUNDARY — this tool reports what the diagnostic service
 * actually returns; an unreachable service is an error result, never a
 * fabricated "all healthy".
 */

const http = require('http');

// §FIXED by test T-007 — was a load-time const, freezing the URL for the
// process lifetime; a repointed service silently kept hitting the old
// address. Resolved at call time now.
function _diag_url() { return process.env.DIAGNOSTIC_URL || 'http://127.0.0.1:7825'; }

function _get(path, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const u = new URL(_diag_url() + path);
    const req = http.request({ hostname: u.hostname, port: u.port || 7825, path: u.pathname + u.search, method: 'GET', timeout: timeoutMs },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error(`non-JSON from diagnostic: ${d.slice(0, 120)}`)); } }); });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('diagnostic service timed out')); });
    req.end();
  });
}

const ACTIONS = {
  status:   ()   => _get('/status'),
  gaps:     (a)  => _get(`/gaps?status=${encodeURIComponent(a.status || 'open')}${a.system ? `&system=${encodeURIComponent(a.system)}` : ''}`),
  friction: ()   => _get('/friction'),
  summary:  (a)  => a.system ? _get(`/summary/${encodeURIComponent(a.system)}`) : Promise.reject(new Error('summary requires a system name')),
  tension:  ()   => _get('/tension'),
  heal:     ()   => _get('/self-heal'),
};

module.exports = {
  name: 'diagnose',
  description:
    `Diagnose the NEXUS system via the real diagnostic service. Actions: ` +
    `"status" (every system's online/friction/sigma/open-gap state), ` +
    `"gaps" (open gaps, optionally filtered by system), ` +
    `"friction" (current friction readings), ` +
    `"summary" (deep diagnosis of ONE system — requires system name, e.g. guardian/cortex/ollama/idearium/bridge), ` +
    `"tension" (cross-system relational tension), ` +
    `"heal" (trigger the diagnostic self-heal surface).`,
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: Object.keys(ACTIONS), description: 'Which diagnostic action to run' },
      system: { type: 'string', description: 'System name — required for "summary", optional filter for "gaps"' },
      status: { type: 'string', description: 'Gap status filter for "gaps": open (default), closed, or all' },
    },
    required: ['action'],
  },
  execute: async (args = {}) => {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action '${args.action}' — valid: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `diagnostic ${args.action} failed: ${e.message}` }; }
  },
};
