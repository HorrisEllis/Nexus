'use strict';
/**
 * lib/agent-tools/tools/move-data.js — move_data tool
 * UUID: nexus-agent-tools-move-data-v1-0000-2026-0707-jamesbrooks-001
 * Expansion map: "Copilot-as-NEXUS" phase, build-order item (1).
 *
 * "Tell him to move data" — as a real tool over Cortex's real memory
 * surface, every endpoint verified against cortex/boot.js's actual
 * routes before being listed (push/recall/read/insert — all real):
 *   push   → POST /api/push            (push-recall unified API: content+tags+tier)
 *   recall → GET  /api/recall          (intent/query recall across MQL lanes)
 *   read   → GET  /api/memory          (tail N rows of any table)
 *   insert → POST /api/memory/insert   (raw row into a named table)
 *
 * §DELIBERATE OMISSION — /api/memory/forget exists but is NOT exposed
 * here. A model-callable delete is a data-loss surface; "nothing lost,
 * ever" is the standing law. Forgetting stays a human-invoked endpoint.
 */

const http = require('http');

// §FIXED by test T-007 — was a load-time const, freezing the URL for the
// process lifetime; a repointed service silently kept hitting the old
// address. Resolved at call time now.
function _cx_url() { return process.env.CORTEX_URL || 'http://127.0.0.1:3748'; }

function _req(method, path, body, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const u = new URL(_cx_url() + path);
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: u.hostname, port: u.port || 3748, path: u.pathname + u.search, method,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
      timeout: timeoutMs,
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error(`non-JSON from cortex: ${d.slice(0, 120)}`)); } }); });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('cortex timed out')); });
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = {
  name: 'move_data',
  description:
    `Move data in/out of Cortex (NEXUS's memory). Actions: ` +
    `"push" (store content with tags into a memory tier: recent/session/long), ` +
    `"recall" (retrieve memories by intent/query), ` +
    `"read" (tail the last N rows of a named table, e.g. chat_log, event_log, gaps), ` +
    `"insert" (write a raw row into a named table). ` +
    `There is deliberately no delete — nothing is lost, ever.`,
  parameters: {
    type: 'object',
    properties: {
      action:  { type: 'string', enum: ['push', 'recall', 'read', 'insert'], description: 'Which memory operation' },
      content: { type: 'string', description: 'For push: the text content to store' },
      tags:    { type: 'array', items: { type: 'string' }, description: 'For push: tags for later recall' },
      tier:    { type: 'string', description: 'For push: memory tier (recent, session, long); recall: optional tier filter' },
      intent:  { type: 'string', description: 'For recall: what you are trying to remember/find' },
      query:   { type: 'string', description: 'For recall: optional keyword query' },
      table:   { type: 'string', description: 'For read/insert: table name (chat_log, event_log, gaps, ...)' },
      n:       { type: 'number', description: 'For read: how many rows (default 10)' },
      row:     { type: 'object', description: 'For insert: the row object to write' },
    },
    required: ['action'],
  },
  execute: async (args = {}) => {
    try {
      switch (args.action) {
        case 'push': {
          if (!args.content) return { error: 'push requires content' };
          return await _req('POST', '/api/push', { content: args.content, tags: args.tags || [], tier: args.tier || 'recent' });
        }
        case 'recall': {
          if (!args.intent && !args.query) return { error: 'recall requires an intent or query' };
          const qs = new URLSearchParams();
          if (args.intent) qs.set('intent', args.intent);
          if (args.query)  qs.set('query', args.query);
          if (args.tier)   qs.set('tier', args.tier);
          return await _req('GET', `/api/recall?${qs}`);
        }
        case 'read': {
          if (!args.table) return { error: 'read requires a table name' };
          return await _req('GET', `/api/memory?table=${encodeURIComponent(args.table)}&n=${args.n || 10}`);
        }
        case 'insert': {
          if (!args.table || !args.row) return { error: 'insert requires table + row' };
          return await _req('POST', '/api/memory/insert', { table: args.table, row: args.row });
        }
        default: return { error: `unknown action '${args.action}'` };
      }
    } catch (e) { return { error: `cortex ${args.action} failed: ${e.message}` }; }
  },
};
